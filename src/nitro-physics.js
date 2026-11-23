// SPDX-License-Identifier: Apache-2.0
import {clamp, dot, quatConjugate, rotate} from '../vendor/vanillajs/modules/math/index.js';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {carRecipe, controls, loadSuspension, rideHeight, STEP} from './sim.js';

export const NEUTRAL_NITRO = Object.freeze({throttle:0, brake:0, steer:0, drift:false, boost:false});
export const NITRO_CAPACITY = 100000; // Thousandths of one dashboard unit.
const boostAcceleration = 11, boostLimit = 68, boostCost = 440;
const gripCar = createVehicle(carRecipe);
const slideCar = createVehicle({...carRecipe, tyres:{...carRecipe.tyres, grip:1.10, corneringStiffness:2500}});
const commandFields = Object.keys(NEUTRAL_NITRO);

export function validateNitroCommand(command) {
  if (!command || Object.getPrototypeOf(command) !== Object.prototype ||
      Reflect.ownKeys(command).length !== commandFields.length) throw TypeError('Invalid Nitro command fields');
  for (const field of commandFields) {
    const property = Object.getOwnPropertyDescriptor(command,field);
    if (!property?.enumerable || !Object.hasOwn(property,'value')) throw TypeError('Missing Nitro input '+field);
    const value = property.value;
    if (field === 'drift' || field === 'boost') {
      if (typeof value !== 'boolean') throw TypeError('Invalid Nitro '+field);
    } else if (!Number.isFinite(value) || value < (field === 'steer' ? -1 : 0) || value > 1) {
      throw RangeError('Invalid Nitro '+field);
    }
  }
  return command;
}

export function nitroState(station) {
  return {energy:0, charging:false, boosting:false, chargedTotal:0, spentTotal:0,
    slideTicks:0, steerSign:0, chargeLock:0, frontier:station,
    hadSupport:false, airborne:false, launch:false, landed:false, airTicks:0, lastAirTicks:0,
    takeoffS:station, takeoffRamp:-1, peakHeight:0, lastAirVY:0, landSpeedY:0,
    landingTicks:0, cleanFlight:false, launches:0, landings:0,
    stunts:0, points:0, lastRewardRamp:-1, rewarded:false};
}

export function resetNitroAfterRecovery(entrant) {
  // Re-covering old road cannot issue energy or a second award at the same ramp.
  const old = entrant.nitro;
  entrant.nitro = {...nitroState(old.frontier), stunts:old.stunts, points:old.points,
    lastRewardRamp:old.lastRewardRamp, chargedTotal:old.chargedTotal, spentTotal:old.spentTotal,
    launches:old.launches, landings:old.landings};
}

export function asphaltSupport(state) {
  let count = 0;
  for (const wheel of state.wheels) {
    if (wheel.grounded && wheel.surfaceId === 'asphalt' && wheel.load > 150) count++;
  }
  return count;
}

function airControl(state, command) {
  if (!command.drift) return state;
  const angular = rotate(quatConjugate(state.orientation), state.angularVelocity);
  const targets = [.65*(command.throttle-command.brake), -.60*command.steer, .50*command.steer];
  const impulse = rotate(state.orientation,targets.map((target,i)=>clamp(target-angular[i],-STEP,STEP)));
  return {...state,angularVelocity:state.angularVelocity.map((value,i)=>value+impulse[i])};
}

// All impulses precede the vendor's four contact/gravity substeps. A physical
// collision may absorb the delivered energy; it cannot trigger an extra tick.
export function advanceNitroVehicle(entrant, command, course, world) {
  const n = entrant.nitro;
  let state = loadSuspension(entrant.vehicle);
  const forward = rotate(state.orientation,[0,0,-1]);
  const forwardSpeed = dot(forward,state.velocity);
  const onRoad = asphaltSupport(state) >= 2 && Math.abs(entrant.current.lateral) < course.halfWidth &&
    !entrant.recoveryCooldown && !entrant.wrongWay;
  const sliding = command.drift && onRoad && forwardSpeed >= 10;
  const input = controls(state,command);
  if (sliding) {
    // A bounded yaw couple models rear breakaway. The tyre solver still owns
    // lateral force, load, slip and the integrated chassis orientation.
    const normal = course.sample(entrant.current.s,entrant.current.lateral).normal;
    const target = -command.steer * Math.min(.80, forwardSpeed*.032);
    const impulse = clamp(target-dot(state.angularVelocity,normal),-1.9*STEP,1.9*STEP);
    state = {...state,angularVelocity:state.angularVelocity.map((v,i)=>v+normal[i]*impulse)};
  } else if (n.airborne) {
    state = airControl(state,command);
  }
  let spent = 0;
  if (command.boost && onRoad && forwardSpeed > 1 && command.throttle > 0 && !command.brake &&
      state.gear > 0 && !entrant.contact && n.energy > 0) {
    const headroom = boostLimit-Math.hypot(...state.velocity);
    const cost = Math.min(boostCost,n.energy,Math.floor(headroom*boostCost/(boostAcceleration*STEP)));
    if (cost > 0) {
      const delta = boostAcceleration*STEP*cost/boostCost;
      state = {...state,velocity:state.velocity.map((v,i)=>v+forward[i]*delta)};
      spent = cost;
    }
  }
  const next = (sliding ? slideCar : gripCar).step(state,input,world,STEP);
  n.boosting = !next.needsRecovery && spent>0;
  if (n.boosting) {
    n.energy -= spent;
    n.spentTotal += spent;
  }
  return next;
}

