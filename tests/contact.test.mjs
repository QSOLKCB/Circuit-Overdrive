// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicle, vehiclePreset} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {resolveCarContacts} from '../src/contact.js';
import {track} from '../src/track.js';
import {carRecipe, createRace, rideHeight, startRace, stepRace} from '../src/sim.js';

const vehicle = createVehicle(vehiclePreset('arcade'));
const chassis = vehicle.recipe.chassis;
const step = 1/60;
function body(id, x, z, vx=0, vz=0, yaw=0) {
  const y = track.project(x,z).y + .52;
  const state = vehicle.spawn({position:[x+vx*step,y,z+vz*step], velocity:[vx,0,vz], yaw});
  return {id, previous:{x,y,z,yaw}, vehicle:state, finishTicks:null, contact:false, pairContact:false};
}
function collide(...field) {
  resolveCarContacts(field,chassis,() => {});
  for (const e of field) {
    assert.ok([...e.vehicle.position,...e.vehicle.velocity,...e.vehicle.orientation].every(Number.isFinite));
  }
}

test('rear impact exchanges momentum; side brush retains forward motion', () => {
  const rear = body(0,0,4.8,0,-44), front = body(1,0,0,0,-12);
  collide(rear,front);
  assert.ok(rear.pairContact && front.pairContact);
  assert.ok(rear.vehicle.velocity[2]>front.vehicle.velocity[2]);
  assert.equal(rear.vehicle.velocity[2]+front.vehicle.velocity[2],-56);
  assert.ok(rear.vehicle.position[2]-front.vehicle.position[2]>=chassis.length);
  const side = body(0,-2,25,7,-32), other = body(1,0,25,0,-32);
  collide(other,side);
  assert.ok(side.pairContact && other.pairContact);
  assert.ok(side.vehicle.velocity[0]<=other.vehicle.velocity[0]);
  assert.equal(side.vehicle.velocity[2],-32);
  assert.equal(other.vehicle.velocity[1],0);
});

test('head-on collision brakes both cars and swept corner contact catches disjoint end poses', () => {
  const a = body(0,0,5.4,0,-70), b = body(1,0,0,0,70,Math.PI);
  collide(a,b);
  assert.ok(a.pairContact && b.pairContact);
  assert.ok(a.vehicle.velocity[2]>=0 && a.vehicle.velocity[2]<4);
  assert.ok(b.vehicle.velocity[2]<=0 && b.vehicle.velocity[2]>-4);
  // Each car moves ~1 m each axis at a legal speed, briefly clipping the
  // other's corner between poses. There is a gap along a different axis at
  // either end, so a destination-only intersection test misses the contact.
  const c = body(0,0,0,60,60), d = body(1,2.65,-3.5,-60,-60);
  assert.ok(d.previous.x-c.previous.x>chassis.width);
  assert.ok(c.vehicle.position[2]-d.vehicle.position[2]>chassis.length);
  collide(c,d);
  assert.ok(c.pairContact && d.pairContact);
  assert.ok(d.vehicle.position[0]-c.vehicle.position[0]>=chassis.width);
});

test('nearly tangential rotating front corner finds contact within the tick', () => {
  const a = body(0,0,0), b = body(1,2.1,3.4,-30,60);
  const halfAngle = -4*Math.PI/180; // final yaw -8 degrees, tick-start yaw zero
  b.vehicle.orientation = [0,Math.sin(halfAngle),0,Math.cos(halfAngle)];
  collide(a,b);
  assert.ok(a.pairContact && b.pairContact);
  assert.ok(a.vehicle.position[0] < a.previous.x);
});

test('separating axes reject adjacent yawed cars and vertical clearance', () => {
  const angle = Math.PI/4, x = Math.cos(angle)*2.05, z = -Math.sin(angle)*2.05;
  const a = body(0,0,0,0,0,angle), b = body(1,x,z,0,0,angle);
  collide(a,b);
  assert.equal(a.pairContact,false);
  const c = body(2,0,0);
  c.vehicle.position[1] += 3;
  c.previous.y += 3;
  collide(a,c);
  assert.equal(c.pairContact,false);
});

