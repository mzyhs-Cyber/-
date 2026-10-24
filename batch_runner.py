"""Durable selected-paper jobs. No credentials or browser profiles enter a job file."""
from __future__ import annotations
import asyncio
from contextlib import contextmanager
import os
import json
import re
import time
from pathlib import Path
from urllib.parse import urlsplit
from bank_core import VERSION, json_write
SELECTION_PAGE_WAIT_SECONDS = 8


def mock_scope(category):
    return {'region': '江苏', 'paper_type': 'B'} if category == '省考模拟题' else {}


def submission_key(url):
    p = urlsplit(url)
    path = re.sub(r'/exam/(?:exercise|solution)/', '/exam/paper/', p.path)
    query = '' if re.search(r'/exam/(?:exercise|solution)/', p.path) else p.query
    return p.scheme + '://' + p.netloc + path + ('?' + query if query else '')


def load_submission_events(output):
    events = {}
    path = Path(output) / 'submission_events.jsonl'
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            try:
                event = json.loads(line)
                if event.get('url'):
                    events[submission_key(event['url'])] = event
            except (ValueError, TypeError):
                # A crash may leave only the last line incomplete. Earlier
                # attempted submissions remain protected from a second click.
                continue
    return events


AUTH_JS = r"""() => {
 const visible = e => !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
 const normal = [...document.querySelectorAll('app-question-choice,.correct-answer,.paper-item')].some(visible);
 const challenge = [...document.querySelectorAll('[class*="geetest"],[class*="captcha"],iframe[title*="captcha" i]')].some(visible);
 if(challenge) return 'verification_required';
 const text = (document.body?.innerText || '').trim();
 if(!normal && text.length < 3000 && /验证您是人类|人机验证|安全验证|滑动.*验证|Verify you are human|Checking your browser/i.test(text)) return 'verification_required';
 const login = [...document.querySelectorAll('input[type="password"],input[autocomplete="one-time-code"],input[placeholder*="手机号"],input[placeholder*="验证码"]')].some(visible);
 if(login && (!normal || /登录/.test(text))) return 'login_required';
 if(!normal && /\/(login|signin)(\/|\?|$)/i.test(location.href)) return 'login_required';
 return null;
}"""


async def account_issue(page):
    try:
        return await asyncio.wait_for(page.evaluate(AUTH_JS), timeout=6)
    except Exception:
        return None  # Preserve the original page/navigation error for bounded retries.


async def wait_for_account(page, args, issue):
    from fenbi_crawler_v2 import UserActionRequired, run_status
    run_status(args.output, 'needs_user', reason=issue, resume_available=True)
    print('[需本人操作] 请在程序浏览器中正常登录或完成验证；完成后自动继续，不会代填凭据或解验证码。', flush=True)
    if getattr(args, 'headless', False):
        raise UserActionRequired(issue + ': 请使用有界面模式续跑')
    deadline = time.monotonic() + getattr(args, 'auth_wait', 900)
    while time.monotonic() < deadline:
        await asyncio.sleep(2)
        if not await account_issue(page):
            return
    raise UserActionRequired(issue + ': 等待超时，任务已保留，可再次续跑')


def parse_selection(value, count):
    selected = []
    for part in re.split(r'[,，\s]+', value.strip()):
        if not part:
            continue
        match = re.fullmatch(r'(\d+)(?:-(\d+))?', part)
        if not match:
            raise ValueError('选卷格式示例：1-10 或 1,3,5-8')
        start, end = int(match[1]), int(match[2] or match[1])
        if not 1 <= start <= end <= count:
            raise ValueError('选卷编号超出当前列表范围')
        selected.extend(n - 1 for n in range(start, end + 1) if n - 1 not in selected)
    if not selected:
        raise ValueError('至少选择一套试卷')
    return selected


def select_ab_pairs(rows, pairs=5):
    groups = {}
    for i, row in enumerate(rows):
        match = re.search(r'(20\d{2}).*?(?:[（(]([AB])类[）)]|([AB])卷)', row['title'])
        if match:
            groups.setdefault(int(match[1]), {}).setdefault(match[2] or match[3], []).append(i)
    selected = []
    for year in sorted(groups, reverse=True):
        types = groups[year]
        if len(types.get('A', [])) == 1 and len(types.get('B', [])) == 1:
            selected.extend([types['A'][0], types['B'][0]])
        if len(selected) == pairs * 2:
            return selected
    raise ValueError(f'本页不足{pairs}组唯一A/B卷，请翻页或按编号选择')


