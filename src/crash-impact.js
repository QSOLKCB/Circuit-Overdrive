// SPDX-License-Identifier: Apache-2.0
// Planar time-of-impact authority for the flat test pad. SI, +Y yaw, -Z forward.
import {clamp} from '../vendor/vanillajs/modules/math/index.js';
import {vehiclePreset,validateVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';

export const LAB_RULES=1, LAB_STEP=1/60, DRIVE_CAP=120;
export const labRecipe=validateVehicle(vehiclePreset('arcade'));
const {mass,inertia,chassis}=labRecipe, yawInertia=inertia[1];
const radius=chassis.width/2, tip=chassis.length/2-radius;
const stations=[-tip,0,tip];
const skin=.002, tolerance=1e-8, releaseGap=.035;
const MAX_PASSES=24, MAX_SWEEP=40;
const restitution=.14, friction=.24;
const validId=n=>Number.isSafeInteger(n) && n>=0 && n<=255;
const limited=(v,limit)=>Number.isFinite(v) && Math.abs(v)<=limit;

export function crashCar(id,{x=0,z=0,yaw=0,vx=0,vz=0,spin=0}={}) {
  if (!validId(id) || ![x,z].every(v=>limited(v,1000)) || !limited(yaw,2*Math.PI) ||
      !Number.isFinite(Math.hypot(vx,vz)) || Math.hypot(vx,vz)>DRIVE_CAP || !limited(spin,12))
    throw RangeError('Invalid laboratory car');
  return {id,x,z,yaw,vx,vz,spin};
}

export function crashBarrier(id,x1,z1,x2,z2,r,material='concrete') {
  const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);
  if (!validId(id) || ![x1,z1,x2,z2].every(v=>limited(v,1000)) || length<.01 ||
      !Number.isFinite(r) || r<.005 || r>3 || !['concrete','steel'].includes(material))
    throw RangeError('Invalid laboratory fixture');
  return Object.freeze({id,x1,z1,x2,z2,dx,dz,length,r,material});
}

export function impactWorld(cars,barriers=[],revision=null) {
  const ids=[...cars,...barriers].map(o=>o.id);
  if (cars.length<1 || cars.length>4 || barriers.length>8 || new Set(ids).size!==ids.length ||
      (revision!==null && (typeof revision!=='string' || !/^[0-9a-f]{40}$/.test(revision))))
    throw RangeError('Invalid impact world');
  const sorted=items=>items.slice().sort((a,b)=>a.id-b.id);
  const bodies=sorted(cars), fixtures=sorted(barriers), pairs=[];
  for (const a of bodies) {
    for (const b of bodies) if (a.id<b.id) pairs.push({a,b,wall:false,active:false});
    for (const b of fixtures) pairs.push({a,b,wall:true,active:false});
  }
  pairs.sort((p,q)=>p.a.id-q.a.id || p.b.id-q.b.id);
  return {cars:bodies,barriers:fixtures,pairs,tick:0,revision};
}

function centre(car,station,t) {
  const angle=car.yaw+t*car.spin;
  return [car.x+t*car.vx+Math.sin(angle)*station,car.z+t*car.vz+Math.cos(angle)*station];
}

// Signed distance and closest surface witnesses for one disc pair or disc/capsule.
function sample(pair,i,j,t) {
  const {a,b,wall}=pair;
  const [ax,az]=centre(a,i,t);
  let bx,bz;
  if (wall) {
    const u=clamp(((ax-b.x1)*b.dx+(az-b.z1)*b.dz)/(b.length*b.length),0,1);
    bx=b.x1+u*b.dx; bz=b.z1+u*b.dz;
  } else [bx,bz]=centre(b,j,t);
  const dx=ax-bx,dz=az-bz,d=Math.hypot(dx,dz);
  const nx=d>1e-12 ? dx/d : wall ? -b.dz/b.length : 1;
  const nz=d>1e-12 ? dz/d : wall ? b.dx/b.length : 0;
  const gap=d-radius-(wall ? b.r : radius);
  return {gap,nx,nz,x:ax-nx*(radius+gap/2),z:az-nz*(radius+gap/2)};
}

// The current separating plane remains valid until relative translation and tip
// rotation can close its gap. An unresolved interval stops at its last safe pose.
function sweep(pair,i,j,duration) {
  const {a,b,wall}=pair;
  const vx=a.vx-(wall ? 0 : b.vx),vz=a.vz-(wall ? 0 : b.vz);
  const rotation=Math.abs(i*a.spin)+(wall ? 0 : Math.abs(j*b.spin));
  let t=0;
  for (let iteration=0;iteration<MAX_SWEEP;iteration++) {
    const hit=sample(pair,i,j,t);
    if (hit.gap<=tolerance) return {t,hit};
    const closure=rotation-vx*hit.nx-vz*hit.nz;
    if (closure<=0 || hit.gap>closure*(duration-t)+tolerance) return null;
    t+=hit.gap/closure;
    if (t>duration) return null;
  }
  return {t,limited:true};
}

