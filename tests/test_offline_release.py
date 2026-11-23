# SPDX-License-Identifier: Apache-2.0
"""Exercise the release CLI using independent local Git checkouts and ZIP readers."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parents[1]


def run(*cmd, cwd, check=True, **options):
    result = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **options)
    if check and result.returncode:
        raise AssertionError(result.stderr + result.stdout)
    return result


class OfflineRelease(unittest.TestCase):
    def test_archive_and_independent_verification(self):
        with tempfile.TemporaryDirectory(prefix='circuit-release-test-') as temporary:
            temp = Path(temporary)
            source = temp / 'first checkout'
            peer = temp / 'second checkout'
            run('git', 'init', '--quiet', '--template=', str(source), cwd=temp)
            module = "import {siteFiles} from './scripts/package-site.mjs'; console.log(JSON.stringify(siteFiles));"
            site_files = json.loads(run('node', '--input-type=module', '-e', module, cwd=ROOT).stdout)
            # Commit the current source under test, including uncommitted implementation changes.
            for name in [*site_files, 'package.json', 'scripts/offline-release.py',
                         *(p.relative_to(ROOT) for p in (ROOT / 'scripts').glob('*.mjs'))]:
                (source / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, source / name)
            (source / '.env').write_text('private fixture excluded from game')
            run('git', 'add', '--force', '.', cwd=source)
            run('git', '-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit',
                '--quiet', '--no-gpg-sign', '-m', 'release fixture', cwd=source)
            revision = run('git', 'rev-parse', 'HEAD', cwd=source).stdout.strip()
            run('git', 'clone', '--quiet', '--depth=1', source.as_uri(), str(peer), cwd=temp)
            run('git', 'checkout', '--quiet', '--detach', revision, cwd=peer)
            (source / 'src/main.js').write_text('// unstaged changes must never ship under this commit')
            (source / 'src/debug.js').write_text('development-only')

            def release(repo, command, output, **kwargs):
                return run(sys.executable, 'scripts/offline-release.py', command, str(output), cwd=repo, **kwargs)

            first, second = temp / 'one', temp / 'two'
            release(source, 'build', first, env={**os.environ, 'TZ': 'UTC'})
            release(peer, 'build', second, env={**os.environ, 'TZ': 'Australia/Adelaide'})
            name = f'Circuit-Overdrive-{revision}.zip'
            receipt = name + '.sha256'
            self.assertEqual({p.name for p in first.iterdir()}, {name, receipt})
            for path in (name, receipt):
                self.assertEqual((first / path).read_bytes(), (second / path).read_bytes())
            digest = hashlib.sha256((first / name).read_bytes()).hexdigest()
            self.assertEqual((first / receipt).read_text(), f'{digest}  {name}\n')
            release(source, 'verify', second)
            self.assertNotEqual(release(peer, 'build', first, check=False).returncode, 0)
            release(peer, 'verify', first)

            prefix = 'Circuit-Overdrive/'
            with ZipFile(first / name) as archive:
                expected = sorted(prefix + p for p in [*site_files, 'START-HERE.txt', 'RELEASE.json'])
                self.assertEqual(archive.namelist(), expected)
                self.assertIsNone(archive.testzip())
                for member in archive.infolist():
                    self.assertEqual(member.date_time, (1980, 1, 1, 0, 0, 0))
                    self.assertEqual(member.external_attr >> 16, 0o100644)
                    self.assertEqual(member.compress_type, ZIP_STORED)
                manifest = json.loads(archive.read(prefix + 'RELEASE.json'))
                self.assertEqual(manifest['source']['commit'], revision)
                vendor = json.loads(archive.read(prefix + 'vendor/vanillajs/provenance.json'))
                self.assertEqual(manifest['vanillajs'], {k: vendor[k] for k in ('repository', 'commit')})
                self.assertIn('python3 -m http.server', archive.read(prefix + 'START-HERE.txt').decode())
                self.assertEqual(manifest['sha256'], {
                    p: hashlib.sha256(archive.read(prefix + p)).hexdigest() for p in [*site_files, 'START-HERE.txt']})
                self.assertEqual(archive.read(prefix + 'src/main.js'), (peer / 'src/main.js').read_bytes())
                self.assertIn(revision.encode(), archive.read(prefix + 'index.html'))

            (second / receipt).write_text('wrong receipt\n')
            self.assertIn('Checksum receipt', release(peer, 'verify', second, check=False).stderr)
            # An internally consistent, rehashed archive still has to match the committed source.
            with ZipFile(first / name) as original, ZipFile(second / name, 'w') as modified:
                replacement = b'// modified after build\n'
                manifest['sha256']['src/main.js'] = hashlib.sha256(replacement).hexdigest()
                substitutions = {prefix + 'src/main.js': replacement, prefix + 'RELEASE.json':
                                 (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()}
                for info in original.infolist():
                    updated = substitutions.get(info.filename, original.read(info))
                    modified.writestr(info, updated)
            forged = hashlib.sha256((second / name).read_bytes()).hexdigest()
            (second / receipt).write_text(f'{forged}  {name}\n')
            self.assertIn('Archive differs', release(source, 'verify', second, check=False).stderr)

            with (source / 'scripts/offline-release.py').open('a') as script:
                script.write('\n# changed build tool\n')
            self.assertIn('committed at the target revision', release(source, 'build', temp / 'bad', check=False).stderr)
            self.assertFalse((temp / 'bad').exists())


if __name__ == '__main__':
    unittest.main()
