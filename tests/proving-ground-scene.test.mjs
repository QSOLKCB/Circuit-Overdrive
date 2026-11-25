// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {rotate,add,subtract,quatInterpolate} from '../vendor/vanillajs/modules/math/index.js';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {garageVehicleGeometry} from '../src/garage-geometry.js';
import {compileVehicleBuild,stockVehicleBuild,stockUpgradeBuild} from '../src/vehicle-builds.js';
import {PROVING_TRACK} from '../src/proving-ground.js';
import {createProvingScene,vehicleDrawTransforms,provingVehicleGeometry,provingGroundGeometry} from '../src/proving-ground-scene.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const close=(actual,expected,epsilon=1e-6)=>{
  assert.equal(actual.length,expected.length);
  for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<epsilon,`${actual[i]} != ${expected[i]} at ${i}`);
};
const world={sampleSurface(){return PROVING_TRACK.surface;},barriers:[]};
function physicalRun(modelId='cinder-two',build=stockVehicleBuild(modelId),pose={}) {
  const accepted=compileVehicleBuild(modelId,build),solver=createVehicle(accepted.recipe);
  const previous=solver.spawn(pose),vehicle=solver.step(previous,{throttle:.3,steer:.3},world,1/60);
  return {modelId,build:accepted.build,recipe:accepted.recipe,previous,vehicle,testId:'practice',ticks:1};
}

function inspect(vertices) {
  assert(vertices instanceof Float32Array&&vertices.length>0&&vertices.length%33===0);
  for(let i=0;i<vertices.length;i+=11) {
    const p=vertices.slice(i,i+11);
    assert(p.every(Number.isFinite));
    assert(p.slice(0,3).every(v=>Math.abs(v)<1800));
    assert(Math.abs(Math.hypot(...p.slice(3,6))-1)<1e-6);
    assert(p.slice(6,9).every(v=>v>=0&&v<=1));
  }
  for(let i=0;i<vertices.length;i+=33) {
    const a=vertices.slice(i,i+3),b=vertices.slice(i+11,i+14),c=vertices.slice(i+22,i+25);
    const [x,y,z]=subtract(b,a),[u,v,w]=subtract(c,a);
    assert(Math.hypot(y*w-z*v,z*u-x*w,x*v-y*u)>1e-8,'nondegenerate triangle');
  }
}

test('facility retains finite original geometry, exact physical wall boxes and route markings',()=>{
  const geometry=provingGroundGeometry();
  let vertices=0;
  for(const batch of Object.values(geometry)){inspect(batch);vertices+=batch.length/11;}
  assert(vertices<50000);
  assert.equal(geometry.barriers.length/11,PROVING_TRACK.barriers.length*36);
  for(let i=0;i<PROVING_TRACK.barriers.length;i++) {
    const {min,max}=PROVING_TRACK.barriers[i],batch=geometry.barriers.slice(i*36*11,(i+1)*36*11);
    for(let k=0;k<3;k++) {
      const coordinates=Array.from({length:36},(_,v)=>batch[v*11+k]);
      assert.equal(Math.min(...coordinates),min[k]);assert.equal(Math.max(...coordinates),max[k]);
    }
  }
  const has=(x,y,z)=>{
    for(let i=0;i<geometry.markings.length;i+=11)if(Math.hypot(geometry.markings[i]-x,geometry.markings[i+1]-y,geometry.markings[i+2]-z)<1e-5)return true;
    return false;
  };
  for(const gate of PROVING_TRACK.slalom.gates)assert(has(gate.center[0]-gate.halfWidth,.03,gate.center[1]-.2));
  for(const gate of PROVING_TRACK.handling.gates) {
    const [x,z]=gate.center,[nx,nz]=gate.normal;
    assert(has(x+nz*gate.halfWidth-nx*.2,.03,z-nx*gate.halfWidth-nz*.2));
  }
});

test('six original silhouettes and paint retain authored triangles with four independent exact-radius wheel meshes',()=>{
  const shapes=new Set();
  for(const {modelId} of GARAGE_CATALOG) {
    const stock=compileVehicleBuild(modelId,stockVehicleBuild(modelId)).recipe;
    for(const paint of ['factory','midnight']) {
      const geometry=provingVehicleGeometry(modelId,paint),original=garageVehicleGeometry(modelId,paint);
      for(const [name,vertices] of Object.entries(geometry.body)){inspect(vertices);assert.deepEqual(vertices,original[name]);}
      for(const name of ['tyres','rims']) {
        const recovered=[];
        for(let index=0;index<4;index++) {
          const vertices=geometry.wheels[index][name];inspect(vertices);
          assert.equal(vertices.length*4,original[name].length);
          const center=[(index%2?1:-1)*stock.wheel.track/2,stock.wheel.radius+.03,(index<2?-1:1)*stock.wheel.wheelbase/2];
          for(let i=0;i<vertices.length;i+=11) {
            const vertex=Array.from(vertices.slice(i,i+11));
            for(let k=0;k<3;k++)vertex[k]+=center[k];
            recovered.push(vertex);
          }
          if(name==='tyres') {
            const radii=Array.from({length:vertices.length/11},(_,i)=>Math.hypot(vertices[i*11+1],vertices[i*11+2]));
            assert(Math.abs(Math.max(...radii)-stock.wheel.radius)<1e-6);
            assert(Math.abs(Math.max(...radii)/stock.wheel.radius-1)<1e-6,'no wheel scaling');
          }
        }
        // Regrouping may reorder wheels, but it never authors replacement shapes.
        const key=v=>v.map(n=>n.toFixed(5)).join(',');
        const authored=Array.from({length:original[name].length/11},(_,i)=>Array.from(original[name].slice(i*11,i*11+11)));
        assert.deepEqual(recovered.map(key).sort(),authored.map(key).sort());
      }
      if(paint==='factory')shapes.add(createHash('sha256').update(geometry.body.shell).digest('hex'));
      else assert.notDeepEqual(geometry.body.shell,provingVehicleGeometry(modelId).body.shell);
    }
  }
  assert.equal(shapes.size,6);
});

