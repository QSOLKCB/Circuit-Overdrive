// SPDX-License-Identifier: Apache-2.0
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {track} from './track.js';

const SKIN = 0.0001; // numerical tolerance, metres

function shape(entrant) {
  const forward = rotate(entrant.vehicle.orientation, [0, 0, -1]);
  const yaw = Math.atan2(-forward[0], -forward[2]);
  const angle = yaw - entrant.previous.yaw;
  return {entrant, yaw, turn:Math.atan2(Math.sin(angle), Math.cos(angle))};
}

function axes(yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[c, -s], [s, c]]; // road-plane right and back
}

function extent(basis, x, z, chassis) {
  return (Math.abs(x*basis[0][0]+z*basis[0][1])*chassis.width
    + Math.abs(x*basis[1][0]+z*basis[1][1])*chassis.length) / 2;
}

// A positive separating-axis gap proves disjoint rectangles. On overlap the
// largest (least negative) gap gives the minimum translation to separate them.
function separation(a, b, dx, dz, t, chassis) {
  const axesA = axes(a.yaw - (1-t)*a.turn), axesB = axes(b.yaw - (1-t)*b.turn);
  let gap = -Infinity, nx = 0, nz = 0;
  for (const basis of [axesA, axesB]) {
    for (const [x,z] of basis) {
      const signed = dx*x + dz*z;
      const d = Math.abs(signed) - extent(axesA,x,z,chassis) - extent(axesB,x,z,chassis);
      if (d <= gap) continue;
      gap = d;
      nx = signed < 0 ? -x : x;
      nz = signed < 0 ? -z : z;
    }
  }
  return {gap, nx, nz};
}

function findContact(a, b, chassis, radius, sweep) {
  const ap = a.entrant.vehicle.position, bp = b.entrant.vehicle.position;
  const endX = bp[0]-ap[0], endY = bp[1]-ap[1], endZ = bp[2]-ap[2];
  if (!sweep) {
    if (Math.abs(endY)>chassis.height || endX*endX+endZ*endZ > 4*radius*radius) return null;
    const hit = separation(a,b,endX,endZ,1,chassis);
    return hit.gap < -SKIN ? hit : null;
  }
  const prevA = a.entrant.previous, prevB = b.entrant.previous;
  const x = prevB.x-prevA.x, y = prevB.y-prevA.y, z = prevB.z-prevA.z;
  const dx = endX-x, dy = endY-y, dz = endZ-z;
  const travelSq = dx*dx+dz*dz;
  const nearest = travelSq ? Math.max(0,Math.min(1,-(x*dx+z*dz)/travelSq)) : 0;
  if ((x+nearest*dx)**2 + (z+nearest*dz)**2 > (2*radius+SKIN)**2) return null;

  // Restrict the horizontal sweep to the interval of overlapping heights.
  let t = 0, end = 1;
  if (dy === 0) {
    if (Math.abs(y)>chassis.height) return null;
  } else {
    const p = (-chassis.height-y)/dy, q = (chassis.height-y)/dy;
    t = Math.max(0,Math.min(p,q));
    end = Math.min(1,Math.max(p,q));
  }

  if (t>end) return null;
  const turning = radius*(Math.abs(a.turn)+Math.abs(b.turn));
  const sample = time => separation(a,b,x+dx*time,z+dz*time,time,chassis);
  let hit = sample(t);
  const initialGap = hit.gap;
  // Conservative advancement on a fixed separating axis. Translation and the
  // arc length of both outer tips bound how much of its gap can close.
  for (let i=0; hit.gap>SKIN && i<12; i++) {
    const closure = turning - dx*hit.nx - dz*hit.nz;
    if (closure <= 0) return null;
    t += hit.gap / closure;
    if (t>end) return null;
    hit = sample(t);
  }
  if (hit.gap>SKIN) {
    // For nearly tangential rotating corners advancement can approach contact
    // slowly. Search the remaining interval, discarding only intervals proved
    // clear on a separating axis. Sixteen bisections at the 120 m/s, 12 rad/s
    // engine caps localise contact to less than 0.1 mm of relative tip travel.
    function earliest(lo, hi, depth) {
      const mid = (lo+hi)/2, at = sample(mid);
      const travel = (Math.abs(dx*at.nx+dz*at.nz)+turning)*(hi-lo)/2;
      if (at.gap>travel+SKIN) return null;
      if (depth===16) return at;
      return earliest(lo,mid,depth+1) || earliest(mid,hi,depth+1);
    }
    hit = earliest(t,end,0);
    if (!hit) return null;
  }

  // Preserve the side of the contact plane on a pass-through. A rotating tip
  // may touch and already have turned away by the end of the same tick.
  const reach = extent(axes(a.yaw),hit.nx,hit.nz,chassis) + extent(axes(b.yaw),hit.nx,hit.nz,chassis);
  hit.gap = endX*hit.nx + endZ*hit.nz - reach;
  hit.swept = initialGap>SKIN;
  if (!hit.swept && hit.gap>SKIN) {
    const endpoint = separation(a,b,endX,endZ,1,chassis);
    return Math.abs(endY)<=chassis.height && endpoint.gap < 0 ? endpoint : null;
  }
  return hit;
}

