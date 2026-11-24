// SPDX-License-Identifier: Apache-2.0
import {add, clamp, cross, dot, length, normalize, quatConjugate, quatMultiply, quatNormalize,
  rotate, scale, subtract} from '../vendor/vanillajs/modules/math/index.js';

export const ROCKET_RULES = 2;
export const NEUTRAL_ROCKET = Object.freeze({throttle:0, brake:0, steer:0, boost:false, assist:false, dodge:0});
export const ROCKET_LIMITS = Object.freeze({
  mass:1100, gravity:9.81, substeps:4, maxSpeed:75, maxAngularSpeed:6,
  mountHeight:-0.14, restLength:0.64, minLength:0.24, probeRange:0.72,
  enterSpeed:9, releaseSpeed:6, adhesion:32, spring:480, damper:29, maxSupport:145, tyreRollArm:.26,
  dodgeCooldown:60, dodgeSpeed:4, dodgeCost:12, capacity:100, boostDrain:18, boostAcceleration:13,
  maxAcceleration:352, maxAngularAcceleration:120, maxStopImpulse:1100*85,
});
const L = ROCKET_LIMITS, h = 1/(60*L.substeps);
const mounts = [[-.79,L.mountHeight,-1.29],[.79,L.mountHeight,-1.29],
  [-.79,L.mountHeight,1.29],[.79,L.mountHeight,1.29]];
// Principal moments in kg m² about local right, up and rear axes.
export const ROCKET_INERTIA = Object.freeze([1780,2050,540]);
const fields = Object.keys(NEUTRAL_ROCKET);
const towards = (v, n) => subtract(v, scale(n,dot(v,n)));
const limited = (v, cap) => { const speed=length(v); return speed>cap ? scale(v,cap/speed) : v; };
const emptyWheel = () => ({contact:false, frame:null, load:0, compression:0, distance:null});
const maximumTick = Number.MAX_SAFE_INTEGER - 1;

function bound(value,lo,hi,name) {
  if (!Number.isFinite(value) || value<lo || value>hi) throw RangeError('Invalid Rocket '+name);
  return value;
}
function vector(v,size,limit,name) {
  if (!Array.isArray(v) || v.length!==size) throw TypeError('Invalid Rocket '+name);
  for (const value of v) bound(value,-limit,limit,name);
}
function integer(v,lo,hi,name) {
  if (!Number.isSafeInteger(v)) throw TypeError('Invalid Rocket '+name);
  bound(v,lo,hi,name);
}

export function validateRocketCommand(command) {
  if (!command || Object.getPrototypeOf(command)!==Object.prototype ||
      Reflect.ownKeys(command).length!==fields.length) throw TypeError('Invalid Rocket command fields');
  for (const key of fields) {
    const field=Object.getOwnPropertyDescriptor(command,key);
    if (!field?.enumerable || !Object.hasOwn(field,'value')) throw TypeError('Invalid Rocket '+key);
    if (key==='boost' || key==='assist') {
      if (typeof field.value!=='boolean') throw TypeError('Invalid Rocket '+key);
    } else if (key==='dodge') integer(field.value,-1,1,key);
    else bound(field.value,key==='steer' ? -1 : 0,1,key);
  }
  return command;
}

function checkFrame(frame) {
  if (!frame || (frame.material!=='magnetic' && frame.material!=='ordinary') ||
      typeof frame.id!=='string' || !frame.id.length || frame.id.length>128) throw TypeError('Invalid Rocket surface');
  vector(frame.point,3,1e6,'surface point');
  bound(frame.station,-1e6,1e6,'station'); bound(frame.offset,-1e6,1e6,'offset');
  for (const axis of [frame.tangent,frame.normal,frame.lateral]) {
    vector(axis,3,1.000001,'surface axis');
    if (Math.abs(length(axis)-1)>1e-6) throw RangeError('Invalid Rocket unit axis');
  }
  if (Math.abs(dot(frame.tangent,frame.normal))>1e-6 ||
      length(subtract(cross(frame.tangent,frame.normal),frame.lateral))>1e-6) {
    throw RangeError('Invalid Rocket surface basis');
  }
}