def validate_targets(targets):
    from fenbi_crawler_v2 import allowed_page, accepts_paper, MOCK_CATEGORY
    if not isinstance(targets, list) or not targets:
        raise ValueError('任务须包含非空试卷数组')
    unique, titles, urls = [], set(), {}
    for target in targets:
        if not isinstance(target, dict) or not isinstance(target.get('title'), str) or not target['title'].strip():
            raise ValueError('每卷须有完整title')
        expected = target.get('expected_count')
        if expected is not None and (type(expected) is not int or expected < 1 or expected > 1000):
            raise ValueError('expected_count须是已核实的正整数，未知时省略')
        listing = target.get('listing')
        if listing:
            if not isinstance(listing, dict) or not allowed_page(listing.get('url', '')):
                raise ValueError('列表须是正常粉笔HTTPS页面')
            if type(listing.get('page_index')) is not int or not 0 <= listing['page_index'] <= 300:
                raise ValueError('列表页码无效')
            if not isinstance(listing.get('category'), str) or not isinstance(listing.get('signature'), list):
                raise ValueError('选卷任务缺分类或列表证据')
            if listing['category'] == MOCK_CATEGORY:
                if not accepts_paper(MOCK_CATEGORY, target['title']):
                    raise ValueError('省考模拟题默认仅采集江苏B卷，请重新选卷；未采集通用卷或其他卷型')
                if listing.get('region') != '江苏' or listing.get('paper_type') != 'B':
                    raise ValueError('旧模拟卷任务缺少江苏B卷筛选证据，请重新选卷')
        elif not allowed_page(target.get('url', '')):
            raise ValueError('每卷须有正常粉笔HTTPS url或保存的列表位置')
        title = target['title'].strip()
        if title in titles:
            continue
        if not listing:
            key = submission_key(target['url'])
            if key in urls and urls[key] != title:
                raise ValueError('同一试卷URL不能作为两套不同卷计数')
            urls[key] = title
        titles.add(title)
        unique.append({**target, 'title': title})
    return unique


def parse_year_setting(value, current_year):
    value = value.strip().lower()
    if value in ('m', 'manual'):
        return None
    if not value:
        return current_year - 9, current_year
    match = re.fullmatch(r'((?:19|20)\d{2})\s*[-—~至]\s*((?:19|20)\d{2})', value)
    if not match or int(match[1]) > int(match[2]):
        raise ValueError('输入年份范围如2017-2026，回车取近十年，或m手动选卷')
    return int(match[1]), int(match[2])


def paper_year(title):
    match = re.search(r'(?<!\d)((?:19|20)\d{2})(?!\d)', title)
    return int(match[1]) if match else None


