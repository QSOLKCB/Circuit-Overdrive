// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {damageWorld,newDamage,resolveLabTick} from '../src/crash-damage.js';
import {crashCar} from '../src/crash-impact.js';
import {crashRecorder,crashReceipt} from '../src/crash-replay.js';
import {createCrashScene} from '../src/crash-scene.js';
import {createTrial,startTrial,stepTrial} from '../src/crash-trial.js';
import {createImpactPanelGeometry,deformImpactPanel,IMPACT_PANEL_VERTEX_LIMIT,IMPACT_PANEL_ZONES} from '../src/impact-panels.js';
import {createReplaySession,validateTheatreReplay} from '../src/replay-theatre-core.js';
import {touringMeshes} from '../src/touring-car.js';

const publishedRevision='1f0527098b9eb9c27c678d9ad4bfa2b276374551';
const differentRevision='ab'.repeat(20);
const gas={throttle:1,brake:0,steer:0};
const stride=11;
const digest=vertices=>createHash('sha256').update(
  Buffer.from(vertices.buffer,vertices.byteOffset,vertices.byteLength)).digest('hex');
const source=touringMeshes({mesh:vertices=>vertices}).shell;
const triangleFloats=stride*3;
const panelShell=()=>createImpactPanelGeometry(source,{exposedMetal:true});

function triangleDigests(vertices) {
  const digests=[];
  for(let i=0;i<vertices.length;i+=triangleFloats)digests.push(digest(vertices.subarray(i,i+triangleFloats)));
  return digests;
}

function cross(vertices,i) {
  const x=vertices[i+stride]-vertices[i], y=vertices[i+stride+1]-vertices[i+1], z=vertices[i+stride+2]-vertices[i+2];
  const u=vertices[i+2*stride]-vertices[i], v=vertices[i+2*stride+1]-vertices[i+1], w=vertices[i+2*stride+2]-vertices[i+2];
  return [y*w-z*v,z*u-x*w,x*v-y*u];
}

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const position=(vertices,i)=>vertices.subarray(i,i+3);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

test('clean shell partitions the original v1.1.0 triangles byte for byte',()=>{
  const {fixed,panels}=panelShell();
  assert.equal(source.length/stride,3192);
  assert.equal(digest(source),'485032703905d505210cbb9338943724c55a2490d5711fe14f61662d220d1067');
  assert.deepEqual(IMPACT_PANEL_ZONES,['front','rear','left','right']);
  const pieces=[fixed,...IMPACT_PANEL_ZONES.map(zone=>{
    const panel=panels[zone];
    assert(panel.clean.length>=triangleFloats);
    return deformImpactPanel(panel,0);
  })];
  assert(pieces.every(vertices=>vertices instanceof Float32Array && vertices.length%triangleFloats===0));
  assert.deepEqual(pieces.map(vertices=>vertices.length/stride),[1974,576,354,144,144]);
  assert.deepEqual(pieces.flatMap(triangleDigests).sort(),triangleDigests(source).sort());
});

test('glancing, opposing and wall targets have distinct physical folds and severe exposed-metal facets',()=>{
  const {panels}=panelShell();
  const right=deformImpactPanel(panels.right,19);
  const medium=deformImpactPanel(panels.front,401);
  const severe=deformImpactPanel(panels.front,815);
  function change(clean,damaged) {
    let moved=0,peak=0;
    const colors=new Set();
    for(let i=0;i<clean.length;i+=stride) {
      const displacement=distance(position(clean,i),position(damaged,i));
      if(displacement>0)moved++;
      peak=Math.max(peak,displacement);
      const before=clean.subarray(i+6,i+9),after=damaged.subarray(i+6,i+9);
      if(distance(before,after)>0)colors.add(after.join(','));
    }
    return {moved,peak,colors:colors.size};
  }
  const minorChange=change(panels.right.clean,right), moderateChange=change(panels.front.clean,medium);
  const severeChange=change(panels.front.clean,severe);
  assert(minorChange.moved>0 && minorChange.peak>=.005 && minorChange.peak<.10);
  assert(moderateChange.moved>0 && moderateChange.peak>=.10);
  assert(severeChange.peak>moderateChange.peak && severeChange.colors>=3,'multiple colors describe exposed creases');
  // Float32 little-endian reference targets for the original touring shell.
  assert.equal(digest(right),'61ce468af588b5bce4851837f75c7b3cd0af73d89916698133be3698c974e721');
  assert.equal(digest(medium),'5489476e22046173d8f65c401f9f02802900a8221ed6c8c5d770629ad9cfcfde');
  assert.equal(digest(severe),'47d0c437c8d316bb4ee4e72eb2e003103321bc28f80e38162277caf057686bd0');
});

