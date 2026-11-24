// SPDX-License-Identifier: Apache-2.0
import {seededRandom} from '../vendor/vanillajs/modules/math/index.js';
import {box,lettering,local,quad,triangle} from './geometry.js';
import {skyway} from './skyway.js';

const steel=[.16,.28,.34], water=[.08,.48,.52], ink=[.075,.11,.16];
const cream=[.99,.90,.69], cyan=[.22,.96,.85], copper=[.91,.30,.12], mustard=[1,.68,.16];
const asphalt=[.22,.25,.30], apron=[.35,.38,.40];
const UP=[0,1,0];
const xyz=(p,h)=>[p.x,p.y+h,p.z];

function strip(out,s,t,l,r,h,tint) {
  quad(out,xyz(skyway.sample(s,l),h),xyz(skyway.sample(s,r),h),
    xyz(skyway.sample(t,r),h),xyz(skyway.sample(t,l),h),tint);
}
function rail(out,s,t,side) {
  const inside=side*skyway.barrierOffset, outside=inside+side*.44;
  const a=skyway.sample(s,inside), b=skyway.sample(t,inside);
  quad(out,xyz(a,0),xyz(b,0),xyz(b,.94),xyz(a,.94),steel);
  strip(out,s,t,Math.min(inside,outside),Math.max(inside,outside),.94,
    Math.floor(s/6)%2===0 ? cream : copper);
}

// The energy flywheels have six spokes, alternating ceramic casing segments
// and an open centre. All of the structure is outside the inner face of the rail.
function wheel(out,p,side,radius) {
  const at=(u,v,w)=>local(p,side*(skyway.barrierOffset+radius+6)+u,radius+v+1,w);
  box(out,at,[0,-radius*.66,0],[radius*.38,radius*1.35,1.8],steel);
  const ring=(r,a,z)=>at(r*Math.cos(a),r*Math.sin(a),z);
  for(let i=0;i<24;i++) {
    const a=i*Math.PI/12,b=(i+1)*Math.PI/12,col=i%6<4 ? copper : cream;
    quad(out,ring(radius,a,-1),ring(radius,b,-1),ring(radius*.79,b,-1),ring(radius*.79,a,-1),col);
    quad(out,ring(radius,b,1),ring(radius,a,1),ring(radius*.79,a,1),ring(radius*.79,b,1),col);
    quad(out,ring(radius,a,1),ring(radius,b,1),ring(radius,b,-1),ring(radius,a,-1),steel);
    if(i%4===0) triangle(out,at(0,0,0),ring(radius*.82,a,-.6),ring(radius*.82,b,-.6),mustard);
  }
}
function signal(out,p,label,accent) {
  const at=(x,y,z)=>local(p,x,y,z);
  for(const side of [-1,1]) {
    box(out,at,[side*17,5.2,0],[1.6,10.4,1.8],steel);
    box(out,at,[side*17,8,0],[1.65,.8,1.85],accent);
  }
  box(out,at,[0,10.4,0],[35.4,2.6,1.7],ink);
  lettering(out,label,.30,(x,y)=>at(x,9.70+y,-.86),cream);
  for(const side of [-1,1]) box(out,at,[side*12,10.4,-.89],[6,.32,.1],accent);
}

function backdrop(out) {
  const center=[-130,0,270];
  quad(out,[-1950,0,1950],[1950,0,1950],[1950,0,-1950],[-1950,0,-1950],water,UP);
  const rng=seededRandom(27129);
  // Wind-sheared ripples break up the water at racing speed. These fixed
  // facets occupy the far scenery batch and carry no contact geometry.
  for(let i=0;i<1100;i++) {
    const x=-1500+rng()*3000,z=-1200+rng()*2800,w=2+rng()*12;
    triangle(out,[x,.025,z],[x+w,.025,z+.2],[x+w*.85,.025,z-.36],[.22,.61,.62],UP);
  }
  // Original offshore conversion platforms anchor each vista. Reserve the
  // entire track corridor before adding an installation in the tidal basin.
  for(let i=0;i<40;i++) {
    const x=-930+rng()*1550,z=-510+rng()*1440;
    const near=skyway.project(x,z);
    if(Math.hypot(near.x-x,near.z-z)<80 && Math.abs(near.lateral)<80) continue;
    const at=(u,v,w)=>[x+u,v,z-w],h=9+rng()*13;
    box(out,at,[0,h*.45,0],[17,h*.9,11],steel);
    box(out,at,[0,h,0],[27,2.4,18],cream);
    box(out,at,[-5,h+3,0],[10,4.5,9],copper);
    box(out,at,[6,h+10,-3],[1.1,20,1.1],steel);
    box(out,at,[6,h+18,-3],[2,1.5,2],mustard);
    box(out,at,[0,h+9,2],[13,1,1.6],cream);
  }
  // Salt terraces and wind-cut caprocks form a continuous horizon.
  for(let i=0;i<44;i++) {
    const a=i*Math.PI/22,b=(i+1)*Math.PI/22;
    const point=(t,r,y)=>[center[0]+Math.sin(t)*r,y,center[2]-Math.cos(t)*r];
    const h=t=>54+31*Math.sin(3*t+1)+22*Math.cos(9*t);
    const rim=(t)=>point(t,1100+45*Math.sin(t*7),h(t));
    quad(out,point(a,970,0),point(b,970,0),rim(b),rim(a),i%2?[.48,.46,.45]:[.54,.46,.41]);
    quad(out,rim(a),rim(b),point(b,1240,h(b)+12),point(a,1240,h(a)+12),[.76,.64,.52]);
  }
}

