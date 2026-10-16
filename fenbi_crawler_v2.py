from __future__ import annotations
BROWSER_QUERY_SECONDS = 6
PAGE_READY_SECONDS = 15
NO_PROGRESS_ROUNDS = 8
NO_PROGRESS_SECONDS = 6
MEDIA_VERIFY_SECONDS = 120
SUBMIT_CONFIRM_SECONDS = 8
import argparse
import asyncio
import base64
import hashlib
import io
import json
import logging
import os
import re
import time
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo
from openpyxl import Workbook
from PIL import Image
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from bank_core import VERSION, json_write, media_manifest, parse_question, to_v2, validate_exam
from batch_runner import submission_key, load_submission_events
START_URL = 'https://www.fenbi.com/spa/tiku/guide/realTest/xingce/xingce'
PAPER_ITEMS, FILTER_ITEMS = ('.paper-item', '.categories-item')
NEXT_LIST = "button:has-text('下一页'), a:has-text('下一页'), .pagination-next, [aria-label='Next']"
NEXT_QUESTION = "button:has-text('下一题'), a:has-text('下一题'), .next-question"
LOG = logging.getLogger('fenbi')

class UserActionRequired(RuntimeError):
    """Authentication or verification needs the account owner; never solve automatically."""

class ListingStateError(RuntimeError):
    """The listing cannot be trusted; do not repeat the failure for every paper."""

def run_status(output, phase, **details):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    json_write(output / 'run_status.json', {'version': VERSION, 'phase': phase, 'updated_at': now(), **details})

def now():
    return datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def safe_name(s):
    return re.sub('[<>:"/\\\\|?*\\x00-\\x1f]', '_', s).strip(' .')[:120] or '未命名'

def allowed_page(url):
    parts = urlsplit(url)
    host = parts.hostname or ''
    return not parts.username and (not parts.password) and (parts.scheme == 'https') and (host == 'fenbi.com' or host.endswith('.fenbi.com'))
NEXT_CONTROL_JS = (Path(__file__).resolve().parent / 'next_control.js').read_text(encoding='utf-8')

async def click_next(page, selector):

    async def step():
        kind = 'question' if selector == NEXT_QUESTION else 'list'
        count = await page.evaluate(NEXT_CONTROL_JS, kind)
        if count == 0:
            return False
        if count != 1:
            raise RuntimeError('下一题或下一页按钮不唯一，已停止自动点击。')
        await page.locator('[data-fenbi-next-control="1"]').click(timeout=4000)
        await asyncio.sleep(0.6)
        return True
    try:
        return await asyncio.wait_for(step(), timeout=BROWSER_QUERY_SECONDS)
    except TimeoutError:
        raise RuntimeError('browser_navigation_timeout') from None
    except Exception as exc:
        raise RuntimeError('browser_navigation_error:' + type(exc).__name__) from None

PAGE_STATE_JS = """() => {
  const rendered = e => {
    if (e.closest('[hidden]') || getComputedStyle(e).visibility === 'hidden') return false;
    const r = document.createRange(); r.selectNodeContents(e);
    return !!(e.getClientRects().length || r.getClientRects().length);
  };
  const content = e => !!(e.textContent.trim() || e.querySelector('img[src],svg,math,table'));
  if ([...document.querySelectorAll('app-solution-overall,.correct-answer')]
      .some(e => rendered(e) && content(e))) return 'solution';
  const exercise = [...document.querySelectorAll('app-question-choice,.ti-content,[data-role="stem"]')]
      .some(e => rendered(e) && content(e));
  const submit = [...document.querySelectorAll('div.submit-btn,button.submit-btn')]
      .filter(e => rendered(e) && !e.closest('[disabled],[aria-disabled="true"]'));
  return exercise && submit.length === 1 ? 'exercise' : false;
}"""

async def solution_visible(page):
    state = await asyncio.wait_for(page.evaluate(PAGE_STATE_JS), timeout=BROWSER_QUERY_SECONDS)
    return state == 'solution'

async def wait_page_ready(page):
    try:
        handle = await asyncio.wait_for(
            page.wait_for_function(PAGE_STATE_JS, timeout=PAGE_READY_SECONDS * 1000),
            timeout=PAGE_READY_SECONDS + 1)
        try:
            return await handle.json_value()
        finally:
            await handle.dispose()
    except (TimeoutError, PlaywrightTimeoutError):
        raise RuntimeError('页面等待超时：未确认可见解析或真实练习内容及唯一交卷入口，未点击提交。') from None