test('all six accepted physical states own body orientation and each steered/spinning wheel hub',()=>{
  for(const {modelId} of GARAGE_CATALOG) {
    const run=physicalRun(modelId,stockVehicleBuild(modelId),{yaw:.42,pitch:.025,roll:-.018,velocity:[0,0,-6]});
    const before=JSON.stringify(run),pose=vehicleDrawTransforms(run),state=run.vehicle,recipe=run.recipe;
    for(let i=0;i<4;i++)close(pose.wheels[i].slice(12,15),state.wheels[i].position,1e-10);
    const stockReference=recipe.wheel.radius+recipe.suspension.restLength-recipe.mass*9.81/(4*recipe.suspension.spring)+.03;
    close(pose.body.slice(12,15),subtract(state.position,rotate(state.orientation,[0,stockReference,0])),1e-10);
    close(pose.body.slice(0,3),rotate(state.orientation,[1,0,0]),1e-10);
    close(pose.body.slice(4,7),rotate(state.orientation,[0,1,0]),1e-10);
    // The axle is invariant under spin. Front axles turn in the solver's sign.
    for(let i=0;i<4;i++)close(pose.wheels[i].slice(0,3),rotate(state.orientation,i<2?[Math.cos(state.steering),0,Math.sin(state.steering)]:[1,0,0]),1e-10);
    assert.equal(JSON.stringify(run),before,'drawing transforms never mutate authoritative snapshots');
  }
});

test('interpolation follows prior/current accepted poses, including wrapped wheel spin',()=>{
  const run=physicalRun('cinder-two',stockVehicleBuild('cinder-two'),{yaw:.6,velocity:[0,0,-10]});
  run.previous={...run.previous,tick:1,wheelSpin:Math.PI-.03};run.vehicle={...run.vehicle,wheelSpin:-Math.PI+.05};
  const a=vehicleDrawTransforms(run,0),b=vehicleDrawTransforms(run,1),middle=vehicleDrawTransforms(run,.5);
  close(a.pose.position,run.previous.position);close(b.pose.position,run.vehicle.position);
  close(middle.pose.position,run.previous.position.map((v,i)=>(v+run.vehicle.position[i])/2));
  close(middle.pose.orientation,quatInterpolate(run.previous.orientation,run.vehicle.orientation,.5));
  assert(Math.abs(middle.pose.wheelSpin-Math.PI-.01)<1e-10);
  for(let i=0;i<4;i++)close(middle.wheels[i].slice(12,15),run.previous.wheels[i].position.map((v,j)=>(v+run.vehicle.wheels[i].position[j])/2));
  assert.throws(()=>vehicleDrawTransforms(run,NaN),/interpolation/);
});

test('declared tick-zero empty-wheel presentation uses the level plane without changing solver state',()=>{
  for(const {modelId} of GARAGE_CATALOG) {
    const run=physicalRun(modelId);run.vehicle=run.previous;
    const before=JSON.stringify(run),pose=vehicleDrawTransforms(run);
    for(const wheel of pose.wheels)assert(Math.abs(wheel[13]-run.recipe.wheel.radius)<1e-10);
    assert(Math.abs(pose.body[13]+.03)<1e-10,'authored showroom floor clearance is removed at stock equilibrium');
    assert.equal(JSON.stringify(run),before);
    const airborne=physicalRun(modelId,stockVehicleBuild(modelId),{position:[0,3,0]});airborne.vehicle=airborne.previous;
    for(const wheel of vehicleDrawTransforms(airborne).wheels)assert.equal(wheel[13],3-airborne.recipe.suspension.restLength);
  }
});

