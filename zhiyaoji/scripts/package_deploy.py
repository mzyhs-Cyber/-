#!/usr/bin/env python3
"""Assemble a local ZIP only after all original assets match the source manifest."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--private-birthday', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'output/zhiyaoji-V2.9.18-r7.zip')
    args = parser.parse_args()
    manifest = json.loads((ROOT/'docs/SOURCE_MANIFEST.json').read_text())
    assets = []
    for item in manifest['entries']:
        p = ROOT/'app'/item['path'] if item['tracked'] else args.private_birthday
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != item['sha256']:
            raise SystemExit('Refusing incomplete or changed snapshot: '+item['path'])
        assets.append((p, item['path']))
    if args.output.exists():
        raise SystemExit('Refusing to overwrite existing output')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for p, name in assets:
            z.write(p, name)
    with zipfile.ZipFile(args.output) as z:
        assert z.testzip() is None and 'index.html' in z.namelist()
    print(json.dumps({'output': str(args.output), 'files': len(assets), 'deployed': False}))


if __name__ == '__main__':
    main()