async def ensure_solution(page, args, submitted, expected_title=None):
    if await solution_visible(page):
        return None
    if await wait_page_ready(page) == 'solution':
        return None
    if expected_title:
        observed_titles = await page.evaluate("""() => [...document.querySelectorAll('.paper-title,.exam-title,.solution-title-container .paper-name,.header-title,h1')].filter(e=>e.getClientRects().length).map(e=>e.innerText.trim()).filter(Boolean)""")
        if set(observed_titles) != {expected_title}:
            raise RuntimeError('交卷前标题未与所选试卷唯一匹配，未提交。')
    if not args.auto_submit:
        raise RuntimeError('不是解析页，自动交卷已关闭。请正常打开解析页。')
    key = submission_key(page.url)
    if key in submitted:
        raise RuntimeError('已尝试提交该页面，不重复交卷。')
    submit = page.locator('div.submit-btn:visible, button.submit-btn:visible')
    if await submit.count() != 1:
        raise RuntimeError('没有唯一可见的交卷按钮，未执行提交。')
    event = {'time': now(), 'url': page.url, 'submission_key': key, 'kind': 'placeholder_submission', 'status': 'attempted', 'purpose': '自动占位，仅用于取得解析', 'exclude_from_personal_statistics': True}
    submitted[key] = event

    def record(value):
        path = args.output / 'submission_events.jsonl'
        needs_newline = False
        if path.exists() and path.stat().st_size:
            with path.open('rb') as prior:
                prior.seek(-1, 2)
                needs_newline = prior.read(1) != b'\n'
        with path.open('a', encoding='utf-8') as f:
            if needs_newline:
                f.write('\n')
            f.write(json.dumps(value, ensure_ascii=False) + '\n')
            f.flush()
            os.fsync(f.fileno())  # Persist attempted status before a submit click.
    record(event)
    await submit.click()
    await page.wait_for_timeout(600)
    if not await solution_visible(page):
        dialogs = page.locator("[role='dialog']:visible, dialog:visible, [class*='dialog']:visible, [class*='modal']:visible, [class*='popup']:visible, app-exam-submit-dialog:visible").filter(has_text=re.compile('交卷|提交试卷|未作答|未答'))
        confirm = dialogs.locator("button:visible, [role='button']:visible, .btn-submit:visible, .confirm-btn:visible, .submit-btn:visible").filter(has_text=re.compile('^\\s*(确认交卷|确定交卷|提交试卷|确认提交|交卷|提交|确定|确认)\\s*$'))
        deadline = time.monotonic() + SUBMIT_CONFIRM_SECONDS
        while not await solution_visible(page) and await confirm.count() != 1 and time.monotonic() < deadline:
            await page.wait_for_timeout(150)
        if await solution_visible(page):
            pass
        elif await confirm.count() == 1:
            await confirm.click()
        else:
            if getattr(args, 'headless', False) or getattr(args, 'unattended', False):
                raise RuntimeError('交卷确认窗口无法唯一识别；本卷保留待补，自动模式不等待人工确认。')
            while not await solution_visible(page):
                print('请在浏览器里手动完成交卷，看到标准答案和解析后再回来。', flush=True)
                await asyncio.to_thread(input, '完成后按 Enter 继续采集：')
    for _ in range(30):
        if await solution_visible(page):
            event = {**event, 'time': now(), 'status': 'solution_opened'}
            record(event)
            return event
        await page.wait_for_timeout(500)
    raise RuntimeError('提交后未确认解析已打开，未计为采集成功。')
SNAPSHOT_JS = (Path(__file__).resolve().parent / 'snapshot_dom.js').read_text(encoding='utf-8')

