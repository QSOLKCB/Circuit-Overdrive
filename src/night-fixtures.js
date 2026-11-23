// SPDX-License-Identifier: Apache-2.0
import {seededRandom} from '../vendor/vanillajs/modules/math/index.js';
import {box, lettering, local, quad, triangle} from './geometry.js';

const ICE=[.34,.84,1], PINK=[1,.18,.51], AMBER=[1,.56,.15];
const IVORY=[1,.91,.67], RED=[1,.080,.040], STEEL=[.25,.33,.41], INK=[.06,.09,.16];
const CELL=50;

// Place fixtures in station coordinates. Sampling the lateral offset matters on
// the banking and on Ridge's graded approach, deck, tunnel and runoff.
function mounted(course,s,l) {
  const frame=course.sample(s,l);
  return (x,y,z)=>local(frame,x,y,z);
}

function addPitLane(c,solid,lit,addLight) {
  for (const s of [-39,-23,-7,9,25]) {
    const at=mounted(c,s,c.barrierOffset+8);
    // Open-front service bays, roof fascia, two vertical work lights.
    box(solid,at,[2.2,2.1,0],[.42,4.2,14],STEEL);
    for(const z of [-6.9,6.9]) box(solid,at,[0,2.1,z],[5.0,4.2,.24],INK);
    box(solid,at,[0,4.2,0],[6,.46,14.7],STEEL);
    box(lit,at,[-3.04,4.2,0],[.12,.24,14.6],PINK);
    for(const z of [-5.9,5.9]) box(lit,at,[1.94,2,z],[.10,2.9,.22],ICE);
    addLight(at(-3.1,4,0),ICE,29,2.4);
  }
  // Place the light bars directly under the two existing stand canopies.
  for(const s of [-23,19]) {
    const f=c.sample(s), at=(x,y,z)=>local(f,-(c.barrierOffset+6+x),y,z);
    for(const z of [-12,0,12]) {
      box(lit,at,[-2.04,10.12,z],[.35,.18,6.2],IVORY);
      addLight(at(-2.0,10,z),IVORY,33,5.4);
    }
  }
  // A second, thin timing ribbon above the original chequered gantry.
  const at=mounted(c,0,0);
  box(solid,at,[0,9.72,0],[20.2,1.55,.75],INK);
  for(const face of [-1,1]) {
    lettering(lit,'NIGHTSHIFT',.205,(x,y)=>at(-face*x,9.18+y,face*.39),ICE);
    for(const side of [-1,1]) box(lit,at,[side*7.78,9.34,face*.39],[3.65,.11,.06],PINK);
  }
}

function neonSign(course,s,side,word,color,solid,lit) {
  const at=mounted(course,s,side*(course.barrierOffset+9));
  for(const x of [-4.7,4.7]) box(solid,at,[x,2.5,0],[.31,6,.39],STEEL);
  box(solid,at,[0,5.3,0],[10.5,3.1,.58],INK);
  for(const face of [-1,1]) {
    lettering(lit,word,.37,(x,y)=>at(-face*x,4.52+y,face*.31),color);
    box(lit,at,[0,3.82,face*.31],[10.3,.13,.06],color);
  }
}

function cornerBoard(c,s,side,solid,lit,tint) {
  const at=mounted(c,s,side*(c.barrierOffset+3.5));
  box(solid,at,[0,2.0,0],[.19,4,.24],STEEL);
  box(solid,at,[0,3.0,0],[4.4,1.72,.23],INK);
  for(const sign of [-1,1]) for(const x of [-1.18,.36]) {
    const p=(u,h)=>at(x-side*u,3+h,sign*.125);
    quad(lit,p(-.45,.63),p(.1,.63),p(.65,0),p(.1,0),tint);
    quad(lit,p(.1,0),p(.65,0),p(.10,-.63),p(-.45,-.63),tint);
  }
}

