// SPDX-License-Identifier: Apache-2.0
// Run from the exact checkout being served. Probes the actual HTTP entry and
// every byte-shipped file, including optional audio and attribution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {siteFiles} from './package-site.mjs';

const base = new URL(process.argv[2]);
assert(base.pathname === '/Circuit-Overdrive/' && !base.search && !base.hash,
  'Expected the /Circuit-Overdrive/ project URL with a trailing slash');
const types = {
  html: ['text/html'], css: ['text/css'], json: ['application/json'],
  js: ['text/javascript', 'application/javascript']
};

for (const name of siteFiles) {
  // Fetch the bare directory to verify its default entry point.
  const url = new URL(name === 'index.html' ? '' : name, base);
  const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(20_000)});
  assert.equal(response.status, 200, 'HTTP ' + url);
  const required = types[name.split('.').pop()];
  if (required) {
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    assert(required.includes(type), url + ' served as ' + type);
  }
  const expected = await readFile(name);
  assert(expected.equals(Buffer.from(await response.arrayBuffer())), url + ' differs from the checked-out revision');
}
console.log('HTTP contents and MIME types verified at ' + base.href + ' (' + siteFiles.length + ' files).');
