// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {LIT_PROFILES} from '../vendor/vanillajs/modules/render-lit/index.js';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {createGarage} from '../src/garage.js';
import {transactGarage} from '../src/garage-transactions.js';
import {garageGeometry,garageVehicleGeometry,GARAGE_BAY_POSITIONS} from '../src/garage-geometry.js';
import {createGarageScene,GARAGE_CAMERAS} from '../src/garage-scene.js';
import {vehicleParts,vehiclePaint} from '../src/vehicle-parts.js';
import {transactGarageInstallation} from '../src/garage-transactions.js';

function inspect(vertices) {
  assert(vertices instanceof Float32Array);
  assert(vertices.length>0 && vertices.length%33===0);
  for(let i=0;i<vertices.length;i+=11) {
    const p=vertices.slice(i,i+11);
    assert(p.every(Number.isFinite));
    assert(p.slice(0,3).every(v=>Math.abs(v)<30));
    assert(Math.abs(Math.hypot(...p.slice(3,6))-1)<1e-6);
    assert(p.slice(6,9).every(v=>v>=0&&v<=1));
  }
  for(let i=0;i<vertices.length;i+=33) {
    const a=vertices.slice(i,i+3),b=vertices.slice(i+11,i+14),c=vertices.slice(i+22,i+25);
    const [x,y,z]=b.map((v,j)=>v-a[j]),[u,v,w]=c.map((k,j)=>k-a[j]);
    assert(Math.hypot(y*w-z*v,z*u-x*w,x*v-y*u)>1e-8,'nondegenerate triangle');
  }
}

test('six original showroom silhouettes have bounded complete lit geometry and four separated bays',()=>{
  const {workshop,vehicles}=garageGeometry(),shapes=new Set();
  for(const vertices of Object.values(workshop))inspect(vertices);
  for(const model of vehicles) {
    const positions=[];
    for(const vertices of Object.values(model.parts)) {
      inspect(vertices);
      for(let i=0;i<vertices.length;i+=11)positions.push(...vertices.slice(i,i+3));
    }
    shapes.add(createHash('sha256').update(JSON.stringify(positions)).digest('hex'));
    // Every visual remains safely inside a 4.7 m x 6.2 m storage marking.
    assert(positions.every((v,i)=>i%3===0?Math.abs(v)<1.3:i%3===1?v>=0&&v<2:v>-2.6&&v<2.6));
  }
  assert.equal(shapes.size,6,'geometry itself differs, independent of vertex colour');
  assert.equal(GARAGE_BAY_POSITIONS.length,4);
  assert.equal(new Set(GARAGE_BAY_POSITIONS.map(p=>p.join(','))).size,4);
  for(let i=1;i<4;i++)assert(Math.abs(GARAGE_BAY_POSITIONS[i][0]-GARAGE_BAY_POSITIONS[i-1][0])>4.7);
  assert.throws(()=>garageVehicleGeometry('../../other.js'),/Unknown/);
});

// The actual pinned renderer executes against a recording WebGL surface.
// This checks ownership/lifecycle calls, not shader output or native GPU speed.
function recordingCanvas({failUpload=Infinity}={}) {
  const buffers=new Set(),programs=new Set(),shaders=new Set(),listeners=new Map();
  let uploads=0,allocations=0,lost=false;
  const gl={NO_ERROR:0,ARRAY_BUFFER:34962,
    createBuffer(){const b={};buffers.add(b);allocations++;return b;},deleteBuffer:b=>assert(buffers.delete(b)),
    createProgram(){const p={};programs.add(p);return p;},deleteProgram:p=>assert(programs.delete(p)),
    createShader(){const s={};shaders.add(s);return s;},deleteShader:s=>assert(shaders.delete(s)),
    bufferData(){if(++uploads===failUpload)throw Error('test upload failure');},
    getError:()=>0,getAttribLocation:()=>0,getUniformLocation:()=>null,getShaderParameter:()=>true,
    getProgramParameter:()=>true,isContextLost:()=>lost
  };
  for(const name of ['bindBuffer','shaderSource','compileShader','attachShader','linkProgram','viewport','disable',
    'enable','colorMask','depthMask','clearDepth','clearColor','clear','useProgram','enableVertexAttribArray',
    'vertexAttribPointer','uniform3fv','uniform1f','disableVertexAttribArray','depthFunc','uniformMatrix4fv',
    'uniformMatrix3fv','blendFunc','drawArrays'])gl[name]=()=>{};
  const canvas={getContext:()=>gl,getBoundingClientRect:()=>({width:960,height:540}),
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{
      assert.equal(listeners.get(type),fn);listeners.delete(type);
    }};
  return {canvas,buffers,programs,shaders,listeners,get uploads(){return uploads;},get allocations(){return allocations;},
    lose(){lost=true;buffers.clear();programs.clear();let prevented=false;
      listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});assert(prevented);}};
}