test('coincident chassis separate deterministically in stable ID order without launch impulses', () => {
  function pile(reverse) {
    const field = [body(0,0,0),body(1,0,0),body(2,0,0)];
    collide(...(reverse ? [...field].reverse() : field));
    for (const e of field) assert.deepEqual(e.vehicle.velocity,[0,0,0]);
    const positions = field.map(e=>e.vehicle.position[0]).sort((a,b)=>a-b);
    assert.ok(positions[1]-positions[0]>=chassis.width-.002 && positions[2]-positions[1]>=chassis.width-.002);
    return field.map(e=>e.vehicle.position);
  }
  assert.deepEqual(pile(true),pile(false));
});

test('side contact on the 17 degree bank preserves clearance and road-relative vertical speed', () => {
  const road = track.sample(195);
  const create = (id, lateral, drift) => {
    const p = track.sample(195,lateral), vx = p.rx*drift + p.tx*34, vz = p.rz*drift + p.tz*34;
    const e = body(id,p.x,p.z,vx,vz,p.yaw);
    const position = e.vehicle.position;
    const projected = track.project(position[0],position[2]);
    position[1] = projected.y+.52;
    const [nx,ny,nz] = projected.normal;
    e.vehicle.velocity[1] = -(vx*nx+vz*nz)/ny;
    e.vehicle.wheels[0].grounded = true;
    return e;
  };
  assert.ok(Math.abs(road.bank)>.29);
  const a = create(0,-1,-1), b = create(1,.85,-5);
  collide(a,b);
  for (const e of [a,b]) {
    assert.ok(e.pairContact);
    const p = e.vehicle.position, v = e.vehicle.velocity, road = track.project(p[0],p[2]);
    assert.ok(Math.abs(p[1]-road.y-.52)<.0001);
    const [nx,ny,nz] = road.normal;
    assert.ok(Math.abs(v[0]*nx+v[1]*ny+v[2]*nz)<.025);
  }
});

test('six-car simulation resolves a door-to-door squeeze against the banked outside rail', () => {
  const race = createRace(), car = createVehicle(carRecipe);
  startRace(race);
  for (let i=0; i<180; i++) stepRace(race);
  const outer = race.entrants[0], inner = race.player;
  function place(e, lateral, drift) {
    const p = track.sample(194,lateral);
    const vx = p.tx*28+p.rx*drift, vz = p.tz*28+p.rz*drift;
    const vy = -(p.normal[0]*vx+p.normal[2]*vz)/p.normal[1];
    e.vehicle = car.spawn({position:[p.x,p.y+rideHeight,p.z],yaw:p.yaw,roll:p.bank,velocity:[vx,vy,vz]});
    e.current = {...e.current,x:p.x,y:p.y+rideHeight,z:p.z,s:p.s,lateral,yaw:p.yaw,roll:p.bank,speed:28};
    e.distance = e.safeDistance = 194;
  }
  place(outer,1.06-track.barrierOffset,0);
  place(inner,2.91-track.barrierOffset,-12);
  stepRace(race);
  assert.ok(outer.vehicle.contacts.includes('guardrail'));
  assert.ok(outer.vehicle.contacts.includes('car:'+inner.id));
  assert.ok(inner.vehicle.contacts.includes('car:'+outer.id));
  assert.ok(inner.current.lateral-outer.current.lateral>carRecipe.chassis.width-.02);
  for (let i=0; i<32; i++) {
    for (const e of [outer,inner]) {
      assert.ok(Math.abs(e.current.lateral)<=track.barrierOffset-.95);
      assert.ok(e.current.y-e.current.groundY<rideHeight+.14);
      assert.ok(e.vehicle.wheels.some(w=>w.grounded));
      assert.deepEqual([e.current.x,e.current.y,e.current.z],e.vehicle.position);
      assert.equal(e.recoveries,0);
    }
    stepRace(race);
  }
});
