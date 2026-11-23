// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('vendored sources and notices match the pinned manifest', async () => {
  const root = new URL('../vendor/vanillajs/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('provenance.json', root)));
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  for (const [path, hash] of Object.entries(manifest.sha256)) {
    const data = await readFile(new URL(path, root));
    assert.equal(createHash('sha256').update(data).digest('hex'), hash, path);
  }
});