function fullGarage() {
  let state=createGarage();
  for(let i=0;i<4;i++) {
    const result=transactGarage(state,{type:'buy',targetId:'cinder-two',expectedRevision:state.revision});
    assert(result.accepted);state=result.state;
  }
  return state;
}

test('original paint changes authored panel colours while preserving every silhouette and non-paint batch',()=>{
  for(const {modelId} of GARAGE_CATALOG)for(const {id} of vehicleParts('paint')) {
    const stock=garageVehicleGeometry(modelId),painted=garageVehicleGeometry(modelId,id);
    for(const batch of Object.keys(stock)) {
      assert.equal(painted[batch].length,stock[batch].length);
      for(let i=0;i<stock[batch].length;i++)if(i%11<6||i%11>8)assert.equal(painted[batch][i],stock[batch][i]);
      if(['glass','lamps','tyres','rims'].includes(batch))assert.deepEqual(painted[batch],stock[batch]);
    }
    const colour=vehiclePaint(id,modelId).body;
    const rgb=[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16)/255);
    assert(rgb.every((v,i)=>Math.abs(painted.shell[6+i]-v)<1e-6));
    if(id!=='factory')assert.notDeepEqual(painted.shell,stock.shell);
  }
});

test('accepted owned paint is cached, bounded across the finite palette and released on disposal',()=>{
  const gl=recordingCanvas(),scene=createGarageScene(gl.canvas);
  const bought=transactGarage(createGarage(),{type:'buy',targetId:'cinder-two',expectedRevision:0}).state;
  const fitted=transactGarageInstallation(bought,{type:'install',ownedVehicleId:'car-000001',slot:'paint',partId:'midnight',
    tuning:{finalDrive:0,spring:0,damper:0,travel:0,steering:0},expectedRevision:1});
  assert(fitted.accepted);assert.equal(fitted.state.credits,1730);
  scene.draw({garage:fitted.state,modelId:'cinder-two',ownedVehicleId:'car-000001'});
  const uploaded=gl.uploads;
  for(let i=0;i<8;i++)scene.draw({garage:fitted.state,modelId:'cinder-two',ownedVehicleId:'car-000001'});
  assert.equal(gl.uploads,uploaded,'accepted repeated paint draws reuse retained GPU meshes');
  // Authored visual fixtures only: exhaust the finite palette, not purchases.
  for(const model of GARAGE_CATALOG)for(const {id} of vehicleParts('paint')) {
    scene.draw({garage:{bays:[{ownedVehicleId:'car-000001',modelId:model.modelId,build:{parts:{paint:id}}},null,null,null]},
      modelId:model.modelId,ownedVehicleId:'car-000001'});
  }
  const final=scene.stats();assert.equal(final.meshes,149);
  assert(final.meshes<LIT_PROFILES.high.maxMeshes&&final.vertices<LIT_PROFILES.high.maxVertices);
  const allUploads=gl.uploads;
  for(const model of GARAGE_CATALOG)for(const {id} of vehicleParts('paint')) {
    scene.draw({garage:{bays:[{ownedVehicleId:'car-000001',modelId:model.modelId,build:{parts:{paint:id}}},null,null,null]},
      modelId:model.modelId,ownedVehicleId:'car-000001'});
  }
  assert.equal(gl.uploads,allUploads);
  scene.dispose();assert.equal(gl.buffers.size+gl.programs.size+gl.listeners.size,0);
});

