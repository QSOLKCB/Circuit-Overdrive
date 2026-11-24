// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {dot,rotate,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {createRocketCamera} from '../src/rocket-scene.js';
import {orbital} from '../src/orbital.js';
import {createRocketBody} from '../src/rocket-dynamics.js';

test('chase and high cameras stay above the tyres in the wall and ceiling frames',()=>{
  const rig=createRocketCamera();
  for(const kind of ['floor','wall','ceiling','landing']) {
    const section=orbital.sections.find(p=>p.kind===kind), f=orbital.frame((section.start+section.end)/2);
    const b=createRocketBody(f),[x,y,z]=b.position;
    const p=Object.freeze({x,y,z,id:5,orientation:b.orientation,speed:40});
    for(const camera of ['chase','high']) {
      const v=rig(p,{camera,dt:0,mode:'paused',reducedMotion:true});
      const displacement=subtract(v.eye,b.position), sight=rotate(v.q,[0,0,-1]);
      assert.ok(dot(displacement,f.normal)>2);
      assert.ok(dot(displacement,f.tangent)<-6);
      assert.ok(dot(sight,f.tangent)>.94);
      assert.ok(dot(sight,f.normal)<0);
      assert.equal(v.fov,.94);
    }
  }
});
