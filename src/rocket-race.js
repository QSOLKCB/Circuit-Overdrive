// SPDX-License-Identifier: Apache-2.0
import {add,clamp,dot,length,rotate,scale,seededRandom,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {FIELD,PLAYER_ID} from './field.js';
import {orbital} from './orbital.js';
import {createRocketBody,NEUTRAL_ROCKET,ROCKET_LIMITS,stepRocketBody,validateRocketCommand} from './rocket-dynamics.js';
import {resolveRocketContacts} from './rocket-contact.js';
import {classify,PENALTY_TICKS} from './sim.js';

function snapshot(body,road,input,oldSpin=0) {
  const forward=rotate(body.orientation,[0,0,-1]), up=rotate(body.orientation,[0,1,0]), right=rotate(body.orientation,[1,0,0]);
  const speed=length(body.velocity),gear=clamp(1+Math.floor(speed/10),1,6);
  return {x:body.position[0],y:body.position[1],z:body.position[2],orientation:body.orientation.slice(),
    yaw:Math.atan2(-forward[0],-forward[2]),pitch:Math.asin(clamp(forward[1],-1,1)),roll:Math.atan2(right[1],up[1]),
    speed,gear,rpm:1000+3800*Math.min(speed/48,1),brake:input.brake,steering:input.steer*.4,
    wheelSpin:(oldSpin-speed/(60*.34))%(Math.PI*2),compression:body.wheels.map(w=>w.compression),
    s:road.station,lateral:road.offset,groundY:road.point[1]};
}
function entrant(driver,seed) {
  const distance=-5-9*Math.floor(driver.id/2)-2*(driver.id%2),lane=driver.id%2 ? 4 : -4;
  const road=orbital.frame(distance,lane),vehicle=createRocketBody(road),current=snapshot(vehicle,road,NEUTRAL_ROCKET);
  const stream=seededRandom((seed+Math.imul(driver.id+1,0x9e3779b9))>>>0);
  const ai=driver.id===PLAYER_ID ? null : {lane:lane+(stream()-.5)*2,cruise:29+stream()*5,stalled:0};
  return {...driver,ai,vehicle,previousBody:vehicle,previous:current,current,distance,extraDistance:0,
    elapsedTicks:0,lapStartTick:0,lap:1,lapTicks:[],splitTicks:[],nextGate:0,finishTicks:null,
    missedGate:false,safeDistance:distance,safeLateral:lane,recoveryCooldown:0,recoveries:0,pendingRecovery:false,
    wrongWay:false,contact:false,pairContact:false,deckContact:false,overturnedTicks:0,position:driver.id+1};
}
export function createRocketRace(seed=27) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff) throw RangeError('Invalid Rocket race seed');
  const entrants=FIELD.map(driver=>entrant(driver,seed));
  const race={discipline:'rocket',seed,phase:'menu',pausedFrom:null,countdownTicks:180,elapsedTicks:0,
    entrants,player:entrants[PLAYER_ID],order:entrants.slice()};
  Object.defineProperty(race,'course',{value:orbital});
  return race;
}
export function startRocketRace(race) {
  Object.assign(race,createRocketRace(race.seed),{phase:'countdown'});
}

