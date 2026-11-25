// SPDX-License-Identifier: Apache-2.0
import {createDerbyArenaWorld,stepDerbyArena} from './derby-arenas.js';
import {createDerbyDrivers,derbyAICommand} from './derby-ai.js';
import {neutralLab,validateLabCommand} from './crash-damage.js';
import {FIELD,PLAYER_ID} from './field.js';

export const DERBY_RULES=1;
export const DERBY_TICK_LIMIT=10800;
const mechanics=['engine','steering','tyres','suspension'];
const matchCalibration=Object.freeze({competitive:true});
const failure=damage=>damage.engine===1000 ? 'engine' : damage.tyres===1000 ? 'tyres' : null;
const condition=damage=>4000-mechanics.reduce((sum,key)=>sum+damage[key],0);

function order(a,b) {
  return Number(b.active)-Number(a.active) ||
    (a.active ? 0 : b.eliminatedTick-a.eliminatedTick) ||
    b.knockouts-a.knockouts || b.inflicted-a.inflicted || b.condition-a.condition || a.id-b.id;
}

function classify(round) {
  const rows=round.world.cars.map(({id,damage})=>{
    const score=round.scores[id];
    return {id,active:score.eliminatedTick===null,knockouts:score.knockouts,
      inflicted:score.inflicted,condition:condition(damage),eliminatedTick:score.eliminatedTick};
  });
  rows.sort(order);
  return Object.freeze(rows.map((row,index)=>Object.freeze({...row,rank:index+1})));
}

export function createDerbyRound({arena,seed,revision=null}) {
  if (!Number.isInteger(seed) || seed<0 || seed>0xffffffff)
    throw RangeError('Derby seed must be a uint32');
  const world=createDerbyArenaWorld(arena,revision);
  const round={world,seed,ticks:0,drivers:createDerbyDrivers(seed),targets:FIELD.map(()=>null),
    scores:FIELD.map(()=>({knockouts:0,inflicted:0,eliminatedTick:null})),
    eliminations:[],standings:null,result:null};
  for (const key of ['world','seed'])
    Object.defineProperty(round,key,{writable:false,configurable:false});
  round.standings=classify(round);
  return round;
}

function snapshotCommand(command) {
  if (!command || typeof command!=='object' ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(command)))
    throw TypeError('Expected derby throttle, brake and steer data');
  const fields=Object.getOwnPropertyDescriptors(command);
  const keys=['throttle','brake','steer'];
  if (Reflect.ownKeys(fields).length!==3 ||
      !keys.every(key=>fields[key] && Object.hasOwn(fields[key],'value')))
    throw TypeError('Expected derby throttle, brake and steer data');
  const copy={throttle:fields.throttle.value,brake:fields.brake.value,steer:fields.steer.value};
  validateLabCommand(copy);
  return copy;
}

// Reapply only the accepted integer increments to a private before-tick
// snapshot to recover the exact failure transition and its causal receipt.
function settleContacts(round,contacts,damage,active) {
  const eliminations=[];
  for (const contact of contacts) {
    if (!contact.newImpact) continue;
    const [a,b]=contact.participants;
    const opposing=contact.kind==='vehicle' && active[a] && active[b];
    const failed=[];
    for (const site of contact.sites) {
      const id=site.id,state=damage[id];
      const increments=Object.entries(site.damage);
      for (const [key,points] of increments) state[key]+=points;
      if (!active[id]) continue;
      const attackerId=opposing ? (id===a ? b : a) : null;
      if (attackerId!==null)
        round.scores[attackerId].inflicted+=increments.reduce((sum,[,points])=>sum+points,0);
      const reason=failure(state);
      if (reason) failed.push({id,tick:round.ticks,reason,damage:Object.freeze({...state}),
        impactId:contact.id,attackerId});
    }
    // Eligibility is snapshotted per receipt. Mutual failures on the same
    // receipt may each receive credit. Later receipts see both cars as wrecks.
    for (const event of failed) {
      active[event.id]=false;
      round.scores[event.id].eliminatedTick=round.ticks;
      if (event.attackerId!==null) round.scores[event.attackerId].knockouts++;
      const entry=Object.freeze({...event,sequence:round.eliminations.length+1});
      round.eliminations.push(entry); eliminations.push(entry);
    }
  }
  return eliminations;
}

function settle(round,reason,winnerId=null,technicalStop=null) {
  const result=Object.freeze({reason,winnerId,ticks:round.ticks,standings:round.standings,technicalStop});
  Object.defineProperty(round,'result',{value:result,writable:false,configurable:false});
  Object.freeze(round.eliminations);
  return result;
}

export function stepDerbyRound(round,command) {
  if (round.result) throw Error('Derby settled; create a fresh round');
  const player=snapshotCommand(command);
  const {world,drivers}=round;
  const damage=world.cars.map(car=>({...car.damage}));
  const active=round.scores.map(score=>score.eliminatedTick===null);
  // Every decision reads the same pre-step poses and operational states.
  const commands=world.cars.map(car=>car.id===PLAYER_ID ? (active[car.id] ? player : neutralLab)
    : derbyAICommand(drivers[car.id],car,world.cars,active,world.arena));
  const step=stepDerbyArena(world,commands,matchCalibration);
  if (step.technicalStop) {
    // Partial interval impulses remain available for diagnosis. The failed
    // attempt awards no scores and leaves the last certified standings intact.
    return {...step,eliminations:[],result:settle(round,'technical-stop',null,step.technicalStop)};
  }

  round.ticks++;
  const eliminations=settleContacts(round,step.contacts,damage,active);
  round.standings=classify(round);
  const survivors=round.standings.filter(row=>row.active);
  for (const {id} of world.cars) {
    const target=drivers[id]?.target;
    round.targets[id]=active[id] && active[target] ? target : null;
  }
  const human=world.cars[PLAYER_ID];
  if (active[PLAYER_ID]) {
    let nearest=Infinity;
    for (const rival of world.cars) {
      if (rival.id===PLAYER_ID || !active[rival.id]) continue;
      const distance=(rival.x-human.x)**2+(rival.z-human.z)**2;
      if (distance<nearest) {nearest=distance; round.targets[PLAYER_ID]=rival.id;}
    }
  }
  if (!survivors.length) settle(round,'simultaneous-elimination');
  else if (survivors.length===1) settle(round,'last-car-standing',survivors[0].id);
  else if (round.ticks===DERBY_TICK_LIMIT) settle(round,'time-limit',survivors[0].id);
  return {...step,eliminations,result:round.result};
}