function observeFlight(entrant,course) {
  const n=entrant.nitro, state=entrant.vehicle;
  const grounded=state.wheels.some(w=>w.grounded);
  n.launch=n.landed=n.rewarded=false;
  if (!grounded && n.hadSupport) {
    if (!n.airborne && !n.landingTicks) {
      n.launch=true;
      n.launches++;
      n.takeoffS=entrant.previous.s;
      n.takeoffRamp=course.rampAt?.(n.takeoffS) ?? -1;
      n.peakHeight=0;
      n.airTicks=0;
      n.cleanFlight=true;
    }
    n.airborne=true;
    n.landingTicks=0;
    n.airTicks++;
    n.lastAirVY=state.velocity[1];
    n.peakHeight=Math.max(n.peakHeight,entrant.current.y-entrant.current.groundY-rideHeight);
  } else if (grounded) {
    n.hadSupport=true;
    if (n.airborne) {
      n.airborne=false;
      n.lastAirTicks=n.airTicks;
      n.landSpeedY=n.lastAirVY;
      n.landingTicks=1;
    }
    if (n.landingTicks && asphaltSupport(state)>=2) {
      if (++n.landingTicks >= 4) {
        n.landed=true;
        n.landings++;
        n.landingTicks=0;
        n.airTicks=0;
      }
    } else if (n.landingTicks) {
      n.landingTicks=1;
    }
  }
  if (entrant.contact || entrant.missedGate || entrant.wrongWay) n.cleanFlight=false;
}

export function observeNitro(entrant,command,course) {
  const n=entrant.nitro, state=entrant.vehicle, p=entrant.current;
  observeFlight(entrant,course);
  n.charging=false;
  const forward=dot(state.velocity,rotate(state.orientation,[0,0,-1]));
  const side=Math.abs(dot(state.velocity,rotate(state.orientation,[1,0,0])));
  const angle=Math.atan2(side,forward);
  const steerSign=Math.abs(command.steer)>=.14 ? Math.sign(command.steer) : 0;
  if (steerSign && n.steerSign && steerSign!==n.steerSign) n.chargeLock=15;
  if (steerSign) n.steerSign=steerSign;
  if (entrant.contact) n.chargeLock=30;
  n.chargeLock=Math.max(0,n.chargeLock-1);
  const progress=p.s-n.frontier;
  n.frontier=Math.max(n.frontier,p.s);
  const loaded=asphaltSupport(state);
  const slip=state.wheels.reduce((max,w)=>w.grounded && w.load>150 ? Math.max(max,Math.abs(w.lateralSpeed)) : max,0);
  const drifting=command.drift && !n.boosting && !n.chargeLock && !entrant.recoveryCooldown &&
    !entrant.missedGate && !entrant.wrongWay && loaded>=3 && Math.abs(p.lateral)<course.halfWidth-1 &&
    forward>=10 && progress>.08 && angle>=.032 && angle<=.67 && slip>=.65;
  n.slideTicks=drifting && (steerSign || n.slideTicks>0) ? n.slideTicks+1 : 0;
  if (n.slideTicks>=8 && steerSign) {
    const quality=clamp((angle-.025)/.24,0,1)*clamp(slip/3,0,1);
    const gain=Math.min(NITRO_CAPACITY-n.energy,Math.round(95+440*quality));
    n.energy+=gain;
    n.chargedTotal+=gain;
    n.charging=gain>0;
  }
  course.settleStunt?.(entrant);
}