// Each rival aims at a physical point in its prospective lane. Curves, walls,
// ceiling and catch all use the same chassis-relative heading measurement.
const gap=orbital.sections.find(p=>p.kind==='air');
function avoidanceDodge(driver,active) {
  const v=driver.vehicle;
  if(v.airTicks<6 || v.airTicks>18 || driver.distance<gap.start-2 || driver.distance>gap.end+12 ||
    v.dodgeCooldown || v.dodgeHeld || v.energy<ROCKET_LIMITS.dodgeCost) return 0;
  const right=rotate(v.orientation,[1,0,0]),forward=rotate(v.orientation,[0,0,-1]),up=rotate(v.orientation,[0,1,0]);
  for(const other of active) {
    if(other===driver || other.pendingRecovery) continue;
    const relative=subtract(other.vehicle.position,v.position),ahead=dot(relative,forward),beside=dot(relative,right);
    if(ahead<0 || ahead>12 || Math.abs(beside)>2.6 || Math.abs(dot(relative,up))>2 ||
      (ahead>4 && dot(subtract(v.velocity,other.vehicle.velocity),forward)<=.5)) continue;
    const side=beside>0 ? -1 : beside<0 ? 1 : driver.current.lateral>0 ? -1 : 1;
    const landingLane=driver.current.lateral+side*4;
    if(Math.abs(landingLane)>orbital.railOffset-2.5) continue;
    if(active.some(car=>car!==driver && car!==other && !car.pendingRecovery &&
      Math.abs(car.distance-driver.distance)<18 && Math.abs(car.current.lateral-landingLane)<2.8)) continue;
    return side;
  }
  return 0;
}
export function planRocketCommand(driver,active) {
  const {vehicle:v,ai}=driver, s=driver.distance, speed=length(v.velocity);
  let lane=ai.lane;
  for(const other of active) {
    const ahead=other.distance-s;
    if(other.id===driver.id || ahead<=0 || ahead>=13 || Math.abs(other.current.lateral-lane)>2.5) continue;
    lane=clamp(other.current.lateral+(other.current.lateral>=0?-3.5:3.5),-10,10);
    break;
  }
  const target=orbital.frame(s+7+.30*speed,lane), delta=subtract(target.point,v.position);
  const right=rotate(v.orientation,[1,0,0]), forward=rotate(v.orientation,[0,0,-1]);
  const angle=Math.atan2(dot(delta,right),dot(delta,forward));
  const steer=clamp(angle*2.3,-1,1),air=v.airTicks>0;
  const wanted=['azimuth-bank','counterbank','escape-bank'].includes(target.id) ? Math.min(27,ai.cruise) : ai.cruise;
  const boost=!air && s>gap.start-35 && s<gap.start-12 && speed<39 && v.energy>2;
  const brake=boost || air ? 0 : clamp((speed-wanted-.6)*.19,0,1);
  return {throttle:air ? 0 : boost ? 1 : clamp((wanted-speed)*.36,0,1),brake,steer:air?0:steer,assist:true,boost,
    dodge:avoidanceDodge(driver,active)};
}

function clearSlot(road,e,active) {
  const p=add(road.point,scale(road.normal,.75));
  return active.every(other=>{
    if(other===e || other.finishTicks!==null) return true;
    const d=subtract(p,other.vehicle.position),v=other.vehicle.velocity;
    const t=clamp(dot(d,v)/(dot(v,v)||1),0,.35);
    return length(subtract(d,scale(v,t)))>5.3;
  });
}
function recover(e,active) {
  const limit=Math.min(e.distance,e.safeDistance);
  for(let back=0;back<=120;back+=8) {
    const s=Math.max(orbital.startS+3,limit-back);
    for(const lane of [e.safeLateral,-8,8,0]) {
      const road=orbital.frame(s,lane);
      if(!road.supported || road.normal[1]<.87 || !clearSlot(road,e,active)) continue;
      const vehicle=createRocketBody(road);
      vehicle.energy=e.vehicle.energy;
      vehicle.tick=e.vehicle.tick;
      vehicle.dodgeCooldown=e.vehicle.dodgeCooldown;
      vehicle.dodgeHeld=e.vehicle.dodgeHeld;
      e.vehicle=e.previousBody=vehicle;
      e.previous=e.current=snapshot(vehicle,road,NEUTRAL_ROCKET);
      e.distance=e.safeDistance=s;e.safeLateral=lane;
      e.elapsedTicks+=PENALTY_TICKS;e.recoveries++;e.recoveryCooldown=120;
      e.pendingRecovery=e.wrongWay=e.missedGate=e.contact=e.pairContact=e.deckContact=false;
      e.overturnedTicks=0;
      if(e.ai) e.ai.stalled=0;
      return true;
    }
    if(s===orbital.startS+3) break;
  }
  return false;
}
export function recoverRocketCar(race) {
  const e=race.player;
  if(race.phase!=='racing' || e.finishTicks!==null || e.recoveryCooldown) return false;
  const accepted=recover(e,race.entrants);
  if(accepted) classify(race);
  return accepted;
}

