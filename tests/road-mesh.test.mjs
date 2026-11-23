// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {speedwayBatches} from '../src/speedway.js';
import {track} from '../src/track.js';

// Intersect a vertical ray with the actual WebGL triangles, including their
// diagonal. Sampling the four quad corners alone would miss a twisted face.
function heightAt(vertices, point) {
  for (let i=0; i<vertices.length; i+=33) {
    const ax=vertices[i], az=vertices[i+2];
    const bx=vertices[i+11], bz=vertices[i+13];
    const cx=vertices[i+22], cz=vertices[i+24];
    if (point.x<Math.min(ax,bx,cx) || point.x>Math.max(ax,bx,cx) ||
        point.z<Math.min(az,bz,cz) || point.z>Math.max(az,bz,cz)) continue;
    const abX=bx-ax, abZ=bz-az, acX=cx-ax, acZ=cz-az;
    const det=abX*acZ-abZ*acX;
    if (Math.abs(det)<1e-12) continue;
    const dx=point.x-ax, dz=point.z-az;
    const u=(dx*acZ-dz*acX)/det, v=(abX*dz-abZ*dx)/det;
    if (u>=0 && v>=0 && u+v<=1) {
      return vertices[i+1]+u*(vertices[i+12]-vertices[i+1])+v*(vertices[i+23]-vertices[i+1]);
    }
  }
  assert.fail('Road triangle missing at '+point.s+' m, offset '+point.lateral+' m');
}

test('bank transitions keep the asphalt at tyre height and the paint above it', () => {
  const batches=speedwayBatches();
  const road=batches.find(batch=>batch.material.pattern==='asphalt').vertices;
  const details=batches[2].vertices;
  const section=track.length/Math.ceil(track.length/5);
  // Probe the diagonals of every road triangle, validating ramps on both
  // sides of every turn, plus the aprons just inside the rail.
  for (let i=0; i<road.length; i+=33) {
    const x=(road[i]+road[i+22])/2, y=(road[i+1]+road[i+23])/2, z=(road[i+2]+road[i+24])/2;
    const surface=track.sampleSurface(x,z,y+1);
    assert.ok(surface && Math.abs(y-surface.height)<.016, 'asphalt differs from wheel contact by over 16 mm');
  }
  // Probe the first sweeper on the normal racing line, under both tyres, and
  // through the dashed lane lines on entry and exit.
  for (let i=30; i<=57; i+=3) {
    const s=section*(i+.5);
    for (const lateral of [-track.halfWidth+.16,-4,-.88,0,.88,4,track.halfWidth-.16]) {
      const p=track.sample(s,lateral), asphalt=heightAt(road,p);
      assert.ok(Math.abs(asphalt-p.y)<.016);
      if (Math.abs(lateral)>=4) {
        const lift=heightAt(details,p)-asphalt;
        assert.ok(lift>.008 && lift<.028, 'paint height '+lift+' at '+s+' m');
      }
    }
  }
});