function advance(cars,t) {
  for (const car of cars) {
    car.x+=car.vx*t; car.z+=car.vz*t;
    car.yaw+=car.spin*t;
  }
}
export const kinetic=car=>(mass*(car.vx**2+car.vz**2)+yawInertia*car.spin**2)/2;

function contactVelocity(car,x,z) {
  return [car.vx+car.spin*(z-car.z),car.vz-car.spin*(x-car.x)];
}
function lever(car,hit,nx,nz) {return (hit.z-car.z)*nx-(hit.x-car.x)*nz;}
function inverseMass(pair,hit,nx,nz) {
  const from=car=>1/mass+lever(car,hit,nx,nz)**2/yawInertia;
  return from(pair.a)+(pair.wall ? 0 : from(pair.b));
}
function impulse(car,hit,nx,nz,j) {
  car.vx+=nx*j/mass; car.vz+=nz*j/mass;
  car.spin+=lever(car,hit,nx,nz)*j/yawInertia;
}
function localSite(car,hit) {
  const dx=hit.x-car.x,dz=hit.z-car.z,c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  const x=c*dx-s*dz,z=s*dx+c*dz;
  const zone=Math.abs(x)/radius>Math.abs(z)/(chassis.length/2) ? (x<0?'left':'right') : (z<0?'front':'rear');
  return {id:car.id,x,z,zone};
}

function resolve(world,pair,hit,elapsed,ordinal) {
  const {a,b,wall}=pair, {nx,nz,x,z}=hit, tx=-nz,tz=nx;
  const relative=()=>{
    const va=contactVelocity(a,x,z), vb=wall ? [0,0] : contactVelocity(b,x,z);
    return [va[0]-vb[0],va[1]-vb[1]];
  };
  const apply=(ux,uz,j)=>{
    impulse(a,hit,ux,uz,j);
    if (!wall) impulse(b,hit,ux,uz,-j);
  };
  const before=relative(), closing=-(before[0]*nx+before[1]*nz);
  let contact=null;
  // Deep initial intersections have no observed entry direction. Project only.
  if (closing>1e-7 && hit.gap>=-skin) {
    const effectiveMass=1/inverseMass(pair,hit,nx,nz);
    const normalImpulse=(1+(pair.active?0:restitution))*closing*effectiveMass;
    const energy=()=>kinetic(a)+(wall ? 0 : kinetic(b));
    const preKinetic=energy(),sites=[localSite(a,hit)];
    if (!wall) sites.push(localSite(b,hit));
    apply(nx,nz,normalImpulse);
    const slide=relative();
    const tangentialImpulse=clamp(-(slide[0]*tx+slide[1]*tz)/inverseMass(pair,hit,tx,tz),
      -friction*normalImpulse,friction*normalImpulse);
    apply(tx,tz,tangentialImpulse);
    const postKinetic=energy();
    contact={id:[world.tick,a.id,b.id,ordinal].join('/'),tick:world.tick,time:elapsed,
      rules:LAB_RULES,revision:world.revision,participants:[a.id,b.id],kind:wall?'fixed':'vehicle',
      material:wall?b.material:'bodywork',point:[x,z],normal:[nx,nz],relativeVelocity:before,
      relativeSpeed:Math.hypot(...before),closing,normalImpulse,tangentialImpulse,effectiveMass,
      normalEnergy:.5*effectiveMass*closing**2,preKinetic,postKinetic,
      dissipated:Math.max(0,preKinetic-postKinetic),sites,newImpact:!pair.active};
    pair.active=true;
  }
  const correction=Math.min(.1,skin-hit.gap)/(wall?1:2);
  a.x+=correction*nx; a.z+=correction*nz;
  if (!wall) {b.x-=correction*nx; b.z-=correction*nz;}
  return contact;
}

export function stepImpacts(world) {
  world.tick++;
  const contacts=[],stats={passes:0,candidates:0,accepted:0,limited:false};
  let elapsed=0;
  for (let pass=0;pass<MAX_PASSES;pass++) {
    stats.passes++;
    let first=null;
    const remaining=LAB_STEP-elapsed;
    for (const pair of world.pairs) {
      let gap=Infinity;
      for (const i of stations) for (const j of pair.wall ? [0] : stations) {
        stats.candidates++;
        if (pair.active) gap=Math.min(gap,sample(pair,i,j,0).gap);
        const candidate=sweep(pair,i,j,remaining);
        if (candidate && (!first || candidate.t<first.t)) first={...candidate,pair};
      }
      if (gap>releaseGap) pair.active=false;
    }
    if (!first) {advance(world.cars,remaining); return {contacts,stats};}
    advance(world.cars,first.t); elapsed+=first.t;
    if (first.limited) break;
    const contact=resolve(world,first.pair,first.hit,elapsed,contacts.length);
    if (contact) {contacts.push(contact); stats.accepted++;}
  }
  stats.limited=true;
  return {contacts,stats};
}
