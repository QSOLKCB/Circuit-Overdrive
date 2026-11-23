// SPDX-License-Identifier: Apache-2.0
// Run from the checkout with node --experimental-vm-modules.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';

const vendor = 'vendor/vanillajs/';
const engine = ['collision', 'input', 'math', 'render-lit', 'scenic3d', 'terrain', 'time', 'vehicle-audio', 'vehicle3d'];
const code = ['ai', 'audio', 'camera', 'contact', 'effects', 'field', 'geometry', 'input', 'main', 'map', 'ridge', 'ridge-scene',
  'scene', 'sim', 'speedway', 'touring-car', 'track'];
const attribution = ['LICENSE', vendor + 'LICENSE', vendor + 'NOTICE', vendor + 'provenance.json'];
export const siteFiles = Object.freeze([
  'index.html', 'src/style.css', ...code.map(name => 'src/' + name + '.js'),
  'tracks/overdrive-speedway.json', 'tracks/redline-ridge.json',
  vendor + 'demos/horizon-lab/race-audio.js', ...engine.map(name => vendor + 'modules/' + name + '/index.js'),
  ...attribution
].sort());

function dependencies(name, data) {
  if (name.endsWith('.js')) {
    const module = new vm.SourceTextModule(data.toString(), {identifier: name});
    return module.moduleRequests?.map(request => request.specifier) ?? module.dependencySpecifiers;
  }
  const source = data.toString();
  if (name === 'index.html') {
    return [...source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
      .map(match => match[1]).filter(url => url !== 'data:,');
  }
  if (name.endsWith('.css')) {
    return [...source.matchAll(/@import\s+["']([^"']+)["']|url\(\s*(?:["']([^"']+)["']|([^\s"')]+))/gi)]
      .map(match => match[1] ?? match[2] ?? match[3]);
  }
  if (name.endsWith('.json')) JSON.parse(source);
  return [];
}

function validate(files) {
  const base = new URL('https://package.invalid/Circuit-Overdrive/');
  const reached = new Set();
  function visit(name) {
    if (reached.has(name)) return;
    reached.add(name);
    for (const specifier of dependencies(name, files.get(name))) {
      assert.match(specifier, /^\.\.?\//, name + ' must reference a relative asset: ' + specifier);
      const target = new URL(specifier, new URL(name, base));
      assert(target.href.startsWith(base.href), name + ' references a file outside the site: ' + specifier);
      const local = target.href.slice(base.href.length);
      assert(files.has(local), name + ' references an unlisted asset: ' + local);
      visit(local);
    }
  }
  visit('index.html');
  assert.deepEqual([...reached, ...attribution].sort(), siteFiles, 'unreachable runtime files in allowlist');

  const manifest = JSON.parse(files.get(vendor + 'provenance.json'));
  assert.equal(manifest.commit, '9d95d74b355ec17add32db0b55f0f71130f9c004', 'VANILLAJS source pin');
  const vendored = siteFiles.filter(name => name.startsWith(vendor) && name !== vendor + 'provenance.json');
  assert.deepEqual(Object.keys(manifest.sha256).sort(), vendored.map(name => name.slice(vendor.length)));
  for (const name of vendored) {
    assert.equal(createHash('sha256').update(files.get(name)).digest('hex'),
      manifest.sha256[name.slice(vendor.length)], 'vendor checksum: ' + name);
  }
}

export async function packageSite(source, destination) {
  const root = await realpath(source);
  const files = new Map();
  for (const name of siteFiles) {
    const path = resolve(root, name);
    assert.equal(await realpath(path), path, 'symlink in site allowlist: ' + name);
    files.set(name, await readFile(path));
  }
  validate(files);
  await mkdir(dirname(destination), {recursive: true});
  await mkdir(destination); // The caller supplies a fresh directory. Never publish leftover files.
  try {
    for (const [name, bytes] of files) {
      const path = resolve(destination, name);
      await mkdir(dirname(path), {recursive: true});
      await writeFile(path, bytes, {flag: 'wx'});
    }
  } catch (error) {
    await rm(destination, {recursive: true, force: true});
    throw error;
  }
  return files.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3, 'Usage: node --experimental-vm-modules scripts/package-site.mjs NEW_DIRECTORY');
  const count = await packageSite('.', resolve(process.argv[2]));
  console.log('Packaged ' + count + ' files, including both courses and verified VANILLAJS sources and notices.');
}