function wheelsAt(body,station) {
  return body.wheels.filter(w=>w.contact && w.load>0 && Math.abs(w.frame.station-station)<4).length>=2;
}
// Sweep the chassis centre through this finite 3D timing window in the forward
// direction. Prior and subsequent wheel loads admit only the local road level.
export function crossesOrbitalGate(gate,previous,body) {
  const a=subtract(previous.position,gate.point), b=subtract(body.position,gate.point);
  const before=dot(a,gate.tangent),after=dot(b,gate.tangent);
  if(before>=0 || after<0 || dot(body.velocity,gate.tangent)<=0 ||
    dot(rotate(body.orientation,[0,0,-1]),gate.tangent)<.4) return false;
  const f=-before/(after-before),crossing=add(a,scale(subtract(b,a),f)),height=dot(crossing,gate.normal);
  return Math.abs(dot(crossing,gate.lateral))<=orbital.railOffset && height>=.15 && height<=1.65;
}
function score(e,oldStation,road) {
  const gate=orbital.gates[e.nextGate],s=road.station;
  if(!gate || Math.abs(s-gate.s)>3 || s<=oldStation || s-oldStation>2 ||
    !wheelsAt(e.previousBody,oldStation) || !wheelsAt(e.vehicle,s) ||
    !crossesOrbitalGate(gate,e.previousBody,e.vehicle)) return;
  if(e.nextGate===orbital.gates.length-1) e.finishTicks=e.elapsedTicks;
  else if(e.nextGate) e.splitTicks.push(e.elapsedTicks);
  e.nextGate++;e.missedGate=false;
  // At a reset the motor starts at rest. Reserve a supported upright deck for
  // that operation; entry to inverted regions needs forward momentum.
  if(gate.normal[1]>.87) {
    e.safeDistance=gate.s-2;
    e.safeLateral=clamp(road.offset,-9,9);
  }
}
function accept(e,input,active) {
  const body=e.vehicle,oldStation=e.distance,road=orbital.projectNear(body.position,oldStation);
  const delta=road.station-oldStation, clearance=dot(subtract(body.position,road.point),road.normal);
  if(clearance< -4 || clearance>13 || Math.abs(road.offset)>orbital.halfWidth+4 || Math.abs(delta)>2.5) {
    e.pendingRecovery=true;
    if(!e.recoveryCooldown && recover(e,active)) return;
    e.current=snapshot(body,road,input,e.previous.wheelSpin);
    return;
  }
  e.current=snapshot(body,road,input,e.previous.wheelSpin);
  e.distance=road.station;e.wrongWay=delta<-.03;
  // A roof resting on the inverted road is a crash too. Compare chassis up
  // with this deck's normal so legitimate ceiling driving can continue.
  const overturned=e.deckContact && length(body.velocity)<3 &&
    dot(rotate(body.orientation,[0,1,0]),road.normal)<.4 &&
    body.wheels.filter(w=>w.contact && w.load>0).length<2;
  e.overturnedTicks=overturned ? Math.min(90,e.overturnedTicks+1) : 0;
  if(e.overturnedTicks===90) {
    e.pendingRecovery=true;
    if(!e.recoveryCooldown) recover(e,active);
    return;
  }
  score(e,oldStation,road);
  if(e.finishTicks===null && road.station>orbital.gates[e.nextGate].s+2) e.missedGate=true;
  if(e.ai) {
    e.ai.stalled=body.tick>120 && (delta<.016 || e.missedGate) ? e.ai.stalled+1 : 0;
    if(e.ai.stalled>=150 && !e.recoveryCooldown) recover(e,active);
  }
}
export function stepRocketRace(race,command=NEUTRAL_ROCKET) {
  validateRocketCommand(command);
  if(race.phase==='countdown') {
    if(--race.countdownTicks===0) race.phase='racing';
    return;
  }
  if(race.phase!=='racing') return;
  const active=race.entrants.filter(e=>e.finishTicks===null);
  const inputs=[];
  for(const e of active) inputs[e.id]=e.ai ? planRocketCommand(e,active) : command;
  race.elapsedTicks++;
  const moving=[];
  for(const e of active) {
    e.previous=e.current;e.previousBody=e.vehicle;e.contact=false;e.pairContact=false;
    e.elapsedTicks++;e.recoveryCooldown=Math.max(0,e.recoveryCooldown-1);
    if(e.pendingRecovery || e.vehicle.position.some(n=>Math.abs(n)>2400)) {
      e.pendingRecovery=true;
      if(!e.recoveryCooldown) recover(e,active);
      continue;
    }
    e.vehicle=stepRocketBody(e.vehicle,inputs[e.id],orbital.surface);
    moving.push(e);
  }
  resolveRocketContacts(moving,orbital);
  for(const e of moving) accept(e,inputs[e.id],active);
  classify(race);
  if(race.entrants.every(e=>e.finishTicks!==null)) race.phase='finished';
}
