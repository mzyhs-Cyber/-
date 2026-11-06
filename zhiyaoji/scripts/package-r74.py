#!/usr/bin/env python3
"""Assemble a private full deployment from the original release and reviewed overlays."""
import argparse
import hashlib
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = '5827859a7e6b05a62032d2ed47d2c093b2f655cc79d05e2e1aced39dc29674df'
RUNTIME = ['_headers', 'index.html', 'sw.js', 'performance-diagnostics.js',
           'local-review-engine.js', 'local-review-background.js', 'local-review-worker.js',
           'local-review.js', 'excluded-options.css', 'practice-images.js']


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        ref = attrs.get('src') if tag in ('script', 'img') else attrs.get('href') if tag == 'link' else None
        if ref:
            self.refs.append(ref)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-zip', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert hashlib.sha256(args.source_zip.read_bytes()).hexdigest() == SOURCE_SHA
    with zipfile.ZipFile(args.source_zip) as source:
        assert source.testzip() is None
        original = {i.filename: source.read(i) for i in source.infolist() if not i.is_dir()}
    assert len(original) == 83 and 'birthday.html' in original
    for name in original:
        assert not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
    files = dict(original)
    for name in RUNTIME:
        files[name] = (ROOT / 'app' / name).read_bytes()
    for name in ('bundle.js', '_worker.js', 'birthday.html', 'local-records.js', 'answer-journal.js',
                 'practice-window.js', 'ink-surface-cache.js', 'draft-owner-review.js'):
        assert files[name] == original[name], name
    for name in original:
        if name.endswith('.css'):
            assert files[name] == original[name], name
    assert b'text-decoration: line-through;' in files['excluded-options.css']
    page = Page()
    page.feed(files['index.html'].decode())
    refs = page.refs[:]
    worker = files['sw.js'].decode()
    assert "r8-8-74'" in worker
    for array in ('FILES', 'READING_FILES'):
        match = re.search(r'const ' + array + r'=\[(.*?)\];', worker, re.S)
        assert match, array
        refs += re.findall(r"'([^']+)'", match[1])
    for ref in refs:
        parsed = urlsplit(ref)
        name = unquote(parsed.path).removeprefix('./')
        if not parsed.scheme and not parsed.netloc and name:
            assert name in files, ref
    changed = sorted(name for name in original if files[name] != original[name])
    assert changed == sorted(name for name in RUNTIME if name in original), changed
    summary = json.loads((ROOT / 'verification/r74/summary.json').read_text())
    assert summary['passed'] and summary['assertions'] >= 157
    files['更新说明_R74.txt'] = (ROOT / 'app/RELEASE_NOTES.md').read_bytes()
    files['程序验证_R74.json'] = json.dumps(summary, ensure_ascii=False, indent=2).encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for name, data in files.items():
            output.writestr(name, data)
    with zipfile.ZipFile(args.output) as output:
        assert output.testzip() is None and 'index.html' in output.namelist()
        assert all(output.read(name) == data for name, data in files.items())
    report = {'release': 'R74', 'sourceArchiveSha256': SOURCE_SHA, 'entryCount': len(files),
              'changedFromR73': changed, 'added': sorted(set(files) - set(original)),
              'unchangedOriginalFiles': len(original) - len(changed), 'originalBundlePreserved': True,
              'privateBirthdayPreserved': True, 'inkStorageWorkerPreserved': True,
              'crcAndFileBytesVerified': True, 'archive': args.output.name,
              'archiveBytes': args.output.stat().st_size,
              'archiveSha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
              'deployed': False, 'browserQA': False, 'iPadQA': False}
    (ROOT / 'verification/r74/package.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
