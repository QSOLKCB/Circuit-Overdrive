// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {add,dot,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {orbital} from '../src/orbital.js';
import {createRocketBody} from '../src/rocket-dynamics.js';
import {resolveRocketContacts} from '../src/rocket-contact.js';
import {orbitalBatches} from '../src/orbital-scene.js';

function entrant(id,f,velocity) {
  const previousBody=createRocketBody(f);
  const vehicle={...previousBody,position:add(previousBody.position,scale(velocity,1/60)),velocity};
  return {id,previousBody,vehicle,distance:f.station};
}
test('all rendered Orbital deck corners match the wheel probe triangles, including both lips',()=>{
  const [road]=orbitalBatches();
  assert.equal(road.kind,'deck');
  let v=0;
  for(const [i,a] of orbital.rows.entries()) {
    if(!a.connected) continue;
    const b=orbital.rows[i+1];
    for(const p of [a.left,a.right,b.right,a.left,b.right,b.left]) {
      for(let k=0;k<3;k++) assert.ok(Math.abs(road.vertices[v+k]-p[k])<.00004);
      v+=11;
    }
  }
  assert.equal(v,road.vertices.length);
});
test('swept equal-mass chassis contact resolves physical velocities in stable entrant order',()=>{
  const encounter=reverse=>{
    const a=entrant(1,orbital.frame(27,-1),[70,0,0]);
    const b=entrant(2,orbital.frame(27,1),[-70,0,0]);
    resolveRocketContacts(reverse?[b,a]:[a,b],orbital);
    assert.ok(a.pairContact && b.pairContact);
    assert.ok(a.vehicle.position[0]<b.vehicle.position[0]);
    assert.ok(a.vehicle.velocity[0]<0 && b.vehicle.velocity[0]>0);
    assert.equal(a.vehicle.velocity[0]+b.vehicle.velocity[0],0);
    return [a.vehicle,b.vehicle];
  };
  assert.deepEqual(encounter(false),encounter(true));
});
for(const kind of ['wall','ceiling']) test(kind+' rail acts along the physical lateral axis and has finite height',()=>{
  const section=orbital.sections.find(p=>p.kind===kind);
  const station=(section.start+section.end)/2, f=orbital.frame(station,12.5), v=scale(f.lateral,74);
  const e=entrant(1,f,v);
  resolveRocketContacts([e],orbital);
  assert.ok(e.contact && dot(e.vehicle.velocity,f.lateral)<=0);
  assert.ok(orbital.projectNear(e.vehicle.position,station).offset<=orbital.railOffset-.86);
  const flyer=entrant(1,f,v);
  for(const b of [flyer.vehicle,flyer.previousBody]) b.position=add(b.position,scale(f.normal,4));
  resolveRocketContacts([flyer],orbital);
  assert.equal(flyer.contact,undefined);
  const low=entrant(2,f,[0,0,0]);
  resolveRocketContacts([low,flyer],orbital);
  assert.equal(low.pairContact,undefined);
  assert.ok(dot(subtract(flyer.vehicle.position,low.vehicle.position),f.normal)>3);
});