test('maximum panel damage preserves topology, shared positions, winding and finite lighting normals',()=>{
  const {fixed,panels}=panelShell();
  const maxima={front:.321,rear:.251,left:.125,right:.125};
  const folded=IMPACT_PANEL_ZONES.map(zone=>[panels[zone].clean,deformImpactPanel(panels[zone],1000),maxima[zone]]);
  assert.equal(digest(folded[1][1]),'16ebe2088566c243bf8ba14aace3174910ab48dfb57f21e7b660c479b0a190a2');
  const seam=new Map();
  let shared=0;
  for(const [clean,damaged,maximum] of [[fixed,fixed,0],...folded]) {
    assert.equal(damaged.length,clean.length);
    assert(damaged.every(Number.isFinite));
    for(let i=0;i<clean.length;i+=stride) {
      const from=position(clean,i), to=position(damaged,i);
      assert(distance(from,to)<=maximum,'displacement fits the model-space panel envelope');
      const [x,,z]=from;
      if(Math.abs(x)>=.70 && Math.abs(z)>=.95 && Math.abs(z)<=1.74)
        assert.deepEqual(to,from,'the panel leaves the outer wheel-opening zone in place');
      assert(damaged.subarray(i+6,i+9).every(channel=>channel>=0 && channel<=1));
      assert.deepEqual(damaged.subarray(i+9,i+11),clean.subarray(i+9,i+11));
      const key=from.join(',');
      if(seam.has(key)) {
        shared++;
        assert.equal(to.join(','),seam.get(key),'shared vertices cannot crack apart');
      } else seam.set(key,to.join(','));
    }
    for(let i=0;i<clean.length;i+=triangleFloats) {
      const offsets=[i,i+stride,i+2*stride];
      if(offsets.every(j=>distance(position(clean,j),position(damaged,j))===0))continue;
      const before=cross(clean,i),after=cross(damaged,i);
      assert(Math.hypot(...after)>0 && dot(before,after)>0,'folded triangle preserves winding');
      for(const j of offsets) {
        const oldNormal=clean.subarray(j+3,j+6),newNormal=damaged.subarray(j+3,j+6);
        assert(Math.abs(Math.hypot(...newNormal)-1)<1e-6);
        assert(dot(newNormal,oldNormal)>0,'normal remains on the authored exterior');
        assert(Math.abs(dot(newNormal,after)/Math.hypot(...after))>.99999,'normal follows the folded face');
      }
    }
  }
  assert(shared>1000,'the original shell contains shared boundaries');
});

test('panel targets depend on cumulative damage and cannot share vehicle mutations',()=>{
  const first=panelShell(),second=panelShell();
  for(const zone of IMPACT_PANEL_ZONES) {
    const a=first.panels[zone],b=second.panels[zone],clean=digest(a.clean);
    assert.notEqual(a.clean,b.clean);
    const direct=deformImpactPanel(a,815),expected=digest(direct);
    deformImpactPanel(b,19);
    deformImpactPanel(a,401);
    assert.equal(digest(deformImpactPanel(a,815)),expected);
    assert.equal(digest(deformImpactPanel(b,815)),expected);
    direct[0]=999;
    assert.equal(digest(deformImpactPanel(b,815)),expected);
    assert.equal(digest(deformImpactPanel(a,0)),clean);
    assert.equal(digest(deformImpactPanel(b,0)),clean);
  }
});

