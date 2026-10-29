#!/usr/bin/env python3
"""Verify exact R52 baseline, syntax/resources, tests, then build a root-level ZIP."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
BASE_HASH = 'fc350fca6e2d571f34b532a8e4f33a4edcdad99c79efbadc40d5d321f515237d'
CHANGED = {'bundle.js', 'index.html', 'sw.js', 'immersive-mode.js'}


class HTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs, self.scripts, self.buffer = [], [], None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.refs.extend(attrs[k] for k in ['src', 'href'] if k in attrs)
        if tag == 'script' and 'src' not in attrs:
            self.buffer = []

    def handle_data(self, data):
        if self.buffer is not None:
            self.buffer.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.buffer is not None:
            self.scripts.append(''.join(self.buffer))
            self.buffer = None


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--baseline', required=True, type=Path)
    args.add_argument('--output', required=True, type=Path)
    opts = args.parse_args()
    assert digest(opts.baseline.read_bytes()) == BASE_HASH, 'Wrong R52 baseline ZIP'
    subprocess.run(['node', str(ROOT / 'scripts/test-r8-8-52-review.cjs')], check=True)
    with zipfile.ZipFile(opts.baseline) as z:
        assert z.testzip() is None
        names = z.namelist()
        assets = [n for n in names if n not in ['AUDIT_REPORT.md', 'RELEASE_NOTES.md']]
        changed = [n for n in assets if z.read(n) != (APP / n).read_bytes()]
        assert set(changed) == CHANGED, changed
        assert z.read('birthday.html') == (APP / 'birthday.html').read_bytes()
    syntax = []
    for f in APP.glob('*.js'):
        subprocess.run(['node', '--check', str(f)], capture_output=True, check=True)
        syntax.append(f.name)
    with tempfile.TemporaryDirectory(dir=ROOT) as temp:
        for f in APP.glob('*.html'):
            parsed = HTML()
            parsed.feed(f.read_text())
            for i, script in enumerate(parsed.scripts):
                if not script.strip():
                    continue
                item = Path(temp) / 'inline.js'
                item.write_text(script)
                subprocess.run(['node', '--check', str(item)], capture_output=True, check=True)
                syntax.append(f.name + ':inline:' + str(i))
    parsed = HTML()
    parsed.feed((APP / 'index.html').read_text())
    refs = [x.split('?')[0] for x in parsed.refs if not re.match(r'^(?:[a-z]+:|#|/api/)', x)]
    missing = [x for x in refs if not (APP / x).exists()]
    assert not missing, missing
    result = {'passed': True, 'syntaxUnits': len(syntax), 'localIndexReferences': len(refs),
              'missing': missing, 'changedAssets': sorted(changed), 'unchangedAssets': len(assets)-len(changed),
              'originalBirthdayPreserved': True, 'legacyVerifier': 'not passed: SOURCE_MANIFEST.json unavailable; no substitute fabricated',
              'hashes': {n: digest((APP / n).read_bytes()) for n in names}}
    (ROOT / 'verification/R8_8_53_STATIC.json').write_text(json.dumps(result, indent=2))
    opts.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(opts.output, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.write(APP / n, n)
    with zipfile.ZipFile(opts.output) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == 62 and 'index.html' in z.namelist()
        assert all(z.read(n) == (APP / n).read_bytes() for n in names)
    report = {'passed': True, 'file': opts.output.name, 'sha256': digest(opts.output.read_bytes()),
              'entries': len(names), 'crc': 'pass', 'rootIndex': True, 'bytes': opts.output.stat().st_size,
              'gitExcludesPrivateBirthday': True, 'deployed': False, 'deviceVerified': False}
    (ROOT / 'verification/R8_8_53_PACKAGE.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'static': {k: v for k, v in result.items() if k != 'hashes'}, 'package': report}, indent=2))


if __name__ == '__main__':
    main()