async def extract_exam_data(page, expected=None, expected_title=None, max_rounds=300, progress_dir=None):
    questions, observations, errors, counts, titles, snapshots = ({}, [], set(), set(), set(), {})
    previous, stagnant = (None, 0)
    capture_started = time.monotonic()
    last_progress = capture_started
    count_evidence = {}
    stop_reason = None
    if progress_dir is not None:
        Path(progress_dir).mkdir(parents=True, exist_ok=True)
        json_write(Path(progress_dir) / 'capture_checkpoint.json', {'schema_version': VERSION, 'paper_title': expected_title, 'page_url': page.url, 'expected_count': expected, 'questions': [], 'rendered_snapshots': [], 'collection_errors': [], 'captured_at': now(), 'status': 'capture_starting_not_import_ready'})
    for _ in range(max_rounds):
        if time.monotonic() - capture_started > 90:
            errors.add('capture_time_limit')
            stop_reason = 'capture_time_limit'
            break
        try:
            snap = await asyncio.wait_for(page.evaluate(SNAPSHOT_JS), timeout=12)
        except Exception as step_error:
            errors.add('browser_read_failed' + ':' + str(step_error))
            stop_reason = 'browser_read_failed'
            break
        if snap['title']:
            titles.add(snap['title'])
        counts.update(snap['counts'])
        for evidence in snap.get('countEvidence', []):
            count_evidence[json.dumps(evidence, sort_keys=True, ensure_ascii=False)] = evidence
        if snap['unresolvedMaterials']:
            errors.add('unresolved_visible_material')
        for row in snap['rows']:
            snapshot_hash = hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            snapshots[snapshot_hash] = row
            q = parse_question(row['html'], page.url, row['order'], row['subject'], row['material'])
            identity = q.get('globalId') or 'missing:' + hashlib.sha256(row['html'].encode()).hexdigest()
            prior = questions.get(identity)
            if prior:
                if prior.get('question_no') != q.get('question_no'):
                    errors.add('conflicting_order:' + identity)
                for field in ('stem_html', 'options', 'answer', 'analysis_html', 'materials'):
                    if prior.get(field) and q.get(field) and (prior[field] != q[field]):
                        errors.add('conflicting_' + field + ':' + identity)
                for field, value in q.items():
                    if not prior.get(field) and value:
                        prior[field] = value
            else:
                questions[identity] = q
        observations.append({'visible_questions': len(snap['rows']), 'collected': len(questions)})
        print(f"[采集进度] 已读取 {len(questions)} 题；页面声明题数：{expected or (next(iter(counts)) if len(counts) == 1 else '尚未识别')}", flush=True)
        if progress_dir is not None:
            checkpoint_folder = Path(progress_dir)
            checkpoint_folder.mkdir(parents=True, exist_ok=True)
            json_write(checkpoint_folder / 'capture_checkpoint.json', {'schema_version': VERSION, 'paper_title': next(iter(titles)) if len(titles) == 1 else '未命名试卷', 'page_url': page.url, 'expected_count': expected or (next(iter(counts)) if len(counts) == 1 else None), 'count_evidence': list(count_evidence.values()), 'questions': list(questions.values()), 'collection_errors': sorted(errors), 'captured_at': now(), 'observations': observations, 'rendered_snapshots': list(snapshots.values()), 'status': 'checkpoint_only_not_import_ready'})
        fingerprint = json.dumps({'questions': questions, 'counts': sorted(counts), 'titles': sorted(titles)}, sort_keys=True, ensure_ascii=False)
        stagnant = stagnant + 1 if fingerprint == previous else 0
        if fingerprint != previous:
            last_progress = time.monotonic()
        previous = fingerprint
        count = expected or (next(iter(counts)) if len(counts) == 1 else None)
        if count and len(questions) == count and all((q.get('answer') and q.get('analysis_html') for q in questions.values())):
            stop_reason = 'expected_content_collected'
            break
        if stagnant >= NO_PROGRESS_ROUNDS and time.monotonic() - last_progress >= NO_PROGRESS_SECONDS:
            stop_reason = 'no_content_progress'
            errors.add(stop_reason)
            break
        try:
            if await click_next(page, NEXT_QUESTION):
                continue
        except Exception as step_error:
            errors.add('next_control_failed' + ':' + str(step_error))
            stop_reason = 'next_control_failed'
            break
        try:
            moved = await asyncio.wait_for(page.evaluate("() => {\n          let moved=false;\n          for(const e of [document.scrollingElement,...document.querySelectorAll('app-tis,.right-section,.question-list,.solution-content')]) {\n            if(!e||!e.getClientRects().length) continue;\n            const before=e.scrollTop; e.scrollTop+=Math.max(400,e.clientHeight*0.8);\n            moved ||= e.scrollTop!==before;\n          }\n          return moved;\n        }"), timeout=12)
        except Exception as step_error:
            errors.add('browser_read_failed' + ':' + str(step_error))
            stop_reason = 'browser_read_failed'
            break
        await asyncio.sleep(0.7)
        observations[-1]['scroll_moved'] = moved
    else:
        errors.add('collection_round_limit')
        stop_reason = 'collection_round_limit'
    if len(counts) > 1:
        errors.add('ambiguous_expected_count')
    if expected and counts and (counts != {expected}):
        errors.add('expected_count_conflicts_with_page')
    if len(titles) > 1:
        errors.add('conflicting_paper_titles')
    title = next(iter(titles)) if len(titles) == 1 else '未命名试卷'
    if expected_title and title != expected_title:
        errors.add('paper_title_mismatch')
    collected_data = {'schema_version': VERSION, 'paper_title': title, 'page_url': page.url, 'expected_count': expected or (next(iter(counts)) if len(counts) == 1 else None), 'count_evidence': list(count_evidence.values()), 'stop_reason': stop_reason, 'questions': list(questions.values()), 'collection_errors': sorted(errors), 'observations': observations, 'captured_at': now(), 'rendered_snapshots': list(snapshots.values())}
    if progress_dir is not None:
        json_write(Path(progress_dir) / 'capture_checkpoint.json', {**collected_data, 'status': 'capture_finished_needs_validation'})
    return collected_data