function applyResponse(entrant, otherId, dx, dz, dvx, dvz, constrainRail) {
  const v = entrant.vehicle, p = v.position, speed = v.velocity;
  const grounded = v.wheels.some(w => w.grounded);
  const before = grounded ? track.project(p[0],p[2]) : null;
  p[0] += dx;
  p[2] += dz;
  speed[0] += dvx;
  speed[2] += dvz;
  if (grounded) {
    // Preserve ride height and vertical motion relative to the road on a bank.
    p[1] += track.project(p[0],p[2]).y - before.y;
    const [nx,ny,nz] = before.normal;
    speed[1] -= (nx*dvx+nz*dvz)/ny;
  }
  entrant.contact = entrant.pairContact = true;
  const label = 'car:' + otherId;
  if (!v.contacts.includes(label)) v.contacts.push(label);
  constrainRail(entrant);
}

function resolvePair(a, b, hit, constrainRail) {
  const {nx,nz,gap} = hit;
  const va = a.entrant.vehicle.velocity, vb = b.entrant.vehicle.velocity;
  const vx = va[0]-vb[0], vz = va[2]-vb[2];
  // Equal 1,200 kg chassis. Exchange closing momentum with low restitution.
  // Tangential friction is limited by the normal impulse for glancing contact.
  const impulse = Math.max(0, vx*nx+vz*nz)*0.52;
  const slide = Math.max(-impulse*.12,Math.min(impulse*.12,(vx*nz-vz*nx)*.5));
  const dvx = impulse*nx + slide*nz, dvz = impulse*nz - slide*nx;
  if (gap >= 0 && !impulse && !hit.swept) return false;
  const push = Math.max(0,SKIN-gap)*.5;
  applyResponse(a.entrant,b.entrant.id,-push*nx,-push*nz,-dvx,-dvz,constrainRail);
  applyResponse(b.entrant,a.entrant.id, push*nx, push*nz, dvx, dvz,constrainRail);
  return true;
}

// Entrants supply their tick-start pose and newly integrated vehicle3d state.
// The race captures render and scoring snapshots only after all constraints.
export function resolveCarContacts(entrants, chassis, constrainRail) {
  const bodies = entrants.filter(e => e.finishTicks === null).sort((a,b) => a.id-b.id).map(shape);
  const radius = Math.hypot(chassis.width,chassis.length)/2;
  // Sweep once; then settle endpoint overlaps propagated by other cars/rails.
  // The usual uncongested tick exits after the first broad-phase pass.
  for (let pass=0; pass<24; pass++) {
    let changed = false;
    for (let i=0; i<bodies.length; i++) {
      for (let j=i+1; j<bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const hit = findContact(a,b,chassis,radius,pass===0);
        if (hit && resolvePair(a,b,hit,constrainRail)) changed = true;
      }
    }
    if (!changed) break;
  }
}