async def scan_year_targets(page, categories, year_start, year_end, output=None):
    from fenbi_crawler_v2 import (click_filter, reset_listing_first_page, wait_paper_items,
                                 list_signature, click_next, NEXT_LIST, now, accepts_paper, verify_mock_region)
    selected = []
    report = {'year_start': year_start, 'year_end': year_end, 'status': 'scanning', 'categories': []}
    def persist():
        if output is not None:
            Path(output).mkdir(parents=True, exist_ok=True)
            json_write(Path(output) / 'selection_progress.json', {**report, 'updated_at': now(), 'selected': selected})
    try:
        for category in categories:
            await click_filter(page, category)
            await reset_listing_first_page(page)
            item = {'category': category, 'pages': 0, 'selected': 0, 'years_found': [], 'undated_titles': []}
            report['categories'].append(item)
            seen = set()
            for page_index in range(301):
                if page_index == 300:
                    raise RuntimeError('列表超过300页，已停止并保留选卷进度')
                rows = await wait_paper_items(page)
                if category == '省考模拟题':
                    await verify_mock_region(page)
                if not rows:
                    raise RuntimeError('无法读取分类列表：' + category)
                signature = tuple(tuple(row) for row in list_signature(rows))
                if signature in seen:
                    raise RuntimeError('翻页后列表未变化或发生循环：' + category)
                seen.add(signature)
                for row in rows:
                    if not accepts_paper(category, row['title']):
                        continue
                    year = paper_year(row['title'])
                    if year is None:
                        item['undated_titles'].append(row['title'])
                    elif year_start <= year <= year_end:
                        selected.append({'title': row['title'], 'listing': {**mock_scope(category), 'url': page.url, 'category': category,
                            'page_index': page_index, 'signature': [list(r) for r in signature]}})
                        if year not in item['years_found']:
                            item['years_found'].append(year)
                if selected:
                    selected = validate_targets(selected)
                item['pages'] = page_index + 1
                item['selected'] = sum(t['listing']['category'] == category for t in selected)
                persist()
                print(f'[自动选卷] {category} 第{page_index+1}页；{year_start}—{year_end}年已选{item["selected"]}套，累计{len(selected)}套', flush=True)
                if not await click_next(page, NEXT_LIST):
                    break
                deadline = time.monotonic() + SELECTION_PAGE_WAIT_SECONDS
                while time.monotonic() < deadline:
                    if list_signature(await wait_paper_items(page)) != signature:
                        break
                    await asyncio.sleep(0.15)
                else:
                    raise RuntimeError('翻页后列表未变化：' + category)
            item['years_found'].sort()
            item['years_absent_from_listing'] = [y for y in range(year_start, year_end+1) if y not in item['years_found']]
        if not selected:
            raise ValueError('所选分类没有找到该年份范围内的试卷，可改用m手动选择')
        report['status'] = 'selected'
        persist()
        print(f'[自动选卷完成] {year_start}—{year_end}年，{len(categories)}个分类，共{len(selected)}套，开始采集。', flush=True)
        return validate_targets(selected)
    except Exception as exc:
        report.update(status='selection_incomplete', error=str(exc))
        persist()
        raise


async def choose_targets(page, args):
    from fenbi_crawler_v2 import visible_categories, click_filter, paper_items, wait_paper_items, list_signature, click_next, NEXT_LIST, accepts_paper, verify_mock_region
    names = await visible_categories(page)
    if not names:
        raise ValueError('请先在浏览器打开真题或模拟题列表，再选择选卷模式')
    print('\n'.join(f'{i+1}. {name}' + ('（默认江苏B卷）' if name == '省考模拟题' else '') for i, name in enumerate(names)))
    while True:
        value = await asyncio.to_thread(input, '分类编号（可多选，例如2,5,6,19；也可5-8）：')
        try:
            category_indices = parse_selection(value, len(names))
            break
        except ValueError as exc:
            print('分类选择无效：' + str(exc), flush=True)
    from fenbi_crawler_v2 import now
    current_year = int(now()[:4])
    while True:
        value = await asyncio.to_thread(input, f'年份范围：Enter=近十年{current_year-9}—{current_year}；也可2017-2026；m=手动选卷：')
        try:
            years = parse_year_setting(value, current_year)
            break
        except ValueError as exc:
            print(str(exc), flush=True)
    if years is not None:
        return await scan_year_targets(page, [names[i] for i in category_indices], *years, output=getattr(args, 'output', None))
    selected = []
    for position, category_index in enumerate(category_indices):
        category = names[category_index]
        await click_filter(page, category)
        page_index = 0
        print(f'\n正在选卷：{category}（分类{position+1}/{len(category_indices)}）', flush=True)
        while True:
            rows = await wait_paper_items(page)
            if category == '省考模拟题':
                await verify_mock_region(page)
            if not rows:
                raise ValueError('当前分类没有读取到试卷：' + category)
            print('\n'.join(f'{i+1}. {row["title"]}' for i, row in enumerate(rows)))
            next_action = '下一分类' if position + 1 < len(category_indices) else '开始全部采集'
            value = (await asyncio.to_thread(input,
                f'当前{category}，累计已选{len(selected)}套。输入编号/范围；ab选本页5组A/B；n下一页；s{next_action}：')).strip().lower()
            if value == 's':
                if position + 1 == len(category_indices) and not selected:
                    print('尚未选择试卷，请至少选择一套。', flush=True)
                    continue
                break
            if value == 'n':
                if not await click_next(page, NEXT_LIST):
                    print('已到最后一页。', flush=True)
                else:
                    page_index += 1
                continue
            try:
                indices = select_ab_pairs(rows) if value == 'ab' else parse_selection(value, len(rows))
            except ValueError as exc:
                print(str(exc), flush=True)
                continue
            for i in indices:
                if not accepts_paper(category, rows[i]['title']):
                    print('跳过非江苏B卷：' + rows[i]['title'], flush=True)
                    continue
                selected.append({'title': rows[i]['title'], 'listing': {**mock_scope(category), 'url': page.url, 'category': category,
                    'page_index': page_index, 'signature': [list(r) for r in list_signature(rows)]}})
            selected = validate_targets(selected)
    return validate_targets(selected)