async def verify_media(context, v2, folder, download=False):
    print('[图片检查] 开始核验图片，网络检查可能需要几分钟；题目已先保存。', flush=True)
    manifest, sem = (media_manifest(v2), asyncio.Semaphore(4))

    async def check_once(src):
        async with sem:
            result = {'checked_at': now(), 'status': 'unchecked'}
            try:
                if src.startswith('data:image/'):
                    header, data = src.split(',', 1)
                    if ';base64' not in header:
                        raise ValueError('unsupported_data_uri')
                    body = base64.b64decode(data, validate=True)
                elif urlsplit(src).scheme in ('https', 'http'):
                    response = await context.request.get(src, timeout=15000)
                    result['http_status'] = response.status
                    if not response.ok:
                        return {**result, 'status': 'http_error'}
                    body = await response.body()
                else:
                    raise ValueError('unsupported_image_url')
                if len(body) > 20 * 1024 * 1024:
                    raise ValueError('image_too_large')
                with Image.open(io.BytesIO(body)) as im:
                    im.verify()
                with Image.open(io.BytesIO(body)) as im:
                    im.load()
                    size, fmt = (im.size, im.format)
                result.update(status='verified', sha256=hashlib.sha256(body).hexdigest(), size=list(size))
                if download:
                    target = folder / 'images' / (result['sha256'] + '.' + fmt.lower())
                    target.parent.mkdir(exist_ok=True)
                    target.write_bytes(body)
                    result['local_path'] = str(target.relative_to(folder))
            except Exception as exc:
                result.update(status='unverified', error=type(exc).__name__ + ': ' + str(exc)[:180])
            return result
    async def check(src):
        for attempt in range(3):
            result = await check_once(src)
            result['attempts'] = attempt + 1
            if result['status'] == 'verified' or result.get('http_status') in (401, 403, 404):
                return result
            if attempt < 2:
                await asyncio.sleep(0.3 * (attempt + 1))
        return result
    sources = sorted(set((row['source'] for row in manifest)))
    cache = {}
    async def capture(src):
        cache[src] = await check(src)
    try:
        await asyncio.wait_for(asyncio.gather(*(capture(src) for src in sources)), timeout=MEDIA_VERIFY_SECONDS)
    except TimeoutError:
        for src in sources:
            cache.setdefault(src, {'status': 'media_time_limit', 'checked_at': now()})
    return [{**row, **cache[row['source']]} for row in manifest]

