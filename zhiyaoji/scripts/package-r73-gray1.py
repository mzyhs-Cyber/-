#!/usr/bin/env python3
"""Build the full gray1 release from the original private R73 deployment ZIP."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = '5827859a7e6b05a62032d2ed47d2c093b2f655cc79d05e2e1aced39dc29674df'


class Entry(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.stylesheets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get('src') if tag in ('script', 'img') else attrs.get('href') if tag == 'link' else None
        if value:
            self.refs.append(value)
            if tag == 'link' and attrs.get('rel') == 'stylesheet':
                self.stylesheets.append(value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-zip', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    assert hashlib.sha256(args.source_zip.read_bytes()).hexdigest() == SOURCE_SHA256, 'Expected original R73 ZIP'
    with zipfile.ZipFile(args.source_zip) as source:
        assert source.testzip() is None
        original = {i.filename: source.read(i) for i in source.infolist() if not i.is_dir()}
    for name in original:
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts
    assert len(original) == 83 and 'birthday.html' in original
    files = dict(original)
    for name in ('index.html', 'sw.js', 'excluded-options.css'):
        files[name] = (ROOT / 'app' / name).read_bytes()
    changed = sorted(name for name in original if files[name] != original[name])
    assert changed == ['index.html', 'sw.js'], changed
    assert files['_worker.js'] == original['_worker.js']
    assert files['birthday.html'] == original['birthday.html']
    page = Entry()
    page.feed(files['index.html'].decode())
    missing = []
    for ref in page.refs:
        url = urlsplit(ref)
        if not url.scheme and not url.netloc and url.path and unquote(url.path) not in files:
            missing.append(ref)
    assert not missing, missing
    assert page.stylesheets[-1] == 'excluded-options.css?v=r73-gray-1'
    worker = files['sw.js'].decode()
    cache_refs = []
    for array in ('FILES', 'READING_FILES'):
        match = re.search(r'const ' + array + r'=\[(.*?)\];', worker, re.S)
        assert match, array
        cache_refs += re.findall(r"'([^']+)'", match[1])
    for ref in cache_refs:
        name = unquote(urlsplit(ref).path).removeprefix('./')
        assert not name or name in files, ref
    assert './excluded-options.css?v=r73-gray-1' in cache_refs
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as folder:
        target = Path(folder) / 'sw.js'
        target.write_bytes(files['sw.js'])
        subprocess.run(['node', '--check', str(target)], capture_output=True, check=True)
    files['更新说明_R73_排除变灰.txt'] = (ROOT / 'app' / 'RELEASE_NOTES.md').read_bytes()
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for name, data in files.items():
            output.writestr(name, data)
    with zipfile.ZipFile(args.output) as output:
        assert output.testzip() is None
        assert 'index.html' in output.namelist()
        assert all(output.read(name) == data for name, data in files.items())
    result = {
        'release': 'R8.8.73-gray1', 'sourceArchiveSha256': SOURCE_SHA256,
        'sourceFiles': len(original), 'modifiedFromR73': changed,
        'added': sorted(set(files) - set(original)), 'unchangedSourceFiles': len(original) - len(changed),
        'workerUnchanged': True, 'allR73ApplicationScriptsUnchanged': True,
        'privateBirthdayPreserved': True, 'entryCount': len(files),
        'entryAssetReferences': len(page.refs), 'cachedAssetReferences': len(cache_refs),
        'archive': args.output.name, 'archiveBytes': args.output.stat().st_size,
        'archiveSha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
        'crcAndFileBytesVerified': True, 'deployed': False, 'browserQA': False, 'iPadQA': False,
    }
    destination = ROOT / 'verification' / 'r73-gray1' / 'package.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