test('accepted suspension extension moves actual body stance while wheel radii and hubs stay physical',()=>{
  for(const {modelId} of GARAGE_CATALOG) {
    const build=copy(stockUpgradeBuild(modelId,stockVehicleBuild(modelId)));
    build.parts.suspension='adjustable';build.inventory.suspension.push('adjustable');build.tuning.travel=2;
    const stock=physicalRun(modelId),changed=physicalRun(modelId,build);
    for(const run of [stock,changed]) {
      const solver=createVehicle(run.recipe);
      for(let i=0;i<90;i++){run.previous=run.vehicle;run.vehicle=solver.step(run.vehicle,{brake:1},world,1/60);}
    }
    const a=vehicleDrawTransforms(stock),b=vehicleDrawTransforms(changed);
    assert(b.body[13]-a.body[13]>.03,'accepted suspension support increases chassis height');
    for(let i=0;i<4;i++)close(b.wheels[i].slice(12,15),changed.vehicle.wheels[i].position);
    const reference=compileVehicleBuild(modelId,stockVehicleBuild(modelId)).recipe;
    assert.equal(changed.recipe.wheel.radius,reference.wheel.radius);
  }
});

// Execute the pinned renderer with a recording WebGL surface. This verifies
// ownership and retained uploads, not native GPU output or performance.
function recordingCanvas({failUpload=Infinity}={}) {
  const buffers=new Set(),programs=new Set(),shaders=new Set(),listeners=new Map();
  let uploads=0,allocations=0,lost=false;
  const gl={NO_ERROR:0,ARRAY_BUFFER:34962,
    createBuffer(){const b={};buffers.add(b);allocations++;return b;},deleteBuffer:b=>assert(buffers.delete(b)),
    createProgram(){const p={};programs.add(p);return p;},deleteProgram:p=>assert(programs.delete(p)),
    createShader(){const s={};shaders.add(s);return s;},deleteShader:s=>assert(shaders.delete(s)),
    bufferData(){if(++uploads===failUpload)throw Error('test upload failure');},
    getError:()=>0,getAttribLocation:()=>0,getUniformLocation:()=>null,getShaderParameter:()=>true,
    getProgramParameter:()=>true,isContextLost:()=>lost};
  for(const name of ['bindBuffer','shaderSource','compileShader','attachShader','linkProgram','viewport','disable',
    'enable','colorMask','depthMask','clearDepth','clearColor','clear','useProgram','enableVertexAttribArray',
    'vertexAttribPointer','uniform3fv','uniform1f','disableVertexAttribArray','depthFunc','uniformMatrix4fv',
    'uniformMatrix3fv','blendFunc','drawArrays'])gl[name]=()=>{};
  const canvas={getContext:()=>gl,getBoundingClientRect:()=>({width:960,height:540}),
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{
      assert.equal(listeners.get(type),fn);listeners.delete(type);
    }};
  return {canvas,buffers,programs,shaders,listeners,get uploads(){return uploads;},get allocations(){return allocations;},
    lose(){lost=true;buffers.clear();programs.clear();listeners.get('webglcontextlost')({preventDefault(){}});}};
}

test('eight workshop/test cycles retain meshes through driving/camera changes and release every resource',()=>{
  for(const {modelId} of GARAGE_CATALOG) {
    const run=physicalRun(modelId),before=JSON.stringify(run),gl=recordingCanvas(),scene=createProvingScene(gl.canvas,run);
    const initial=scene.stats(),uploads=gl.uploads,allocations=gl.allocations;
    assert.equal(initial.meshes,18);assert(initial.vertices<50000);
    for(let cycle=0;cycle<8;cycle++)for(const camera of ['chase','high'])for(const alpha of [0,.5,1]) {
      scene.draw(run,{alpha,camera,reducedMotion:!!(cycle%2)});
      assert.equal(scene.stats().frameDraws,18);
    }
    assert.equal(gl.uploads,uploads);assert.equal(gl.allocations,allocations);
    assert.equal(scene.stats().bytes,initial.bytes);assert.equal(JSON.stringify(run),before);
    assert.throws(()=>scene.draw(run,{camera:'unknown'}),/Unknown proving-ground camera/);
    const changed=copy(run);changed.build.parts.paint='midnight';
    assert.throws(()=>scene.draw(changed),/accepted model and paint/);
    scene.dispose();scene.dispose();
    assert.equal(gl.buffers.size+gl.programs.size+gl.shaders.size+gl.listeners.size,0);
  }
});

test('failed uploads and context restoration cannot retain stale buffers',()=>{
  const run=physicalRun(),failed=recordingCanvas({failUpload:9});
  assert.throws(()=>createProvingScene(failed.canvas,run),/test upload failure/);
  assert.equal(failed.buffers.size+failed.programs.size+failed.shaders.size+failed.listeners.size,0);
  const gl=recordingCanvas(),scene=createProvingScene(gl.canvas,run);
  scene.draw(run);const frames=scene.stats().frames;
  gl.lose();scene.draw(run);assert.equal(scene.stats().frames,frames);
  scene.dispose();assert.equal(gl.listeners.size,0);
  const next=recordingCanvas(),restored=createProvingScene(next.canvas,run);
  restored.draw(run);assert.equal(restored.stats().frameDraws,18);
  restored.dispose();assert.equal(next.buffers.size,0);
});
