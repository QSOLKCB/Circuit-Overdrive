// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {add,dot,length,quatMultiply,rotate,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {createRocketBody,ROCKET_LIMITS,stepRocketBody} from '../src/rocket-dynamics.js';
import {proofSurface as surface} from './fixtures/rocket-proof-surface.mjs';
import {runRocketTraversal} from './rocket-traversal.mjs';

const sectionIds=surface.sections.map(p=>p.id);

function verifyWheelGeometry(body) {
  // Wheel contacts describe the start of the final 240 Hz substep. Undo its
  // world-space rotation and translation to reconstruct the four real mounts.
  const h=1/(60*ROCKET_LIMITS.substeps), spin=length(body.angularVelocity);
  const half=spin*h/2;
  const reverse=[...scale(body.angularVelocity,spin ? -Math.sin(half)/spin : 0),Math.cos(half)];
  const q=quatMultiply(reverse,body.orientation);
  const centre=subtract(body.position,scale(body.velocity,h)), down=rotate(q,[0,-1,0]);
  for(const [i,w] of body.wheels.entries()) {
    assert(w.contact && w.load>0 && w.distance>0 && w.distance<=ROCKET_LIMITS.restLength);
    const mount=add(centre,rotate(q,[i%2 ? .79 : -.79,ROCKET_LIMITS.mountHeight,i<2 ? -1.29 : 1.29]));
    const tip=add(mount,scale(down,w.distance)), actual=surface.frame(w.frame.station,w.frame.offset);
    assert(length(subtract(tip,actual.point))<1e-7,'world tyre ray must reach the actual strip');
    assert(length(subtract(w.frame.point,actual.point))<1e-7);
    assert(dot(w.frame.normal,actual.normal)>.999999);
  }
}

test('one body drives from rest through both walls and the inverted ceiling on four physical tyre contacts',()=>{
  let previous=createRocketBody(surface.frame(4)), ceilingBody;
  const tape=[];
  const summary=runRocketTraversal({onTick(body,command) {
    assert.equal(body.tick,previous.tick+1);
    assert(Math.abs(length(body.orientation)-1)<1e-9);
    // Independent position/velocity consistency across the four force substeps.
    const travelled=subtract(body.position,previous.position);
    const implied=scale(add(body.velocity,previous.velocity),1/120);
    assert(length(subtract(travelled,implied))<.004,'chassis moved farther than its integrated velocities admit');
    verifyWheelGeometry(body);
    const up=rotate(body.orientation,[0,1,0]), forward=rotate(body.orientation,[0,0,-1]);
    const probe=surface.probe(body.position,scale(up,-1),2);
    assert(probe && dot(forward,probe.tangent)>.99 && dot(up,probe.normal)>.99);
    if(body.wheels.every(w=>w.frame.id===probe.id)) {
      if(probe.id==='ascending-wall') assert(body.velocity[1]>10 && forward[1]>.99 && up[2]>.99);
      if(probe.id==='descending-wall') assert(body.velocity[1]<-10 && forward[1]<-.99 && up[2]<-.99);
      if(probe.id==='ceiling') {
        assert(body.velocity[2]>10 && body.position[1]>95 && body.position[1]<96);
        assert(up[1]<-.99 && body.adhesionAcceleration[1]>ROCKET_LIMITS.gravity);
        ceilingBody??=body;
      }
    }
    tape.push(command);
    previous=body;
  }});
  assert.deepEqual(summary.sections.map(s=>s.id),sectionIds);
  for(const id of ['ascending-wall','ceiling','descending-wall']) {
    assert(summary.sections.find(s=>s.id===id).longestFourWheelAttachment>=60,id+' needs 1 s of sustained support');
  }
  assert(summary.minClearance>.3 && summary.maxClearance<1);
  assert.equal(summary.minLoadedWheels,4);

  // Replay the captured controls on a fresh body with different tick batching.
  let replay=createRocketBody(surface.frame(4)), at=0;
  const hash=createHash('sha256'),batches=[9,1,23,3,4];
  for(let batch=0;at<tape.length;batch++) {
    const end=Math.min(at+batches[batch%batches.length],tape.length);
    for(;at<end;at++) {
      const command=tape[at];
      replay=stepRocketBody(replay,command,surface);
      hash.update(JSON.stringify({tick:replay.tick,command,body:replay})+'\n');
    }
  }
  assert.equal(hash.digest('hex'),summary.sha256);
  assert.deepEqual(replay,previous);

  // Fork the same inverted chassis over the deck and over an open gap.
  const coast={throttle:0,brake:0,steer:0,boost:false,dodge:0};
  const gap={probe:()=>null};
  let supported=ceilingBody,falling=ceilingBody;
  for(let t=0;t<60;t++) {
    supported=stepRocketBody(supported,coast,surface);
    falling=stepRocketBody(falling,coast,gap);
  }
  assert(supported.attached && supported.wheels.every(w=>w.contact && w.load>0));
  assert(!falling.attached && falling.wheels.every(w=>!w.contact));
  assert(falling.position[1]<ceilingBody.position[1]-4 && falling.velocity[1]<-8);
  assert(falling.position[2]>ceilingBody.position[2]+12);
});

test('a held throttle crosses the same contact geometry without a speed governor',()=>{
  const summary=runRocketTraversal({fullThrottle:true});
  assert.deepEqual(summary.sections.map(s=>s.id),sectionIds);
  assert(summary.maxSpeed>40 && summary.maxSpeed<ROCKET_LIMITS.maxSpeed);
  assert.equal(summary.minLoadedWheels,4);
  assert(summary.minAlignment>.99 && summary.minClearance>.3 && summary.maxClearance<1);
});
