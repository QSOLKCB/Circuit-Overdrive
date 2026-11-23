// SPDX-License-Identifier: Apache-2.0
import { seededRandom } from '../vendor/vanillajs/modules/math/index.js';
import { track } from './track.js';
import { box, lettering, local, quad, triangle } from './geometry.js';

const INK = [.045,.074,.11], BLUE = [.035,.31,.55], GOLD = [1,.61,.085];
const CREAM = [.93,.91,.78], ALLOY = [.48,.57,.61], RED = [.88,.12,.065];
const TURF = [.29,.53,.19];
const up = [0,1,0];
function roadPoint(s, lateral, raised=0) {
  const p = track.sample(s,lateral);
  return [p.x,p.y+raised,p.z];
}
function ribbon(out, from, to, left, right, lift, color) {
  if (right < left) [left,right] = [right,left];
  const a = roadPoint(from,left,lift), b = roadPoint(from,right,lift);
  const c = roadPoint(to,right,lift), d = roadPoint(to,left,lift);
  quad(out,a,b,c,d,color);
}

function roadSlice(road, field, details, from, to, columns, section, dashStart, dashEnd) {
  const width = track.halfWidth, wall = track.barrierOffset;
  for (let j=0; j<columns; j++) {
    const left = width*(2*j/columns-1), right = width*(2*(j+1)/columns-1);
    ribbon(road,from,to,left,right,0,[.224,.245,.264]);
  }
  for (const side of [-1,1]) {
    const lo=side*width, outer=side*wall;
    ribbon(details,from,to,lo-side*.32,lo,.016,CREAM);
    ribbon(details,from,to,lo,lo+side*.82,.012,section%2 ? CREAM : RED);
    ribbon(road,from,to,lo+side*.82,outer,.001,[.43,.46,.43]);
    // Inner barrier face sits exactly at the simulation boundary.
    const a=roadPoint(from,outer), b=roadPoint(to,outer);
    const A=roadPoint(from,outer,1), B=roadPoint(to,outer,1);
    const p=track.sample(from);
    quad(details,a,b,B,A,section%8 < 2 ? BLUE : [.68,.72,.70],[-side*p.rx,0,-side*p.rz]);
    ribbon(details,from,to,outer,outer+side*.4,1,[.8,.82,.78]);
    // Sloping embankment joins the broad flat field even under the banking.
    const farA=roadPoint(from,outer+side*9), farB=roadPoint(to,outer+side*9);
    farA[1]=farB[1]=-1.75;
    quad(field,a,b,farB,farA,section%8<4 ? TURF : [.32,.56,.21],up);
    const start=Math.max(from,dashStart), end=Math.min(to,dashEnd);
    if (section%3===0 && end>start) {
      ribbon(details,start,end,side*width/3-.105,side*width/3+.105,.018,[.69,.71,.69]);
    }
  }
}

function makeCourse(road, field, details) {
  const width = track.halfWidth;
  const sections = Math.ceil(track.length/5);
  for (let i=0; i<sections; i++) {
    const s = track.length*i/sections, next = track.length*(i+1)/sections;
    // Where the bank changes, the two road edges have different grades.
    // Sample the twisted surface at tyre-scale intervals across the ribbon.
    const changingBank = track.sample(s).bank !== track.sample(next).bank;
    const rows = changingBank ? 3 : 1, columns = changingBank ? 12 : 1;
    for (let row=0; row<rows; row++) {
      const from = s+(next-s)*row/rows, to = s+(next-s)*(row+1)/rows;
      roadSlice(road,field,details,from,to,columns,i,s+.4,next-.8);
    }
  }
  for (let row=0; row<2; row++) {
    const count=32, unit=width*2/count;
    for (let k=0; k<count; k++)
      ribbon(details,row*unit,(row+1)*unit,-width+k*unit,-width+(k+1)*unit,.03,(row+k)%2 ? INK : CREAM);
  }
  for (let row=0; row<5; row++) for (const side of [-1,1]) {
    const s=-5-9*row+(side<0 ? 0 : -3), mid=side*3.5;
    ribbon(details,s,s+.15,mid-1.6,mid+1.6,.025,CREAM);
    for (const end of [-1,1]) ribbon(details,s-1.2,s,mid+end*1.6-.075,mid+end*1.6+.075,.025,CREAM);
  }
}

