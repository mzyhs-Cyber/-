import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from batch_runner import choose_targets, open_target

class MultiCategorySelectionTests(unittest.IsolatedAsyncioTestCase):
    async def select(self, answers):
        page=SimpleNamespace(url='https://www.fenbi.com/spa/tiku/guide/realTest/xingce/xingce')
        state={'category':'','page':0};changes=[]
        async def category(p,name):state.update(category=name,page=0);changes.append(name)
        async def rows(p):return [{'title':f"{state['category']}卷{state['page']}-{n}", 'key':str(n)} for n in range(1,4)]
        async def nxt(*a):state['page']+=1;return True
        with patch('fenbi_crawler_v2.visible_categories',AsyncMock(return_value=['国考','安徽','北京','江苏'])),patch('fenbi_crawler_v2.click_filter',category),patch('fenbi_crawler_v2.wait_paper_items',rows),patch('fenbi_crawler_v2.list_signature',lambda rs:tuple((r['title'],r['key']) for r in rs)),patch('fenbi_crawler_v2.click_next',nxt),patch('builtins.input',side_effect=(answers[:1]+["m"]+answers[1:] if answers[0]!='99' else answers)):
            result=await choose_targets(page,SimpleNamespace())
        return result,changes
    async def test_multiple_categories_keep_each_paper_location(self):
        result,changes=await self.select(['1,2,4','1-2','s','3','s','2','s'])
        self.assertEqual(changes,['国考','安徽','江苏'])
        self.assertEqual([r['listing']['category'] for r in result],['国考','国考','安徽','江苏'])
        self.assertEqual([r['title'] for r in result],['国考卷0-1','国考卷0-2','安徽卷0-3','江苏卷0-2'])
    async def test_pagination_resets_for_next_category_and_deduplicates(self):
        result,_=await self.select(['1-2','1,1','n','2','s','3','s'])
        self.assertEqual(len(result),3)
        self.assertEqual([r['listing']['page_index'] for r in result],[0,1,0])
    async def test_invalid_category_reprompts_and_empty_category_can_be_skipped(self):
        result,changes=await self.select(['99','1,2','m','s','1','s'])
        self.assertEqual(changes,['国考','安徽']);self.assertEqual(len(result),1)
    async def test_single_category_still_works_and_empty_final_does_not_start(self):
        result,_=await self.select(['4','s','1-2','s']);self.assertEqual(len(result),2)
    async def test_open_target_restores_each_category_and_page(self):
        page=SimpleNamespace(url='https://www.fenbi.com/spa/tiku/guide/realTest/xingce/xingce',goto=AsyncMock())
        for category,page_index in [('国考',0),('安徽',1),('江苏',0)]:
            row={'title':category+'卷','key':'1'};sig=((row['title'],'1'),)
            target={'title':row['title'],'listing':{'url':page.url,'category':category,'page_index':page_index,'signature':[list(x) for x in sig]}}
            with patch('fenbi_crawler_v2.paper_items',AsyncMock(return_value=[])),patch('fenbi_crawler_v2.wait_paper_items',AsyncMock(return_value=[row])),patch('fenbi_crawler_v2.list_signature',lambda rs:tuple((r['title'],r['key']) for r in rs)),patch('fenbi_crawler_v2.click_filter',AsyncMock()) as click,patch('fenbi_crawler_v2.reset_listing_first_page',AsyncMock()),patch('fenbi_crawler_v2.click_next',AsyncMock(return_value=True)) as nxt,patch('fenbi_crawler_v2.open_paper',AsyncMock(return_value=page)):
                self.assertIs(await open_target(None,page,target),page)
                click.assert_awaited_once_with(page,category);self.assertEqual(nxt.await_count,page_index)

class CrossCategoryBrowserTests(unittest.IsolatedAsyncioTestCase):
    async def test_four_categories_eight_papers_and_resume(self):
        import json
        from tempfile import TemporaryDirectory
        import test_crawler as fixtures
        import fenbi_crawler_v2 as crawler
        from batch_runner import run_batch
        from test_batch_runner import args_for
        browser=fixtures.BrowserTests();await browser.asyncSetUp()
        try:
            names=['国考','安徽','北京','江苏'];visits=[]
            listing=''.join(f'<span class="categories-item" onclick="sessionStorage.cat={i};draw()">{c}</span>' for i,c in enumerate(names))
            listing+='<main></main><script>const names='+json.dumps(names)+';function draw(){let c=Number(sessionStorage.cat||0);document.querySelector("main").innerHTML=[1,2].map(n=>`<div class="paper-item"><a class="item-info-title" href="/exam/solution/${c}-${n}">${names[c]}合成卷${n}</a></div>`).join("")}draw()</script>'
            async def route(r):
                url=r.request.url
                if url.endswith('/list'):body=listing
                else:
                    key=url.rsplit('/',1)[-1];visits.append(key);c,n=map(int,key.split('-'))
                    body=f'<h1>{names[c]}合成卷{n}</h1><div class="paper-summary">共1题</div>'+fixtures.question('id'+key,1,True)
                await r.fulfill(body=body,content_type='text/html; charset=utf-8')
            await browser.context.route('https://www.fenbi.com/**',route)
            await browser.page.goto('https://www.fenbi.com/list')
            with patch('builtins.input',side_effect=['1,2,3,4','m']+['1-2','s']*4):plan=await choose_targets(browser.page,None)
            self.assertEqual(len(plan),8)
            self.assertEqual([p['listing']['category'] for p in plan],[c for c in names for _ in range(2)])
            with TemporaryDirectory() as td,patch('builtins.input',side_effect=AssertionError('No midrun prompt')):
                args=args_for(td);args.paper_timeout=30
                job=await run_batch(browser.context,browser.page,args,{},plan)
                self.assertTrue(job['target_met'],job);self.assertEqual(job['complete_papers'],8)
                for paper in job['papers']:self.assertTrue(crawler.valid_receipt(paper['receipt']))
                previous=list(visits);resumed=await run_batch(browser.context,browser.page,args,{},None)
                self.assertTrue(resumed['target_met']);self.assertEqual(visits,previous)
        finally:await browser.asyncTearDown()
