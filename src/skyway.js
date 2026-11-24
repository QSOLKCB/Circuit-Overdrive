// SPDX-License-Identifier: Apache-2.0
import {aiCommand} from './ai.js';
import {bounded, centerAt, closestDistance} from './track.js';

const startS=-60, length=1920, endS=1992, halfWidth=13, barrierOffset=15;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

// Chain of tangent lines and circular arcs measured in horizontal metres.
// The sign of radius selects the direction of each independent sweep.
const plan=[[150,0],[350,154],[645,0],[825,-143],[1135,0],[1355,-175],
  [1625,0],[1800,148],[endS,0]];
const pieces=[];
let station=startS, heading=0, start={x:-410,z:900-startS};
for (const [endStation,radius] of plan) {
  const tx=Math.sin(heading),tz=-Math.cos(heading), curvature=radius ? 1/radius : 0;
  const piece={s:station,length:endStation-station,start,tx,tz,heading,curvature};
  if(radius) piece.center={x:start.x-tz*radius,z:start.z+tx*radius};
  const end=centerAt(piece,piece.length);
  piece.end={x:end.x,z:end.z};
  pieces.push(piece);
  heading+=piece.length*curvature; station=endStation; start=piece.end;
}

// The three launch decks are continuous road. The short rounded crest unloads
// the tyres. A descending catch face and eased toe keep crawl-speed travel possible.
const ramps=Object.freeze([
  {name:'Copper Step',lip:504,run:28,grade:.17},
  {name:'Signal Crown',lip:983,run:40,grade:.26},
  {name:'Turbine Rise',lip:1476,run:34,grade:.21},
].map(Object.freeze));
const toe=7, crest=2;
function rampAt(s) {
  return ramps.findIndex(r=>s>=r.lip-r.run && s<=r.lip+r.run+100);
}
function elevation(s) {
  const deck=24;
  for(const ramp of ramps) {
    const d=s-ramp.lip, u=ramp.run-Math.abs(d);
    if(u<=0) continue;
    const sign=d<0 ? 1 : -1, g=ramp.grade;
    if(u<toe) return {y:deck+g*u*u/(2*toe),grade:sign*g*u/toe};
    if(Math.abs(d)<crest) {
      const peak=g*(ramp.run-toe/2-crest/2);
      return {y:deck+peak-g*d*d/(2*crest),grade:-g*d/crest};
    }
    return {y:deck+g*(u-toe/2),grade:sign*g};
  }
  return {y:deck,grade:0};
}

function frame(piece,d,lateral) {
  const c=centerAt(piece,d),rx=-c.tz,rz=c.tx,s=piece.s+d,e=elevation(s);
  // Every ramp occupies a straight. Curves are level across the entire deck.
  const slope=e.grade,ny=1/Math.hypot(1,slope);
  return {x:c.x+rx*lateral,y:e.y,z:c.z+rz*lateral,s,lateral,rx,rz,tx:c.tx,tz:c.tz,
    yaw:Math.atan2(-c.tx,-c.tz),bank:0,normal:[-c.tx*slope*ny,ny,-c.tz*slope*ny]};
}
function sample(s,lateral=0) {
  s=clamp(bounded(s,-1e9,1e9,'Skyway distance'),startS,endS);
  bounded(lateral,-2000,2000,'Skyway lateral offset');
  const p=pieces.find(p=>s<=p.s+p.length);
  return frame(p,s-p.s,lateral);
}
function project(x,z) {
  bounded(x,-4000,4000,'Skyway x'); bounded(z,-4000,4000,'Skyway z');
  let nearest, along, lateral, best=Infinity;
  for(const p of pieces) {
    const d=closestDistance(p,x,z), c=centerAt(p,d), dx=x-c.x,dz=z-c.z;
    const error=dx*dx+dz*dz;
    if(error<best) { best=error; nearest=p; along=d; lateral=-dx*c.tz+dz*c.tx; }
  }
  return frame(nearest,along,lateral);
}
function sampleSurface(x,z,maxY) {
  bounded(maxY,-4000,4000,'Skyway surface ceiling');
  const p=project(x,z);
  if(p.y>maxY || Math.abs(p.lateral)>barrierOffset+1) return null;
  const beyond=(x-p.x)*p.tx+(z-p.z)*p.tz;
  if((p.s===startS && beyond<-.000001) || (p.s===endS && beyond>.000001)) return null;
  const paved=Math.abs(p.lateral)<=halfWidth;
  return {height:p.y,normal:p.normal,friction:paved?1:.82,surfaceId:paved?'asphalt':'apron'};
}
function driftZone(s) {
  return pieces.some(p=>p.curvature && s>p.s+8 && s<p.s+p.length-8);
}

