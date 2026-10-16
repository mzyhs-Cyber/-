"""Verify a handoff ZIP without extracting or executing its contents."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile


def verify(path):
    path = Path(path)
    with zipfile.ZipFile(path) as archive:
        names = [info.filename for info in archive.infolist() if not info.is_dir()]
        if len(names) != len(set(names)):
            raise ValueError('Duplicate ZIP member')
        for name in names:
            p = PurePosixPath(name)
            if p.is_absolute() or '..' in p.parts or '\\' in name:
                raise ValueError('Unsafe ZIP path: ' + name)
        manifests = [n for n in names if n.endswith('/MANIFEST.json')]
        if len(manifests) != 1:
            raise ValueError('Expected one root manifest')
        manifest_name = manifests[0]
        prefix = manifest_name.removesuffix('MANIFEST.json')
        manifest = json.loads(archive.read(manifest_name))
        expected = [prefix + row['path'] for row in manifest['files']]
        if len(expected) != len(set(expected)) or set(names) != set(expected + [manifest_name]):
            raise ValueError('ZIP file list differs from manifest')
        for row in manifest['files']:
            body = archive.read(prefix + row['path'])
            if len(body) != row['bytes'] or hashlib.sha256(body).hexdigest() != row['sha256']:
                raise ValueError('Hash or size mismatch: ' + row['path'])
        bad = archive.testzip()
        if bad:
            raise ValueError('ZIP CRC failure: ' + bad)
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return {'status': 'verified', 'zip_file': path.name, 'bytes': path.stat().st_size,
            'zip_sha256': digest.hexdigest(), 'payload_files': len(expected),
            'zip_entries': len(names), 'source_commit': manifest['source_commit'],
            'kind': manifest['kind'], 'all_file_hashes_match': True, 'zip_crc_ok': True}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python verify_package.py HANDOFF.zip')
    print(json.dumps(verify(sys.argv[1]), ensure_ascii=False, indent=2))
