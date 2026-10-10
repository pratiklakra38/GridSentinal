"""Build a self-contained submission ZIP from explicit project roots."""
import hashlib
import json
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'tmp' / 'submission' / 'GridSentinel'
ARCHIVE = ROOT / 'GridSentinel_Submission.zip'
EXCLUDED = {'node_modules', '__pycache__', '.pytest_cache', '.ruff_cache', 'test-results', 'playwright-report', '.venv', '.git'}


def include(path):
    return not any(part in EXCLUDED for part in path.parts) and path.suffix.lower() not in {'.db', '.db-shm', '.db-wal', '.pyc', '.log', '.tsbuildinfo'} and path.name != '.env'


def main():
    if PACKAGE.exists():
        raise RuntimeError(f'Package staging already exists: {PACKAGE}; choose a fresh staging directory before rebuilding.')
    PACKAGE.mkdir(parents=True)
    for name in ['frontend', 'backend', 'docs', 'scripts']:
        source = ROOT / name
        for path in source.rglob('*'):
            relative = path.relative_to(ROOT)
            if path.is_file() and include(relative):
                destination = PACKAGE / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination)
    for name in ['.gitignore', 'overleaf_project.pdf']:
        if (ROOT / name).is_file():
            shutil.copy2(ROOT / name, PACKAGE / name)
    shutil.copy2(ROOT / 'README.md', PACKAGE / 'DEVELOPMENT_README.md')
    shutil.copy2(ROOT / 'docs' / 'SUBMISSION_README.md', PACKAGE / 'README.md')
    shutil.copy2(ROOT / 'tmp' / 'package-bin' / 'GridSentinel.exe', PACKAGE / 'GridSentinel.exe')
    manifest = []
    for path in sorted(PACKAGE.rglob('*')):
        if path.is_file():
            manifest.append({'path': path.relative_to(PACKAGE).as_posix(), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (PACKAGE / 'MANIFEST.json').write_text(json.dumps({'project': 'GridSentinel', 'github': 'https://github.com/pratiklakra38/GridSentinal', 'files': manifest}, indent=2), encoding='utf-8')
    with zipfile.ZipFile(ARCHIVE, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(PACKAGE.rglob('*')):
            if path.is_file():
                archive.write(path, Path('GridSentinel') / path.relative_to(PACKAGE))
    with zipfile.ZipFile(ARCHIVE) as archive:
        bad_file = archive.testzip()
        if bad_file:
            raise RuntimeError(f'Archive CRC verification failed: {bad_file}')
        names = archive.namelist()
        for required in ['GridSentinel/README.md', 'GridSentinel/GridSentinel.exe', 'GridSentinel/frontend/dist/index.html', 'GridSentinel/frontend/src/App.tsx', 'GridSentinel/backend/app/main.py']:
            if required not in names:
                raise RuntimeError(f'Missing required submission file: {required}')
    size = ARCHIVE.stat().st_size
    if size >= 100_000_000:
        raise RuntimeError('Submission exceeds the 100 MB limit')
    print(json.dumps({'archive': str(ARCHIVE), 'bytes': size, 'size_mb': round(size / 1_000_000, 2), 'file_count': len(names), 'sha256': hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
