import asyncio
import base64
import copy
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock
from PIL import Image
from playwright.async_api import async_playwright
from bank_core import parse_question, to_v2, validate_exam, validate_question
from fenbi_crawler_v2 import (crawl_category, daily_entries, ensure_solution,
    extract_exam_data, save_exam, verify_media, valid_receipt, open_paper, paper_items, list_signature, click_next, NEXT_QUESTION, crawl_current_page, solution_visible, ListingStateError)

buf = io.BytesIO()
Image.new('RGB', (2, 2), 'white').save(buf, format='PNG')
PIXEL = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

def question(gid='q1', order=1, images=False):
    options = ''.join('<li><label class="choice-radio-label"><input type="radio"><div class="input-radio">'+chr(65+i)+'</div><p class="input-text">'+
        (f'<img src="{PIXEL}" alt="option {i}">' if images else '相同文字')+'</p></label></li>' for i in range(4))
    return f'''<app-ti data-question-no="{order}" data-subject="判断推理">
      <app-question-choice><div class="question-choice-container"><app-format-html><p>合成测试题</p></app-format-html>
      <app-choice-radio><ul>{options}</ul></app-choice-radio></div></app-question-choice>
      <app-solution-overall><span class="correct-answer">B</span><span class="correct-rate">0%</span></app-solution-overall>
      <section id="section-solution-{gid}"><div class="content"><p>合成解析</p></div></section>
      <section id="section-source-{gid}"><div class="content">测试来源</div></section></app-ti>'''

def dataset(count=1):
    return {'paper_title':'2026合成A卷','page_url':'https://www.fenbi.com/solution/test', 'expected_count':count,
            'questions':[parse_question(question('q'+str(i),i), 'https://www.fenbi.com') for i in range(1,count+1)]}

class CoreTests(unittest.TestCase):
    def test_four_pure_image_options_and_equal_text_options_preserved(self):
        for image in (True,False):
            q=parse_question(question(images=image),'https://www.fenbi.com')
            self.assertEqual(len(q['options']),4)
            self.assertTrue(validate_question(q)['ok'])
        self.assertEqual(q['rate'],0)

    def test_missing_id_or_order_cannot_be_invented(self):
        h=question().replace('section-solution-q1','no-platform-id').replace('data-question-no="1"','')
        q=parse_question(h,'https://www.fenbi.com')
        self.assertIsNone(q['globalId']); self.assertIsNone(q['question_no'])
        self.assertFalse(validate_question(q)['ok'])

    def test_missing_rate_is_optional_answer_is_required(self):
        q=parse_question(question().replace('<span class="correct-rate">0%</span>',''),'https://www.fenbi.com')
        self.assertTrue(validate_question(q)['ok']); self.assertIsNone(q['rate'])
        q['answer']='答案B'; self.assertFalse(validate_question(q)['ok'])

    def test_lazy_image_source_is_normalized_and_missing_source_rejected(self):
        h=question().replace('合成测试题','<img src="placeholder" data-src="//cdn.example/formula.png" srcset="old 2x">')
        q=parse_question(h,'https://www.fenbi.com')
        self.assertIn('https://cdn.example/formula.png',q['stem_html'])
        self.assertNotIn('srcset',q['stem_html'])
        q['stem_html']='<img>'
        self.assertFalse(validate_question(q)['ok'])

    def test_incomplete_count_orders_and_duplicates_rejected(self):
        d=dataset(2); self.assertTrue(validate_exam(d)['ok'])
        d['expected_count']=3; self.assertFalse(validate_exam(d)['ok'])
        d=dataset(2); d['questions'][1]['question_no']=1
        self.assertIn('non_contiguous_orders',validate_exam(d)['issues'])
        d=dataset(2); d['questions'][1]['globalId']='q1'
        self.assertIn('duplicate_platform_ids',validate_exam(d)['issues'])
        d=dataset(); d['expected_count']=None
        self.assertIn('unknown_expected_count',validate_exam(d)['issues'])

    def test_materials_referenced_in_card_and_conflicts_rejected(self):
        d=dataset(2)
        for q in d['questions']:
            q['materials']=[{'globalId':'local-material:test','content':'<p>共享材料</p>'}]
        v=to_v2(d)
        self.assertEqual(len(v['materials']),1)
        self.assertEqual([n['materialKeys'] for n in v['card']['children'][0]['children']], [['local-material:test']]*2)
        d['questions'][1]['materials'][0]['content']='不同材料'
        self.assertFalse(validate_exam(d)['ok'])

    def test_inline_math_not_silently_declared_compatible(self):
        q=parse_question(question().replace('合成测试题','<math><mi>x</mi></math>'),'https://www.fenbi.com')
        self.assertFalse(validate_question(q)['ok'])

    def test_v2_order_and_source_do_not_change_membership(self):
        d=dataset(2); d['questions'].reverse()
        d['questions'][0]['source_html']='2026另一个B卷第99题'
        v=to_v2(d)
        self.assertEqual(list(v),['name','question_count','card','materials','questions'])
        self.assertEqual([q['order'] for q in v['questions']],[1,2])
        self.assertEqual(v['name'],'2026合成A卷')


