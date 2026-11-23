// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import recipe from '../tracks/overdrive-speedway.json' with {type: 'json'};
import {buildTrack, track} from '../src/track.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const arcDelta = (a, b) => Math.min(Math.abs(a - b), track.length - Math.abs(a - b));

test('the start, finish and seam share a continuous level, northbound straight', () => {
  assert.deepEqual(track.sample(0), track.sample(track.length));
  const a = track.sample(-0.02), b = track.sample(0.02);
  near(a.x, b.x);
  near(a.z - b.z, 0.04);
  near(a.y, b.y);
  near(a.tz, -1);
  near(b.tz, -1);
  near(a.bank, 0);
  near(b.bank, 0);
  assert.deepEqual(track.gates.map(g => g.s), Array.from({length: 8}, (_, i) => track.sample(track.length * i / 8).s));
});

test('asphalt and both barrier edges project to the same closed ribbon at every metre', () => {
  let maxBank = 0, minBank = 0;
  for (let s = 0; s < track.length; s++) {
    for (const offset of [-track.barrierOffset, 0, track.barrierOffset]) {
      const p = track.sample(s, offset), q = track.project(p.x, p.z);
      near(q.lateral, offset);
      near(q.y, p.y);
      near(arcDelta(q.s, s), 0);
      near(Math.hypot(...q.normal), 1);
      assert.ok(q.normal[1] > 0.93);
      maxBank = Math.max(maxBank, q.bank);
      minBank = Math.min(minBank, q.bank);
    }
  }
  near(minBank, -17 * Math.PI / 180);
  near(maxBank, 5 * Math.PI / 180);
});

test('contact height, gradient and material follow the bank, shoulder and wheel ceiling', () => {
  for (let s = 0; s < track.length; s += 2.71) {
    const p = track.sample(s, 8);
    const hit = track.sampleSurface(p.x, p.z, p.y + 0.01);
    assert.equal(hit.surfaceId, 'asphalt');
    near(hit.height, p.y);
    assert.equal(track.sampleSurface(p.x, p.z, p.y - 0.01), null);
    // Surface normals should be orthogonal to the local longitudinal slope.
    const before = track.sample(s - 0.001, 8), after = track.sample(s + 0.001, 8);
    const [nx, ny, nz] = hit.normal;
    near((after.x - before.x) * nx + (after.y - before.y) * ny + (after.z - before.z) * nz, 0);
  }
  const apron = track.sample(10, track.halfWidth + 1);
  assert.equal(track.sampleSurface(apron.x, apron.z, 20).surfaceId, 'apron');
  const outside = track.sample(10, track.barrierOffset + 3);
  assert.equal(track.sampleSurface(outside.x, outside.z, 20), null);
});

test('invalid content and out-of-domain queries reject before entering the vehicle world', () => {
  for (const patch of [{version: 2}, {halfWidth: NaN}, {corners: []}, {barrierOffset: -2}]) {
    assert.throws(() => buildTrack({...recipe, ...patch}));
  }
  for (const patch of [{x: Infinity}, {radius: 400}, {bankDegrees: 25}, recipe.corners[1]]) {
    const corners = [{...recipe.corners[0], ...patch}, ...recipe.corners.slice(1)];
    assert.throws(() => buildTrack({...recipe, corners}));
  }
  assert.throws(() => track.project(Infinity, 0));
  assert.throws(() => track.sample(NaN));
  assert.throws(() => track.sampleSurface(0, 0, NaN));
});