function speedwayFixtures(c,solid,lit,addLight) {
  addPitLane(c,solid,lit,addLight);
  for(const [fraction,word,side,tint] of [[.165,'ION',-1,ICE],[.42,'HEXA',-1,PINK],[.75,'VANTA',-1,ICE]])
    neonSign(c,c.length*fraction,side,word,tint,solid,lit);
  for(let s=63;s<c.length-55;s+=76) {
    const frame=c.sample(s),ahead=c.sample(s+38);
    const turn=ahead.tx*frame.rx+ahead.tz*frame.rz;
    const side=Math.abs(turn)>.12 ? -Math.sign(turn) : 1;
    const at=mounted(c,s,side*(c.barrierOffset+2));
    box(solid,at,[0,6.4,0],[.26,13.3,.26],STEEL);
    box(solid,at,[-side,12.9,0],[2.35,.28,.36],STEEL);
    box(lit,at,[-side*2.04,12.72,0],[1.1,.21,1.9],IVORY);
    addLight(at(-side*2.04,12.65,0),IVORY,39,4.8);
    if(Math.abs(turn)>.12) cornerBoard(c,s+7,side,solid,lit,AMBER);
  }
  for(let i=0,n=Math.ceil(c.length/18);i<n;i++) for(const side of [-1,1]){
    const at=mounted(c,i*c.length/n,side*(c.barrierOffset+.20));
    box(lit,at,[0,1.13,0],[.23,.18,1.34],i%3===0 ? RED : ICE);
  }
}

function ridgeFixtures(c,solid,lit,addLight) {
  const [bridge,endBridge]=c.features.bridge, [tunnel,endTunnel]=c.features.tunnel;
  for(let s=c.startS+7;s<c.endS;s+=24) for(const side of [-1,1]) {
    const at=mounted(c,s,side*(c.barrierOffset+.48));
    box(solid,at,[0,.91,0],[.20,1.8,.20],STEEL);
    box(lit,at,[0,1.65,0],[.22,.27,.25],side<0 ? ICE : AMBER);
  }
  for(let s=51,i=0;s<c.length;s+=144,i++) {
    if ((s>=bridge-15 && s<=endBridge+15) || (s>=tunnel-15 && s<=endTunnel+15)) continue;
    const side=i%2 ? 1 : -1, at=mounted(c,s,side*(c.barrierOffset+1.15));
    box(solid,at,[0,4.0,0],[.18,8.2,.18],STEEL);
    box(solid,at,[-side*.82,8.05,0],[1.77,.13,.17],STEEL);
    box(lit,at,[-side*1.6,7.91,0],[.75,.17,1.12],AMBER);
    addLight(at(-side*1.6,7.8,0),AMBER,32,5);
    const here=c.sample(s),ahead=c.sample(s+37);
    const turn=ahead.tx*here.rx+ahead.tz*here.rz;
    if (Math.abs(turn)>.18) cornerBoard(c,s+8,-Math.sign(turn),solid,lit,AMBER);
  }
  // Deck beacons are fastened to the foot of the steel arch at each panel.
  for(let j=0;j<=18;j++) for(const side of [-1,1]){
    const s=bridge+(endBridge-bridge)*j/18, at=mounted(c,s,side*(c.barrierOffset+1.2));
    const arch=7.4+23*Math.sin(j*Math.PI/18);
    box(lit,at,[0,arch+.59,0],[.96,.32,1.2],j%3===0 ? AMBER : ICE);
    box(lit,at,[-side*.23,4,0],[.17,3.24,.34],ICE);
    if(j%2===0) addLight(at(0,4,0),ICE,28,4.1);
  }
  // The vaulted shell has 17 panels. Its original luminaires are mounted
  // every other panel at lateral 11.9 and height 6.4 above the sloping deck.
  for(let j=0;j<17;j+=2) for(const side of [-1,1]){
    const s=tunnel+(endTunnel-tunnel)*j/17+3, at=mounted(c,s,side*11.9);
    box(lit,at,[-side*.28,6.43,0],[.11,.19,2.42],IVORY);
    addLight(at(0,6.22,0),IVORY,28,6);
  }
  for(const s of [tunnel-.35,endTunnel+.35]) for(const side of [-1,1]){
    const at=mounted(c,s,side*12.5);
    box(lit,at,[0,3.24,0],[.27,6.46,.28],AMBER);
  }
}