class SaveTests(unittest.IsolatedAsyncioTestCase):
    async def test_diagnostics_exist_even_if_first_page_check_fails(self):
        with TemporaryDirectory() as td:
            page=SimpleNamespace(url='https://www.fenbi.com/solution/test',locator=lambda s: SimpleNamespace(first=SimpleNamespace(wait_for=AsyncMock(side_effect=RuntimeError('synthetic page check failed')))))
            args=SimpleNamespace(output=Path(td))
            with self.assertRaisesRegex(RuntimeError,'synthetic page check failed'):
                await crawl_current_page(None,page,args,{})
            checkpoint=json.loads((Path(td)/'capture_checkpoint.json').read_text())
            self.assertEqual(checkpoint['questions'],[])
            self.assertEqual(checkpoint['status'],'checking_solution_not_import_ready')
            self.assertEqual(json.loads((Path(td)/'run_status.json').read_text())['phase'],'checking_solution_page')

    async def test_solution_probe_does_not_wait_forever(self):
        async def stuck(*args):
            await asyncio.sleep(10)
        with unittest.mock.patch('fenbi_crawler_v2.BROWSER_QUERY_SECONDS',0.03):
            with self.assertRaises(TimeoutError):
                await solution_visible(SimpleNamespace(evaluate=AsyncMock(side_effect=stuck)))

    async def test_verified_images_stay_portable_and_nonimage_not_accepted(self):
        with TemporaryDirectory() as td:
            d=dataset();d['questions'][0]=parse_question(question(images=True),'https://www.fenbi.com')
            v=to_v2(d);before=copy.deepcopy(v)
            media=await verify_media(None,v,Path(td),True)
            self.assertEqual(v,before)
            self.assertTrue(all(r['status']=='verified' for r in media))
            self.assertTrue(all((Path(td)/r['local_path']).exists() for r in media))
            v['questions'][0]['stemHtml']='<img src="https://cdn.example/test.png">'
            response=SimpleNamespace(ok=True,status=200,body=AsyncMock(return_value=b'<html>login</html>'))
            context=SimpleNamespace(request=SimpleNamespace(get=AsyncMock(return_value=response)))
            media=await verify_media(context,v,Path(td))
            self.assertEqual(media[0]['status'],'unverified')

    async def test_only_complete_outputs_count_and_tampering_invalidates_receipt(self):
        with TemporaryDirectory() as td:
            args=SimpleNamespace(output=Path(td),download_images=False)
            d=dataset();d['questions'][0]['answer']=None
            result=await save_exam(None,d,args)
            self.assertEqual(result['status'],'incomplete')
            self.assertFalse((Path(result['path'])/'paper_v2.json').exists())
            self.assertEqual(len(daily_entries(Path(td))),0)
            result=await save_exam(None,dataset(),args)
            self.assertTrue(valid_receipt(result));self.assertEqual(len(daily_entries(Path(td))),1)
            (Path(result['path'])/'paper_v2.json').write_text('{}')
            self.assertFalse(valid_receipt(result));self.assertEqual(len(daily_entries(Path(td))),0)

    async def test_alias_urls_do_not_count_twice_but_ab_titles_do(self):
        with TemporaryDirectory() as td:
            args=SimpleNamespace(output=Path(td),download_images=False)
            await save_exam(None,dataset(),args)
            d=dataset();d['page_url']+='?alias=1';await save_exam(None,d,args)
            self.assertEqual(len(daily_entries(Path(td))),1)
            d['paper_title']='2026合成B卷';await save_exam(None,d,args)
            self.assertEqual(len(daily_entries(Path(td))),2)


class BrowserTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.pw=await async_playwright().start()
        launch={'headless':True}
        if os.environ.get('TEST_CHROMIUM_EXECUTABLE'):
            launch['executable_path']=os.environ['TEST_CHROMIUM_EXECUTABLE']
        self.browser=await self.pw.chromium.launch(**launch)
        self.context=await self.browser.new_context()
        self.page=await self.context.new_page()

    async def asyncTearDown(self):
        await self.browser.close();await self.pw.stop()

    async def test_next_question_collects_two_and_links_only_second_material(self):
        mat='<app-materials><div class="materials-container"><div class="material-content"><p class="material-content">共享材料</p></div></div></app-materials>'
        second='<div class="question-group">'+mat+question('q2',2,True)+'</div>'
        html='<h1>2026合成A卷</h1><div class="question-count">共2题</div><main>'+question()+'</main>'
        html+='<button class="next-question" onclick="document.querySelector(\'main\').innerHTML=next;this.disabled=true">下一题</button><script>const next='+json.dumps(second)+'</script>'
        await self.page.set_content(html)
        d=await extract_exam_data(self.page,max_rounds=8)
        self.assertTrue(validate_exam(d)['ok'],validate_exam(d))
        self.assertEqual([len(q['materials']) for q in d['questions']],[0,1])
        self.assertEqual(len(to_v2(d)['materials']),1)

    async def test_unknown_count_and_unassociated_material_fail_closed(self):
        await self.page.set_content('<h1>测试卷</h1>'+question())
        d=await extract_exam_data(self.page,max_rounds=5)
        self.assertIn('unknown_expected_count',validate_exam(d)['issues'])
        html='<h1>测试卷</h1><div data-question-count="2"></div>'+question()+question('q2',2)
        html+='<div class="materials-container"><div class="material-content">关系未知的材料</div></div>'
        await self.page.set_content(html)
        d=await extract_exam_data(self.page,max_rounds=5)
        self.assertIn('unresolved_visible_material',d['collection_errors'])

    async def test_navigation_query_has_external_deadline(self):
        async def stuck(*args):
            await asyncio.sleep(10)
        fake=SimpleNamespace(evaluate=AsyncMock(side_effect=stuck))
        with unittest.mock.patch('fenbi_crawler_v2.BROWSER_QUERY_SECONDS',0.03):
            with self.assertRaisesRegex(RuntimeError,'browser_navigation_timeout'):
                await click_next(fake,NEXT_QUESTION)

    async def test_navigation_failure_preserves_questions_and_raw_snapshot(self):
        await self.page.set_content('<h1>2026测试卷</h1><div data-question-count="2"></div>'+question())
        with TemporaryDirectory() as td:
            with unittest.mock.patch('fenbi_crawler_v2.click_next',new=AsyncMock(side_effect=RuntimeError('browser_navigation_timeout'))):
                d=await extract_exam_data(self.page,max_rounds=5,progress_dir=Path(td))
            self.assertEqual(len(d['questions']),1)
            self.assertIn('next_control_failed:browser_navigation_timeout',d['collection_errors'])
            saved=json.loads((Path(td)/'capture_checkpoint.json').read_text())
            self.assertEqual(len(saved['questions']),1)
            self.assertEqual(len(saved['rendered_snapshots']),1)
            self.assertFalse(validate_exam(d)['ok'])

    async def test_auto_submit_event_is_recorded_and_never_called_learning(self):
        with TemporaryDirectory() as td:
            args=SimpleNamespace(output=Path(td),auto_submit=True)
            html='<button class="submit-btn" onclick="document.querySelector(\'[role=dialog]\').hidden=false">交卷</button>'
            html+='<app-question-choice>合成练习题</app-question-choice>'
            html+='<div role="dialog" hidden><button onclick="document.body.innerHTML=solution">确认交卷</button></div>'
            html+='<script>const solution='+json.dumps(question())+'</script>'
            await self.page.set_content(html)
            event=await ensure_solution(self.page,args,{})
            self.assertEqual(event['status'],'solution_opened')
            self.assertTrue(event['exclude_from_personal_statistics'])
            self.assertEqual(len((Path(td)/'submission_events.jsonl').read_text().splitlines()),2)

    async def test_disabled_auto_submit_does_not_click(self):
        await self.page.set_content('<button class="submit-btn" onclick="window.clicked=true">交卷</button>')
        with self.assertRaises(RuntimeError):
            await ensure_solution(self.page,SimpleNamespace(auto_submit=False),{})
        self.assertIsNone(await self.page.evaluate('window.clicked'))

    async def test_delayed_custom_div_confirmation_is_automatic(self):
        with TemporaryDirectory() as td:
            custom='<div class="submit-dialog-wrapper"><div class="modal-content"><p>还有题目未作答，确认交卷？</p><div class="btn-submit" onclick="document.body.innerHTML=solution">确定</div></div></div>'
            html='<app-question-choice>合成练习题</app-question-choice><button class="submit-btn" onclick="setTimeout(()=>document.querySelector(\'aside\').innerHTML=dialog,1200)">交卷</button><aside></aside>'
            html+='<script>const dialog='+json.dumps(custom)+';const solution='+json.dumps(question())+'</script>'
            await self.page.set_content(html)
            args=SimpleNamespace(output=Path(td),auto_submit=True,headless=True)
            event=await ensure_solution(self.page,args,{})
            self.assertEqual(event['status'],'solution_opened')
            self.assertFalse(self.page.is_closed())

    async def test_unrelated_confirmation_is_not_clicked(self):
        with TemporaryDirectory() as td:
            await self.page.set_content('<app-question-choice>合成练习题</app-question-choice><button class="submit-btn">交卷</button><div role="dialog">其他操作<button onclick="window.wrong=true">确定</button></div>')
            with self.assertRaises(RuntimeError):
                await ensure_solution(self.page,SimpleNamespace(output=Path(td),auto_submit=True,headless=True),{})
            self.assertIsNone(await self.page.evaluate('window.wrong'))

    async def test_uncertain_submission_is_not_retried(self):
        with TemporaryDirectory() as td:
            await self.page.set_content('<app-question-choice>合成练习题</app-question-choice><button class="submit-btn">交卷</button>')
            args=SimpleNamespace(output=Path(td),auto_submit=True,headless=True)
            submitted={}
            for _ in range(2):
                with self.assertRaises(RuntimeError):
                    await ensure_solution(self.page,args,submitted)
            self.assertEqual(len((Path(td)/'submission_events.jsonl').read_text().splitlines()),1)

    async def test_unrecognized_confirmation_waits_for_manual_action_then_resumes(self):
        with TemporaryDirectory() as td:
            await self.page.set_content('<app-question-choice>合成练习题</app-question-choice><button class="submit-btn">交卷</button>')
            args=SimpleNamespace(output=Path(td),auto_submit=True,headless=False)
            async def manual_action(*args,**kwargs):
                self.assertFalse(self.page.is_closed())
                await self.page.set_content(question())
                return ''
            with unittest.mock.patch('fenbi_crawler_v2.asyncio.to_thread',new=AsyncMock(side_effect=manual_action)) as action:
                event=await ensure_solution(self.page,args,{})
                action.assert_awaited_once()
            self.assertEqual(event['status'],'solution_opened')
            self.assertTrue(event['exclude_from_personal_statistics'])

    async def test_nohref_popup_uses_verified_listing_and_preserves_original(self):
        listing='<span class="categories-item">A类</span><div class="paper-item" onclick="window.open(\'/paper/1\')"><span class="item-info-title">2026合成A卷</span></div>'
        async def route(r):
            html=listing if r.request.url.endswith('/list') else '<h1>2026合成A卷</h1>'+question()
            await r.fulfill(body=html,content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        await self.page.goto('https://www.fenbi.com/list')
        rows=await paper_items(self.page)
        worker=await open_paper(self.context,rows[0],self.page,list_signature(rows))
        self.assertTrue(worker.url.endswith('/paper/1'))
        self.assertTrue(self.page.url.endswith('/list'))
        await worker.close()

    async def test_three_listing_pages_keep_state_and_stop_at_five(self):
        async def route(r):
            path=r.request.url.split('fenbi.com')[-1]
            if path.startswith('/paper/'):
                n=int(path.split('/')[-1])
                body=f'<h1>2026合成{n}卷</h1><div data-question-count="1"></div>'+question('id'+str(n),1,True)
            else:
                pages=[]
                for j in range(3):
                    pages.append(''.join(f'<div class="paper-item"><a href="https://www.fenbi.com/paper/{n}"><span class="item-info-title">2026合成{n}卷</span></a></div>' for n in range(j*2+1,j*2+3)))
                body='<span class="categories-item" onclick="show(0)">A/B类</span><main></main><button id="next" onclick="show(current+1)">下一页</button>'
                body+='<script>let current=0;const pages='+json.dumps(pages)+';function show(n){current=n;document.querySelector("main").innerHTML=pages[n];document.querySelector("#next").disabled=n===2}show(0)</script>'
            await r.fulfill(body=body,content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        await self.page.goto('https://www.fenbi.com/list')
        with TemporaryDirectory() as td:
            args=SimpleNamespace(output=Path(td),daily_target=5,max_rounds=10,download_images=False,auto_submit=False)
            results=await crawl_category(self.context,self.page,'A/B类',args,{})
            self.assertEqual(len(results),5,results)
            self.assertTrue(all(r['status']=='success' for r in results),results)
            self.assertEqual(len(daily_entries(Path(td))),5)
            self.assertEqual(await self.page.evaluate('current'),2)

    async def test_session_scoped_listing_opens_paper_in_existing_tab(self):
        listing='<span class="categories-item">推荐</span><div class="paper-item" onclick="window.open(\'/paper/1\')"><span class="item-info-title">2026合成A卷</span></div>'
        async def route(r):
            if r.request.url.endswith('/list'):
                html='<script>if(sessionStorage.getItem("selectedSubject")){document.write('+json.dumps(listing)+')}</script>'
            else:
                html='<h1>2026合成A卷</h1>'+question()
            await r.fulfill(body=html,content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        await self.page.goto('https://www.fenbi.com/list')
        await self.page.evaluate('sessionStorage.setItem("selectedSubject", "xingce")')
        await self.page.reload()
        rows=await paper_items(self.page)
        worker=await open_paper(self.context,rows[0],self.page,list_signature(rows))
        self.assertTrue(worker.url.endswith('/paper/1'))
        self.assertEqual(await worker.evaluate('sessionStorage.getItem("selectedSubject")'),'xingce')
        self.assertTrue(self.page.url.endswith('/list'))
        await worker.close()

    async def test_session_listing_same_tab_navigation_restores_three_pages(self):
        async def route(r):
            path=r.request.url.split('fenbi.com')[-1]
            if path.startswith('/paper/'):
                n=int(path.split('/')[-1])
                html=f'<h1>2026合成{n}卷</h1><div data-question-count="1"></div>'+question('id'+str(n),1,True)
            else:
                pages=[]
                for j in range(3):
                    pages.append(''.join(f'<div class="paper-item" onclick="location.href=\'/paper/{n}\'"><span class="item-info-title">2026合成{n}卷</span></div>' for n in range(j*2+1,j*2+3)))
                listing='<span class="categories-item" onclick="show(0)">推荐</span><main></main><button id="next" onclick="show(current+1)">下一页</button>'
                script='window.current=0;const pages='+json.dumps(pages)+';window.show=function(n){current=n;document.querySelector("main").innerHTML=pages[n];document.querySelector("#next").disabled=n===2};show(0);'
                html='<div id="listing"></div><script>if(sessionStorage.getItem("selectedSubject")){setTimeout(()=>{document.querySelector("#listing").innerHTML='+json.dumps(listing)+';'+script+'},250)}</script>'
            await r.fulfill(body=html,content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        await self.page.goto('https://www.fenbi.com/list')
        await self.page.evaluate('sessionStorage.setItem("selectedSubject","xingce")')
        await self.page.reload()
        opened=[]
        self.context.on('page',lambda p:opened.append(p))
        with TemporaryDirectory() as td:
            args=SimpleNamespace(output=Path(td),daily_target=5,max_rounds=10,download_images=False,auto_submit=False)
            results=await crawl_category(self.context,self.page,'推荐',args,{})
            self.assertEqual(len(results),5,results)
            self.assertTrue(all(r['status']=='success' for r in results),results)
            self.assertEqual(len(daily_entries(Path(td))),5)
            self.assertEqual(await self.page.locator('.paper-item').count(),2)
            self.assertIn('2026合成5卷',await self.page.locator('main').inner_text())
            self.assertEqual(await self.page.evaluate('sessionStorage.getItem("selectedSubject")'),'xingce')
            self.assertEqual(opened,[])
            self.assertFalse(self.page.is_closed())

    async def test_listing_failure_stops_after_one_attempt_and_saves_diagnostics(self):
        from unittest.mock import patch
        html='<span class="categories-item">推荐</span>'+''.join('<div class="paper-item"><span class="item-info-title">合成卷'+str(i)+'</span></div>' for i in range(8))
        await self.page.set_content(html)
        with TemporaryDirectory() as td:
            args=SimpleNamespace(output=Path(td),daily_target=5,max_rounds=10)
            with patch('fenbi_crawler_v2.open_paper',new=AsyncMock(side_effect=ListingStateError('找不到分类：推荐'))) as opening:
                with self.assertRaisesRegex(ListingStateError,'找不到分类'):
                    await crawl_category(self.context,self.page,'推荐',args,{})
                opening.assert_awaited_once()
            self.assertEqual(json.loads((Path(td)/'listing_failure.json').read_text(encoding='utf-8'))['category'],'推荐')
            self.assertEqual(json.loads((Path(td)/'run_status.json').read_text(encoding='utf-8'))['phase'],'batch_stopped')
            self.assertTrue((Path(td)/'listing_failure.png').exists())
            self.assertFalse(self.page.is_closed())

    async def test_changed_listing_is_not_clicked_or_closed(self):
        await self.page.set_content('<div class="paper-item" onclick="window.clicked=true"><span class="item-info-title">合成A卷</span></div>')
        rows=await paper_items(self.page)
        await self.page.locator('.item-info-title').evaluate('(e)=>e.innerText="合成B卷"')
        with self.assertRaisesRegex(ListingStateError,'列表已变化'):
            await open_paper(self.context,rows[0],self.page,list_signature(rows))
        self.assertIsNone(await self.page.evaluate('window.clicked'))
        self.assertFalse(self.page.is_closed())

    async def test_unrestorable_same_tab_keeps_saved_paper_and_stops_once(self):
        solution='<h1>2026合成A卷</h1><div data-question-count="1"></div>'+question()
        listing='<span class="categories-item">推荐</span><div class="paper-item" onclick="document.body.innerHTML=solution"><span class="item-info-title">2026合成A卷</span></div>'
        async def route(r):
            await r.fulfill(body=listing+'<script>const solution='+json.dumps(solution)+'</script>',content_type='text/html; charset=utf-8')
        await self.context.route('https://www.fenbi.com/**',route)
        await self.page.goto('https://www.fenbi.com/list')
        with TemporaryDirectory() as td:
            args=SimpleNamespace(output=Path(td),daily_target=5,max_rounds=10,download_images=False,auto_submit=False)
            with self.assertRaises(ListingStateError):
                await crawl_category(self.context,self.page,'推荐',args,{})
            self.assertEqual(len(daily_entries(Path(td))),1)
            self.assertTrue((Path(td)/'listing_failure.json').exists())
            self.assertFalse(self.page.is_closed())

if __name__=='__main__':
    unittest.main()