test('rejects invalid damage and malformed triangle data without reading accessors',()=>{
  const {panels}=panelShell();
  for(const value of [NaN,Infinity,-1,1001,19.5,'19',null,undefined,{}])
    assert.throws(()=>deformImpactPanel(panels.right,value),RangeError);
  const triangle=source.slice(0,triangleFloats),nonFinite=triangle.slice(),invalidColor=triangle.slice();
  nonFinite[0]=NaN;
  invalidColor[6]=1.1;
  const sparse=Array.from(triangle),accessor=Array.from(triangle);
  delete sparse[7];
  let reads=0;
  Object.defineProperty(accessor,7,{get(){reads++;return 1;}});
  for(const invalid of [nonFinite,invalidColor,triangle.slice(1),sparse,accessor])
    assert.throws(()=>createImpactPanelGeometry(invalid));
  assert.equal(reads,0);
  const overBudget=(Math.floor(IMPACT_PANEL_VERTEX_LIMIT/3)+1)*triangleFloats;
  assert.throws(()=>createImpactPanelGeometry(new Float32Array(overBudget)),/budget/);
});

// Captured from untouched v1.1.0, Node 22.18.0, seed 27, full throttle.
const reference={
  wall:{tick:220,damage:[{front:815,engine:733,steering:309,tyres:187,suspension:358}],
    uploads:2,contacts:'c20a243c4570ce617417b715303d3820be4dce30a0a224e223c84889ce39317c',
    final:'a2ede31edd7233fcc3b7a75588bd634bd989e0d812e895191820390d8fb1b69d'},
  glancing:{tick:209,damage:[{right:19,steering:5,tyres:13,suspension:11}],
    uploads:2,contacts:'15b3ea09b37ee903ce0e7e75fab1ce5a9d31c8808d6e11814066fd188d7ade48',
    final:'2550e9d33b3321c40e72b2cf92a47ef64ed52610ae5d58a5009ea735bf432354'},
  opposing:{tick:180,damage:Array(2).fill({front:401,engine:360,steering:152,tyres:92,suspension:176}),
    uploads:4,contacts:'7418f51ac05f9c8230faa1cc1cfeb876ab545d71cfc3ac7af83b956b3c9de3c0',
    final:'3cfe892dd2594a6b02fe6321a5da2f6f65508630adb6caf37d806b1be1859853'}
};

// Record WebGL calls from the real pinned LitRenderer. Rendering and shader
// execution are covered separately by the browser test.
function trackedCanvas() {
  const buffers=new Map(), programs=new Set(), shaders=new Set(), listeners=new Map();
  const draws=[];
  let bound=null;
  const gl={
    NO_ERROR:0,ARRAY_BUFFER:34962,
    createProgram(){const program={};programs.add(program);return program;},
    createShader(){const shader={};shaders.add(shader);return shader;},
    createBuffer(){const buffer={};buffers.set(buffer,null);return buffer;},
    deleteProgram(program){assert(programs.delete(program));},
    deleteShader(shader){assert(shaders.delete(shader));},
    deleteBuffer(buffer){assert(buffers.delete(buffer));},
    bindBuffer(target,buffer){assert.equal(target,this.ARRAY_BUFFER);assert(buffers.has(buffer));bound=buffer;},
    bufferData(target,data){assert.equal(target,this.ARRAY_BUFFER);assert(buffers.has(bound));buffers.set(bound,data);},
    clear(){draws.length=0;},
    drawArrays(_mode,_first,count){
      const vertices=buffers.get(bound);
      assert(vertices instanceof Float32Array);
      assert.equal(vertices.length,draws.length===0?6:count*stride);
      draws.push({buffer:bound,vertices});
    },
    getError:()=>0,
    getAttribLocation:()=>0,
    getUniformLocation:()=>null,
    getShaderParameter:()=>true,
    getProgramParameter:()=>true,
    isContextLost:()=>false
  };
  for(const call of ['shaderSource','compileShader','attachShader','linkProgram','viewport','disable','enable',
    'colorMask','depthMask','clearDepth','clearColor','useProgram','enableVertexAttribArray','vertexAttribPointer',
    'uniform3fv','uniform1f','disableVertexAttribArray','depthFunc','uniformMatrix4fv','uniformMatrix3fv','blendFunc'])
    gl[call]=()=>{};
  const canvas={
    getContext(name){assert.equal(name,'webgl');return gl;},
    getBoundingClientRect:()=>({width:960,height:540}),
    addEventListener(type,listener){assert(!listeners.has(type));listeners.set(type,listener);},
    removeEventListener(type,listener){assert.equal(listeners.get(type),listener);listeners.delete(type);}
  };
  return {canvas,buffers,programs,shaders,listeners,draws};
}