function orientationFrom(frame) {
  // Rotation-matrix columns are local right, up, rear in world coordinates.
  const [m00,m10,m20]=frame.lateral, [m01,m11,m21]=frame.normal;
  const [m02,m12,m22]=scale(frame.tangent,-1);
  if (m00+m11+m22>0) {
    const r=2*Math.sqrt(1+m00+m11+m22);
    return quatNormalize([(m21-m12)/r,(m02-m20)/r,(m10-m01)/r,r/4]);
  }
  if (m00>=m11 && m00>=m22) {
    const r=2*Math.sqrt(1+m00-m11-m22);
    return quatNormalize([r/4,(m01+m10)/r,(m20+m02)/r,(m21-m12)/r]);
  }
  if (m11>=m22) {
    const r=2*Math.sqrt(1-m00+m11-m22);
    return quatNormalize([(m01+m10)/r,r/4,(m12+m21)/r,(m02-m20)/r]);
  }
  const r=2*Math.sqrt(1-m00-m11+m22);
  return quatNormalize([(m20+m02)/r,(m12+m21)/r,r/4,(m10-m01)/r]);
}

export function createRocketBody(frame) {
  checkFrame(frame);
  const height=L.restLength-L.mountHeight-L.gravity/L.spring;
  const position=add(frame.point,scale(frame.normal,height));
  vector(position,3,1e6,'spawn position');
  return {position,orientation:orientationFrom(frame),
    velocity:[0,0,0],angularVelocity:[0,0,0],tick:0,energy:L.capacity,airTicks:0,
    dodgeHeld:0,dodgeApplied:0,dodgeCooldown:0,boosting:false,attached:false,grounded:false,
    contactFrame:null,wheels:mounts.map(emptyWheel),endStopImpulse:0,acceleration:[0,0,0],adhesionAcceleration:[0,0,0]};
}

function checkBody(body) {
  vector(body.position,3,1e6,'position'); vector(body.orientation,4,1.000001,'orientation');
  if (Math.abs(length(body.orientation)-1)>1e-6) throw RangeError('Invalid Rocket quaternion');
  vector(body.velocity,3,L.maxSpeed+1e-8,'velocity'); vector(body.angularVelocity,3,L.maxAngularSpeed+1e-8,'angular velocity');
  bound(length(body.velocity),0,L.maxSpeed+1e-8,'speed'); bound(length(body.angularVelocity),0,L.maxAngularSpeed+1e-8,'spin');
  integer(body.tick,0,maximumTick,'tick'); integer(body.airTicks,0,maximumTick,'air ticks');
  integer(body.dodgeHeld,-1,1,'dodge latch'); integer(body.dodgeCooldown,0,L.dodgeCooldown,'cooldown');
  bound(body.energy,0,L.capacity,'energy');
  integer(body.dodgeApplied,-1,1,'applied dodge');
  for (const key of ['attached','grounded','boosting']) {
    if (typeof body[key]!=='boolean') throw TypeError('Invalid Rocket '+key);
  }
  vector(body.acceleration,3,L.maxAcceleration+1e-8,'acceleration');
  vector(body.adhesionAcceleration,3,L.adhesion+1e-8,'adhesion acceleration');
  bound(body.endStopImpulse,0,L.maxStopImpulse+1e-6,'end stop');
  if (!Array.isArray(body.wheels) || body.wheels.length!==4) {
    throw TypeError('Invalid Rocket contact state');
  }
  for (const w of body.wheels) {
    if (!w || typeof w.contact!=='boolean') throw TypeError('Invalid Rocket wheel');
    if (w.distance!==null) bound(w.distance,0,L.probeRange,'wheel distance');
    bound(w.load,0,L.maxSupport*L.mass/4,'wheel load'); bound(w.compression,0,L.restLength-L.minLength,'wheel compression');
    if (w.frame!==null) checkFrame(w.frame);
  }
  if (body.contactFrame!==null) checkFrame(body.contactFrame);
}

function wheelContact(state,surface,orientation,up,down,index) {
  const mount=add(state.position,rotate(orientation,mounts[index]));
  const sample=surface.probe(mount,down,L.probeRange,state.wheels[index].frame ?? state.contactFrame);
  if (sample===null) return null;
  checkFrame(sample);
  // Own the result. A sampler may reuse temporary vectors on its next query.
  const hit=Object.freeze({point:Object.freeze(sample.point.slice()),normal:Object.freeze(sample.normal.slice()),
    tangent:Object.freeze(sample.tangent.slice()),lateral:Object.freeze(sample.lateral.slice()),
    station:sample.station,offset:sample.offset,id:sample.id,material:sample.material,distance:sample.distance});
  bound(hit.distance,0,L.probeRange,'probe distance');
  if (length(subtract(hit.point,add(mount,scale(down,hit.distance))))>1e-5) {
    throw RangeError('Inconsistent Rocket wheel intersection');
  }
  if (dot(up,hit.normal)<.40) return null; // side/back-face cannot carry this suspension
  const arm=subtract(hit.point,state.position);
  const motion=add(state.velocity,cross(state.angularVelocity,arm));
  const compression=clamp(L.restLength-hit.distance,0,L.restLength-L.minLength);
  const load=hit.distance<=L.restLength ?
    L.mass/4*clamp(L.spring*compression-L.damper*dot(motion,hit.normal),0,L.maxSupport) : 0;
  return {hit,arm,motion,compression,load};
}

