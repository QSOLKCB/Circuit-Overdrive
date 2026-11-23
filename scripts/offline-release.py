#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Build or independently reproduce an offline Circuit Overdrive ZIP from Git HEAD."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_STORED, ZipFile, ZipInfo


START_HERE = b"""Circuit Overdrive - offline arcade racing

1. Extract the entire ZIP, keeping its folders together.
2. Open a terminal in the extracted Circuit-Overdrive folder beside index.html.
3. With Python 3 installed, start the local web server:

   python3 -m http.server 8000 --bind 127.0.0.1

   On Windows with the Python launcher, use py -3 in place of python3.
4. Open http://127.0.0.1:8000/ in a browser with WebGL and native JSON modules.
   Choose a course and select Start race. Follow the grid prompt to take control.
   Open Controller to select, calibrate or inspect an exposed device.
5. Press Ctrl+C in the terminal when you are done.

The server reads this folder on your computer. Both courses, the six-car field,
controls and audio work without internet access. Controller exposure depends on
the OS and browser. Profiles are saved in browser storage for the local origin.

RELEASE.json records the source commit, VANILLAJS provenance and SHA-256 of each
payload file. The separate .sha256 receipt covers the entire ZIP including this
manifest. Keep the source revision when saving a replay. LICENSE and
vendor/vanillajs/LICENSE and NOTICE contain the game and engine licences.
"""


class RevisionMeta(HTMLParser):
    def __init__(self):
        super().__init__()
        self.revisions = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'meta' and values.get('name') == 'game-revision':
            self.revisions.append(values.get('content'))


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(128 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def git_output(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def build_archive(repository, revision, temp):
    # Fetch only from the local object database. This also handles shallow CI
    # checkouts and detached PR merges. Working-tree and untracked files cannot
    # become release inputs, even if they change while the archive is built.
    snapshot = temp / 'source'
    git_output('init', '--quiet', '--template=', str(snapshot))
    git_output('-C', str(snapshot), 'config', 'core.autocrlf', 'false')
    git_output('-C', str(snapshot), 'fetch', '--quiet', '--no-tags', '--depth=1', '--', repository, revision)
    git_output('-C', str(snapshot), 'checkout', '--quiet', '--detach', revision)
    if (snapshot / 'scripts/offline-release.py').read_bytes() != Path(__file__).read_bytes():
        raise ValueError('Use the offline-release.py script committed at the target revision.')

    site = temp / 'Circuit-Overdrive'
    subprocess.run(['node', '--experimental-vm-modules', 'scripts/package-site.mjs', str(site)],
                   check=True, cwd=snapshot)
    meta = RevisionMeta()
    meta.feed((site / 'index.html').read_text(encoding='utf-8'))
    if meta.revisions != [revision]:
        raise ValueError('Packaged replay revision does not match the source commit.')
    provenance = json.loads((site / 'vendor/vanillajs/provenance.json').read_bytes())
    (site / 'START-HERE.txt').write_bytes(START_HERE)
    payload = {entry.relative_to(site).as_posix(): entry for entry in site.rglob('*') if entry.is_file()}
    manifest = {
        'version': 1,
        'source': {'repository': 'https://github.com/QSOLKCB/Circuit-Overdrive', 'commit': revision},
        'vanillajs': {'repository': provenance['repository'], 'commit': provenance['commit']},
        'sha256': {name: file_hash(path) for name, path in payload.items()},
    }
    manifest_path = site / 'RELEASE.json'
    manifest_path.write_bytes((json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode('utf-8'))
    payload['RELEASE.json'] = manifest_path

    archive = temp / f'Circuit-Overdrive-{revision}.zip'
    with ZipFile(archive, 'x', compression=ZIP_STORED, allowZip64=False) as output:
        for name in sorted(payload):
            info = ZipInfo('Circuit-Overdrive/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3  # Fixed UNIX regular-file metadata on every host.
            info.external_attr = 0o100644 << 16
            with payload[name].open('rb') as source, output.open(info, 'w') as member:
                shutil.copyfileobj(source, member)
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('build', 'verify'))
    parser.add_argument('directory', type=Path, help='fresh output directory for build, existing one for verify')
    args = parser.parse_args()
    destination = args.directory.absolute()
    if args.command == 'build' and (destination.exists() or destination.is_symlink()):
        raise FileExistsError(f'Choose a fresh release directory: {destination}')
    repository = git_output('rev-parse', '--show-toplevel')
    revision = git_output('rev-parse', '--verify', 'HEAD^{commit}')
    with TemporaryDirectory(prefix='circuit-release-') as directory:
        archive = build_archive(repository, revision, Path(directory))
        digest = file_hash(archive)
        receipt_name = archive.name + '.sha256'
        receipt = f'{digest}  {archive.name}\n'.encode('ascii')
        if args.command == 'build':
            # Stage on the output filesystem, so the ZIP and its receipt become
            # visible together. A concurrent build cannot replace a nonempty directory.
            destination.parent.mkdir(parents=True, exist_ok=True)
            with TemporaryDirectory(prefix='.circuit-release-', dir=destination.parent) as staging:
                pair = Path(staging) / 'release'
                pair.mkdir()
                shutil.copyfile(archive, pair / archive.name)
                (pair / receipt_name).write_bytes(receipt)
                pair.rename(destination)
        else:
            received = destination / archive.name
            if (not received.is_file() or received.stat().st_size != archive.stat().st_size
                    or file_hash(received) != digest):
                raise ValueError('Archive differs from the canonical ZIP rebuilt from Git HEAD.')
            recorded = destination / receipt_name
            if not recorded.is_file() or recorded.stat().st_size != len(receipt) or recorded.read_bytes() != receipt:
                raise ValueError('Checksum receipt does not match the archive and filename.')
        print(f'{args.command} {revision}\n{receipt.decode("ascii").rstrip()}')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