test('mechanical appearance variants evict invisible meshes within the published retained resource bound',()=>{
  const gl=recordingCanvas(),scene=createGarageScene(gl.canvas);
  for(let cycle=0;cycle<8;cycle++)for(const model of GARAGE_CATALOG)for(const tyres of ['stock','touring','performance','economy'])for(const exhaust of ['stock','flow']){
    const car={ownedVehicleId:'car-000001',modelId:model.modelId,build:{parts:{paint:cycle%2?'oxide':'factory',tyres,exhaust}}};
    scene.draw({garage:{bays:[car,null,null,null]},modelId:model.modelId,ownedVehicleId:car.ownedVehicleId});
    assert(scene.stats().meshes<=149);assert(gl.buffers.size<=150);
  }
  scene.dispose();assert.equal(gl.buffers.size+gl.programs.size+gl.listeners.size,0);
});

test('all catalogue switches and camera views retain bounded resources and never mutate ownership',()=>{
  const gl=recordingCanvas(),scene=createGarageScene(gl.canvas),garage=fullGarage(),before=JSON.stringify(garage);
  const initial=scene.stats();
  assert.equal(initial.meshes,41);
  assert(initial.vertices<20000 && initial.vertices<LIT_PROFILES.low.maxVertices);
  assert(initial.meshes<LIT_PROFILES.low.maxMeshes);
  assert.equal(gl.buffers.size,42,'one sky buffer belongs to the renderer');
  const allocations=gl.allocations,uploads=gl.uploads;
  for(let cycle=0;cycle<8;cycle++)for(const model of GARAGE_CATALOG)for(const camera of GARAGE_CAMERAS) {
    scene.draw({garage,modelId:model.modelId,camera});
    assert.equal(scene.stats().frameDraws,39,'four workshop + five shadows + five six-part vehicles');
  }
  scene.draw({garage:null});
  assert.equal(scene.stats().frameDraws,11,'an unavailable save cannot invent stored cars');
  assert.equal(gl.allocations,allocations);assert.equal(gl.uploads,uploads);
  assert.equal(scene.stats().bytes,initial.bytes);
  assert.equal(JSON.stringify(garage),before);
  assert.throws(()=>scene.draw({camera:'unknown'}),/Unknown garage camera/);
  assert.throws(()=>scene.draw({modelId:'unknown'}),/Unknown garage model/);
  scene.dispose();scene.dispose();
  assert.equal(gl.buffers.size+gl.programs.size+gl.shaders.size+gl.listeners.size,0);
  assert.equal(scene.stats().meshes,0);
});

test('failed uploads clean construction; lost contexts skip drawing and recreate without stale handles',()=>{
  const failed=recordingCanvas({failUpload:9});
  assert.throws(()=>createGarageScene(failed.canvas),/test upload failure/);
  assert.equal(failed.buffers.size+failed.programs.size+failed.shaders.size+failed.listeners.size,0);
  const first=recordingCanvas(),scene=createGarageScene(first.canvas);
  scene.draw();const frames=scene.stats().frames;
  first.lose();scene.draw();assert.equal(scene.stats().frames,frames);
  scene.dispose();assert.equal(first.listeners.size,0);
  const second=recordingCanvas(),restored=createGarageScene(second.canvas);
  restored.draw({garage:fullGarage(),modelId:'yardhand',camera:'rear'});
  assert.equal(restored.stats().meshes,41);assert.equal(restored.stats().frameDraws,39);
  restored.dispose();assert.equal(second.buffers.size,0);
});