async def save_exam(context, data, args):
    identity = hashlib.sha256(data['page_url'].encode()).hexdigest()[:10]
    folder = args.output / (safe_name(data['paper_title']) + '_' + identity) / datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    folder.mkdir(parents=True)
    data = dict(data)
    snapshots = data.pop('rendered_snapshots', [])
    json_write(folder / 'rendered_dom.json', {'page_url': data['page_url'], 'captured_at': data.get('captured_at'), 'snapshots': snapshots})
    json_write(folder / 'questions.json', data)
    json_write(folder / 'source_provenance.json', {'page_url': data['page_url'], 'captured_at': data.get('captured_at'), 'method': 'normal_rendered_DOM', 'expected_count': data.get('expected_count'), 'count_evidence': data.get('count_evidence', []), 'stop_reason': data.get('stop_reason'), 'source_files': [{'file': name, 'sha256': sha(folder / name)} for name in ('rendered_dom.json', 'questions.json')], 'submission': data.get('submission'), 'material_id_policy': 'local-material: prefix denotes a local content-derived ID'})
    audit, v2 = (validate_exam(data), None)
    try:
        v2 = to_v2(data)
    except ValueError as exc:
        audit['issues'].append(str(exc))
        audit['ok'] = False
    media = await verify_media(context, v2, folder, args.download_images) if v2 else []
    if any((row['status'] != 'verified' for row in media)):
        audit['ok'] = False
        audit['issues'].append('unverified_media')
    status = 'success' if audit['ok'] else 'incomplete'
    if v2:
        json_write(folder / ('paper_v2.json' if audit['ok'] else 'paper_v2_pending.json'), v2)
    json_write(folder / 'audit.json', audit)
    json_write(folder / 'missing.json', {'issues': audit['issues'], 'questions': [r for r in audit['questions'] if not r['ok']], 'warnings': audit['warnings']})
    json_write(folder / 'media_manifest.json', media)
    wb, ws = (Workbook(), None)
    ws = wb.active
    ws.append(['卷名', '题号', 'globalId', '答案', '平台正确率', '状态'])
    for q in data['questions']:
        values = [data['paper_title'], q.get('question_no'), q.get('globalId'), q.get('answer'), q.get('rate'), status]
        ws.append(["'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@')) else v for v in values])
    wb.save(folder / 'questions.xlsx')
    result = {'status': status, 'title': data['paper_title'], 'path': str(folder.resolve()), 'questions': len(data['questions']), 'page_url': data['page_url'], 'completed_at': now(), 'version': VERSION, 'issues': audit['issues']}
    if status == 'success':
        result['sha256'] = sha(folder / 'paper_v2.json')
        result['file_hashes'] = {n: sha(folder / n) for n in ('paper_v2.json', 'questions.json', 'audit.json', 'media_manifest.json')}
    json_write(folder / 'receipt.json', result)
    return result

async def crawl_current_page(context, page, args, submitted, expected=None, title=None):
    print('[步骤1] 正在检查试卷和解析页……', flush=True)
    run_status(args.output, 'checking_solution_page')
    json_write(args.output / 'capture_checkpoint.json', {'schema_version': VERSION, 'questions': [], 'rendered_snapshots': [], 'collection_errors': [], 'captured_at': now(), 'status': 'checking_solution_not_import_ready'})
    start = time.monotonic()
    if not allowed_page(page.url):
        raise ValueError('只支持正常访问的 fenbi.com HTTPS 页面。')
    event = await ensure_solution(page, args, submitted, title)
    run_status(args.output, 'collecting')
    data = await extract_exam_data(page, expected, title, args.max_rounds, progress_dir=args.output)
    run_status(args.output, 'saving_and_verifying', captured_questions=len(data['questions']))
    data['submission'] = event or submitted.get(submission_key(page.url))
    data['elapsed_capture_seconds'] = round(time.monotonic() - start, 3)
    result = await save_exam(context, data, args)
    result['elapsed_total_seconds'] = round(time.monotonic() - start, 3)
    json_write(Path(result['path']) / 'receipt.json', result)
    return result

async def _read_paper_items(page):
    rows = []
    for i, item in enumerate(await page.locator(PAPER_ITEMS).all()):
        if not await item.is_visible():
            continue
        title = item.locator('.item-info-title,.paper-title').first
        name = (await title.inner_text()).strip() if await title.count() else (await item.inner_text()).strip()
        link = item.locator('a[href]').first
        raw = await link.get_attribute('href') if await link.count() else ''
        href = urljoin(page.url, raw) if raw and (not raw.startswith(('#', 'javascript:'))) else ''
        rows.append({'title': name, 'href': href, 'index': i})
    return rows

async def paper_items(page):
    try:
        return await asyncio.wait_for(_read_paper_items(page), timeout=BROWSER_QUERY_SECONDS)
    except Exception as exc:
        raise ListingStateError('读取试卷列表失败：' + type(exc).__name__) from exc

async def wait_paper_items(page, timeout=8):
    deadline = time.monotonic() + timeout
    while True:
        rows = await paper_items(page)
        if rows or time.monotonic() >= deadline:
            return rows
        await asyncio.sleep(0.15)


def list_signature(rows):
    return tuple(((r['title'], r['href']) for r in rows))

async def click_filter(page, name):
    async def select():
        deadline = time.monotonic() + 8
        while True:
            matches = []
            for loc in await page.locator(FILTER_ITEMS).all():
                if await loc.is_visible() and (await loc.inner_text()).strip() == name:
                    matches.append(loc)
            if len(matches) > 1:
                raise ListingStateError('分类不唯一：' + name)
            if matches:
                await matches[0].click(timeout=4000)
                await page.wait_for_timeout(600)
                return
            if time.monotonic() >= deadline:
                raise ListingStateError('找不到分类：' + name)
            await asyncio.sleep(0.2)
    try:
        await asyncio.wait_for(select(), timeout=12)
    except ListingStateError:
        raise
    except Exception as exc:
        raise ListingStateError('分类切换失败：' + name + '；' + type(exc).__name__) from exc

async def reset_listing_first_page(page):
    for pager in await page.locator('.paging').all():
        if not await pager.is_visible():
            continue
        active = pager.locator('.item.active')
        if await active.count() != 1:
            continue
        raw = (await active.inner_text()).strip()
        if not raw.isdigit() or int(raw) <= 1:
            continue
        first = pager.locator('.item').filter(has_text=re.compile(r'^\s*1\s*$'))
        if await first.count() != 1:
            raise ListingStateError('无法确认列表第一页按钮')
        await first.click(timeout=4000)
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            active = pager.locator('.item.active')
            if await active.count() == 1 and (await active.inner_text()).strip() == '1':
                await page.wait_for_timeout(600)
                return
            await asyncio.sleep(0.15)
        raise ListingStateError('返回列表第一页失败')


async def visible_categories(page):
    async def read():
        names = []
        for loc in await page.locator(FILTER_ITEMS).all():
            if await loc.is_visible():
                name = (await loc.inner_text()).strip()
                if name and name not in names:
                    names.append(name)
        return names
    return await asyncio.wait_for(read(), timeout=BROWSER_QUERY_SECONDS)

async def open_paper(context, paper, list_page, signature):
    # Click the observed element in the existing tab. A new tab loaded from just
    # its URL does not carry the original sessionStorage or in-memory selection.
    popups = []
    def on_popup(p):
        popups.append(p)
    list_page.on('popup', on_popup)
    try:
        async def open_observed():
            current_rows = await paper_items(list_page)
            if list_signature(current_rows) != signature:
                raise ListingStateError('列表已变化，未点击试卷。')
            matches = [r for r in current_rows if (r['title'], r['href']) == (paper['title'], paper['href'])]
            if len(matches) != 1:
                raise ListingStateError('试卷条目不唯一，未点击。')
            if paper['href'] and not allowed_page(paper['href']):
                raise ListingStateError('试卷链接不是允许的粉笔页面。')
            before = list_page.url
            item = list_page.locator(PAPER_ITEMS).nth(matches[0]['index'])
            link = item.locator('a[href]').first
            target = link if paper['href'] and await link.count() else item
            await target.click(timeout=4000)
            await asyncio.sleep(0.3)
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if len(popups) > 1:
                    raise ListingStateError('试卷打开了多个窗口，无法确定目标。')
                if popups:
                    await popups[0].wait_for_load_state('domcontentloaded', timeout=6000)
                    return popups[0]
                if list_page.url != before:
                    return list_page
                if await list_page.locator('app-question-choice:visible,.correct-answer:visible,.ti-content:visible').count():
                    return list_page
                await asyncio.sleep(0.2)
            raise ListingStateError('点击试卷后未确认打开成功，已停止批量处理。')
        return await asyncio.wait_for(open_observed(), timeout=14)
    except Exception as exc:
        for popup in popups:
            if not popup.is_closed():
                await popup.close()
        if isinstance(exc, ListingStateError):
            raise
        raise ListingStateError('打开试卷失败：' + type(exc).__name__) from exc
    finally:
        list_page.remove_listener('popup', on_popup)

async def restore_listing(page, list_url, name, round_no, signature):
    async def restore():
        if page.is_closed():
            raise ListingStateError('原试卷列表窗口已关闭。')
        if list_signature(await paper_items(page)) == signature:
            return
        for _ in range(4):
            if page.url == list_url:
                break
            if await page.go_back(wait_until='domcontentloaded', timeout=10000) is None and page.url != list_url:
                # SPA history traversal can return None; inspect the URL, not
                # just the navigation response, before deciding it failed.
                await asyncio.sleep(0.2)
        if page.url != list_url:
            raise ListingStateError('无法返回原试卷列表。')
        if list_signature(await wait_paper_items(page)) == signature:
            return
        await click_filter(page, name)
        await reset_listing_first_page(page)
        await wait_paper_items(page)
        for _ in range(round_no):
            if not await click_next(page, NEXT_LIST):
                raise ListingStateError('无法恢复原列表页码。')
            await wait_paper_items(page)
        if list_signature(await wait_paper_items(page)) != signature:
            raise ListingStateError('返回后的列表与原列表不一致。')
    try:
        await asyncio.wait_for(restore(), timeout=30)
    except ListingStateError:
        raise
    except Exception as exc:
        raise ListingStateError('恢复原列表失败：' + type(exc).__name__) from exc

async def listing_diagnostic(page, args, name, error):
    # Local diagnostics only; never sent to GitHub or another service.
    detail = {'category': name, 'page_url': page.url, 'error': str(error), 'captured_at': now()}
    try:
        detail['categories'] = await visible_categories(page)
        detail['papers'] = await asyncio.wait_for(paper_items(page), timeout=BROWSER_QUERY_SECONDS)
    except Exception as exc:
        detail['inspection_error'] = type(exc).__name__
    args.output.mkdir(parents=True, exist_ok=True)
    json_write(args.output / 'listing_failure.json', detail)
    run_status(args.output, 'batch_stopped', reason=str(error))
    try:
        await page.screenshot(path=str(args.output / 'listing_failure.png'), timeout=5000)
    except Exception:
        pass

def valid_receipt(entry):
    try:
        path = Path(entry['path'])
        if entry.get('version') not in ('2.2-candidate', '2.3-candidate', '2.4-candidate', '2.4.1-candidate', VERSION) or entry.get('status') != 'success':
            return False
        if sha(path / 'paper_v2.json') != entry.get('sha256'):
            return False
        if not json.loads((path / 'audit.json').read_text(encoding='utf-8'))['ok']:
            return False
        required = ('paper_v2.json', 'questions.json', 'audit.json', 'media_manifest.json')
        hashes = entry.get('file_hashes')
        if hashes:
            return all(hashes.get(n) == sha(path / n) for n in required)
        # Older receipts used one hash. Revalidate their content once at resume
        # instead of discarding completed work solely because the app upgraded.
        data = json.loads((path / 'questions.json').read_text(encoding='utf-8'))
        v2 = json.loads((path / 'paper_v2.json').read_text(encoding='utf-8'))
        media = json.loads((path / 'media_manifest.json').read_text(encoding='utf-8'))
        return (validate_exam(data)['ok'] and to_v2(data) == v2 and
                len(media) == len(media_manifest(v2)) and all(m.get('status') == 'verified' for m in media))
    except (OSError, KeyError, ValueError, TypeError):
        return False

def complete_entries(output, today_only=False):
    found = {}
    for p in output.glob('*/*/receipt.json'):
        try:
            e = json.loads(p.read_text(encoding='utf-8'))
            if (not today_only or e.get('completed_at', '').startswith(now()[:10])) and valid_receipt(e):
                identity = e['title']
                found[identity] = e
        except (ValueError, OSError):
            continue
    return found

def daily_entries(output):
    return complete_entries(output, today_only=True)

async def crawl_category(context, page, name, args, submitted):
    print('[分类] ' + name, flush=True)
    try:
        await click_filter(page, name)
    except ListingStateError as exc:
        await listing_diagnostic(page, args, name, exc)
        raise
    seen_pages, seen_papers, results = (set(), set(), [])
    consecutive_failures = 0
    for round_no in range(args.max_rounds):
        rows = await paper_items(page)
        list_url = page.url
        signature = list_signature(rows)
        if not rows or signature in seen_pages:
            break
        seen_pages.add(signature)
        for paper in rows:
            if len(daily_entries(args.output)) >= args.daily_target:
                return results
            key = paper['href'] or name + '|' + paper['title']
            if key in seen_papers:
                continue
            seen_papers.add(key)
            checkpoint = args.output / 'checkpoint.json'
            cp = json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.exists() else {}
            if valid_receipt(cp.get(key, {})):
                continue
            if paper['title'] in complete_entries(args.output):
                continue
            worker = None
            try:
                print('[试卷] ' + paper['title'], flush=True)
                worker = await open_paper(context, paper, page, signature)
                result = await crawl_current_page(context, worker, args, submitted, title=paper['title'])
                cp[key] = result
                json_write(checkpoint, cp)
                results.append(result)
                consecutive_failures = 0
                LOG.info('%s | %s | %s题', result['status'], result['title'], result['questions'])
            except ListingStateError as exc:
                await listing_diagnostic(page, args, name, exc)
                raise
            except Exception as exc:
                results.append({'status': 'failed', 'title': paper['title'], 'message': str(exc)})
                consecutive_failures += 1
                LOG.warning('本卷失败，继续下一卷：%s', exc)
                if consecutive_failures >= 3:
                    error = ListingStateError('连续三卷无法采集，已停止批量处理：' + str(exc))
                    await listing_diagnostic(page, args, name, error)
                    raise error from exc
            finally:
                if worker and worker is not page:
                    await worker.close()
                try:
                    await restore_listing(page, list_url, name, round_no, signature)
                except ListingStateError as exc:
                    await listing_diagnostic(page, args, name, exc)
                    raise
            await page.wait_for_timeout(400)
        try:
            if not await click_next(page, NEXT_LIST):
                break
        except Exception as exc:
            error = ListingStateError('列表翻页失败：' + str(exc))
            await listing_diagnostic(page, args, name, error)
            raise error from exc
    return results

def options():
    p = argparse.ArgumentParser(description='粉笔正常页面采集、整卷核验、当前网站V2输出')
    p.add_argument('--output', type=Path, default=Path('fenbi_output'))
    p.add_argument('--profile', type=Path, default=Path('fenbi_browser_profile'))
    p.add_argument('--browser', choices=['chromium', 'chrome'], default='chromium')
    p.add_argument('--headless', action='store_true', help='仅已有可用登录时使用；须同时给--plan')
    p.add_argument('--auto-submit', action=argparse.BooleanOptionalAction, default=True, help='默认开启；仅本人已授权练习卷；--no-auto-submit可关闭')
    p.add_argument('--download-images', action='store_true', help='额外保存图片副本，不改写HTML原地址')
    p.add_argument('--daily-target', type=int, default=10)
    p.add_argument('--max-rounds', type=int, default=300)
    p.add_argument('--plan', type=Path, help='JSON数组，每条含正常页面url/title；expected_count可选，未知时从页面核实')
    p.add_argument('--resume', action='store_true', help='继续输出目录中保存的选卷任务')
    p.add_argument('--paper-retries', type=int, default=2, help='每卷失败后的额外尝试次数，默认2')
    p.add_argument('--paper-timeout', type=float, default=240, help='单次处理时限（秒）')
    p.add_argument('--auth-wait', type=float, default=900, help='等待用户正常登录/验证的最长秒数')
    p.add_argument('--expected-count', type=int, help='仅单卷模式，须核实后填写')
    args = p.parse_args()
    if args.paper_retries < 0 or args.paper_timeout <= 0 or args.auth_wait <= 0:
        p.error('重试次数不能为负，时限须为正数')
    if args.daily_target < 1 or args.max_rounds < 1 or (args.expected_count is not None and args.expected_count < 1):
        p.error('数量参数必须为正整数')
    if (args.plan or args.resume) and args.expected_count:
        p.error('计划模式请分别设置每卷expected_count')
    if args.plan and args.resume:
        p.error('--plan与--resume不能同时使用')
    if args.headless and not (args.plan or args.resume):
        p.error('无界面模式必须给--plan；首次登录请用有界面模式')
    return args

async def main():
    args = options()
    args.output.mkdir(parents=True, exist_ok=True)
    run_status(args.output, 'starting')
    logging.basicConfig(level=logging.INFO, handlers=[logging.StreamHandler(), logging.FileHandler(args.output / 'crawler.log', encoding='utf-8')])
    results, submitted, single_mode = ([], load_submission_events(args.output), False)
    batch_job = None
    async with async_playwright() as pw:
        launch = {'headless': args.headless, 'viewport': {'width': 1440, 'height': 900}}
        if args.browser == 'chrome':
            launch['channel'] = 'chrome'
        context = await pw.chromium.launch_persistent_context(str(args.profile.resolve()), **launch)
        context.set_default_navigation_timeout(60000)
        context.set_default_timeout(10000)
        try:
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto(START_URL, wait_until='domcontentloaded')
            run_status(args.output, 'waiting_for_login_or_page_selection')
            print('请在浏览器正常登录并打开目标页。登录目录勿共享。自动交卷：', args.auto_submit)
            print('占位提交不代表真实学习成绩；平台端练习历史可能被改变，本程序不会清理平台记录。')
            if not args.headless:
                await asyncio.to_thread(input, '准备好后按Enter：')
            from batch_runner import run_batch, choose_targets
            if args.plan or args.resume:
                targets = json.loads(args.plan.read_text(encoding='utf-8')) if args.plan else None
                batch_job = await run_batch(context, page, args, submitted, targets)
                results = [p.get('receipt') or {'status': p['state'], 'title': p['target']['title']} for p in batch_job['papers']]
            else:
                saved = args.output / 'batch_task.json'
                default_mode = '5' if saved.exists() and json.loads(saved.read_text(encoding='utf-8')).get('state') != 'completed' else '4'
                default_label = '续跑已保存任务' if default_mode == '5' else '选卷后自动完成'
                mode = (await asyncio.to_thread(input, f'模式：Enter={default_label}，4=新建选卷任务，5=续跑，1=当前卷：')).strip() or default_mode
                if mode in ('4', '5'):
                    targets = await choose_targets(page, args) if mode == '4' else None
                    batch_job = await run_batch(context, page, args, submitted, targets)
                    results = [p.get('receipt') or {'status': p['state'], 'title': p['target']['title']} for p in batch_job['papers']]
                elif mode == '1':
                    single_mode = True
                    results.append(await crawl_current_page(context, page, args, submitted, args.expected_count))
                else:
                    if args.expected_count:
                        raise ValueError('--expected-count仅允许单卷模式')
                    names = await visible_categories(page)
                    if not names:
                        error = ListingStateError('当前页没有可识别的试卷分类。')
                        await listing_diagnostic(page, args, '', error)
                        raise error
                    if mode == '2':
                        print('\n'.join((f'{i + 1}. {n}' for i, n in enumerate(names))))
                        index = int(await asyncio.to_thread(input, '分类编号：'))
                        if not 1 <= index <= len(names):
                            raise ValueError('分类编号无效')
                        names = [names[index - 1]]
                    elif mode != '3':
                        raise ValueError('无效模式')
                    try:
                        for name in names:
                            if len(daily_entries(args.output)) >= args.daily_target:
                                break
                            results.extend(await crawl_category(context, page, name, args, submitted))
                    except ListingStateError as exc:
                        results.append({'status': 'failed', 'stage': 'listing', 'message': str(exc)})
                        LOG.error('批量已停止；诊断已保存到输出目录：%s', exc)
        finally:
            await context.close()
            entries = list(daily_entries(args.output).values())
            unique = set()
            for e in entries:
                d = json.loads((Path(e['path']) / 'paper_v2.json').read_text(encoding='utf-8'))
                unique.update((q['globalId'] for q in d['questions']))
            summary = {'date': now()[:10], 'timezone': 'Asia/Shanghai', 'target': args.daily_target, 'complete_papers': len(entries), 'target_met': len(entries) >= args.daily_target, 'question_positions': sum((e['questions'] for e in entries)), 'unique_globalIds': len(unique), 'papers': entries, 'this_run': results, 'website_import_verified': False, 'note': '本地核验；还需当前网站实际导入及导出复核'}
            json_write(args.output / ('daily_' + now()[:10] + '.json'), summary)
            if batch_job is None:
                print(json.dumps({k: summary[k] for k in ('complete_papers', 'target', 'target_met', 'question_positions', 'unique_globalIds')}, ensure_ascii=False))
    if batch_job is not None:
        print(json.dumps({k: batch_job.get(k) for k in ('state', 'target', 'complete_papers', 'target_met')}, ensure_ascii=False))
        return 0 if batch_job.get('target_met') else 2
    if single_mode:
        return 0 if results and results[-1]['status'] == 'success' else 2
    return 0 if summary['target_met'] else 2
if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
