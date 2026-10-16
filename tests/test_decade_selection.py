import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from batch_runner import parse_year_setting, paper_year, scan_year_targets, choose_targets

class DecadeTests(unittest.IsolatedAsyncioTestCase):
    def test_defaults_and_custom_years(self):
        self.assertEqual(parse_year_setting('',2026),(2017,2026))
        self.assertEqual(parse_year_setting('',2027),(2018,2027))
        self.assertEqual(parse_year_setting('2016—2025',2026),(2016,2025))
        self.assertIsNone(parse_year_setting('m',2026))
        for text in ['2026-2017','1-10','nothing']:
            with self.assertRaises(ValueError):parse_year_setting(text,2026)
    def test_title_year_uses_exam_year(self):
        self.assertEqual(paper_year('2026年国考（2025回忆）'),2026)
        self.assertEqual(paper_year('2017年江苏B卷'),2017)
        self.assertIsNone(paper_year('未标年份试卷'))
    async def scan(self, categories, pages, output=None, stuck=False):
        page=SimpleNamespace(url='https://www.fenbi.com/list');state={'cat':'','i':0}
        async def category(p,name):state.update(cat=name,i=0)
        async def rows(p):return [{'title':t,'href':str(n)} for n,t in enumerate(pages[state['cat']][state['i']])]
        async def nxt(*a):
            if state['i']+1>=len(pages[state['cat']]):return False
            if not stuck:state['i']+=1
            return True
        with patch('fenbi_crawler_v2.click_filter',category),patch('fenbi_crawler_v2.reset_listing_first_page',AsyncMock()),patch('fenbi_crawler_v2.wait_paper_items',rows),patch('fenbi_crawler_v2.click_next',nxt):
            return await scan_year_targets(page,categories,2017,2026,output)
    async def test_cross_pages_boundaries_missing_years_and_saved_report(self):
        with TemporaryDirectory() as td:
            plan=await self.scan(['国考','江苏'],{'国考':[['2027年国考','2026年国考'],['2020年国考','2017年国考'],['2016年国考','未标年份卷']],'江苏':[['2026年江苏A','2017年江苏B'],['2016年江苏C']]},td)
            self.assertEqual([t['title'] for t in plan],['2026年国考','2020年国考','2017年国考','2026年江苏A','2017年江苏B'])
            self.assertEqual([t['listing']['page_index'] for t in plan],[0,1,1,0,0])
            report=json.loads((Path(td)/'selection_progress.json').read_text())
            self.assertEqual(report['status'],'selected')
            self.assertEqual(report['categories'][0]['undated_titles'],['未标年份卷'])
            self.assertIn(2025,report['categories'][0]['years_absent_from_listing'])
    async def test_no_matching_year_is_not_reported_as_success(self):
        with TemporaryDirectory() as td:
            with self.assertRaises(ValueError):await self.scan(['国考'],{'国考':[['2016年国考']]},td)
            self.assertEqual(json.loads((Path(td)/'selection_progress.json').read_text())['status'],'selection_incomplete')
    async def test_default_prompt_scans_categories_without_manual_paper_input(self):
        page=SimpleNamespace();args=SimpleNamespace(output=Path('unused'))
        expected=[{'title':'2026年国考'}]
        with patch('fenbi_crawler_v2.visible_categories',AsyncMock(return_value=['国考','江苏'])),patch('fenbi_crawler_v2.now',return_value='2026-10-16T00:00:00+08:00'),patch('batch_runner.scan_year_targets',AsyncMock(return_value=expected)) as scan,patch('builtins.input',side_effect=['1,2','']):
            self.assertEqual(await choose_targets(page,args),expected)
            scan.assert_awaited_once_with(page,['国考','江苏'],2017,2026,output=args.output)
    async def test_listing_cycle_does_not_silently_truncate_selection(self):
        # A duplicate next-page signature is detected without navigating beyond it.
        page=SimpleNamespace(url='https://www.fenbi.com/list');rows=[{'title':'2026年国考','href':'x'}]
        with TemporaryDirectory() as td,patch('fenbi_crawler_v2.click_filter',AsyncMock()),patch('fenbi_crawler_v2.reset_listing_first_page',AsyncMock()),patch('fenbi_crawler_v2.wait_paper_items',AsyncMock(return_value=rows)),patch('fenbi_crawler_v2.click_next',AsyncMock(return_value=True)),patch('batch_runner.SELECTION_PAGE_WAIT_SECONDS',0):
            with self.assertRaisesRegex(RuntimeError,'未变化'):await scan_year_targets(page,['国考'],2017,2026,td)
            self.assertEqual(json.loads((Path(td)/'selection_progress.json').read_text())['status'],'selection_incomplete')

class FirstPageBrowserTest(unittest.IsolatedAsyncioTestCase):
    async def test_first_page_is_restored_before_replaying_page_index(self):
        import test_crawler as fixtures
        from fenbi_crawler_v2 import reset_listing_first_page
        browser=fixtures.BrowserTests();await browser.asyncSetUp()
        try:
            await browser.page.set_content('<div class="paging"><div class="item" onclick="document.querySelector(\'.active\').classList.remove(\'active\');this.classList.add(\'active\')">1</div><div class="item active">2</div></div>')
            await reset_listing_first_page(browser.page)
            self.assertEqual(await browser.page.locator('.item.active').inner_text(),'1')
        finally:await browser.asyncTearDown()