function advanceTo(session,tick) {
  do {session.seekBatch(tick);} while(session.tick<tick);
}

for(const [scenario,expected] of Object.entries(reference)) {
  test(`${scenario} retains its certified authority and reconstructs panel uploads through playback`,async()=>{
    const trial=createTrial(scenario,27,publishedRevision), recorder=crashRecorder(trial);
    startTrial(trial);
    let impact;
    while(!trial.result) {
      stepTrial(trial,gas);
      recorder.record(gas);
      if(!impact && trial.firstImpact!==null)impact=structuredClone(trial);
    }
    assert.equal(impact.firstImpact,expected.tick);
    assert.deepEqual(impact.world.cars.map(car=>car.damage),expected.damage.map(d=>({...newDamage(),...d})));
    const tape=recorder.export();
    assert.throws(()=>validateTheatreReplay(tape,differentRevision),/exact source revision/);
    const receipt=await crashReceipt(tape,trial,'node');
    assert.equal(receipt.contactsSha256,expected.contacts);
    assert.equal(receipt.finalStateSha256,expected.final);

    const gl=trackedCanvas(), scene=createCrashScene(gl.canvas,scenario);
    const session=createReplaySession(tape,publishedRevision);
    const stats=()=>scene.stats();
    const draw=(state=session.race,options={})=>{
      scene.draw(state,{camera:'inspect',reducedMotion:true,...options});
      return gl.draws.map(({vertices})=>digest(vertices));
    };
    try {
      const initial=stats(), clean=draw(), cleanDraws=gl.draws.slice();
      assert.equal(gl.buffers.size,initial.meshes+1,'renderer owns one additional sky buffer');
      assert.equal(initial.bytes,initial.vertices*stride*Float32Array.BYTES_PER_ELEMENT);
      assert.equal(gl.programs.size,2);
      assert.equal(gl.shaders.size,0);
      advanceTo(session,expected.tick-1);
      assert.deepEqual(draw(),clean);
      assert.equal(stats().uploads,initial.uploads);

      session.step();
      const before=JSON.stringify(session.race), damaged=draw();
      const changedDraws=damaged.flatMap((hash,i)=>hash===clean[i]?[]:[i]);
      assert.equal(JSON.stringify(session.race),before,'drawing observes the damage ledger without modifying it');
      assert.equal(damaged.length,clean.length);
      assert.equal(changedDraws.length,expected.uploads,'only the accepted panels change uploads');
      assert.equal(stats().uploads,initial.uploads+expected.uploads);
      assert.equal(stats().skippedIdentical,initial.skippedIdentical,'dirty checking is before renderer validation');
      for(const i of changedDraws) {
        const {buffer,vertices}=cleanDraws[i],after=gl.draws[i];
        assert(!gl.buffers.has(buffer),'each changed mesh releases its previous buffer');
        assert.notEqual(after.buffer,buffer);
        let moved=0;
        for(let j=0;j<vertices.length;j+=stride) {
          if(distance(position(vertices,j),position(after.vertices,j))===0)continue;
          moved++;
          if(scenario==='glancing')assert(vertices[j]>.68,'only the right side may dent');
          else assert(vertices[j+2]<-.95,'only the front may compress');
        }
        assert(moved>0);
      }
      assert.equal(new Set(changedDraws.map(i=>gl.draws[i].buffer)).size,expected.uploads);
      const follow=scenario==='opposing'?1:0;
      assert.deepEqual(draw(session.race,{follow}),damaged,'camera and follow cannot change car geometry');
      assert.deepEqual(draw(session.race,{follow,reducedMotion:false}).slice(0,damaged.length),damaged,
        'reduced motion has the same immediate canonical panel target');
      const braked=structuredClone(impact);
      for(let tick=0;tick<6;tick++)stepTrial(braked,{throttle:0,brake:1,steer:0});
      assert.notDeepEqual(braked.world.cars,impact.world.cars);
      assert.deepEqual(draw(braked,{follow}),damaged,'braking without a new accepted strike preserves the dent');
      assert.equal(stats().uploads,initial.uploads+expected.uploads);
      assert.equal(gl.buffers.size,initial.meshes+1);

      advanceTo(session,0);
      assert.deepEqual(draw(),clean,'rewinding restores every canonical clean buffer');
      advanceTo(session,expected.tick);
      assert.deepEqual(draw(),damaged,'seeking back to the accepted impact restores identical vertices');
      advanceTo(session,tape.ticks);
      assert.deepEqual(session.race,trial);
      const finalDraw=draw();
      for(const batchSize of [1,73,240]) {
        session.reset();
        while(!session.finished)session.advance(batchSize);
        assert.deepEqual(draw(),finalDraw);
      }
      assert.deepEqual(draw(createTrial(scenario)),clean,'Reset Trial restores the clean appearance');
      const restored=stats();
      assert.equal(restored.meshes,initial.meshes);
      assert.equal(restored.vertices,initial.vertices);
      assert.equal(restored.bytes,initial.bytes);
      assert.equal(gl.buffers.size,initial.meshes+1);
      assert.equal(gl.programs.size,2);
    } finally {
      scene.dispose();
    }
    assert.equal(stats().meshes+stats().bytes+stats().vertices,0);
    assert.equal(gl.buffers.size+gl.programs.size+gl.shaders.size+gl.listeners.size,0);
  });
}