function gantry(details) {
  const p = track.sample(0), at=(x,y,z)=>local(p,x,y,z), wall=track.barrierOffset;
  for (const side of [-1,1]) {
    for (const z of [-.65,.65]) box(details,at,[side*(wall+1.3),3.9,z],[.48,8,.46],ALLOY);
    box(details,at,[side*(wall+1.3),1.25,0],[1.5,2.55,2.5],BLUE);
  }
  box(details,at,[0,7.7,0],[(wall+2)*2,2.25,1.65],INK);
  box(details,at,[0,8.85,0],[(wall+2)*2,.16,1.75],GOLD);
  for (const face of [-1,1]) {
    const faceAt=(x,y)=>at(face<0?x:-x,y,face*.84);
    lettering(details,'OVERDRIVE',.26,(x,y)=>faceAt(x,7.07+y),CREAM);
    for (const side of [-1,1]) for(let i=0;i<7;i++) for(let j=0;j<3;j++) {
      if((i+j)%2)continue;
      const x=side*(9.2+i*.53), y=6.91+j*.53;
      quad(details,faceAt(x,y),faceAt(x+.53,y),faceAt(x+.53,y+.53),faceAt(x,y+.53),CREAM);
    }
  }
}

// Multi-tier race stands beside the grid. Coloured seat blocks and the canopy
// break up their profile at speed without modelling thousands of spectators.
function stands(out, s, side) {
  const p=track.sample(s), at=(x,y,z)=>local(p,side*(track.barrierOffset+6+x),y,z);
  for(let i=0;i<6;i++){
    box(out,at,[i*1.35,(-1.2+i*.68)/2,0],[1.35,4+i*.68,32],i%2 ? [.31,.56,.62] : [.68,.74,.68]);
    for(let j=-14;j<=14;j+=3.5)
      box(out,at,[i*1.35,i*.68+1.65,j],[.75,.52,2.8],(j+i)%3<1 ? BLUE : CREAM);
  }
  for(const dz of [-14,0,14]) box(out,at,[7.8,4.6,dz],[.42,13,.5],INK);
  box(out,at,[3.2,10.45,0],[10.6,.45,34],BLUE);
  box(out,at,[-2.05,10.52,0],[.23,.68,34],CREAM);
}

function pine(out,x,y,z,h,rng) {
  const radius=h*(.19+rng()*.055), arms=6, twist=rng()*3;
  const leaf=[.08+rng()*.05,.235+rng()*.09,.135+rng()*.04];
  // Three angular needle skirts; trunks end just inside the first skirt.
  const levels=[[0,.29,.14,.14],[.18,.64,1,.04],[.39,.86,.81,.035],[.61,1,.60,0]];
  for(let k=0;k<levels.length;k++) {
    const [lo,hi,wide,narrow]=levels[k];
    const ring=(a,height,r)=>[x+Math.cos(a)*r*radius,y+h*height,z+Math.sin(a)*r*radius];
    for(let i=0;i<arms;i++){
      const a=twist+2*Math.PI*i/arms, b=twist+2*Math.PI*(i+1)/arms;
      const color=k ? leaf.map(v=>v*(.87+.065*k)) : [.30,.21,.145];
      const lowA=ring(a,lo,wide), lowB=ring(b,lo,wide), highA=ring(a,hi,narrow);
      if (!narrow) triangle(out,lowB,lowA,highA,color);
      else quad(out,lowB,lowA,highA,ring(b,hi,narrow),color);
    }
  }
}

function trackSigns(out) {
  for (const [fraction,word,side] of [[.23,'APEX',-1],[.49,'PINERY',1],[.78,'APEX',-1]]) {
    const p=track.sample(track.length*fraction);
    const at=(x,y,z)=>local(p,side*(track.barrierOffset+5)+x,y,z);
    for (const x of [-2.9,2.9]) box(out,at,[x,1.8,0],[.25,5.4,.25],ALLOY);
    box(out,at,[0,4,0],[8,2.8,.21],BLUE);
    box(out,at,[0,2.6,0],[8.3,.18,.25],GOLD);
    lettering(out,word,.28,(x,y)=>at(x,3.3+y,-.12),CREAM);
  }
  // Three pairs of start-straight pennants signal the return to the grid.
  for(const side of [-1,1]) for(const s of [-82,-68,-54]) {
    const p=track.sample(s,side*(track.barrierOffset+2.6));
    const at=(x,y,z)=>local(p,x,y,z);
    box(out,at,[0,3.7,0],[.12,8.2,.12],ALLOY);
    const tip=at(side*.55,6.37,2.4);
    triangle(out,at(0,7.74,0),at(0,5.75,0),tip,s===-68 ? GOLD : BLUE,[0,.1,1]);
  }
}

function fieldBoulders(out,x,z,size,rng) {
  const ring=[];
  const sides=7, phase=rng()*3;
  for(let i=0;i<sides;i++) {
    const angle=phase+i*2*Math.PI/sides;
    const r=size*(.68+.26*rng());
    ring.push([[x+Math.cos(angle)*r,-1.79,z+Math.sin(angle)*r],
      [x+Math.cos(angle)*r*.61,-1.78+r*(.35+.12*rng()),z+Math.sin(angle)*r*.67]]);
  }
  const summit=[x-size*.18,-1.8+size*.56,z+size*.11];
  for(let i=0;i<sides;i++) {
    const [a,A]=ring[i], [b,B]=ring[(i+1)%sides];
    quad(out,b,a,A,B,[.45,.47,.39]);
    triangle(out,B,A,summit,[.53,.55,.47]);
  }
}

