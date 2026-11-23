// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import recipe from '../tracks/redline-ridge.json' with {type:'json'};
import {buildRidge,ridge} from '../src/ridge.js';
import {ridgeBatches} from '../src/ridge-scene.js';
import {track} from '../src/track.js';

const near=(a,b,tolerance)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const batches=ridgeBatches(ridge);

test('finite paved approach, racing distance and runoff have physically distinct endpoints',()=>{
  assert.equal(track.closed,true);
  assert.deepEqual(track.sample(1),track.sample(track.length+1));
  assert.equal(ridge.closed,false);
  assert.equal(ridge.length,4510);
  assert.deepEqual(ridge.sample(-1e5),ridge.sample(ridge.startS));
  assert.deepEqual(ridge.sample(1e5),ridge.sample(ridge.endS));
  assert.deepEqual(ridge.gates.map(g=>Math.round(g.s)),[0,540,1160,1750,2260,2820,3390,3950,4510]);
  const a=ridge.gates[0], b=ridge.gates.at(-1);
  assert.ok(Math.hypot(b.x-a.x,b.z-a.z)>3700);
  assert.ok(a.y-b.y>120);
  for(const [s,sign] of [[ridge.startS,-1],[ridge.endS,1]]){
    const p=ridge.sample(s);
    assert.equal(ridge.sampleSurface(p.x+sign*p.tx,p.z+sign*p.tz,p.y+10),null);
    assert.ok(ridge.sampleSurface(p.x-sign*p.tx,p.z-sign*p.tz,p.y+10));
  }
});

test('projection, contact plane and arc tangent agree on both sides through hills and banking',()=>{
  let maxGrade=0, maxBank=0;
  for(let s=ridge.startS+.13;s<ridge.endS;s+=2.53) for(const l of [-12,-8.43,0,8.43,12]){
    const p=ridge.sample(s,l), q=ridge.project(p.x,p.z);
    near(p.s,q.s,1e-6); near(l,q.lateral,1e-7);
    assert.ok(Math.max(Math.abs(p.x),Math.abs(p.z))<1950);
    const surface=ridge.sampleSurface(p.x,p.z,p.y+.01);
    assert.equal(surface.surfaceId,Math.abs(l)<=ridge.halfWidth ? 'asphalt' : 'apron');
    const [nx,ny,nz]=surface.normal;
    near(Math.hypot(nx,ny,nz),1,1e-12);
    const before=ridge.sample(s-.0001,l),after=ridge.sample(s+.0001,l);
    near((after.x-before.x)*nx+(after.y-before.y)*ny+(after.z-before.z)*nz,0,1e-8);
    const lateral=ridge.sample(s,l+.0001);
    near((lateral.x-p.x)*nx+(lateral.y-p.y)*ny+(lateral.z-p.z)*nz,0,1e-8);
    maxGrade=Math.max(maxGrade,Math.abs(nx*p.tx+nz*p.tz)/ny);
    maxBank=Math.max(maxBank,Math.abs(p.bank));
  }
  assert.ok(maxGrade>.075 && maxGrade<.24);
  assert.ok(maxBank>.12 && maxBank<.18);
  const outside=ridge.sample(1920,ridge.barrierOffset+3);
  assert.equal(ridge.sampleSurface(outside.x,outside.z,outside.y+1),null);
});

test('retained asphalt and shoulder triangles follow authoritative wheel height across the route',()=>{
  let count=0;
  for(const {vertices:v} of batches.filter(b=>b.material.pattern==='asphalt')) {
    for(let i=0;i<v.length;i+=33) for(const [a,b] of [[0,11],[11,22],[0,22]]) {
      const x=(v[i+a]+v[i+b])/2, y=(v[i+a+1]+v[i+b+1])/2, z=(v[i+a+2]+v[i+b+2])/2;
      const road=ridge.project(x,z);
      near(y,road.y,.016);
      count++;
    }
  }
  assert.ok(count>20000);
  assert.ok(batches.every(b=>!b.bounds || Number.isFinite(b.bounds.r)));
  assert.ok(batches.length<=64 && batches.reduce((n,b)=>n+b.vertices.length/11,0)<220000);
});

// Intersect the actual retained triangles, counting *all* layers in XZ. This
// catches an apparently sound road whose bridge lintel or tunnel cap seals it.
function verticalIntersections(point) {
  const ys=[];
  for(const {bounds,vertices:v} of batches) {
    if(bounds && Math.hypot(point.x-bounds.x,point.z-bounds.z)>bounds.r) continue;
    for(let i=0;i<v.length;i+=33){
      const x=v[i], z=v[i+2], x1=v[i+11], z1=v[i+13], x2=v[i+22], z2=v[i+24];
      if(point.x<Math.min(x,x1,x2) || point.x>Math.max(x,x1,x2) ||
        point.z<Math.min(z,z1,z2) || point.z>Math.max(z,z1,z2)) continue;
      const dx=point.x-x,dz=point.z-z,d=(x1-x)*(z2-z)-(x2-x)*(z1-z);
      if(Math.abs(d)<1e-9) continue;
      const a=(dx*(z2-z)-dz*(x2-x))/d,b=((x1-x)*dz-(z1-z)*dx)/d;
      if(a>=0 && b>=0 && a+b<=1) ys.push(v[i+1]+a*(v[i+12]-v[i+1])+b*(v[i+23]-v[i+1]));
    }
  }
  return ys;
}
test('solid rail geometry matches each physical boundary and structures clear the chase camera',()=>{
  for(let s=ridge.startS+.11;s<ridge.endS;s+=49.3) for(const side of [-1,1]){
    const edge=ridge.sample(s,side*(ridge.barrierOffset+.16));
    const top=verticalIntersections(edge);
    assert.ok(top.some(y=>Math.abs(y-edge.y-.86)<.025),`missing side rail at ${s} m`);
  }
  for(const [s,sign] of [[ridge.startS,-1],[ridge.endS,1]]){
    const p=ridge.sample(s,.7);
    const outside={x:p.x+sign*.2*p.tx,z:p.z+sign*.2*p.tz};
    assert.ok(verticalIntersections(outside).some(y=>Math.abs(y-p.y-.90)<.012),'missing runoff stop');
  }
  for(const [name,[start,end]] of Object.entries(ridge.features)){
    for(let s=start+.007;s<end;s+=9.91) for(const l of [-10.8,.73,10.8]){
      const p=ridge.sample(s,l), ys=verticalIntersections(p);
      const wheel=ridge.sampleSurface(p.x,p.z,p.y+2);
      assert.ok(wheel && ys.some(y=>Math.abs(y-wheel.height)<.016));
      assert.ok(ys.every(y=>y<p.y+.1 || y>p.y+6.2),`obstruction at ${name} ${s}, ${l}`);
      if(name==='tunnel') assert.ok(ys.some(y=>y>p.y+6.2 && y<p.y+12));
      if(name==='bridge') assert.ok(ys.some(y=>y<p.y-90));
    }
  }
});

test('invalid route shape, elevation coverage, gates and non-finite queries reject early',()=>{
  for(const patch of [{legs:[[80,123]]}, {elevation:recipe.elevation.slice(1)},
    {origin:[Infinity,0]}, {bridge:[1800,5000]}, {checkpoints:[810,510]}, {halfWidth:NaN}]){
    assert.throws(()=>buildRidge({...recipe,...patch}));
  }
  assert.throws(()=>ridge.project(Infinity,0));
  assert.throws(()=>ridge.sample(1,NaN));
  assert.throws(()=>ridge.sampleSurface(1,2,NaN));
});