export function skywayBatches() {
  const ambient=[];
  backdrop(ambient);
  const rows=[{vertices:new Float32Array(ambient),material:{roughness:1}}];
  for(let start=skyway.startS;start<skyway.endS;start+=100) {
    const end=Math.min(start+100,skyway.endS), out=[];
    // Metre stations include the ramp toes and crests. Both edges and all rail
    // stations use the collision surface, including the descending catch face.
    for(let s=start;s<end;) {
      const ramp=skyway.ramps.find(r=>s>=r.lip-r.run-4 && s<r.lip+r.run+4);
      const t=Math.min(s+(ramp ? 1 : 2),end),w=skyway.halfWidth,railW=skyway.barrierOffset;
      strip(out,s,t,-w,w,0,asphalt);
      for(const k of [-1,1]) {
        const l=k*w,r=k*(railW+1);
        strip(out,s,t,Math.min(l,r),Math.max(l,r),0,apron);
        strip(out,s,t,k*w-.12,k*w+.12,.014,cream);
        rail(out,s,t,k);
        const edgeA=skyway.sample(s,k*(railW+1)),edgeB=skyway.sample(t,k*(railW+1));
        quad(out,xyz(edgeA,0),xyz(edgeB,0),xyz(edgeB,-1.8),xyz(edgeA,-1.8),copper);
      }
      if(Math.floor((s+60)/5)%3===0) strip(out,s,t,-.10,.10,.016,cream);
      if(ramp && s>=ramp.lip-ramp.run && s<ramp.lip) {
        for(const side of [-1,1]) strip(out,s,t,side*10-.60,side*10+.60,.018,
          Math.floor(s/3)%2 ? mustard : ink);
      }
      s=t;
    }
    for(let s=start;s<end;s++) {
      const p=skyway.sample(s), at=(x,y,z)=>local(p,x,y,z);
      if(s%32===0) {
        for(const side of [-1,1]) {
          box(out,at,[side*14,-12,0],[1.7,24,2.1],steel);
          box(out,at,[side*14,-1.1,0],[4,1.65,3.5],copper);
        }
      }
      if(s%64===0) {
        const side=(s%128===0 ? 1 : -1);
        box(out,at,[side*16,2,0],[.40,4,.40],steel);
        box(out,at,[side*16,3.8,0],[.65,.9,.65],cyan);
      }
      for(const [i,r] of skyway.ramps.entries()) {
        if(s===r.lip-57) signal(out,p,'RISE'+(i+1),mustard);
        if(s===r.lip) for(const k of [-1,1]) wheel(out,p,k,8+2*i);
      }
      if(s===170 || s===661 || s===1150 || s===1640) signal(out,p,'DRIFT',cyan);
    }
    for(const [index,gate] of skyway.gates.entries()) {
      const s=gate.s;
      if(s<start || s>=end) continue;
      const w=skyway.barrierOffset;
      if(index>0 && index<skyway.gates.length-1) {
        strip(out,s,s+.30,-w,w,.024,cyan);
        signal(out,gate,'GATE'+index,cyan);
        continue;
      }
      const tile=2*w/20;
      for(let i=0;i<20;i++) for(let j=0;j<2;j++)
        strip(out,s+j*.7,s+(j+1)*.7,-w+i*tile,-w+(i+1)*tile,.024,(i+j)%2 ? ink : cream);
      const starting=index===0;
      signal(out,gate,starting?'NITRO':'FINISH',starting?cyan:mustard);
    }
    const p=skyway.sample((start+end)/2);
    rows.push({vertices:new Float32Array(out),material:{roughness:.85},
      bounds:{x:p.x,y:p.y,z:p.z,r:100}});
  }
  for(const s of [skyway.startS,skyway.endS]) {
    const out=[],p=skyway.sample(s),at=(x,y,z)=>local(p,x,y,z);
    box(out,at,[0,.47,0],[2*skyway.barrierOffset,.94,.15],copper);
    rows.push({vertices:new Float32Array(out),material:{roughness:.8},bounds:{x:p.x,y:p.y,z:p.z,r:20}});
  }
  return rows;
}
