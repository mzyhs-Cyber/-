import contextlib
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
import standalone_main as app


class StandaloneTests(unittest.TestCase):
    def test_frozen_app_uses_bundled_browser_and_persistent_output_location(self):
        with TemporaryDirectory() as td:
            root=Path(td).resolve()
            with patch.object(app.sys,'frozen',True,create=True), patch.object(app.sys,'executable',str(root/'FenbiCollector.exe')), patch.object(app.sys,'_MEIPASS',str(root/'_internal'),create=True), patch.object(app.os,'chdir') as chdir, patch.dict(os.environ):
                self.assertEqual(app.configure_paths(),root)
                self.assertEqual(os.environ['PLAYWRIGHT_BROWSERS_PATH'],str(root/'_internal'/'browser_cache'))
                chdir.assert_called_once_with(root)

    def test_startup_error_is_saved_without_interactive_console(self):
        with TemporaryDirectory() as td:
            root=Path(td)
            stdout_bytes, stderr_bytes = io.BytesIO(), io.BytesIO()
            stdout = io.TextIOWrapper(stdout_bytes, encoding='cp1252')
            stderr = io.TextIOWrapper(stderr_bytes, encoding='cp1252')
            with patch.object(app,'configure_paths',return_value=root), patch.object(app.sys,'argv',['FenbiCollector']), patch.object(app.sys,'stdin',SimpleNamespace(isatty=lambda:False)), patch('fenbi_crawler_v2.main',new=AsyncMock(side_effect=RuntimeError('synthetic startup failure'))), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                self.assertEqual(app.main(),1)
            stdout.flush()
            stderr.flush()
            self.assertIn('发生错误', stdout_bytes.getvalue().decode('utf-8'))
            self.assertIn('synthetic startup failure', stderr_bytes.getvalue().decode('utf-8'))
            stdout.close()
            stderr.close()
            report=json.loads((root/'fenbi_output'/'last_error.json').read_text())
            self.assertEqual(report['status'],'failed')
            self.assertIn('synthetic startup failure',report['traceback'])
