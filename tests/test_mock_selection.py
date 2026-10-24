import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from batch_runner import scan_year_targets, validate_targets, open_target
from fenbi_crawler_v2 import accepts_paper, MOCK_CATEGORY, click_filter, ListingStateError
import test_crawler as fixtures

class MockRules(unittest.TestCase):
    def test_explicit_b_only(self):
        for title in ['2026江苏B卷', '2026模考（B类）', '2026模拟（江苏Ｂ卷）', '2026江苏b 卷']:
            self.assertTrue(accepts_paper(MOCK_CATEGORY, title), title)
        for title in ['2026通用卷', '2026江苏模拟', '2026江苏A卷', '2026江苏C类', '2026江苏A/B卷', '2026江苏A类B卷', '2026江苏AB卷']:
            self.assertFalse(accepts_paper(MOCK_CATEGORY, title), title)
        self.assertTrue(accepts_paper('江苏', '2026江苏A卷'))

    def test_old_or_wrong_mock_jobs_rejected(self):
        target = {'title':'2026模拟B卷', 'listing':{'url':'https://www.fenbi.com/list', 'category':MOCK_CATEGORY, 'page_index':0, 'signature':[]}}
        with self.assertRaisesRegex(ValueError, '筛选证据'):
            validate_targets([target])
        target['listing'].update(region='江苏', paper_type='B')
        self.assertEqual(len(validate_targets([target])), 1)
        target['title']='2026通用卷'
        with self.assertRaisesRegex(ValueError, '仅采集江苏B卷'):
            validate_targets([target])

class MockSelection(unittest.IsolatedAsyncioTestCase):
    async def test_scan_preserves_full_page_signature_and_scope(self):
        rows=[{'title':t, 'href':str(i), 'index':i} for i,t in enumerate(['2026模拟A卷','2026模拟B卷','2026通用卷','2026未标类型卷'])]
        with patch('fenbi_crawler_v2.verify_mock_region',AsyncMock()), patch('fenbi_crawler_v2.click_filter',AsyncMock()) as click, patch('fenbi_crawler_v2.reset_listing_first_page',AsyncMock()), patch('fenbi_crawler_v2.wait_paper_items',AsyncMock(return_value=rows)), patch('fenbi_crawler_v2.click_next',AsyncMock(return_value=False)):
            result=await scan_year_targets(SimpleNamespace(url='https://www.fenbi.com/list'),[MOCK_CATEGORY],2017,2026)
        self.assertEqual([r['title'] for r in result],['2026模拟B卷'])
        self.assertEqual(len(result[0]['listing']['signature']),4)
        self.assertEqual(result[0]['listing']['region'],'江苏')
        self.assertEqual(result[0]['listing']['paper_type'],'B')
        click.assert_awaited_once()

    async def test_resume_reselects_region_even_when_titles_match(self):
        rows=[{'title':'2026模拟B卷','href':'b','index':0}]
        target={'title':rows[0]['title'],'listing':{'url':'https://www.fenbi.com/list','category':MOCK_CATEGORY,'page_index':1,'signature':[[rows[0]['title'],'b']],'region':'江苏','paper_type':'B'}}
        page=SimpleNamespace(url=target['listing']['url'])
        with patch('fenbi_crawler_v2.paper_items',AsyncMock(return_value=rows)),patch('fenbi_crawler_v2.wait_paper_items',AsyncMock(return_value=rows)),patch('fenbi_crawler_v2.click_filter',AsyncMock()) as click,patch('fenbi_crawler_v2.reset_listing_first_page',AsyncMock()),patch('fenbi_crawler_v2.click_next',AsyncMock(return_value=True)) as nxt,patch('fenbi_crawler_v2.open_paper',AsyncMock(return_value=page)):
            self.assertIs(await open_target(None,page,target),page)
        click.assert_awaited_once_with(page,MOCK_CATEGORY)
        self.assertEqual(nxt.await_count,1)

class MockRegionBrowser(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=fixtures.BrowserTests.asyncSetUp
    asyncTearDown=fixtures.BrowserTests.asyncTearDown

    async def test_two_jiangsu_items_only_lower_is_clicked(self):
        await self.page.set_content('''<div><button class="categories-item" onclick="window.wrong=true">江苏</button><button class="categories-item">省考模拟题</button></div><div><button class="categories-item active">通用卷</button><button class="categories-item" onclick="this.previousElementSibling.classList.remove('active');this.classList.add('active');window.region='江苏'">江苏</button></div>''')
        await click_filter(self.page,MOCK_CATEGORY)
        self.assertEqual(await self.page.evaluate('window.region'),'江苏')
        self.assertIsNone(await self.page.evaluate('window.wrong'))

    async def test_unconfirmed_region_does_not_silently_continue(self):
        await self.page.set_content('<div><button class="categories-item">省考模拟题</button></div><div><button class="categories-item active">通用卷</button><button class="categories-item">江苏</button></div>')
        with self.assertRaisesRegex(ListingStateError,'未确认'):
            await click_filter(self.page,MOCK_CATEGORY)
