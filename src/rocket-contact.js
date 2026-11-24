// SPDX-License-Identifier: Apache-2.0
import {add, clamp, cross, dot, length, quatConjugate, rotate, scale, subtract} from '../vendor/vanillajs/modules/math/index.js';
import {ROCKET_INERTIA, ROCKET_LIMITS} from './rocket-dynamics.js';

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

// Chassis-local corners of the wedge, side panels, canopy and rear wing.
// They can hit the driving face when a sideways car's tyre rays point away.
const shellCorners = [
  [.53,-.24,-2.15],[.88,-.24,-.34],[.76,-.24,1.97],
  [.88,.25,-.34],[.86,.22,.87],[.34,.64,-.06],
  [.82,.88,1.43],[.975,.795,1.95]
].flatMap(([x,y,z])=>[[-x,y,z],[x,y,z]]);

function shellContact(e,course) {
  const from=e.previousBody, body=e.vehicle;
  // A settled chassis has its bottom above the four suspension stops. Avoid
  // sweeping the shell throughout ordinary wheel-supported driving.
  if(!e.contact && from.wheels.every(w=>w.load>0 && w.distance>.44) &&
     body.wheels.every(w=>w.load>0 && w.distance>.44)) return;
  const road=course.projectNear(from.position,e.distance);
  const contacts=[];
  let correction=[0,0,0];
  for(const corner of shellCorners) {
    const previous=add(from.position,rotate(from.orientation,corner));
    // Start 3 mm above the old pose so a resting corner can intersect the
    // same face again as the chassis rotates across a triangle seam.
    const start=add(previous,scale(road.normal,.003));
    const arm=rotate(body.orientation,corner), end=add(body.position,arm);
    const travel=subtract(end,start), reach=length(travel);
    if(reach<1e-10) continue;
    const crossed=course.probe(start,scale(travel,1/reach),reach);
    if(!crossed || dot(subtract(from.position,crossed.point),crossed.normal)<=0) continue;
    // During a single tick the corner can cross one triangle and finish
    // inside its neighbour on a bank. Resolve depth against the actual face
    // at the integrated endpoint. The sweep first proves front-side entry.
    const lift=Math.min(1.5,reach+.003);
    const endpoint=course.probe(add(end,scale(crossed.normal,lift)),scale(crossed.normal,-1),lift);
    const hit=endpoint && dot(subtract(from.position,endpoint.point),endpoint.normal)>0 ? endpoint : crossed;
    const depth=dot(subtract(hit.point,end),hit.normal);
    if(depth< -1e-8) continue;
    const remaining=depth-dot(correction,hit.normal);
    if(remaining>0) correction=add(correction,scale(hit.normal,remaining));
    contacts.push({normal:hit.normal,arm,impulse:0});
  }
  if(!contacts.length) return;
  const inverse=quatConjugate(body.orientation);
  let velocity=body.velocity, spin=body.angularVelocity;
  for(const c of contacts) {
    const local=rotate(inverse,cross(c.arm,c.normal));
    c.spinPerImpulse=rotate(body.orientation,local.map((v,i)=>v/ROCKET_INERTIA[i]));
    c.inverseMass=1/ROCKET_LIMITS.mass+dot(c.normal,cross(c.spinPerImpulse,c.arm));
  }
  // Unilateral, non-bouncing impact at each contact point. Rotation can
  // close a roof corner even when the centre of mass is moving away.
  let budget=ROCKET_LIMITS.maxStopImpulse;
  for(let pass=0;pass<4;pass++) {
    for(const c of contacts) {
      const closing=-dot(add(velocity,cross(spin,c.arm)),c.normal);
      const impulse=clamp(closing/c.inverseMass,-c.impulse,budget);
      if(Math.abs(impulse)<1e-9) continue;
      c.impulse+=impulse;
      velocity=add(velocity,scale(c.normal,impulse/ROCKET_LIMITS.mass));
      spin=add(spin,scale(c.spinPerImpulse,impulse));
      budget-=impulse;
    }
  }
  const depth=length(correction), angular=length(spin);
  e.vehicle={...body,position:add(body.position,depth>1.5 ? scale(correction,1.5/depth) : correction),
    velocity:capSpeed(velocity),angularVelocity:angular>ROCKET_LIMITS.maxAngularSpeed ? scale(spin,ROCKET_LIMITS.maxAngularSpeed/angular) : spin};
  e.deckContact=true;
  e.contact=true;
}

export function resolveRocketContacts(active,course) {
  if(active.length>6) throw RangeError('Rocket field exceeds six cars');
  const ordered=[...active].sort((a,b)=>a.id-b.id);
  for(let i=0;i<ordered.length;i++) for(let j=i+1;j<ordered.length;j++) sweptPair(ordered[i],ordered[j]);
  for(const entrant of ordered) {
    entrant.deckContact=false;
    railContact(entrant,course);
    shellContact(entrant,course);
  }
}