function driverCommand(entrant,active) {
  const cmd=aiCommand(entrant,active,skyway);
  const p=entrant.current,n=entrant.nitro;
  const ramp=ramps[rampAt(p.s)];
  if(ramp && p.s>=ramp.lip-60 && p.s<=ramp.lip+ramp.run+18) {
    const target=34+entrant.id*.6;
    cmd.throttle=p.speed>target ? 0 : cmd.throttle;
    cmd.brake=Math.max(cmd.brake,clamp((p.speed-target-1)*.17,0,1));
  }
  const drift=!n.airborne && p.speed>19 && driftZone(p.s) && Math.abs(cmd.steer)>.16;
  const boost=!drift && !ramp && !n.airborne && cmd.brake===0 && cmd.throttle>.1 && n.energy>1000;
  return {...cmd,drift,boost};
}

// Settlement happens after physical contact, rail/car resolution and checkpoint
// validation. Increasing ramp IDs preclude repeat credit after reversals/recovery.
function settleStunt(e) {
  const n=e.nitro, r=ramps[n.takeoffRamp];
  if(n.landed && r && n.cleanFlight && n.takeoffRamp>n.lastRewardRamp && n.lastAirTicks>=8 &&
    n.peakHeight>.3 && Math.abs(e.current.roll)<.40 && Math.abs(e.current.pitch)<.70 &&
    Math.cos(e.current.yaw-sample(e.current.s).yaw)>.85 &&
    Math.abs(n.takeoffS-r.lip)<=6 && e.current.s>r.lip+3 && e.current.s<r.lip+r.run+100 &&
    e.current.s-n.takeoffS>=4 && Math.abs(n.landSpeedY)<=18) {
    n.pendingStunt={ramp:n.takeoffRamp,ticks:45,stable:0,
      points:Math.min(500,2*n.lastAirTicks+Math.floor(e.current.s-n.takeoffS))};
  }
  const candidate=n.pendingStunt;
  if(!candidate) return;
  if(e.contact || e.wrongWay || e.missedGate || e.recoveryCooldown || n.airborne ||
    Math.abs(e.current.lateral)>halfWidth-1 || --candidate.ticks<0) {
    n.pendingStunt=null;
    return;
  }
  const road=sample(e.current.s);
  const supported=e.vehicle.wheels.filter(w=>w.grounded && w.load>150 && w.surfaceId==='asphalt').length;
  const pitch=Math.atan(-(road.normal[0]*road.tx+road.normal[2]*road.tz)/road.normal[1]);
  const stable=supported>=3 && Math.abs(e.current.pitch-pitch)<.24 && Math.abs(e.current.roll)<.23 &&
    Math.cos(e.current.yaw-road.yaw)>.88 && Math.abs(e.vehicle.velocity[1])<3.5;
  candidate.stable=stable ? candidate.stable+1 : 0;
  if(candidate.stable>=5) {
    n.rewarded=true;
    n.stunts++;
    n.points+=candidate.points;
    n.lastRewardRamp=candidate.ramp;
    n.pendingStunt=null;
  }
}

const gates=Object.freeze([0,300,629,803,1115,1370,1609,length].map(s=>Object.freeze(sample(s))));
export const skyway=Object.freeze({id:'skyway',discipline:'nitro',name:'Nitro Skyway',closed:false,
  length,startS,endS,halfWidth,barrierOffset,railHeight:.94,sample,project,sampleSurface,gates,ramps,rampAt,
  driftZone,driverCommand,settleStunt});