test('an asymmetric accepted collision changes the correct panel on each independently owned car',()=>{
  const trial=createTrial('opposing');
  trial.world=damageWorld([crashCar(0,{z:3.2,vz:-45}),crashCar(1,{yaw:Math.PI/2})],[]);
  trial.previous=trial.world.cars.map(({x,z,yaw})=>({x,z,yaw}));
  const gl=trackedCanvas(), scene=createCrashScene(gl.canvas,'opposing');
  const draw=(target,camera=gl)=>{
    target.draw(trial,{camera:'inspect',follow:1,reducedMotion:true});
    return camera.draws.slice();
  };
  try {
    const before=draw(scene),uploadStart=scene.stats().uploads;
    const {contacts}=resolveLabTick(trial.world);
    trial.contacts.push(...contacts);
    assert.deepEqual(contacts[0].sites.map(site=>[site.id,site.zone,site.damage[site.zone]]),
      [[0,'front',246],[1,'left',246]]);
    const after=draw(scene);
    const changed=after.flatMap((mesh,index)=>mesh.buffer===before[index].buffer?[]:[index]);
    assert.equal(changed.length,4);
    assert.equal(new Set(changed.map(i=>after[i].buffer)).size,4);
    assert.equal(scene.stats().uploads-uploadStart,4);
    for(const [rank,i] of changed.entries()) {
      const clean=before[i].vertices, damaged=after[i].vertices, moved=[];
      for(let j=0;j<clean.length;j+=stride) {
        if(distance(position(clean,j),position(damaged,j))>0)moved.push(position(clean,j));
      }
      assert(moved.length>0);
      assert(moved.every(([x,,z])=>rank<2?z<-.95:x<-.68));
    }
    // Context restoration reconstructs the scene from the same accepted trial.
    const restoredGl=trackedCanvas(), restoredScene=createCrashScene(restoredGl.canvas,'opposing');
    try {
      assert.deepEqual(draw(restoredScene,restoredGl).map(part=>digest(part.vertices)),
        after.map(part=>digest(part.vertices)));
      assert.equal(restoredGl.buffers.size,gl.buffers.size);
    } finally {
      restoredScene.dispose();
    }
    assert.equal(restoredGl.buffers.size,0);
  } finally {
    scene.dispose();
  }
});