function directionBoards(out) {
  for(let s=43; s<track.length; s+=68) {
    const p=track.sample(s), t=track.sample(s+40);
    const bend=(t.tx*p.rx+t.tz*p.rz);
    if (Math.abs(bend)<.11) continue;
    const side=-Math.sign(bend), at=(x,y,z)=>local(p,side*(track.barrierOffset+2.2)+x,y,z);
    for (const x of [-1.9,1.9]) box(out,at,[x,1.4,0],[.16,3.4,.16],ALLOY);
    box(out,at,[0,3.15,0],[5.2,1.8,.18],INK);
    for(const x of [-1.65,0,1.65]) {
      const point=(dx,y)=>at(x-side*dx,3.15+y,-.115);
      quad(out,point(-.6,.68),point(.08,.68),point(.65,0),point(0,0),GOLD);
      quad(out,point(0,0),point(.65,0),point(.08,-.68),point(-.6,-.68),GOLD);
    }
  }
}

// Linked mountain silhouettes and shaded facets form a complete horizon so
// every corner has terrain at a distance. The seed is local to decoration.
function mountains(out, centerX, centerZ, rng) {
  for(const [radius,low,relief,baseColor,snow] of [
    [970,82,157,[.33,.44,.57],true], [765,29,90,[.26,.43,.42],false],
    [625,7,60,[.27,.44,.29],false]
  ]) {
    const ring=[];
    const count=64;
    for(let i=0;i<count;i++){
      const a=2*Math.PI*i/count, r=radius*(.975+.055*rng());
      const h=low+relief*(.15+.44*rng()+.35*(.5+.5*Math.cos(7*a+.6))+.26*(.5+.5*Math.sin(3*a)));
      const point=(d,y,angle=a)=>[centerX+Math.cos(angle)*d,y,centerZ+Math.sin(angle)*d];
      ring.push({base:point(r-120,-3),shoulder:point(r-52,.48*h,a-.018),peak:point(r,h)});
    }
    for(let i=0;i<count;i++){
      const p=ring[i], q=ring[(i+1)%count], tint=baseColor.map(k=>k*(.78+.23*rng()));
      triangle(out,p.base,p.shoulder,q.base,tint,up);
      triangle(out,q.base,p.shoulder,q.shoulder,baseColor,up);
      if(snow && p.peak[1]>179) {
        // Partition the rock face along the snow line to avoid distant z-fighting.
        const mix=(a,b,t)=>a.map((v,j)=>v+(b[j]-v)*t);
        const notch=mix(p.peak,p.shoulder,.38+rng()*.24), ridge=mix(p.peak,q.peak,.86);
        triangle(out,p.peak,notch,ridge,[.80,.84,.81],up);
        quad(out,p.shoulder,notch,ridge,q.peak,tint,up);
        triangle(out,p.shoulder,q.peak,q.shoulder,tint,up);
      } else {
        quad(out,p.shoulder,p.peak,q.peak,q.shoulder,tint,up);
      }
    }
  }
}

export function speedwayBatches() {
  const road=[], field=[], details=[], landscape=[];
  const rng=seededRandom(27001);
  makeCourse(road,field,details);
  quad(field,[-1600,-1.8,-1600],[1800,-1.8,-1600],[1800,-1.8,1600],[-1600,-1.8,1600],TURF,up);
  gantry(details);
  stands(details,-23,-1);
  stands(details,19,-1);
  directionBoards(details);
  trackSigns(details);
  let cx=0,cz=0;
  for (let i=0;i<64;i++) {
    const p=track.sample(track.length*i/64);
    cx+=p.x/64; cz+=p.z/64;
  }
  mountains(landscape,cx,cz,rng);
  for (let i=0;i<166;i++) {
    const s=rng()*track.length, side=rng()<.52 ? -1 : 1;
    if(side<0 && Math.min(s,track.length-s)<56)continue;
    const p=track.sample(s);
    const offset=side*(track.barrierOffset+13+rng()**1.3*90);
    const x=p.x+p.rx*offset,z=p.z+p.rz*offset;
    if(Math.abs(track.project(x,z).lateral)<track.barrierOffset+10) continue;
    if(i%7===0) fieldBoulders(landscape,x,z,4+rng()*5,rng);
    else pine(landscape,x,-1.8,z,7+rng()*15,rng);
  }
  return [
    [field,{roughness:1,pattern:'grass',patternScale:.26}],
    [road,{roughness:.96,pattern:'asphalt',patternScale:.54}],
    [details,{roughness:.89}], [landscape,{roughness:1}]
  ].map(([data,material])=>({vertices:new Float32Array(data),material}));
}
