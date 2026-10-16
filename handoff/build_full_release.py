"""Verify all five volumes and reconstruct the full archive for authorized publication."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from verify_package import verify


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    source = repo / 'handoff_full'
    expected = json.loads((source / 'VOLUMES_CHECK.json').read_text(encoding='utf-8'))
    if not expected['all_full_payload_files_covered'] or len(expected['parts']) != 5:
        raise ValueError('Expected five complete verified source volumes')
    reports = []
    for row in expected['parts']:
        path = source / row['filename']
        report = verify(path)
        if report['bytes'] != row['bytes'] or report['zip_sha256'] != row['sha256']:
            raise ValueError('Published volume differs from approved package: ' + path.name)
        reports.append(report)
    first = source / expected['parts'][0]['filename']
    with zipfile.ZipFile(first) as archive:
        name = next(n for n in archive.namelist() if n.endswith('/ORIGINAL_FULL_MANIFEST.json'))
        original = json.loads(archive.read(name))
    wanted = {r['path']: r for r in original['files']}
    payload = {}
    for row in expected['parts']:
        with zipfile.ZipFile(source / row['filename']) as archive:
            manifest_name = next(n for n in archive.namelist() if n.endswith('/MANIFEST.json'))
            prefix = manifest_name.removesuffix('MANIFEST.json')
            for name in archive.namelist():
                relative = name.removeprefix(prefix)
                if relative not in wanted:
                    continue
                body = archive.read(name)
                evidence = wanted[relative]
                if len(body) != evidence['bytes'] or hashlib.sha256(body).hexdigest() != evidence['sha256']:
                    raise ValueError('Original full-package member differs: ' + relative)
                if relative in payload and payload[relative] != body:
                    raise ValueError('Conflicting duplicate across volumes: ' + relative)
                payload[relative] = body
    if set(payload) != set(wanted):
        raise ValueError('Some full-package members are missing')
    notice = (source / 'README.md').read_bytes()
    payload['00_下载后先看.txt'] = (
        '完整交接包已经包含代码、交接说明和原四卷历史资料。\n'
        '先读 START_HERE.md，再读 NEXT_AI_PROMPT.txt。\n'
        '旧资料里的不公开说明是旧授权状态；用户现已明确同意本次公开上传。\n'
        '当前仍为2.3，A/B卷的新故障没有修复，真实每日五卷还未验收。\n'
        '需要分卷上传给下一AI时，请从同一下载页取得五个part ZIP，每卷小于32MiB。\n'
        '登录资料不在包内。\n').encode('utf-8')
    payload['PUBLICATION_NOTICE.md'] = notice
    manifest = {
        'schema_version': 1, 'source_commit': original['source_commit'],
        'kind': 'public_full_handoff_authorized', 'manifest_self_excluded': True,
        'original_full_payload_files': len(wanted),
        'files': [{'path': name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
                  for name, body in sorted(payload.items())]}
    payload['MANIFEST.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
    args.output.mkdir(parents=True, exist_ok=True)
    target = args.output / 'Fenbi_AI_Handoff_20261016_ALL.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, body in sorted(payload.items()):
            archive.writestr('Fenbi_AI_Handoff_20261016/' + name, body)
    report = verify(target)
    (args.output / 'FULL_PACKAGE_VERIFICATION.json').write_text(
        json.dumps({'full': report, 'parts': reports, 'original_payloads_all_preserved': True},
                   ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (args.output / 'SHA256SUMS.txt').write_text(
        '\n'.join(f"{r['zip_sha256']}  {r['zip_file']}" for r in [report] + reports) + '\n', encoding='utf-8')
    shutil.copy2(source / 'README.md', args.output / 'README.md')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
