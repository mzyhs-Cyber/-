"""Original synthetic pages for the 2.3 handoff blockers; never real exam evidence."""
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import test_crawler as fixtures
from bank_core import validate_exam
from fenbi_crawler_v2 import ensure_solution, extract_exam_data


class ProgressRegressions(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.BrowserTests.asyncSetUp
    asyncTearDown = fixtures.BrowserTests.asyncTearDown

    async def test_submit_button_before_exercise_content(self):
        with TemporaryDirectory() as td:
            html = '<button class="submit-btn" onclick="document.body.innerHTML=solution">交卷</button><main></main>'
            html += '<script>const solution=' + json.dumps(fixtures.question()) + ';setTimeout(()=>document.querySelector("main").innerHTML="<div class=ti-content>合成练习题</div>",200)</script>'
            await self.page.set_content(html)
            event = await ensure_solution(self.page, SimpleNamespace(output=Path(td), auto_submit=True, headless=True), {})
            self.assertEqual(event['status'], 'solution_opened')

    async def test_display_contents_questions_and_solution_are_visible(self):
        await self.page.set_content('<style>app-ti,app-question-choice,app-solution-overall{display:contents}</style><h1>合成A卷</h1><div data-question-count="1"></div>' + fixtures.question())
        d = await extract_exam_data(self.page, max_rounds=2)
        self.assertTrue(validate_exam(d)['ok'], validate_exam(d))

    async def test_scoped_answer_card_fraction_is_independent_count(self):
        await self.page.set_content('<h1>合成A卷</h1><aside>3/999</aside><div class="answer-card"><span class="progress-text">已答 0/2 题</span></div>' + fixtures.question() + fixtures.question('q2', 2))
        d = await extract_exam_data(self.page, max_rounds=2)
        self.assertEqual(d['expected_count'], 2)
        self.assertTrue(validate_exam(d)['ok'], validate_exam(d))
        self.assertTrue(any('0/2' in row['text'] for row in d['count_evidence']))

    async def test_count_conflicts_are_not_hidden_by_manual_expected(self):
        await self.page.set_content('<h1>合成A卷</h1><div data-question-count="1"></div><div class="answer-card"><span>0/2</span></div>' + fixtures.question())
        d = await extract_exam_data(self.page, expected=1, max_rounds=2)
        self.assertIn('ambiguous_expected_count', d['collection_errors'])
        self.assertIn('expected_count_conflicts_with_page', d['collection_errors'])
        self.assertFalse(validate_exam(d)['ok'])

    async def test_question_body_fraction_does_not_become_total(self):
        await self.page.set_content('<h1>合成A卷</h1>' + fixtures.question().replace('合成测试题', '0/130'))
        d = await extract_exam_data(self.page, max_rounds=2)
        self.assertIsNone(d['expected_count'])

    async def test_enabled_next_without_new_content_stops_and_saves(self):
        await self.page.set_content('<h1>合成A卷</h1>' + fixtures.question() + '<button class="next-question">下一题</button>')
        with TemporaryDirectory() as td, patch('fenbi_crawler_v2.NO_PROGRESS_ROUNDS', 2, create=True), patch('fenbi_crawler_v2.NO_PROGRESS_SECONDS', 0.1, create=True):
            d = await extract_exam_data(self.page, max_rounds=6, progress_dir=Path(td))
            self.assertEqual(d.get('stop_reason'), 'no_content_progress')
            self.assertLess(len(d['observations']), 6)
            saved = json.loads((Path(td) / 'capture_checkpoint.json').read_text())
            self.assertEqual(saved['stop_reason'], 'no_content_progress')
            self.assertEqual(len(saved['questions']), 1)

    async def test_scrolling_without_new_content_has_independent_bound(self):
        await self.page.set_content('<h1>合成A卷</h1>' + fixtures.question() + '<div style="height:100000px"></div>')
        with patch('fenbi_crawler_v2.NO_PROGRESS_ROUNDS', 2, create=True), patch('fenbi_crawler_v2.NO_PROGRESS_SECONDS', 0.1, create=True):
            d = await extract_exam_data(self.page, max_rounds=6)
        self.assertEqual(d.get('stop_reason'), 'no_content_progress')
        self.assertLess(len(d['observations']), 6)

    async def test_late_analysis_with_same_question_count_is_retained(self):
        html = fixtures.question().replace('<p>合成解析</p>', '')
        await self.page.set_content('<h1>合成A卷</h1><div data-question-count="1"></div>' + html)
        await self.page.evaluate('setTimeout(()=>document.querySelector("[id^=section-solution-] .content").innerHTML="<p>后加载解析</p>",1000)')
        d = await extract_exam_data(self.page, max_rounds=6)
        self.assertTrue(validate_exam(d)['ok'], validate_exam(d))
        self.assertIn('后加载解析', d['questions'][0]['analysis_html'])

    async def test_delayed_solution_without_dialog_is_not_submission_failure(self):
        with TemporaryDirectory() as td:
            html = '<div class="ti-content">合成练习题</div><button class="submit-btn" onclick="setTimeout(()=>document.body.innerHTML=solution,1000)">交卷</button>'
            await self.page.set_content(html + '<script>const solution=' + json.dumps(fixtures.question()) + '</script>')
            event = await ensure_solution(self.page, SimpleNamespace(output=Path(td), auto_submit=True, headless=True), {})
            self.assertEqual(event['status'], 'solution_opened')

    async def test_empty_or_hidden_exercise_never_triggers_submission(self):
        with TemporaryDirectory() as td:
            await self.page.set_content('<app-question-choice></app-question-choice><div hidden class="ti-content">隐藏题目</div><button class="submit-btn" onclick="window.clicked=true">交卷</button>')
            with patch('fenbi_crawler_v2.PAGE_READY_SECONDS', 0.2, create=True):
                with self.assertRaises(RuntimeError):
                    await ensure_solution(self.page, SimpleNamespace(output=Path(td), auto_submit=True, headless=True), {})
            self.assertIsNone(await self.page.evaluate('window.clicked'))
