"""Entry point for the Windows application built by the supplied workflow."""
from __future__ import annotations
import asyncio
import os
from pathlib import Path
import sys
import traceback


def configure_console():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8', errors='backslashreplace')


def configure_paths():
    frozen = getattr(sys, 'frozen', False)
    app_dir = Path(sys.executable).resolve().parent if frozen else Path(__file__).resolve().parent
    resources = Path(getattr(sys, '_MEIPASS', app_dir))
    if frozen:
        os.environ['PLAYWRIGHT_BROWSERS_PATH'] = str(resources / 'browser_cache')
    os.chdir(app_dir)
    return app_dir


async def smoke_test():
    from fenbi_crawler_v2 import now
    if not now().endswith('+08:00'):
        raise RuntimeError('Shanghai timezone check failed')
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        launch = {'headless': True}
        if os.environ.get('TEST_CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['TEST_CHROMIUM_EXECUTABLE']
        browser = await p.chromium.launch(**launch)
        try:
            page = await browser.new_page()
            await page.set_content('<h1>Fenbi browser smoke test</h1>')
            if await page.locator('h1').inner_text() != 'Fenbi browser smoke test':
                raise RuntimeError('Browser smoke test failed')
        finally:
            await browser.close()
    print('Browser smoke test passed.', flush=True)


def main():
    configure_console()
    app_dir = configure_paths()
    automatic = any(arg in sys.argv for arg in ('--smoke-test', '--batch-smoke-test', '--help', '-h'))
    exit_code = 1
    try:
        if '--batch-smoke-test' in sys.argv:
            from batch_smoke import batch_smoke_test
            asyncio.run(batch_smoke_test())
            exit_code = 0
        elif '--smoke-test' in sys.argv:
            asyncio.run(smoke_test())
            exit_code = 0
        else:
            from bank_core import VERSION
            print('采集程序 ' + VERSION + '：请保持此窗口打开。', flush=True)
            print('输出目录：' + str(app_dir / 'fenbi_output'), flush=True)
            from fenbi_crawler_v2 import main as collect
            exit_code = asyncio.run(collect())
    except SystemExit as exc:
        exit_code = exc.code if isinstance(exc.code, int) else 1
    except KeyboardInterrupt:
        print('\n已中断本次运行。现有文件保留。', flush=True)
        exit_code = 130
    except Exception:
        traceback.print_exc()
        import json
        import platform
        diagnostics = app_dir / 'fenbi_output'
        diagnostics.mkdir(parents=True, exist_ok=True)
        (diagnostics / 'last_error.json').write_text(json.dumps({
            'status': 'failed', 'python': platform.python_version(),
            'traceback': traceback.format_exc(),
            'note': 'No passwords, cookies or environment variable values are collected.'
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        print('发生错误，请保留输出目录里的诊断文件。', flush=True)
    finally:
        if not automatic and sys.stdin.isatty():
            try:
                input('\n按 Enter 关闭窗口：')
            except (EOFError, KeyboardInterrupt):
                pass
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
