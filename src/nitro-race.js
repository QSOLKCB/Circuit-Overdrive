// SPDX-License-Identifier: Apache-2.0
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {aiCommand} from './ai.js';
import {resolveCarContacts} from './contact.js';
import {carRecipe,classify,contactRail,createRace,recoverCar,resetCar,score,snapshot,startRace} from './sim.js';
import {advanceNitroVehicle,asphaltSupport,NEUTRAL_NITRO,nitroState,observeNitro,resetNitroAfterRecovery,validateNitroCommand} from './nitro-physics.js';

function prepare(race) {
  race.discipline='nitro';
  for (const entrant of race.entrants) entrant.nitro=nitroState(entrant.distance);
  return race;
}

export function createNitroRace(seed,course) {
  if (course?.discipline!=='nitro' || course.closed) throw RangeError('Expected a Nitro sprint course');
  return prepare(createRace(seed,course));
}
export function startNitroRace(race) {
  startRace(race);
  prepare(race);
}
export function recoverNitroCar(race) {
  if (!recoverCar(race)) return false;
  resetNitroAfterRecovery(race.player);
  return true;
}

function repair(entrant,active,course,damaged) {
  const restored=resetCar(entrant,active,course,damaged);
  if (restored) resetNitroAfterRecovery(entrant);
  return restored;
}

function resolveRail(entrant,course,road=course.project(entrant.vehicle.position[0],entrant.vehicle.position[2])) {
  const state=entrant.vehicle;
  if (state.wheels.every(w=>!w.grounded)) {
    const q=state.orientation, box=carRecipe.chassis;
    const halfHeight=(box.width*Math.abs(rotate(q,[1,0,0])[1]) + box.height*Math.abs(rotate(q,[0,1,0])[1]) +
      box.length*Math.abs(rotate(q,[0,0,-1])[1])) / 2;
    if (state.position[1]-halfHeight>road.y+course.railHeight) return;
  }
  if (contactRail(state,road,course)) entrant.contact=true;
}

function drive(entrant,input,requestRecovery,active,course,world) {
  entrant.previous=entrant.current;
  entrant.elapsedTicks++;
  entrant.recoveryCooldown=Math.max(0,entrant.recoveryCooldown-1);
  if (requestRecovery && !entrant.recoveryCooldown && repair(entrant,active,course,false)) return;
  try {
    entrant.vehicle=advanceNitroVehicle(entrant,input,course,world);
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    repair(entrant,active,course,true);
    return;
  }
  const state=entrant.vehicle, road=course.project(state.position[0],state.position[2]);
  entrant.contact=false;
  entrant.pairContact=false;
  if (state.needsRecovery || Math.abs(road.s-entrant.previous.s)>2.5 ||
      state.position[1]<road.y-3 || Math.abs(road.lateral)>course.barrierOffset+3) {
    repair(entrant,active,course,true);
    return;
  }
  resolveRail(entrant,course,road);
}

function accept(entrant,input,active,course) {
  const state=entrant.vehicle, road=course.project(state.position[0],state.position[2]);
  if (!state.tick) {
    entrant.previous=entrant.current=snapshot(state,road);
    return;
  }
  const ds=road.s-entrant.previous.s;
  if (Math.abs(ds)>2.5) {
    repair(entrant,active,course,true);
    return;
  }
  entrant.current=snapshot(state,road);
  entrant.distance=road.s;
  entrant.wrongWay=ds<-.035;
  const supported=asphaltSupport(state)>=2;
  if (supported && Math.abs(road.lateral)<=course.halfWidth) score(entrant,ds,course);
  if (entrant.finishTicks===null && road.s>course.gates[entrant.nextGate].s+.001) entrant.missedGate=true;
  if (!entrant.missedGate && !entrant.contact && !entrant.wrongWay && Math.abs(road.lateral)<course.halfWidth-1.5 &&
      state.wheels.every(w=>w.grounded && w.surfaceId==='asphalt')) {
    const lastGate=course.gates[entrant.nextGate-1];
    // Recover at or behind the latest credited gate, including after a jump
    // that travelled over a timing plane without valid tyre support.
    entrant.safeDistance=Math.min(road.s,lastGate?.s ?? entrant.safeDistance);
    entrant.safeLateral=road.lateral;
  }
  observeNitro(entrant,input,course);
}

// Stable six-car ordering: plan from the previous field, integrate all six,
// resolve the shared swept contacts, then admit gates, charge and stunt awards.
export function stepNitroRace(race,command=NEUTRAL_NITRO) {
  validateNitroCommand(command);
  if (race.phase==='countdown') {
    if (--race.countdownTicks===0) race.phase='racing';
    return;
  }
  if (race.phase!=='racing') return;
  const course=race.course, active=race.entrants.filter(e=>e.finishTicks===null);
  const recover=[];
  const commands=active.map((entrant,i)=>{
    if (!entrant.ai) return command;
    const planned=course.driverCommand ? course.driverCommand(entrant,active) :
      {...aiCommand(entrant,active,course),drift:false,boost:false};
    const {recover:request=false,...input}=planned;
    if (typeof request!=='boolean') throw TypeError('Invalid Nitro AI recovery request');
    recover[i]=request;
    return validateNitroCommand(input);
  });
  race.elapsedTicks++;
  const world={sampleSurface:course.sampleSurface,barriers:[]};
  active.forEach((e,i)=>drive(e,commands[i],recover[i],active,course,world));
  resolveCarContacts(active,carRecipe.chassis,resolveRail,course);
  active.forEach((e,i)=>accept(e,commands[i],active,course));
  classify(race);
  if (race.player.finishTicks!==null) race.phase='finished';
}