function integrateOrientation(q,worldSpin) {
  const speed=length(worldSpin), half=speed*h/2;
  const delta=[...scale(worldSpin,speed>1e-10 ? Math.sin(half)/speed : h/2),Math.cos(half)];
  return quatNormalize(quatMultiply(delta,q));
}

function substep(state,command,surface,dodgeEdge) {
  const q=state.orientation, up=rotate(q,[0,1,0]), down=scale(up,-1), forward=rotate(q,[0,0,-1]), right=rotate(q,[1,0,0]);
  const hits=mounts.map((_,i)=>wheelContact(state,surface,q,up,down,i));
  const supports=hits.filter(w=>w && w.hit.distance<=L.restLength);
  const eligible=supports.filter(w=>w.load>0 && w.hit.material==='magnetic' &&
    dot(up,w.hit.normal)>=(state.attached ? .55 : .72));
  const forwardSpeed=dot(state.velocity,forward);
  const attached=command.assist && eligible.length>=2 && forwardSpeed>=(state.attached ? L.releaseSpeed : L.enterSpeed);
  const normal=attached ? normalize(eligible.reduce((v,w)=>add(v,w.hit.normal),[0,0,0])) : null;
  const adhesionAcceleration=attached ? scale(normal,-L.adhesion) : [0,0,0];
  let acceleration=add([0,-L.gravity,0],adhesionAcceleration), torque=[0,0,0];
  const wheels=hits.map((wheel,index)=>{
    if (!wheel) return emptyWheel();
    const {hit,arm,motion,load,compression}=wheel;
    const angle=index<2 ? command.steer*.45/(1+Math.abs(forwardSpeed)*.085) : 0;
    const heading=rotate(q,[Math.sin(angle),0,-Math.cos(angle)]);
    const along=normalize(towards(heading,hit.normal)), side=cross(along,hit.normal);
    const sideSpeed=dot(motion,side), longSpeed=dot(motion,along);
    // The cap on the combined tire force scales with the measured wheel load.
    // Let the front axle run wide first under full lock. With the same
    // saturated side force front and rear, neutral steering cannot arrest a spin.
    const lateralLimit=load*(index<2 ? 1.25 : 1.6);
    const lateral=clamp(-sideSpeed*L.mass*1.8,-lateralLimit,lateralLimit);
    const brake=-Math.sign(longSpeed)*Math.min(Math.abs(longSpeed)/h,command.brake*22)*L.mass/4;
    const tire=limited(add(scale(side,lateral),scale(along,brake)),load*1.6);
    const force=add(scale(hit.normal,load),tire);
    acceleration=add(acceleration,scale(force,1/L.mass));
    // The suspension transfers lateral tyre force through an effective roll
    // arm. This anti-roll couple preserves the full contact force, yaw moment
    // and brake pitch while keeping normal steering from lifting the inside wheels.
    const antiRoll=Math.max(0,-dot(arm,up)-L.tyreRollArm)*dot(tire,right);
    torque=add(torque,add(cross(arm,force),scale(forward,antiRoll)));
    return {frame:hit,contact:hit.distance<=L.restLength,distance:hit.distance,load,compression};
  });
  const grounded=supports.length>0;
  const best=supports.reduce((current,w)=>!current || w.load>current.load ? w : current,null);
  // The chassis-mounted engine acts through its centre. It requires loaded
  // tires to drive. Boost is a separate, fuel-limited reaction thruster.
  if (best) {
    const drive=command.throttle*(1-command.brake)*19*clamp(1-(Math.max(0,forwardSpeed)/48)**2,0,1);
    const totalLoad=supports.reduce((sum,w)=>sum+w.load,0);
    acceleration=add(acceleration,scale(normalize(towards(forward,best.hit.normal)),Math.min(drive,1.8*totalLoad/L.mass)));
    acceleration=add(acceleration,scale(state.velocity,-.018));
  }
  let energy=state.energy, dodgeApplied=state.dodgeApplied, cooldown=state.dodgeCooldown;
  let velocity=state.velocity;
  if (!grounded && !attached && dodgeEdge && cooldown===0 && energy>=L.dodgeCost) {
    velocity=add(velocity,scale(rotate(q,[1,0,0]),L.dodgeSpeed*command.dodge));
    energy-=L.dodgeCost; cooldown=L.dodgeCooldown; dodgeApplied=command.dodge;
  }
  const boosting=command.boost && command.brake===0 && energy>1e-9 && length(velocity)<65;
  if (boosting) {
    const cost=Math.min(energy,L.boostDrain*h);
    acceleration=add(acceleration,scale(forward,L.boostAcceleration*cost/(L.boostDrain*h)));
    energy=Math.max(0,energy-cost);
  }
  const inverse=quatConjugate(q), omegaLocal=rotate(inverse,state.angularVelocity);
  if (!grounded && !attached) {
    // Pitch trim, yaw and roll are torque couples. Neutral air damping consumes
    // angular momentum without changing the ballistic centre-of-mass trajectory.
    const damping=command.assist ? 1.35 : .12;
    const airDemand=command.assist ? [command.throttle-command.brake,-command.steer,1.2*command.steer] : [0,0,0];
    const jetTorque=airDemand.map((a,i)=>ROCKET_INERTIA[i]*(a-damping*omegaLocal[i]));
    torque=add(torque,rotate(q,jetTorque));
    const approach=command.assist && hits.find(w=>w && dot(w.motion,w.hit.normal)<0);
    if (approach) torque=add(torque,scale(cross(up,approach.hit.normal),1600));
  }

  const momentum=rotate(q,omegaLocal.map((v,i)=>v*ROCKET_INERTIA[i]));
  const effectiveTorque=subtract(torque,cross(state.angularVelocity,momentum));
  function inverseInertia(worldMoment) {
    return rotate(q,rotate(inverse,worldMoment).map((v,i)=>v/ROCKET_INERTIA[i]));
  }
  const alpha=limited(inverseInertia(effectiveTorque),L.maxAngularAcceleration);
  let angularVelocity=limited(add(state.angularVelocity,scale(alpha,h)),L.maxAngularSpeed);
  acceleration=limited(acceleration,L.maxAcceleration);
  velocity=limited(add(velocity,scale(acceleration,h)),L.maxSpeed);

  // Frictionless unilateral end stops. The contact-point effective mass
  // distributes an impulse between translation and spin and prevents rebound.
  // Four fixed sweeps bound work for mutually coupled wheels on a hard landing.
  let endStopImpulse=0;
  for (let sweep=0;sweep<4;sweep++) {
    let corrected=false;
    for (const w of supports) {
      const n=w.hit.normal, allowance=Math.max(0,w.hit.distance-L.minLength)*dot(up,n)/h;
      const closing=-dot(add(velocity,cross(angularVelocity,w.arm)),n);
      if (closing<=allowance+1e-9 || endStopImpulse>=L.maxStopImpulse) continue;
      const spinPerImpulse=inverseInertia(cross(w.arm,n));
      const inverseMass=1/L.mass+dot(n,cross(spinPerImpulse,w.arm));
      const impulse=Math.min((closing-allowance)/inverseMass,L.maxStopImpulse-endStopImpulse);
      endStopImpulse+=impulse;
      velocity=add(velocity,scale(n,impulse/L.mass));
      angularVelocity=limited(add(angularVelocity,scale(spinPerImpulse,impulse)),L.maxAngularSpeed);
      corrected=true;
    }
    if (!corrected) break;
  }
  velocity=limited(velocity,L.maxSpeed);
  const position=add(state.position,scale(velocity,h));
  vector(position,3,1e6,'integrated position');
  return {...state,position,orientation:integrateOrientation(q,angularVelocity),
    velocity,angularVelocity,grounded,attached,contactFrame:best?.hit ?? null,wheels,energy,boosting,
    dodgeApplied,dodgeCooldown:cooldown,acceleration,adhesionAcceleration,endStopImpulse};
}

export function stepRocketBody(previous,command,surface) {
  validateRocketCommand(command);
  checkBody(previous);
  if (!surface || typeof surface.probe!=='function') throw TypeError('Rocket surface needs probe');
  let state={...previous,dodgeApplied:0,dodgeCooldown:Math.max(0,previous.dodgeCooldown-1)};
  const dodgeEdge=previous.dodgeHeld===0 && command.dodge!==0;
  let boosting=false;
  for (let i=0;i<L.substeps;i++) {
    state=substep(state,command,surface,dodgeEdge && i===0);
    boosting||=state.boosting;
  }
  return {...state,boosting,tick:previous.tick+1,airTicks:state.grounded ? 0 : previous.airTicks+1,dodgeHeld:command.dodge};
}
