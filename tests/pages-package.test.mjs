// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cp, mkdtemp, mkdir, readFile, readdir, rm, unlink, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {siteFiles} from '../scripts/package-site.mjs';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const command = resolve(checkout, 'scripts/package-site.mjs');

test('package is reproducible, with a reachable allowlist, local references and intact upstream sources', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'circuit-package-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const source = join(temp, 'checkout');
  for (const path of siteFiles) {
    await mkdir(dirname(join(source, path)), {recursive: true});
    await cp(join(checkout, path), join(source, path));
  }
  await writeFile(join(source, '.env'), 'excluded');
  await writeFile(join(source, 'src', 'development.js'), 'excluded');
  const run = destination => spawnSync(process.execPath, ['--experimental-vm-modules', command, destination],
    {cwd: source, encoding: 'utf8'});
  for (const name of ['first', 'second']) {
    const output = join(temp, name);
    const build = run(output);
    assert.equal(build.status, 0, build.stderr);
    const contents = await readdir(output, {recursive: true, withFileTypes: true});
    const paths = contents.filter(entry => entry.isFile()).map(entry =>
      join(entry.parentPath, entry.name).slice(output.length + 1));
    assert.deepEqual(paths.sort(), siteFiles);
    for (const path of paths) assert.deepEqual(await readFile(join(output, path)), await readFile(join(source, path)));
    assert.notEqual(run(output).status, 0, 'an existing output directory cannot be reused');
  }
  const html = await readFile(join(source, 'index.html'), 'utf8');
  await writeFile(join(source, 'index.html'), html.replace('./src/main.js', '/src/main.js'));
  assert.match(run(join(temp, 'absolute')).stderr, /must reference a relative asset/);
  await writeFile(join(source, 'index.html'), html);
  const entry = join(source, 'src/main.js');
  const original = await readFile(entry, 'utf8');
  await writeFile(entry, original + "\nimport '../tests/driver.mjs';");
  assert.match(run(join(temp, 'dev-import')).stderr, /references an unlisted asset/);
  await writeFile(entry, original);
  const track = join(source, 'tracks/redline-ridge.json');
  await unlink(track);
  await symlink(join(checkout, 'tracks/redline-ridge.json'), track);
  assert.match(run(join(temp, 'symlink')).stderr, /symlink in site allowlist/);
  await unlink(track);
  await cp(join(checkout, 'tracks/redline-ridge.json'), track);
  await writeFile(join(source, 'vendor/vanillajs/NOTICE'), 'truncated notice');
  assert.match(run(join(temp, 'checksum')).stderr, /vendor checksum/);
});
