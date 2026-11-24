// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {lettering,local,quad} from '../src/geometry.js';
import {skyway} from '../src/skyway.js';
import {skywayBatches} from '../src/skyway-scene.js';

const rows=skywayBatches();
function* asphaltTriangles() {
  for(const {vertices:v} of rows) for(let i=0;i<v.length;i+=33) {
    if(Math.abs(v[i+6]-.22)<1e-6 && Math.abs(v[i+7]-.25)<1e-6 && Math.abs(v[i+8]-.30)<1e-6)
      yield v.subarray(i,i+33);
  }
}

function checkRoadTriangle(v) {
  for(const j of [0,11,22]) {
    const x=v[j], y=v[j+1], z=v[j+2];
    const contact=skyway.sampleSurface(x,z,100);
    assert(contact,'asphalt vertex has no physical deck');
    // A Float32 edge can round a few micrometres onto the adjacent apron.
    assert(Math.abs(skyway.project(x,z).lateral)<=skyway.halfWidth+.0001,'road vertex outside asphalt');
    assert(Math.abs(y-contact.height)<.0001,'road vertex height');
  }
  const x=(v[0]+v[11]+v[22])/3, y=(v[1]+v[12]+v[23])/3, z=(v[2]+v[13]+v[24])/3;
  const contact=skyway.sampleSurface(x,z,100);
  assert.equal(contact?.surfaceId,'asphalt');
  assert(Math.abs(y-contact.height)<.025,'triangle-centre height');
  return skyway.project(x,z).s;
}

test('Skyway mesh follows the tyre surface through all three lips and landing decks',()=>{
  const triangles=rows.reduce((n,row)=>n+row.vertices.length/33,0);
  assert(rows.length<=26 && triangles<38000);
  const marked=new Set();
  let roadTriangles=0;
  for(const v of asphaltTriangles()) {
    const s=checkRoadTriangle(v);
    roadTriangles++;
    for(const [j,r] of skyway.ramps.entries()) if(Math.abs(s-r.lip)<2) marked.add(j);
  }
  assert(roadTriangles>2000);
  assert.equal(marked.size,3);
  for(let s=-59;s<skyway.endS;s+=1.37) {
    const p=skyway.sample(s,9),q=skyway.project(p.x,p.z);
    assert(Math.abs(q.s-s)<1e-8 && Math.abs(q.lateral-9)<1e-8);
    const left=skyway.sample(s-.001,9),right=skyway.sample(s+.001,9);
    const tangent=[right.x-left.x,right.y-left.y,right.z-left.z];
    assert(Math.abs(tangent.reduce((n,x,i)=>n+x*q.normal[i],0))<1e-6);
    assert.equal(skyway.sampleSurface(p.x,p.z,q.y-.01),null);
  }
  for(const l of [-18,18]) {
    const p=skyway.sample(500,l);
    assert.equal(skyway.sampleSurface(p.x,p.z,100),null);
  }
  assert.throws(()=>skyway.project(NaN,0),RangeError);
  assert.throws(()=>skyway.sample(Infinity),RangeError);
});

test('opposite distortions of asphalt vertices fail even with the original centroid',()=>{
  const v=asphaltTriangles().next().value.slice();
  checkRoadTriangle(v);
  const centre=(v[1]+v[12]+v[23])/3;
  v[1]+=.5;
  v[12]-=.5;
  assert.equal((v[1]+v[12]+v[23])/3,centre);
  assert.throws(()=>checkRoadTriangle(v),/road vertex height/);
});

// Identify the triangles sent to WebGL by colour and positions rounded to 1 mm.
function triangleKey(v,i) {
  const key=(j)=>[v[j],v[j+1],v[j+2]].map(n=>Math.round(n*1000)).join(',');
  return [key(i+6),...[key(i),key(i+11),key(i+22)].sort()].join('|');
}

test('each timing line carries one complete chequered stripe and its labelled gantry',()=>{
  const ink=[.075,.11,.16],cream=[.99,.90,.69];
  for(const [gate,word] of [[skyway.gates[0],'NITRO'],[skyway.gates.at(-1),'FINISH']]) {
    const expected=[];
    const corner=(column,row)=>{
      const p=skyway.sample(gate.s+row*.7,-skyway.halfWidth+column*(2*skyway.halfWidth/20));
      return [p.x,p.y+.024,p.z];
    };
    for(let c=0;c<20;c++) for(let r=0;r<2;r++)
      quad(expected,corner(c,r),corner(c+1,r),corner(c+1,r+1),corner(c,r+1),(c+r)%2 ? ink : cream);
    const at=(x,y,z)=>local(gate,x,y,z);
    quad(expected,at(-17.7,9.1,-.85),at(17.7,9.1,-.85),at(17.7,11.7,-.85),at(-17.7,11.7,-.85),ink);
    lettering(expected,word,.30,(x,y)=>at(x,9.70+y,-.86),cream);

    const counts=new Map();
    const packed=new Float32Array(expected);
    for(let i=0;i<packed.length;i+=33) counts.set(triangleKey(packed,i),0);
    assert.equal(counts.size,packed.length/33);
    for(const {vertices:v} of rows) for(let i=0;i<v.length;i+=33) {
      if(Math.abs(v[i]-gate.x)>24 || Math.abs(v[i+2]-gate.z)>24) continue;
      const key=triangleKey(v,i);
      if(counts.has(key)) counts.set(key,counts.get(key)+1);
    }
    for(const [key,count] of counts) assert.equal(count,1,word+' gate triangle '+key);
  }
});
