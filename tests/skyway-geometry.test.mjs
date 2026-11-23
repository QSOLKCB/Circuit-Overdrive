// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {skyway} from '../src/skyway.js';
import {skywayBatches} from '../src/skyway-scene.js';

test('Skyway mesh follows the tyre surface through all three lips and landing decks',()=>{
  const rows=skywayBatches();
  const triangles=rows.reduce((n,row)=>n+row.vertices.length/33,0);
  assert(rows.length<=26 && triangles<38000);
  const marked=new Set();
  let roadTriangles=0,worst=0;
  for(const {vertices:v} of rows) for(let i=0;i<v.length;i+=33) {
    if(Math.abs(v[i+6]-.22)>1e-6 || Math.abs(v[i+7]-.25)>1e-6 || Math.abs(v[i+8]-.30)>1e-6) continue;
    const x=(v[i]+v[i+11]+v[i+22])/3,y=(v[i+1]+v[i+12]+v[i+23])/3,z=(v[i+2]+v[i+13]+v[i+24])/3;
    const road=skyway.sampleSurface(x,z,y+1),p=skyway.project(x,z);
    assert.equal(road.surfaceId,'asphalt');
    worst=Math.max(worst,Math.abs(y-road.height)); roadTriangles++;
    for(const [j,r] of skyway.ramps.entries()) if(Math.abs(p.s-r.lip)<2) marked.add(j);
  }
  assert(roadTriangles>2000);
  assert.equal(marked.size,3);
  assert(worst<.025,'triangle-centre vertical error '+worst);
  for(let s=-59;s<skyway.endS;s+=1.37) {
    const p=skyway.sample(s,9),q=skyway.project(p.x,p.z);
    assert(Math.abs(q.s-s)<1e-8 && Math.abs(q.lateral-9)<1e-8);
    const left=skyway.sample(s-.001,9),right=skyway.sample(s+.001,9);
    const tangent=[right.x-left.x,right.y-left.y,right.z-left.z];
    assert(Math.abs(tangent.reduce((n,x,i)=>n+x*q.normal[i],0))<1e-6);
    assert.equal(skyway.sampleSurface(p.x,p.z,q.y-.01),null);
  }
  for(const l of [-18,18]) {
    const p=skyway.sample(500,l);
    assert.equal(skyway.sampleSurface(p.x,p.z,100),null);
  }
  assert.throws(()=>skyway.project(NaN,0),RangeError);
  assert.throws(()=>skyway.sample(Infinity),RangeError);
});

