// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {track} from '../src/track.js';
import {ridge} from '../src/ridge.js';
import {ridgeBatches} from '../src/ridge-scene.js';
import {speedwayBatches} from '../src/speedway.js';
import {nightFrame, eventTitle, validateEnvironment} from '../src/environment.js';
import {nightStars, buildNightWorld} from '../src/night-fixtures.js';
import {touringMeshes} from '../src/touring-car.js';

test('environment validation accepts only the two literal values without coercion',()=>{
  for(const value of ['day','night']) assert.equal(validateEnvironment(value),value);
  for(const value of [undefined,null,NaN,2,true,'Night','night ',['day'],{toString(){throw Error('coerced');}}])
    assert.throws(()=>validateEnvironment(value),RangeError);
  assert.equal(eventTitle(track,'day'),track.name);
  assert.equal(eventTitle(track,'night'),'Nightshift Speedway');
  assert.equal(eventTitle(ridge,'night'),'Redline Ridge — Midnight Descent');
  assert.throws(()=>eventTitle(ridge,'dusk'));
});

test('night projector lenses share the original front fascia; braking only changes rear lamps',()=>{
  const inspect={mesh:v=>v}, day=touringMeshes(inspect), night=touringMeshes(inspect,true);
  assert.equal(day.projectors,null);
  assert.equal(day.detail.length,night.detail.length+night.projectors.length);
  for(let i=0;i<night.projectors.length;i+=11) assert.ok(night.projectors[i+2]<-2.15);
  for(let i=0;i<night.lamps.length;i+=11) assert.ok(night.lamps[i+2]>2.15);
  assert.deepEqual(night.lamps,day.lamps);
});

for(const course of [track,ridge]) {
  test(course.name+' night fixture lighting retains every original triangle, its normal and UV',()=>{
    const build=()=>course.closed ? speedwayBatches() : ridgeBatches(course);
    const day=build(), night=buildNightWorld(course,build());
    let litRoad=0, unlitRoad=0, litRail=0, litTunnel=0, unlitForest=0;
    for(let k=0;k<day.length;k++){
      const {vertices:a,material}=day[k], b=night[k].vertices;
      assert.equal(a.length,b.length);
      if(night[k].receiverVertices) assert.deepEqual(night[k].receiverVertices,a);
      for(let i=0;i<a.length;i+=11) {
        for(const j of [0,1,2,3,4,5,9,10])
          if(a[i+j]!==b[i+j]) assert.fail('night moves a surface at batch '+k+' vertex '+i/11);
        const gain=b[i+6]-a[i+6], road=material.pattern==='asphalt';
        if(road && gain>.035) litRoad++;
        if(road && gain===0) unlitRoad++;
        if(!road && gain>.02 && Math.abs(b[i+4])<.1) litRail++;
        if(road && !course.closed && (gain>.05 || gain===0)) {
          const s=course.project(a[i],a[i+2]).s;
          if(gain>.05 && s>3080 && s<3230) litTunnel++;
          if(gain===0 && s>880 && s<1180) unlitForest++;
        }
      }
    }
    assert.ok(litRoad>100 && unlitRoad>100 && litRail>100);
    if(!course.closed) assert.ok(litTunnel>100 && unlitForest>100);
    const fixtures=night.slice(day.length);
    assert.ok(fixtures.some(b=>b.material.emission>0));
    for(const {vertices:v,bounds} of fixtures) {
      assert.ok(Number.isFinite(bounds.r));
      for(let i=0;i<v.length;i+=11){
        const p=course.project(v[i],v[i+2]);
        if(Math.abs(p.lateral)<course.barrierOffset-.3)
          assert.ok(v[i+1]-p.y>6.2,`fixture intrudes on road at ${p.s} m / ${p.lateral} m`);
      }
    }
    assert.ok(night.length<118);
    assert.ok(night.reduce((sum,b)=>sum+b.vertices.length/11,0)<255000);
    const stars=nightStars(course);
    assert.deepEqual(stars,nightStars(course));
    assert.equal(stars.length,880*33);
    assert.ok(stars.every(Number.isFinite));
    assert.ok(nightFrame(course).ambient<.3);
  });
}
