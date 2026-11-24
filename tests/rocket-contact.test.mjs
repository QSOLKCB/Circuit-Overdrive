// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {add,dot,length,quatMultiply,rotate,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {orbital} from '../src/orbital.js';
import {createRocketBody,NEUTRAL_ROCKET,ROCKET_LIMITS,stepRocketBody} from '../src/rocket-dynamics.js';
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

function rolledBody(frame,roll,clearance,fallSpeed) {
  const body=createRocketBody(frame);
  body.orientation=quatMultiply(body.orientation,[0,0,Math.sin(roll/2),Math.cos(roll/2)]);
  body.position=add(frame.point,scale(frame.normal,clearance));
  body.velocity=scale(frame.normal,-fallSpeed);
  return body;
}
function advance(e) {
  e.contact=false;
  e.previousBody=e.vehicle;
  e.vehicle=stepRocketBody(e.previousBody,NEUTRAL_ROCKET,orbital.surface);
  resolveRocketContacts([e],orbital);
}
for(const [label,roll] of [['side',Math.PI/2],['roof',Math.PI]]) {
  test('the '+label+' strikes the actual grid deck at speed and remains above it',()=>{
    const frame=orbital.frame(-12,-4);
    const e={id:0,distance:frame.station,vehicle:rolledBody(frame,roll,1.2,55)};
    advance(e);
    assert(e.deckContact && e.contact);
    assert.equal(e.vehicle.attached,false);
    assert(e.vehicle.wheels.every(w=>!w.contact && w.load===0));
    assert(dot(e.vehicle.velocity,frame.normal)>-5);
    assert(length(e.vehicle.angularVelocity)<=ROCKET_LIMITS.maxAngularSpeed);
    let rest=0;
    for(let i=0;i<180;i++) {
      advance(e);
      const h=dot(subtract(e.vehicle.position,frame.point),frame.normal);
      assert(h>.3 && h<1.6,'chassis stays on the finite deck under gravity');
      for(const side of [-1,1]) {
        for(const corner of [[side*.34,.64,-.06],[side*.975,.795,1.95],[side*.88,-.24,-.34]]) {
          const p=add(e.vehicle.position,rotate(e.vehicle.orientation,corner));
          assert(dot(subtract(p,frame.point),frame.normal)>=-1e-6,'roof and side stay above the actual deck');
        }
      }
      if(e.deckContact) rest++;
    }
    assert(rest>60,'repeated physical contact while resting on the shell');
  });
}
test('shell sweeps respect the front face, outer edge, open gap and stacked heights',()=>{
  const gap=orbital.sections.find(s=>s.kind==='air');
  for(const s of [-12,(gap.start+gap.end)/2,588]) {
    const f=orbital.frame(s), body=rolledBody(f,Math.PI,.8,30);
    if(s===-12) body.position=add(body.position,scale(f.lateral,18));
    if(s===588) body.position=add(body.position,scale(f.normal,9));
    const e={id:2,distance:s,vehicle:body,deckContact:true};
    advance(e);
    assert.equal(e.deckContact,false);
    assert.equal(e.vehicle.attached,false);
  }
  const f=orbital.frame(20), under={id:0,distance:20,vehicle:rolledBody(f,Math.PI,-.5,-55)};
  advance(under);
  assert.equal(under.deckContact,false,'motion from the underside cannot attach the shell');
  assert(dot(subtract(under.vehicle.position,f.point),f.normal)>0,'the back-to-front sweep actually crosses the plane');
  assert(dot(under.vehicle.velocity,f.normal)>54);
});

test('a roof-first collision uses the local wall or inverted deck normal',()=>{
  for(const kind of ['wall','ceiling']) {
    const span=orbital.sections.find(s=>s.kind===kind), f=orbital.frame((span.start+span.end)/2);
    const e={id:0,distance:f.station,vehicle:rolledBody(f,Math.PI,1.2,50)};
    advance(e);
    assert(e.deckContact && !e.vehicle.attached);
    assert(e.vehicle.wheels.every(w=>!w.contact));
    assert(dot(subtract(e.vehicle.position,f.point),f.normal)>.87);
    assert(Math.abs(dot(e.vehicle.velocity,f.normal))<1);
  }
});

test('a tumbling wing crossing a bank seam clears the physical triangle under its endpoint',()=>{
  const f=orbital.frame(120), pitch=35*Math.PI/180;
  const body=rolledBody(f,0,3,45);
  const pitchRotation=[Math.sin(pitch/2),0,0,Math.cos(pitch/2)];
  const rollRotation=[0,0,Math.SQRT1_2,Math.SQRT1_2];
  body.orientation=quatMultiply(body.orientation,quatMultiply(pitchRotation,rollRotation));
  body.angularVelocity=rotate(body.orientation,[.25,1.3,-.75]);
  const e={id:0,distance:f.station,vehicle:body};
  let closest=Infinity;
  for(let tick=0;tick<18;tick++) {
    advance(e);
    const tip=add(e.vehicle.position,rotate(e.vehicle.orientation,[-.975,.795,1.95]));
    const road=orbital.projectNear(tip,e.distance);
    e.distance=orbital.projectNear(e.vehicle.position,e.distance).station;
    // Independently measure the integrated wing position with a normal ray.
    const face=orbital.probe(add(tip,scale(road.normal,1)),scale(road.normal,-1),6);
    assert(face);
    const clearance=face.distance-1;
    assert(clearance>=-1e-6,'wing passes through the next triangle at a bank seam');
    closest=Math.min(closest,clearance);
  }
  assert(closest<.001,'exercise actual contact on the bank');
});