async def open_target(context, page, target):
    from fenbi_crawler_v2 import paper_items, wait_paper_items, list_signature, click_filter, reset_listing_first_page, click_next, NEXT_LIST, open_paper, ListingStateError
    listing = target.get('listing')
    if not listing:
        await page.goto(target['url'], wait_until='domcontentloaded')
        return page
    signature = tuple(tuple(row) for row in listing['signature'])
    if listing['category'] == '省考模拟题' or list_signature(await paper_items(page)) != signature:
        if page.url != listing['url']:
            await page.goto(listing['url'], wait_until='domcontentloaded')
        await click_filter(page, listing['category'])
        await reset_listing_first_page(page)
        await wait_paper_items(page)
        for _ in range(listing['page_index']):
            if not await click_next(page, NEXT_LIST):
                raise ListingStateError('无法恢复所选卷的列表页码')
            await wait_paper_items(page)
    rows = await wait_paper_items(page)
    if list_signature(rows) != signature:
        raise ListingStateError('所选卷列表已变化，未点击其他卷；重新选卷可恢复')
    matches = [row for row in rows if row['title'] == target['title']]
    if len(matches) != 1:
        raise ListingStateError('所选卷标题不唯一或已不存在')
    return await open_paper(context, matches[0], page, signature)


@contextmanager
def task_lock(output):
    path = Path(output) / 'batch_task.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        handle.seek(0, 2)
        if handle.tell() == 0:
            handle.write(b'0'); handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise RuntimeError('同一输出目录已有任务在运行，请使用原窗口；未重复采集。') from None
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


async def run_batch(context, page, args, submitted, targets=None):
    with task_lock(args.output):
        return await _run_batch(context, page, args, submitted, targets)


