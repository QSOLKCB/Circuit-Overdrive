// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {add,cross,dot,length,normalize,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {orbital} from '../src/orbital.js';

test('every drivable Orbital Spine triangle is the same finite face for the wheel and mesh',()=>{
  let count=0;
  for(let i=0;i<orbital.rows.length-1;i++) {
    const a=orbital.rows[i],b=orbital.rows[i+1];
    if(!a.connected) continue;
    for(const [p,q,r] of [[a.left,a.right,b.right],[a.left,b.right,b.left]]) {
      const centre=scale(add(add(p,q),r),1/3),normal=normalize(cross(subtract(q,p),subtract(r,p)));
      const origin=add(centre,scale(normal,.62)),hit=orbital.probe(origin,scale(normal,-1),.72);
      assert(hit && Math.abs(hit.distance-.62)<1e-7);
      assert(dot(hit.normal,normal)>.9999999 && dot(cross(hit.tangent,hit.normal),hit.lateral)>.9999999);
      assert(length(subtract(centre,hit.point))<1e-7);
      const sampled=orbital.frame(hit.station,hit.offset);
      assert(length(subtract(sampled.point,centre))<1e-7);
      assert(Math.abs(hit.offset)<=orbital.halfWidth && hit.material==='magnetic');
      count++;
    }
  }
  assert(count>1200 && count<1500);
  const f=orbital.frame(0);
  assert.throws(()=>{f.normal[1]=99;});
  assert.throws(()=>{orbital.rows[0].left[1]=99;});
  assert.throws(()=>orbital.probe([NaN,0,0],[0,-1,0],1));
  assert.throws(()=>orbital.probe([1,0,0],[0,-2,0],1));
  assert.throws(()=>orbital.probe([1,0,0],[0,-1,0],Infinity));
});

test('walls, opposite XZ-overlapping decks, lateral edges and the open transfer have distinct physical support',()=>{
  const sections=orbital.sections;
  const mid=id=>{const s=sections.find(p=>p.id===id);return orbital.frame((s.start+s.end)/2);};
  const lower=mid('magnet-apron'),roof=mid('inverted-spine');
  const above=[lower.point[0],roof.point[1]-.6,lower.point[2]];
  assert.equal(orbital.probe(above,[0,1,0],1,lower).id,roof.id);
  assert.equal(orbital.probe(add(lower.point,[0,.6,0]),[0,-1,0],1,roof).id,lower.id);
  for(const id of ['antenna-wall','earthward-wall']) {
    const w=mid(id);
    assert(Math.abs(w.tangent[1])>.999 && Math.abs(w.normal[1])<1e-8);
    assert.equal(orbital.probe(add(w.point,w.normal),scale(w.normal,-1),1).id,id);
    assert.equal(orbital.probe(subtract(w.point,w.normal),w.normal,1),null);
  }
  const air=mid('vacuum-gap');
  assert(!air.supported);
  assert.equal(orbital.probe(add(air.point,[0,3,0]),[0,-1,0],12),null);
  const off=add(lower.point,scale(lower.lateral,orbital.halfWidth+.4));
  assert.equal(orbital.probe(add(off,lower.normal),scale(lower.normal,-1),2),null);
  assert(orbital.projectNear(off,lower.station).offset>orbital.halfWidth);
  assert(Math.abs(mid('azimuth-bank').lateral[1])>.12);
});
