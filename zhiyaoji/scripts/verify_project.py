#!/usr/bin/env python3
"""Read-only archive/structure checks; no production API or browser DB access."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs, self.scripts = [], []
        self.current = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'img', 'link'):
            ref = a.get('src') if tag != 'link' else a.get('href')
            if ref:
                self.refs.append(ref)
        if tag == 'script' and not a.get('src'):
            self.current = {'type': a.get('type', ''), 'text': ''}

    def handle_data(self, value):
        if self.current is not None:
            self.current['text'] += value

    def handle_endtag(self, tag):
        if tag == 'script' and self.current is not None:
            self.scripts.append(self.current)
            self.current = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-zip', type=Path)
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'docs/SOURCE_MANIFEST.json').read_text())
    checks = []

    def check(name, ok, detail):
        checks.append({'name': name, 'passed': bool(ok), 'detail': detail})

    tracked = [e for e in manifest['entries'] if e['tracked']]
    mismatches = [e['path'] for e in tracked if not (ROOT/'app'/e['path']).is_file()
                  or hashlib.sha256((ROOT/'app'/e['path']).read_bytes()).hexdigest() != e['sha256']]
    check('A01_snapshot_sha256', not mismatches, {'files': len(tracked), 'mismatches': mismatches})
    if args.source_zip:
        with zipfile.ZipFile(args.source_zip) as z:
            bad_crc = z.testzip()
            match = hashlib.sha256(args.source_zip.read_bytes()).hexdigest() == manifest['archive_sha256']
            expected = {e['path']: e['sha256'] for e in manifest['entries']}
            actual = {n: hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if not n.endswith('/')}
        check('A01_source_archive', bad_crc is None and match and actual == expected,
              {'crc_ok': bad_crc is None, 'archive_sha256_matches': match, 'entry_count': len(actual)})

    syntax, missing = [], []
    node = shutil.which('node')
    with tempfile.TemporaryDirectory() as tmp:
        jobs = []
        for p in (ROOT/'app').glob('*.js'):
            target = Path(tmp)/(p.stem + ('.mjs' if p.name == '_worker.js' else '.js'))
            target.write_bytes(p.read_bytes())
            jobs.append((p.name, target))
        for p in (ROOT/'app').glob('*.html'):
            page = Page()
            page.feed(p.read_text())
            for ref in page.refs:
                u = urlsplit(ref)
                if not u.scheme and not u.netloc and u.path and not (p.parent/unquote(u.path)).is_file():
                    missing.append(f'{p.name}: {ref}')
            for i, s in enumerate(page.scripts):
                if s['type'] not in ('', 'text/javascript', 'application/javascript', 'module'):
                    continue
                target = Path(tmp)/(f'{p.stem}-{i}.' + ('mjs' if s['type'] == 'module' else 'js'))
                target.write_text(s['text'])
                jobs.append((f'{p.name}:inline-{i}', target))
        for name, p in jobs:
            result = subprocess.run([node, '--check', str(p)], capture_output=True, text=True) if node else None
            syntax.append({'file': name, 'passed': result is not None and result.returncode == 0})
    check('A02_javascript_syntax', all(x['passed'] for x in syntax), syntax)
    check('A02_html_asset_references', not missing, {'missing': missing})

    json_files = list(ROOT.rglob('*.json')) + list((ROOT/'app').glob('*.webmanifest'))
    errors = []
    for p in json_files:
        try:
            json.loads(p.read_text())
        except (ValueError, UnicodeError):
            errors.append(str(p.relative_to(ROOT)))
    check('A03_json_metadata', not errors, {'checked': len(json_files), 'invalid': errors})
    excluded = ['app/birthday.html']
    unexpected = [str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file()
                  and (p.name.startswith('.env') or p.suffix.lower() in ('.zip', '.rar', '.pem', '.key')
                       or ('备份' in p.name and p.suffix == '.json'))]
    unexpected += [p for p in excluded if (ROOT/p).exists()]
    patterns = [r'gh[pousr]_[A-Za-z0-9]{20,}', r'github_pat_[A-Za-z0-9_]{20,}',
                r'AKIA[0-9A-Z]{16}', r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                r'eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}']
    hits = []
    for p in (ROOT/'app').rglob('*'):
        if p.is_file() and p.suffix != '.png':
            t = p.read_text()
            if any(re.search(pattern, t) for pattern in patterns):
                hits.append(str(p.relative_to(ROOT)))
    check('A03_private_files_and_common_credentials', not unexpected and not hits,
          {'unexpected_paths': unexpected, 'credential_pattern_paths': hits, 'scope': 'heuristic, not security audit'})

    required = ['PROJECT_STATE.md', 'ACTIVE_TASK.md', 'DECISIONS.md', 'TEST_MATRIX.md',
                'CHANGELOG.md', 'AGENTS.md', 'HANDOFF.md', 'README.md']
    absent = [p for p in required if not (ROOT/p).is_file()]
    broken = []
    for p in ROOT.glob('*.md'):
        for ref in re.findall(r'\]\(([^)]+)\)', p.read_text()):
            u = urlsplit(ref)
            if not u.scheme and u.path and not (p.parent/u.path).exists():
                broken.append(f'{p.name}: {ref}')
    bundle = (ROOT/'app/bundle.js').read_text()
    markers = "S.VERSION='2.9.18'" in bundle and "S.BUILD='20261021-r7'" in bundle
    check('A04_entry_docs_links_version', not absent and not broken and markers,
          {'missing_docs': absent, 'broken_links': broken, 'snapshot_markers_match': markers})

    result = {'executed_at': datetime.now(timezone.utc).isoformat(), 'scope': 'archive and static only',
              'passed': all(c['passed'] for c in checks), 'checks': checks,
              'business_tests': 'not executed', 'remote_verification': 'see verification/REMOTE.json'}
    out = ROOT/'verification/RESULTS.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'passed': result['passed'], 'checks': len(checks), 'js_scripts': len(syntax),
                      'result': str(out)}, ensure_ascii=False))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
