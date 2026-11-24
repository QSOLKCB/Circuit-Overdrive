// SPDX-License-Identifier: Apache-2.0
import {add,clamp,cross,dot,finiteVector,length,normalize,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';

// Arc-length stations belong to the centre of the authored ribbon. The two
// triangles between each pair of cross-sections are the actual tyre surface.
const halfWidth=14, startS=-48, railOffset=13.6, railHeight=1.05;
const rows=[], sections=[], spans=[], cells=new Map(), cellSize=24;
let origin=[0,18,0], station=startS, yaw=0, pitch=0;
const axes=(a,b)=>({t:[Math.sin(a)*Math.cos(b),Math.sin(b),-Math.cos(a)*Math.cos(b)],r:[Math.cos(a),0,Math.sin(a)]});
function section(id,kind,span,{turn=0,lift=0,bank=0,drop=0,supported=true}={}) {
  const start=station, finish=station+span, count=Math.ceil(span/2);
  const base=axes(yaw,pitch), up=cross(base.r,base.t);
  let last;
  for(let i=0;i<=count;i++) {
    const f=i/count, s=f*span, angle=(turn||lift)*f;
    let centre;
    if(turn) centre=add(origin,add(scale(base.t,Math.sin(angle)*span/turn),scale(base.r,(1-Math.cos(angle))*span/turn)));
    else if(lift) centre=add(origin,add(scale(base.t,Math.sin(angle)*span/lift),scale(up,(1-Math.cos(angle))*span/lift)));
    else centre=add(origin,scale(base.t,s));
    if(drop) centre[1]-=f*drop;
    const {t,r}=axes(yaw+turn*f,pitch+lift*f), roll=bank*Math.sin(f*Math.PI)**2;
    const across=normalize(add(scale(r,Math.cos(roll)),scale(cross(r,t),Math.sin(roll))));
    const row={station:start+s,centre,left:subtract(centre,scale(across,halfWidth)),right:add(centre,scale(across,halfWidth)),
      across,id,connected:supported};
    if(i===0 && rows.length) rows[rows.length-1]=row;
    else rows.push(row);
    last=centre;
  }
  sections.push(Object.freeze({id,kind,start,end:finish,supported}));
  origin=last; station=finish; yaw+=turn; pitch+=lift;
}

section('mass-driver','grid',128);
section('azimuth-bank','bank',86,{turn:.67,bank:-.18});
section('counterbank','bank',77,{turn:-.67,bank:.16});
section('magnet-apron','floor',56);
section('radial-elbow','transition',54*Math.PI/2,{lift:Math.PI/2});
section('antenna-wall','wall',48);
section('crown-elbow','transition',42*Math.PI/2,{lift:Math.PI/2});
section('inverted-spine','ceiling',182);
section('return-elbow','transition',48*Math.PI/2,{lift:Math.PI/2});
section('earthward-wall','wall',33);
section('gravity-well','transition',55*Math.PI/2,{lift:Math.PI/2});
section('escape-bank','bank',100,{turn:1.0,bank:-.21});
section('launch-apron','floor',50);
section('launch-camber','ramp',17,{lift:.14});
section('impulse-lip','ramp',16);
pitch=0;
section('vacuum-gap','air',9,{drop:1.45,supported:false});
section('catch-deck','landing',88);
section('array-finish','finish',64);
const finishStation=station;
section('runoff','runoff',48);
const endS=station;
rows.at(-1).connected=false;
for(const row of rows) {
  for(const vector of [row.centre,row.left,row.right,row.across]) Object.freeze(vector);
  Object.freeze(row);
}

const cellKey=(x,y,z)=>((x+128)*257+(y+128))*257+z+128;
function triangle(a,b,c,tangent,s0,s1,upper,id) {
  const u=subtract(b,a), v=subtract(c,a), normal=normalize(cross(u,v));
  const heading=normalize(subtract(tangent,scale(normal,dot(tangent,normal))));
  const uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),den=uu*vv-uv*uv;
  return {a,u,v,normal:Object.freeze(normal),heading:Object.freeze(heading),lateral:Object.freeze(cross(heading,normal)),s0,s1,upper,id,
    bu:scale(subtract(scale(u,vv),scale(v,uv)),1/den),bv:scale(subtract(scale(v,uu),scale(u,uv)),1/den)};
}
function register(tri,points) {
  const min=[],max=[];
  for(let k=0;k<3;k++) {
    min[k]=Math.floor((Math.min(...points.map(p=>p[k]))-1e-7)/cellSize);
    max[k]=Math.floor((Math.max(...points.map(p=>p[k]))+1e-7)/cellSize);
  }
  for(let x=min[0];x<=max[0];x++) for(let y=min[1];y<=max[1];y++) for(let z=min[2];z<=max[2];z++) {
    const key=cellKey(x,y,z);
    if(!cells.has(key)) cells.set(key,[]);
    cells.get(key).push(tri);
  }
}
for(let i=0;i<rows.length-1;i++) {
  const a=rows[i], b=rows[i+1], delta=subtract(b.centre,a.centre), along=normalize(delta);
  const near=triangle(a.left,a.right,b.right,along,a.station,b.station,true,a.id);
  const far=triangle(a.left,b.right,b.left,along,a.station,b.station,false,a.id);
  spans.push({near,far,delta,inverse:1/dot(delta,delta)});
  if(a.connected) {
    register(near,[a.left,a.right,b.right]); register(far,[a.left,b.right,b.left]);
  }
}
function indexAt(s) {
  let lo=0, hi=rows.length-1;
  while(hi-lo>1) {
    const mid=(lo+hi)>>1;
    if(s<rows[mid].station) hi=mid; else lo=mid;
  }
  return lo;
}
function makeFrame(tri,bu,bv,connected) {
  return {point:add(tri.a,add(scale(tri.u,bu),scale(tri.v,bv))),normal:tri.normal,tangent:tri.heading,lateral:tri.lateral,
    offset:(2*(tri.upper ? bu+bv : bu)-1)*halfWidth,station:tri.s0+(tri.s1-tri.s0)*(tri.upper ? bv : bu+bv),
    id:tri.id,material:connected?'magnetic':'ordinary',supported:connected};
}
function at(i,s,offset) {
  const span=spans[i],d=clamp((s-rows[i].station)/(rows[i+1].station-rows[i].station),0,1);
  const l=clamp((offset+halfWidth)/(2*halfWidth),0,1);
  return l>=d ? makeFrame(span.near,l-d,d,rows[i].connected) : makeFrame(span.far,l,d-l,rows[i].connected);
}
function frame(s,offset=0) {
  if(!Number.isFinite(s)||!Number.isFinite(offset)) throw RangeError('Invalid Orbital station or offset');
  return at(indexAt(s),s,offset);
}
function probe(position,direction,reach,hint) {
  const [x,y,z]=finiteVector(position,3,'probe position'),[dx,dy,dz]=finiteVector(direction,3,'probe direction');
  if(Math.abs(Math.hypot(dx,dy,dz)-1)>1e-8 ||
    !Number.isFinite(reach) || reach<0 || reach>64) throw RangeError('Invalid Orbital surface probe');
  if(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>2500) return null;
  const ex=x+dx*reach, ey=y+dy*reach, ez=z+dz*reach;
  let best=null, nearest=reach+1e-8,bu=0,bv=0;
  for(let ix=Math.floor(Math.min(x,ex)/cellSize);ix<=Math.floor(Math.max(x,ex)/cellSize);ix++)
    for(let iy=Math.floor(Math.min(y,ey)/cellSize);iy<=Math.floor(Math.max(y,ey)/cellSize);iy++)
      for(let iz=Math.floor(Math.min(z,ez)/cellSize);iz<=Math.floor(Math.max(z,ez)/cellSize);iz++) {
        const tris=cells.get(cellKey(ix,iy,iz));
        if(!tris) continue;
        for(const tri of tris) {
          const n=tri.normal, den=dx*n[0]+dy*n[1]+dz*n[2];
          if(den>=-1e-10) continue;
          const ax=x-tri.a[0],ay=y-tri.a[1],az=z-tri.a[2];
          const d=-(ax*n[0]+ay*n[1]+az*n[2])/den;
          if(d< -1e-9 || d>reach+1e-9 || d>nearest+1e-9) continue;
          const px=ax+dx*d,py=ay+dy*d,pz=az+dz*d;
          const u=px*tri.bu[0]+py*tri.bu[1]+pz*tri.bu[2],v=px*tri.bv[0]+py*tri.bv[1]+pz*tri.bv[2];
          if(u< -1e-9 || v< -1e-9 || u+v>1+1e-9) continue;
          if(best && Math.abs(d-nearest)<=1e-9 && !(tri.id===hint?.id && best.id!==hint.id)) continue;
          best=tri; nearest=d; bu=u; bv=v;
        }
      }
  return best ? {...makeFrame(best,bu,bv,true),distance:clamp(nearest,0,reach)} : null;
}
// Restrict the ranking projection to the driver's continuous neighbourhood.
// A crossing on another storey has its own station. Wheel probes still search
// actual world space independently of any progress hint.
function projectNear(p,last) {
  finiteVector(p,3,'body position');
  if(!Number.isFinite(last) || p.some(n=>Math.abs(n)>1e6)) throw RangeError('Invalid Orbital progress');
  let best=Infinity,nearest=indexAt(last),fraction=0;
  const end=indexAt(last+12);
  for(let i=indexAt(last-12);i<=end;i++) {
    const c=rows[i].centre, d=spans[i].delta, delta=subtract(p,c);
    const f=clamp(dot(delta,d)*spans[i].inverse,0,1), gap=subtract(delta,scale(d,f)), error=dot(gap,gap);
    if(error<best) {nearest=i;fraction=f;best=error;}
  }
  const a=rows[nearest], b=rows[nearest+1];
  const centre=add(a.centre,scale(spans[nearest].delta,fraction));
  const side=normalize(add(scale(a.across,1-fraction),scale(b.across,fraction)));
  const offset=dot(subtract(p,centre),side);
  return {...at(nearest,a.station+(b.station-a.station)*fraction,offset),offset};
}
function sample(s,l=0) {
  const f=frame(s,l);
  return {...f,s:f.station,x:f.point[0],y:f.point[1],z:f.point[2],tx:f.tangent[0],tz:f.tangent[2],
    rx:f.lateral[0],rz:f.lateral[2],yaw:Math.atan2(-f.tangent[0],-f.tangent[2]),lateral:l};
}
const middle=id=>{const p=sections.find(p=>p.id===id);return (p.start+p.end)/2;};
const gateStations=[0,middle('azimuth-bank'),middle('magnet-apron'),middle('antenna-wall'),middle('inverted-spine'),
  middle('earthward-wall'),middle('launch-apron'),sections.find(p=>p.id==='catch-deck').end-8,finishStation];
const gates=Object.freeze(gateStations.map(s=>{
  const f=frame(s);
  return Object.freeze({...f,point:Object.freeze(f.point),s});
}));
export const orbital=Object.freeze({id:'orbital',name:'Orbital Spine',discipline:'rocket',closed:false,startS,endS,
  length:finishStation,halfWidth,railOffset,railHeight,barrierOffset:railOffset,rows:Object.freeze(rows),sections:Object.freeze(sections),
  gates,frame,sample,probe,surface:Object.freeze({probe}),projectNear});
