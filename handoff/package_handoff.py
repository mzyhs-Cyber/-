"""Create a verifiable source handoff; optional private extras stay local."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import zipfile
from verify_package import verify


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--extras', type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    root = 'Fenbi_AI_Handoff_20261016'
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    files = {}
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=repo).split(b'\0')
    for raw in tracked:
        if raw:
            relative = raw.decode('utf-8')
            path = repo / relative
            if path.is_symlink():
                raise ValueError('Symlink is not supported: ' + relative)
            files['code/' + relative] = path.read_bytes()
    files['START_HERE.md'] = (repo / 'handoff/00_START_HERE.md').read_bytes()
    files['NEXT_AI_PROMPT.txt'] = (repo / 'handoff/NEXT_AI_PROMPT.txt').read_bytes()
    files['SOURCE_COMMIT.txt'] = (source + '\n').encode()
    with TemporaryDirectory() as td:
        bundle = Path(td) / 'repository.bundle'
        subprocess.run(['git', 'bundle', 'create', str(bundle), '--all', 'HEAD'], cwd=repo, check=True)
        subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=repo, check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        files['history/repository.bundle'] = bundle.read_bytes()
    files['history/COMMITS.txt'] = subprocess.check_output(
        ['git', 'log', '--all', '--date=iso-strict', '--format=%H %ad %s'], cwd=repo)
    if args.extras:
        for path in sorted(args.extras.rglob('*')):
            if path.is_symlink():
                raise ValueError('Private extra symlink is not supported')
            if path.is_file():
                relative = path.relative_to(args.extras).as_posix()
                if relative in files or relative == 'MANIFEST.json':
                    raise ValueError('Duplicate package path: ' + relative)
                files[relative] = path.read_bytes()
    manifest = {'schema_version': 1, 'source_commit': source,
                'kind': 'local_full_with_private_history' if args.extras else 'public_code_and_handoff_only',
                'manifest_self_excluded': True,
                'files': [{'path': name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
                          for name, body in sorted(files.items())]}
    files['MANIFEST.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, body in sorted(files.items()):
            archive.writestr(root + '/' + name, body)
    report = verify(args.output)
    checksum = report['zip_sha256']
    args.output.with_suffix('.sha256').write_text(checksum + '  ' + args.output.name + '\n', encoding='utf-8')
    args.output.with_name(args.output.stem + '_verification.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
