// SPDX-License-Identifier: Apache-2.0
import {add, clamp, dot, length, rotate, scale, subtract} from '../vendor/vanillajs/modules/math/index.js';
import {ROCKET_LIMITS} from './rocket-dynamics.js';

// Three overlapping spheres approximate the chassis. Each centre sweeps its
// previous-to-current chord. At the spin cap the chord error is under 2 mm.
export const RAIL_THICKNESS=.35;
const stations=[-1.22,0,1.22], radius=.87, diameter=radius*2;
const centre=(body,z)=>add(body.position,rotate(body.orientation,[0,0,z]));
function capSpeed(v) {
  const s=length(v);
  return s>ROCKET_LIMITS.maxSpeed ? scale(v,ROCKET_LIMITS.maxSpeed/s) : v;
}

function sweptPair(a,b) {
  if(length(subtract(a.vehicle.position,b.vehicle.position))>7) return;
  let first=null;
  for(const az of stations) for(const bz of stations) {
    const from=subtract(centre(a.previousBody,az),centre(b.previousBody,bz));
    const end=subtract(centre(a.vehicle,az),centre(b.vehicle,bz));
    const delta=subtract(end,from);
    const c=dot(from,from)-diameter**2, speed2=dot(delta,delta), approach=dot(from,delta);
    let t=0;
    if(c>0) {
      const disc=approach**2-speed2*c;
      if(approach>=0 || disc<0 || speed2<1e-14) continue;
      t=(-approach-Math.sqrt(disc))/speed2;
      if(t>1) continue;
    }
    const sep=add(from,scale(delta,t)), d=length(sep);
    const normal=d>1e-8 ? scale(sep,1/d) : [1,0,0];
    const overlap=diameter-dot(end,normal);
    if(overlap<=0 || (first && (t>first.t || (t===first.t && overlap<=first.overlap)))) continue;
    first={t,normal,overlap};
  }
  if(!first) return;
  const {normal,overlap}=first;
  const impulse=Math.max(0,-dot(subtract(a.vehicle.velocity,b.vehicle.velocity),normal))*.52;
  for(const [entrant,sign] of [[a,1],[b,-1]]) {
    const body=entrant.vehicle;
    entrant.vehicle={...body,position:add(body.position,scale(normal,sign*Math.min(1.5,overlap/2))),
      velocity:capSpeed(add(body.velocity,scale(normal,sign*impulse)))};
    entrant.pairContact=true; entrant.contact=true;
  }
}
function railContact(e,course) {
  // Bound scanning to the connected current station. Short swept samples
  // prevent crossing an end post at the edge of the launch gap.
  const from=e.previousBody, body=e.vehicle;
  const middle=course.projectNear(body.position,e.distance);
  if(Math.abs(middle.offset)<course.railOffset-4) return;
  let best=null;
  for(const z of stations) {
    const start=centre(from,z), finish=centre(body,z);
    for(const fraction of [0,.5,1]) {
      const p=add(start,scale(subtract(finish,start),fraction));
      const frame=course.projectNear(p,e.distance);
      if(!frame?.supported) continue;
      const height=dot(subtract(p,frame.point),frame.normal);
      if(height>course.railHeight+radius || height < -radius) continue;
      const side=Math.sign(frame.offset);
      const separation=Math.abs(frame.offset)-course.railOffset;
      if(separation < -radius || separation > RAIL_THICKNESS+radius) continue;
      const startSeparation=separation+side*dot(subtract(start,p),frame.lateral);
      const outside=startSeparation>RAIL_THICKNESS*.5;
      const normal=scale(frame.lateral,outside ? side : -side);
      const penetration=outside ? radius+RAIL_THICKNESS-separation : radius+separation;
      const depth=penetration-dot(subtract(finish,p),normal);
      if(depth>0 && (!best || depth>best.depth)) best={normal,depth};
    }
  }
  if(best) {
    const vn=dot(body.velocity,best.normal);
    e.vehicle={...body,position:add(body.position,scale(best.normal,clamp(best.depth,0,1.5))),
      velocity:capSpeed(add(body.velocity,scale(best.normal,Math.max(0,-vn)*1.04)))};
    e.contact=true;
  }
}

export function resolveRocketContacts(active,course) {
  if(active.length>6) throw RangeError('Rocket field exceeds six cars');
  const ordered=[...active].sort((a,b)=>a.id-b.id);
  for(let i=0;i<ordered.length;i++) for(let j=i+1;j<ordered.length;j++) sweptPair(ordered[i],ordered[j]);
  for(const entrant of ordered) railContact(entrant,course);
}
