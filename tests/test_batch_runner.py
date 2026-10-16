"""Original end-to-end pages for unattended jobs; no real questions/accounts."""
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import test_crawler as fixtures
import fenbi_crawler_v2 as crawler
from batch_runner import (run_batch, parse_selection, validate_targets,
                          submission_key, load_submission_events, account_issue)


def args_for(folder, **kw):
    return SimpleNamespace(output=Path(folder), daily_target=10, max_rounds=3,
        download_images=False, auto_submit=False, headless=True,
        paper_retries=kw.pop('paper_retries', 1), paper_timeout=10,
        auth_wait=1, **kw)


def targets(count=10):
    return [{'title': f'2026合成{n}{"A" if n % 2 else "B"}卷',
             'url': f'https://www.fenbi.com/exam/solution/{n}'} for n in range(1, count+1)]


def solution(target, images=True):
    no = target['url'].rsplit('/', 1)[-1]
    return f'<h1>{target["title"]}</h1><div class="paper-summary">共1题</div>' + fixtures.question('id'+no, 1, images)


class BatchTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.BrowserTests.asyncSetUp
    asyncTearDown = fixtures.BrowserTests.asyncTearDown

    async def serve(self, plan, full_length=False):
        lookup = {t['url']: t for t in plan}
        visits = []
        async def route(r):
            visits.append(r.request.url)
            target=lookup[r.request.url]
            body=solution(target)
            if full_length:
                no=target['url'].rsplit('/',1)[-1]
                body='<h1>'+target['title']+'</h1><div class=paper-summary>共135题</div>'+''.join(fixtures.question(f'paper{no}q{i}',i) for i in range(1,136))
            await r.fulfill(body=body, content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**', route)
        return visits

    async def test_ten_papers_without_input_and_resume_without_reopening(self):
        plan = targets(); visits = await self.serve(plan,full_length=True)
        with TemporaryDirectory() as td, patch('builtins.input', side_effect=AssertionError('batch must not prompt')):
            args=args_for(td)
            job=await run_batch(self.context,self.page,args,{},plan)
            self.assertTrue(job['target_met'],job)
            self.assertEqual(job['complete_papers'],10)
            self.assertEqual(sum(p['receipt']['questions'] for p in job['papers']),1350)
            self.assertEqual(len(visits),10)
            job=await run_batch(self.context,self.page,args,{},None)
            self.assertTrue(job['target_met'])
            self.assertEqual(len(visits),10)
            self.assertTrue(all(crawler.valid_receipt(p['receipt']) for p in job['papers']))

    async def test_bad_paper_exhausts_retries_and_remaining_nine_finish(self):
        plan=targets(); seen=[];lookup={t['url']:t for t in plan}
        async def route(r):
            seen.append(r.request.url)
            body='<h1>暂不可用</h1>' if r.request.url==plan[0]['url'] else solution(lookup[r.request.url])
            await r.fulfill(body=body,content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        with TemporaryDirectory() as td, patch.object(crawler,'PAGE_READY_SECONDS',0.05):
            job=await run_batch(self.context,self.page,args_for(td),{},plan)
            self.assertEqual(job['state'],'completed_with_gaps')
            self.assertEqual(job['complete_papers'],9)
            self.assertEqual(seen.count(plan[0]['url']),2)
            self.assertEqual(len(job['papers'][0]['attempts']),2)

    async def test_failed_media_reopens_paper_and_uses_new_resource_urls(self):
        plan=targets(1);visits=[]
        async def route(r):
            visits.append(r.request.url)
            body=solution(plan[0])
            if len(visits)==1:
                body=body.replace(fixtures.PIXEL,'data:image/png;base64,broken')
            await r.fulfill(body=body,content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        with TemporaryDirectory() as td:
            job=await run_batch(self.context,self.page,args_for(td),{},plan)
            self.assertTrue(job['target_met'])
            self.assertEqual(len(visits),2)
            self.assertEqual([a['status'] for a in job['papers'][0]['attempts']],['incomplete','success'])

    async def test_cancelled_second_paper_resumes_without_repeating_first(self):
        plan=targets(3); visits=await self.serve(plan)
        original=crawler.crawl_current_page
        async def interrupted(context,page,args,submitted,expected=None,title=None):
            if title==plan[1]['title']:
                raise asyncio.CancelledError()
            return await original(context,page,args,submitted,expected,title)
        with TemporaryDirectory() as td:
            args=args_for(td)
            with patch.object(crawler,'crawl_current_page',side_effect=interrupted):
                with self.assertRaises(asyncio.CancelledError):
                    await run_batch(self.context,self.page,args,{},plan)
            stored=json.loads((Path(td)/'batch_task.json').read_text())
            self.assertEqual([p['state'] for p in stored['papers']],['success','running','pending'])
            job=await run_batch(self.context,self.page,args,{},None)
            self.assertTrue(job['target_met'])
            self.assertEqual(visits.count(plan[0]['url']),1)
            self.assertEqual(visits.count(plan[1]['url']),2)

    async def test_tampered_media_receipt_is_reprocessed(self):
        plan=targets(1);visits=await self.serve(plan)
        with TemporaryDirectory() as td:
            args=args_for(td);job=await run_batch(self.context,self.page,args,{},plan)
            receipt=job['papers'][0]['receipt']
            (Path(receipt['path'])/'media_manifest.json').write_text('[]')
            self.assertFalse(crawler.valid_receipt(receipt))
            job=await run_batch(self.context,self.page,args,{},None)
            self.assertTrue(job['target_met']);self.assertEqual(len(visits),2)

    async def test_unattended_unknown_submit_dialog_never_prompts(self):
        with TemporaryDirectory() as td:
            await self.page.set_content('<app-question-choice>合成练习题</app-question-choice><button class="submit-btn">交卷</button>')
            args=args_for(td);args.auto_submit=True;args.headless=False;args.unattended=True
            with patch('builtins.input',side_effect=AssertionError('must not prompt')):
                with self.assertRaises(RuntimeError):
                    await crawler.ensure_solution(self.page,args,{})

    async def test_login_requires_owner_and_preserves_remaining_job(self):
        plan=targets(2)
        async def route(r):
            await r.fulfill(body='<h1>登录</h1><input type="password">',content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        with TemporaryDirectory() as td:
            job=await run_batch(self.context,self.page,args_for(td),{},plan)
            self.assertEqual(job['state'],'needs_user')
            self.assertEqual(job['papers'][0]['state'],'needs_user')
            self.assertEqual(job['papers'][1]['state'],'pending')
            self.assertEqual(job['complete_papers'],0)

    async def test_account_recovery_reopens_original_target_without_consuming_retry(self):
        plan=targets(1);signed_in=False
        async def route(r):
            await r.fulfill(body=solution(plan[0]) if signed_in else '<h1>登录</h1><input type="password">',content_type='text/html; charset=utf-8')
        async def owner_signs_in(*unused):
            nonlocal signed_in
            signed_in=True
            await unused[0].reload()
        await self.context.route('https://www.fenbi.com/**',route)
        with TemporaryDirectory() as td, patch('batch_runner.wait_for_account',side_effect=owner_signs_in):
            job=await run_batch(self.context,self.page,args_for(td,paper_retries=0),{},plan)
            self.assertTrue(job['target_met'])
            self.assertEqual(len(job['papers'][0]['attempts']),2)

    async def test_media_request_retries_transient_error(self):
        import base64
        response=SimpleNamespace(ok=True,status=200,body=AsyncMock(return_value=base64.b64decode(fixtures.PIXEL.split(',')[1])))
        context=SimpleNamespace(request=SimpleNamespace(get=AsyncMock(side_effect=[SimpleNamespace(ok=False,status=503),response])))
        v2=fixtures.to_v2(fixtures.dataset());v2['questions'][0]['stemHtml']='<img src="https://cdn.example.test/a.png">'
        with TemporaryDirectory() as td:
            manifest=await crawler.verify_media(context,v2,Path(td))
        self.assertEqual(manifest[0]['status'],'verified')
        self.assertEqual(context.request.get.await_count,2)

    async def test_ten_selected_same_tab_papers_keep_listing_state(self):
        plan=targets();lookup={t['url']:t for t in plan}
        listing='<span class="categories-item">A/B类</span>'+''.join('<div class="paper-item"><a href="'+t['url']+'"><span class="item-info-title">'+t['title']+'</span></a></div>' for t in plan)
        async def route(r):
            await r.fulfill(body=listing if r.request.url.endswith('/list') else solution(lookup[r.request.url]),content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        await self.page.goto('https://www.fenbi.com/list')
        signature=[list(r) for r in crawler.list_signature(await crawler.paper_items(self.page))]
        selected=[{'title':t['title'],'listing':{'url':self.page.url,'category':'A/B类','page_index':0,'signature':signature}} for t in plan]
        with TemporaryDirectory() as td:
            job=await run_batch(self.context,self.page,args_for(td),{},selected)
            self.assertTrue(job['target_met'],job)
            self.assertTrue(self.page.url.endswith('/list'))

    async def test_real_layout_arrow_pager_does_not_click_past_last_page(self):
        await self.page.set_content('<footer class="question-list-pager"><div class="paging"><div class="item active">1</div><div class="item">2</div><div class="item">3</div><div class="item"><div class="houpage" style="width:20px;height:20px" onclick="window.moved=(window.moved||0)+1"></div></div></div></footer>')
        self.assertTrue(await crawler.click_next(self.page,crawler.NEXT_LIST))
        await self.page.evaluate("document.querySelector('.item.active').classList.remove('active');document.querySelectorAll('.item')[2].classList.add('active')")
        self.assertFalse(await crawler.click_next(self.page,crawler.NEXT_LIST))
        self.assertEqual(await self.page.evaluate('window.moved'),1)

    async def test_media_overall_timeout_keeps_explicit_incomplete_manifest(self):
        async def slow(*args,**kwargs):
            await asyncio.sleep(60)
        context=SimpleNamespace(request=SimpleNamespace(get=AsyncMock(side_effect=slow)))
        v2=fixtures.to_v2(fixtures.dataset());v2['questions'][0]['stemHtml']='<img src="https://cdn.example.test/slow.png">'
        with TemporaryDirectory() as td,patch.object(crawler,'MEDIA_VERIFY_SECONDS',0.02):
            manifest=await crawler.verify_media(context,v2,Path(td))
        self.assertEqual(manifest[0]['status'],'media_time_limit')

    async def test_pre_upgrade_success_is_revalidated_instead_of_discarded(self):
        with TemporaryDirectory() as td:
            receipt=await crawler.save_exam(None,fixtures.dataset(),args_for(td))
            receipt.pop('file_hashes');receipt['version']='2.4.1-candidate'
            self.assertTrue(crawler.valid_receipt(receipt))
            path=Path(receipt['path'])/'questions.json';data=json.loads(path.read_text());data['questions'][0]['answer']=None;path.write_text(json.dumps(data))
            self.assertFalse(crawler.valid_receipt(receipt))

    async def test_retry_keeps_original_exercise_and_does_not_submit_again(self):
        plan=targets(1)
        listing='<span class="categories-item">A/B类</span><div class="paper-item" onclick="sessionStorage.opens=String(Number(sessionStorage.opens||0)+1);location.href=\'/exam/exercise/\'+sessionStorage.opens"><span class="item-info-title">'+plan[0]['title']+'</span></div>'
        async def route(r):
            body=listing if r.request.url.endswith('/list') else '<h1>'+plan[0]['title']+'</h1><app-question-choice>合成题面</app-question-choice><button class="submit-btn" onclick="sessionStorage.clicks=String(Number(sessionStorage.clicks||0)+1)">交卷</button>'
            await r.fulfill(body=body,content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        await self.page.goto('https://www.fenbi.com/list')
        signature=[list(r) for r in crawler.list_signature(await crawler.paper_items(self.page))]
        selected=[{'title':plan[0]['title'],'listing':{'url':self.page.url,'category':'A/B类','page_index':0,'signature':signature}}]
        with TemporaryDirectory() as td,patch.object(crawler,'SUBMIT_CONFIRM_SECONDS',0.02):
            args=args_for(td);args.auto_submit=True
            job=await run_batch(self.context,self.page,args,{},selected)
            self.assertFalse(job['target_met'])
            self.assertEqual(await self.page.evaluate('Number(sessionStorage.opens)'),1)
            self.assertEqual(await self.page.evaluate('Number(sessionStorage.clicks)'),1)
            self.assertEqual(len((Path(td)/'submission_events.jsonl').read_text().splitlines()),1)

    async def test_title_mismatch_never_submits_wrong_paper(self):
        await self.page.set_content('<h1>其他卷</h1><app-question-choice>合成题面</app-question-choice><button class="submit-btn" onclick="window.clicked=true">交卷</button>')
        with TemporaryDirectory() as td:
            args=args_for(td);args.auto_submit=True
            with self.assertRaisesRegex(RuntimeError,'标题'):
                await crawler.ensure_solution(self.page,args,{},'所选A卷')
            self.assertIsNone(await self.page.evaluate('window.clicked'))

    async def test_submission_record_after_partial_line_survives_restart(self):
        with TemporaryDirectory() as td:
            (Path(td)/'submission_events.jsonl').write_text('{partial')
            await self.page.set_content('<app-question-choice>合成题面</app-question-choice><button class="submit-btn" onclick="document.body.innerHTML=solution">交卷</button><script>const solution='+json.dumps(fixtures.question())+'</script>')
            args=args_for(td);args.auto_submit=True
            await crawler.ensure_solution(self.page,args,{})
            restored=load_submission_events(Path(td))
            self.assertEqual(restored[submission_key(self.page.url)]['status'],'solution_opened')


class JobValidationTests(unittest.TestCase):
    def test_ranges_and_aliases_keep_ab_separate(self):
        self.assertEqual(parse_selection('1-3,3,5',5),[0,1,2,4])
        self.assertEqual(len(validate_targets(targets(2)+targets(2))),2)
        with self.assertRaises(ValueError):parse_selection('1-20',10)
        with self.assertRaises(ValueError):validate_targets([targets(1)[0],{'title':'另一卷','url':'https://www.fenbi.com/exam/exercise/1'}])

    def test_attempted_submission_survives_restart_and_solution_url_alias(self):
        with TemporaryDirectory() as td:
            url='https://spa.fenbi.com/ti/exam/exercise/id?routecs=xingce'
            (Path(td)/'submission_events.jsonl').write_text(json.dumps({'url':url,'status':'attempted'})+'\n{partial')
            events=load_submission_events(Path(td))
            self.assertIn(submission_key(url.replace('/exercise/','/solution/')),events)

    def test_plan_validates_all_targets_before_any_navigation(self):
        with self.assertRaises(ValueError):
            validate_targets(targets(1)+[{'title':'非粉笔链接','url':'https://example.test/'}])

    def test_job_lock_is_exclusive_and_released_after_failure(self):
        from batch_runner import task_lock
        with TemporaryDirectory() as td:
            with task_lock(Path(td)):
                with self.assertRaises(RuntimeError):
                    with task_lock(Path(td)):
                        self.fail('second writer should not acquire the job')
            with task_lock(Path(td)):
                pass

    def test_ab_selection_uses_five_complete_year_pairs_and_ignores_c(self):
        from batch_runner import select_ab_pairs
        rows=[{'title':f'{year}年江苏《行测》题（{kind}类）（网友回忆版）'} for year in range(2021,2026) for kind in 'CBA']
        chosen=select_ab_pairs(rows)
        self.assertEqual(len(chosen),10)
        self.assertIn('2025',rows[chosen[0]]['title'])
        self.assertTrue(all('C类' not in rows[i]['title'] for i in chosen))
        with self.assertRaises(ValueError):select_ab_pairs(rows[:6])
