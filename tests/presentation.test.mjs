// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {quatMultiply,rotate} from '../vendor/vanillajs/modules/math/index.js';
import {createChaseCamera,lookAt} from '../src/camera.js';
import {bodyTransform,touringMeshes,wheelTransforms} from '../src/touring-car.js';
import {carRecipe,rideHeight} from '../src/sim.js';
import {track} from '../src/track.js';
import {ridge} from '../src/ridge.js';

const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} should be near ${b}`);
const meshes=touringMeshes({mesh:v=>v});
function pose(course,s,lane=0,speed=35){
  const p=course.sample(s,lane);
  return {...p,groundY:p.y,y:p.y+rideHeight,speed,pitch:.04,roll:p.bank,
    vx:speed*p.tx,vz:speed*p.tz,compression:[.023,.044,.083,.109],steering:.14,wheelSpin:1.82};
}
test('six distinct number and accent meshes share one shell, tyre and wheel face',()=>{
  assert.equal(meshes.liveries.length,6);
  for(const [i,livery] of meshes.liveries.entries()) {
    assert.ok(livery.graphics.every(Number.isFinite));
    for(const other of meshes.liveries.slice(i+1)) {
      assert.notDeepEqual(livery.paint.color,other.paint.color);
      assert.notDeepEqual(livery.graphics,other.graphics);
    }
  }
  for(const name of ['shell','glass','detail','lamps','tyre','rim']) {
    const data=meshes[name];
    assert.equal(data.length%33,0);assert.ok(data.every(Number.isFinite));
  }
  const vertices=[meshes.shell,meshes.glass,meshes.detail,meshes.lamps,meshes.tyre,meshes.rim,...meshes.liveries.map(l=>l.graphics)]
    .reduce((sum,v)=>sum+v.length/11,0);
  assert.ok(vertices<12000);
});
test('body basis and four independently sprung wheel centres follow authoritative mount convention',()=>{
  const p=pose(track,210);
  const distance=carRecipe.wheel.wheelbase/2,trackWidth=carRecipe.wheel.track/2;
  const half=(angle,axis)=>{const q=[0,0,0,Math.cos(angle/2)];q[axis]=Math.sin(angle/2);return q;};
  const orientation=quatMultiply(quatMultiply(half(p.yaw,1),half(p.pitch,0)),half(p.roll,2));
  const root=bodyTransform(p),wheels=wheelTransforms(meshes.rig,p,root);
  for(const [i,matrix] of wheels.entries()){
    const offset=rotate(orientation,[i%2?trackWidth:-trackWidth,0,i<2?-distance:distance]);
    near(matrix[12],p.x+offset[0]);near(matrix[13],p.y+offset[1]-carRecipe.suspension.restLength+p.compression[i]);
    near(matrix[14],p.z+offset[2]);
    // Local wheel axle, unaffected by wheel spin but steered on the front two wheels.
    const axle=rotate(orientation,i<2?[Math.cos(p.steering),0,Math.sin(p.steering)]:[1,0,0]);
    for(let j=0;j<3;j++) near(matrix[j]*meshes.rig.wheels[i].radius/carRecipe.wheel.radius,axle[j]);
  }
});
test('high and low chase retain bank, bridge and tunnel clearance at the lane edges',()=>{
  for(const [course,range] of [[track,[140,290]],[ridge,ridge.features.bridge],[ridge,ridge.features.tunnel]]) {
    for(const preset of ['chase','high']) for(const side of [-1,1]) {
      const camera=createChaseCamera(course);
      let previous;
      for(let s=range[0];s<range[1];s+=.5){
        const p=pose(course,s,side*(course.barrierOffset-1.1));
        const saved=structuredClone(p);
        const view=camera.update(p,[p],{camera:preset,dt:1/60});
        const road=course.project(view.eye[0],view.eye[2]);
        assert.ok(Math.abs(road.lateral)<course.barrierOffset-1.27);
        assert.ok(view.eye[1]-road.y>2 && view.eye[1]-road.y<5.85);
        assert.ok(Math.abs(view.roll)<.045);
        assert.ok(lookAt(view.eye,view.target,view.roll).every(Number.isFinite));
        if(previous) assert.ok(Math.hypot(...view.eye.map((v,i)=>v-previous[i]))<.9);
        previous=[...view.eye];
        assert.deepEqual(p,saved);
      }
    }
  }
});
test('a yaw discontinuity, gear-speed step, rival and view toggle blend without a camera jump',()=>{
  const camera=createChaseCamera(track),p=pose(track,205);
  p.yaw=Math.PI-.01;
  const initial=structuredClone(camera.update(p,[p],{dt:1/60}));
  p.yaw=-Math.PI+.02; p.speed=5; p.vx=-1; p.vz=-3;
  const rival={...p,x:p.x+2};
  const next=camera.update(p,[p,rival],{dt:1/60,camera:'high'});
  assert.ok(Math.hypot(...next.eye.map((v,i)=>v-initial.eye[i]))<.66);
  assert.ok(Math.abs(next.fov-initial.fov)<.014);
  const reduced=camera.update(p,[p],{dt:1/60,camera:'high',reducedMotion:true});
  assert.equal(reduced.roll,0); assert.ok(reduced.fov<.89);
  const recover=pose(track,1000);
  const safe=camera.update(recover,[recover],{dt:NaN});
  assert.ok(Math.hypot(safe.eye[0]-recover.x,safe.eye[2]-recover.z)<11);
  assert.throws(()=>camera.update({...p,x:NaN},[]),/Invalid chase camera pose/);
  const rivalGap=camera.update(p,[p,{x:NaN,z:0}],{dt:1/60});
  assert.ok(rivalGap.eye.every(Number.isFinite) && Number.isFinite(rivalGap.fov));
});