// One-time vertex lighting. Bound each point source to its world-space sphere
// and index it by the cells its radius overlaps. All source geometry is retained.
function lightIndex() {
  const cells=new Map();
  const key=(x,z)=>x+','+z;
  function add(pos,color,radius,power) {
    const source={pos,color,radius,power};
    for(let i=Math.floor((pos[0]-radius)/CELL);i<=Math.floor((pos[0]+radius)/CELL);i++)
      for(let j=Math.floor((pos[2]-radius)/CELL);j<=Math.floor((pos[2]+radius)/CELL);j++) {
        const k=key(i,j);
        if(!cells.has(k)) cells.set(k,[]);
        cells.get(k).push(source);
      }
  }
  function bake(v) {
    for(let i=0;i<v.length;i+=11){
      const lights=cells.get(key(Math.floor(v[i]/CELL),Math.floor(v[i+2]/CELL)));
      if(!lights) continue;
      const r=v[i+6],g=v[i+7],b=v[i+8];
      for(const {pos,color,radius,power} of lights){
        const dx=pos[0]-v[i],dy=pos[1]-v[i+1],dz=pos[2]-v[i+2];
        const ds=dx*dx+dy*dy+dz*dz;
        if(ds>=radius*radius) continue;
        const d=Math.max(.15,Math.sqrt(ds));
        // Both sides of the original tunnel quads are visible in WebGL.
        const incidence=Math.abs((dx*v[i+3]+dy*v[i+4]+dz*v[i+5])/d);
        const gain=power*(1-d/radius)**2*(.35+.65*incidence);
        v[i+6]=Math.min(1,v[i+6]+gain*r*color[0]);
        v[i+7]=Math.min(1,v[i+7]+gain*g*color[1]);
        v[i+8]=Math.min(1,v[i+8]+gain*b*color[2]);
      }
    }
    return v;
  }
  return {add,bake};
}

function fixtureBatches(data,material,course) {
  // Sorted by station into ~240 m batches so the long sprint keeps its culling.
  const groups=new Map();
  for(let i=0;i<data.length;i+=33){
    const s=course.project(data[i],data[i+2]).s, key=Math.floor(s/240);
    if(!groups.has(key)) groups.set(key,[]);
    const out=groups.get(key);
    for(let k=i;k<i+33;k++) out.push(data[k]);
  }
  return Array.from(groups.values(),values=>{
    const vertices=new Float32Array(values), min=[Infinity,Infinity,Infinity], max=min.map(()=>-Infinity);
    for(let i=0;i<vertices.length;i+=11) for(let j=0;j<3;j++){
      min[j]=Math.min(min[j],vertices[i+j]); max[j]=Math.max(max[j],vertices[i+j]);
    }
    const [x,y,z]=max.map((v,k)=>(v+min[k])/2);
    const r=Math.hypot(x-min[0],y-min[1],z-min[2]);
    return {vertices,material,bounds:{x,y,z,r}};
  });
}

export function buildNightWorld(course,batches) {
  const solid=[],lit=[], lights=lightIndex();
  (course.closed ? speedwayFixtures : ridgeFixtures)(course,solid,lit,lights.add);
  const world=batches.map((batch,i)=>{
    const panorama=course.closed ? i===3 : i===0;
    if(panorama) return {...batch,receivesHeadlights:false};
    return {...batch,vertices:lights.bake(batch.vertices)};
  });
  for(const b of fixtureBatches(solid,{roughness:.82},course)) {
    lights.bake(b.vertices);
    world.push(b);
  }
  return world.concat(fixtureBatches(lit,{emission:1.1,roughness:.42},course));
}

// Distant pinpoints have fixed celestial directions. The scene centres the
// dome on the eye and draws it before opaque geometry, without depth writes.
export function nightStars(course) {
  const rng=seededRandom(course.closed ? 8827 : 8831), stars=[];
  for(let i=0;i<880;i++) {
    const y=.045+.95*rng(), a=rng()*2*Math.PI, r=Math.sqrt(1-y*y);
    const p=[1150*r*Math.cos(a),1150*y,1150*r*Math.sin(a)];
    const width=.63+1.9*rng()**3, tint=.48+.49*rng();
    const u=[-Math.sin(a)*width,0,Math.cos(a)*width];
    const v=[-y*Math.cos(a)*width,r*width,-y*Math.sin(a)*width];
    const at=(x,h)=>p.map((val,k)=>val+u[k]*x+v[k]*h);
    triangle(stars,at(-1,-.7),at(1,-.7),at(0,1.2),[tint*.87,tint*.91,tint],[0,1,0]);
  }
  return new Float32Array(stars);
}
