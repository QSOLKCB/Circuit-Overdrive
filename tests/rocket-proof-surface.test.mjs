// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {add,cross,dot,length,normalize,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {proofSurface as surface} from './fixtures/rocket-proof-surface.mjs';

const near=(actual,expected)=>assert(length(subtract(actual,expected))<1e-8,`${actual} differs from ${expected}`);

test('nine finite patches form one connected, consistently oriented laboratory strip',()=>{
  assert.equal(surface.sections.length,9);
  for(const [i,p] of surface.sections.entries()) {
    const mid=surface.frame((p.start+p.end)/2);
    near(cross(mid.tangent,mid.normal),mid.lateral);
    assert(Math.abs(length(mid.tangent)-1)<1e-12 && Math.abs(length(mid.normal)-1)<1e-12);
    if(!i) continue;
    const before=surface.frame(p.start-1e-5),after=surface.frame(p.start+1e-5);
    assert(length(subtract(after.point,before.point))<.000021);
    assert(dot(after.normal,before.normal)>.99999999 && dot(after.tangent,before.tangent)>.99999999);
    const seam=surface.frame(p.start), origin=add(seam.point,scale(seam.normal,1.5)), ray=scale(seam.normal,-1);
    const incoming=surface.probe(origin,ray,2),outgoing=surface.probe(origin,ray,2,{id:p.id});
    assert.equal(incoming.id,surface.sections[i-1].id);
    assert.equal(outgoing.id,p.id);
    near(incoming.point,outgoing.point);
    near(incoming.normal,outgoing.normal);
  }
});

test('oblique 3D rays intersect the same finite surface point at both edges and inside every patch',()=>{
  for(const p of surface.sections) for(const fraction of [.1,.5,.9]) for(const offset of [-7,-1.45,7]) {
    const f=surface.frame(p.start+(p.end-p.start)*fraction,offset);
    const direction=normalize(add(scale(f.normal,-1),add(scale(f.tangent,.28),scale(f.lateral,.19))));
    const origin=subtract(f.point,scale(direction,.85));
    const hit=surface.probe(origin,direction,1,{id:'stale'});
    assert.equal(hit?.id,p.id);
    assert.equal(hit.material,'magnetic');
    assert(Math.abs(hit.distance-.85)<1e-8 && Math.abs(hit.station-f.station)<1e-8);
    assert(Math.abs(hit.offset-f.offset)<1e-8);
    near(hit.point,f.point);
    near(hit.normal,f.normal);
    near(add(origin,scale(direction,hit.distance)),hit.point);
    assert.equal(surface.probe(origin,direction,.84),null);
    const behind=subtract(f.point,scale(f.normal,.5));
    assert.equal(surface.probe(behind,f.normal,1),null);
    const beyondWidth=add(f.point,[8-f.offset,0,0]);
    assert.equal(surface.probe(add(beyondWidth,f.normal),scale(f.normal,-1),2),null);
  }
});

test('opposed rays at identical XZ choose the floor or the inverted ceiling by physical distance and direction',()=>{
  const origin=[0,48,-24];
  const down=surface.probe(origin,[0,-1,0],50,{id:'ceiling'});
  const up=surface.probe(origin,[0,1,0],50,{id:'entry-floor'});
  assert.equal(down.id,'entry-floor');
  assert.equal(up.id,'ceiling');
  assert.equal(down.distance,48);
  assert.equal(up.distance,48);
  near(down.normal,[0,1,0]);
  near(up.normal,[0,-1,0]);
  assert.equal(surface.probe(origin,[0,0,-1],5),null);
  const ascending=surface.sections.find(p=>p.id==='ascending-wall');
  const wall=surface.frame((ascending.start+ascending.end)/2);
  near(wall.tangent,[0,1,0]);
  near(wall.normal,[0,0,1]);
  const hit=surface.probe(add(wall.point,[0,0,2]),[0,0,-1],2);
  assert.equal(hit.id,'ascending-wall');
  assert.equal(hit.distance,2);
});

test('finite ends, zero-length casts, grazing lines and malformed probe inputs',()=>{
  const f=surface.frame(0);
  assert.equal(surface.probe(f.point,[0,-1,0],0)?.distance,0);
  assert.equal(surface.probe([0,1,.01],[0,-1,0],2),null);
  const last=surface.frame(surface.length);
  assert.equal(surface.probe(add(add(last.point,last.tangent),last.normal),scale(last.normal,-1),2),null);
  assert.equal(surface.probe([0,0,-24],[1,0,0],6),null);
  for(const origin of [[NaN,0,0],[0,0],[Infinity,0,0],[5000,0,0]])
    assert.throws(()=>surface.probe(origin,[0,-1,0],2));
  for(const direction of [[0,0,0],[0,-2,0],[0,NaN,0]])
    assert.throws(()=>surface.probe(f.point,direction,2));
  for(const range of [-1,65,NaN,Infinity])
    assert.throws(()=>surface.probe(f.point,[0,-1,0],range));
  for(const [s,l] of [[-.1,0],[surface.length+.1,0],[0,7.1],[NaN,0]])
    assert.throws(()=>surface.frame(s,l));
});