async def _run_batch(context, page, args, submitted, targets=None):
    from fenbi_crawler_v2 import (now, valid_receipt, complete_entries, crawl_current_page,
                                 UserActionRequired, run_status, restore_listing, allowed_page)
    path = args.output / 'batch_task.json'
    if targets is None:
        job = json.loads(path.read_text(encoding='utf-8'))
        restored = validate_targets([entry['target'] for entry in job['papers']])
        if len(restored) != len(job['papers']):
            raise ValueError('保存的任务包含重复卷，未计数，请重新选卷')
    else:
        targets = validate_targets(targets)
        # Keep old selected jobs available when the user explicitly starts new work.
        if path.exists():
            backup = args.output / 'task_history'
            backup.mkdir(exist_ok=True)
            (backup / (str(time.time_ns()) + '.json')).write_bytes(path.read_bytes())
        job = {'version': VERSION, 'created_at': now(), 'papers': [{'target': t, 'state': 'pending', 'attempts': []} for t in targets]}
    args.unattended = True
    auth_recoveries = 0
    def persist():
        job['target'] = len(job['papers'])
        job['complete_papers'] = sum(p['state'] == 'success' for p in job['papers'])
        job['target_met'] = job['complete_papers'] == job['target']
        job['updated_at'] = now()
        json_write(path, job)
        lines = [f'选卷任务：{job.get("state", "running")}', f'已完成 {job["complete_papers"]}/{job["target"]} 套', '登录与验证码由本人完成；普通故障限次重试，失败卷不计成功。']
        for item in job['papers']:
            lines.append(item['state'] + ' | ' + item['target']['title'])
            if item['state'] == 'success' and item.get('receipt', {}).get('status') == 'success':
                lines.append('  可导入：' + str(Path(item['receipt']['path']) / 'paper_v2.json'))
            elif item.get('error'):
                lines.append('  原因：' + item['error'])
        (args.output / 'batch_summary.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    persist()
    prior = complete_entries(args.output)
    for entry in job['papers']:
        title = entry['target']['title']
        receipt = entry.get('receipt')
        if receipt and receipt.get('title') != title:
            receipt = None
        if not (receipt and valid_receipt(receipt)):
            receipt = prior.get(title)
        if receipt and valid_receipt(receipt):
            entry.update(state='success', receipt=receipt)
            persist()
            continue
        entry['state'] = 'pending'
        entry.pop('receipt', None)
        attempt = 0
        while attempt <= getattr(args, 'paper_retries', 2):
            entry['state'] = 'running'
            record = {'started_at': now(), 'number': len(entry['attempts']) + 1}
            entry['attempts'].append(record)
            persist()  # Running attempts recover as pending after a process interruption.
            worker = None
            try:
                if page.is_closed():
                    page = await context.new_page()
                issue = await account_issue(page)
                if issue:
                    raise UserActionRequired(issue)
                async def process():
                    nonlocal worker
                    observed = entry.get('last_page_url', '')
                    if allowed_page(observed) and re.search(r'/exam/(exercise|solution)/', urlsplit(observed).path):
                        await page.goto(observed, wait_until='domcontentloaded')
                        worker = page
                    else:
                        worker = await open_target(context, page, entry['target'])
                    issue = await account_issue(worker)
                    if issue:
                        raise UserActionRequired(issue)
                    return await crawl_current_page(context, worker, args, submitted,
                        entry['target'].get('expected_count'), title)
                result = await asyncio.wait_for(process(), timeout=getattr(args, 'paper_timeout', 240))
                if result['status'] != 'success':
                    issue = await account_issue(worker)
                    if issue:
                        raise UserActionRequired(issue)
                record.update(finished_at=now(), status=result['status'], receipt=result)
                entry['receipt'] = result
                if result['status'] == 'success' and valid_receipt(result):
                    entry['state'] = 'success'
                    entry.pop('error', None)
                    break
                entry['state'] = 'incomplete'
            except UserActionRequired as exc:
                entry.update(state='needs_user', error=str(exc))
                record.update(finished_at=now(), status='needs_user')
                job['state'] = 'needs_user'; persist()
                try:
                    if auth_recoveries >= 2:
                        raise UserActionRequired('本次登录/验证已反复出现，保留任务并停止自动尝试')
                    await wait_for_account(worker or page, args, str(exc))
                    auth_recoveries += 1
                except UserActionRequired:
                    return job
                job['state'] = 'running'
                record['status'] = 'account_restored'
                continue  # Authentication recovery does not consume a paper retry.
            except Exception as exc:
                issue = await account_issue(worker or page)
                if issue:
                    entry.update(state='needs_user', error=issue)
                    job['state'] = 'needs_user'; persist()
                    try:
                        if auth_recoveries >= 2:
                            raise UserActionRequired('登录/验证反复出现')
                        await wait_for_account(worker or page, args, issue)
                        auth_recoveries += 1
                    except UserActionRequired:
                        return job
                    job['state'] = 'running'
                    record['status'] = 'account_restored'
                    continue
                record.update(finished_at=now(), status='failed', error=type(exc).__name__ + ': ' + str(exc))
                entry.update(state='failed', error=record['error'])
            finally:
                if worker and allowed_page(worker.url) and re.search(r'/exam/(exercise|solution)/', urlsplit(worker.url).path):
                    entry['last_page_url'] = worker.url
                if worker and worker is not page and not worker.is_closed():
                    try:
                        await worker.close()
                    except Exception as exc:
                        record['close_error'] = str(exc)
                if worker and entry['target'].get('listing'):
                    listing = entry['target']['listing']
                    try:
                        await restore_listing(page, listing['url'], listing['category'], listing['page_index'], tuple(tuple(r) for r in listing['signature']))
                    except Exception as exc:
                        record['listing_restore_error'] = str(exc)
                persist()
            attempt += 1
            if attempt <= getattr(args, 'paper_retries', 2):
                print(f'[自动恢复] {title}，下一次尝试将重新打开页面并读取当前图片地址。', flush=True)
                await asyncio.sleep(0.5 * attempt)
        print(f'[任务] {title}：{entry["state"]}', flush=True)
    job['complete_papers'] = sum(p['state'] == 'success' for p in job['papers'])
    job['target'] = len(job['papers'])
    job['target_met'] = job['complete_papers'] == job['target']
    job['state'] = 'completed' if job['target_met'] else 'completed_with_gaps'
    persist()
    run_status(args.output, job['state'], complete_papers=job['complete_papers'], target=job['target'], resume_available=not job['target_met'])
    return job
