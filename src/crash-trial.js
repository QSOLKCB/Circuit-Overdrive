// SPDX-License-Identifier: Apache-2.0
import {crashCar,crashBarrier} from './crash-impact.js';
import {damageWorld,driveLabCar,labCondition,resolveLabTick,validateLabCommand} from './crash-damage.js';

export const LAB_TICKS=3600;
export const scenarios=Object.freeze({
  wall:Object.freeze({number:'01',name:'The Wall',target:'Concrete block',aim:'Hold gas down the centreline for a frontal strike.',fixture:crashBarrier(80,-7,-56,7,-56,.65)}),
  glancing:Object.freeze({number:'02',name:'The Glancing Blow',target:'Angled steel rail',aim:'Follow the centreline into the angled rail. Brake or steer after the slide.',fixture:crashBarrier(81,4,-36,-6,-78,.3,'steel')}),
  opposing:Object.freeze({number:'03',name:'Two-Car Impact',target:'Opposing test car',aim:'Launch toward the blue car. Its driver holds a fixed throttle on the opposing heading.'})
});
const pose=car=>({x:car.x,z:car.z,yaw:car.yaw});
export function createTrial(scenario,seed=27,revision=null) {
  if (!Object.hasOwn(scenarios,scenario) || !Number.isInteger(seed) || seed<0 || seed>0xffffffff)
    throw RangeError('Unknown experiment or seed');
  const setup=scenarios[scenario],cars=[crashCar(0,{z:24})];
  if (scenario==='opposing') cars.push(crashCar(1,{x:.10+(seed%17)/100,z:-68,yaw:Math.PI}));
  const world=damageWorld(cars,setup.fixture?[setup.fixture]:[],revision);
  return {scenario,seed,world,phase:'ready',result:null,firstImpact:null,contacts:[],previous:cars.map(pose),
    lastStep:{passes:0,candidates:0,accepted:0,limited:false},lastContacts:[]};
}
export function startTrial(trial) {
  if (trial.phase!=='ready') throw Error('Experiment already armed');
  trial.phase='running';
}
export function stepTrial(trial,cmd) {
  if (trial.phase!=='running') throw Error('Experiment is not running');
  validateLabCommand(cmd);
  const {world}=trial,player=world.cars[0];
  trial.previous=world.cars.map(pose);
  driveLabCar(player,cmd);
  if (world.cars.length===2) driveLabCar(world.cars[1],{throttle:.68,brake:0,steer:0});
  const {contacts,stats}=resolveLabTick(world);
  trial.lastStep=stats;trial.lastContacts=contacts;
  for (const hit of contacts) {
    trial.contacts.push(hit);
    if (hit.newImpact && trial.firstImpact===null) trial.firstImpact=world.tick;
  }
  const struck=trial.firstImpact!==null;
  let result=null;
  if (stats.limited) result='solver limit';
  else if (labCondition(player.damage).disabled) result='vehicle disabled';
  else if (trial.contacts.length>=512) result='instrument capacity';
  else if (struck && world.cars.every(car=>Math.hypot(car.vx,car.vz)<.8 && Math.abs(car.spin)<.15)) result='settled';
  else if (struck && world.tick-trial.firstImpact>=180) result='post-impact run complete';
  else if (world.cars.some(car=>Math.abs(car.x)>23 || car.z< -130 || car.z>40)) result=struck?'impact and run-off':'missed fixture';
  else if (world.tick>=LAB_TICKS) result='time limit';
  if (result) {trial.result=result; trial.phase='finished';}
}
export function latestImpact(trial,id=0) {
  return trial.contacts.findLast(hit=>hit.newImpact && hit.sites.some(site=>site.id===id));
}
