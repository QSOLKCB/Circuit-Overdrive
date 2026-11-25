// SPDX-License-Identifier: Apache-2.0
import {clamp} from '../vendor/vanillajs/modules/math/index.js';
import {DRIVE_CAP,LAB_STEP,derbyImpactWorld,impactWorld,stepImpacts} from './crash-impact.js';

export const COMPONENTS=Object.freeze(['front','rear','left','right','engine','steering','tyres','suspension']);
const allocations=Object.freeze({
  front:{engine:.90,steering:.38,tyres:.23,suspension:.44},
  rear:{engine:.08,tyres:.22,suspension:.36},
  left:{steering:.28,tyres:.72,suspension:.58},
  right:{steering:.28,tyres:.72,suspension:.58}
});
export const neutralLab=Object.freeze({throttle:0,brake:0,steer:0});

export function newDamage() {return Object.fromEntries(COMPONENTS.map(key=>[key,0]));}
export function checkDamage(damage) {
  if (!damage || Object.keys(damage).length!==COMPONENTS.length ||
      COMPONENTS.some(k=>!Object.hasOwn(damage,k) || !Number.isInteger(damage[k]) || damage[k]<0 || damage[k]>1000))
    throw RangeError('Invalid laboratory damage state');
  return damage;
}
export function labCondition(damage) {
  checkDamage(damage);
  return {drive:1-.00075*damage.engine,steer:1-.00065*damage.steering,
    grip:1-.00068*damage.tyres,damping:1-.00060*damage.suspension,
    disabled:damage.engine===1000 || damage.tyres===1000};
}
export function validateLabCommand(cmd) {
  if (!cmd || Object.keys(cmd).length!==3 ||
      ![cmd.throttle,cmd.brake].every(v=>Number.isFinite(v) && v>=0 && v<=1) ||
      !Number.isFinite(cmd.steer) || Math.abs(cmd.steer)>1) throw RangeError('Invalid laboratory controls');
}
export function damageWorld(cars,fixtures,revision=null) {
  return withDamage(impactWorld(cars,fixtures,revision));
}
export function derbyDamageWorld(cars,fixtures,revision=null) {
  return withDamage(derbyImpactWorld(cars,fixtures,revision));
}
function withDamage(world) {
  for (const car of world.cars) car.damage=newDamage();
  return world;
}

// Integrate horizontal road forces once per tick. Collision integration alone
// owns pose. In particular the tyre law never replaces velocity with heading.
export function driveLabCar(car,cmd) {
  applyRoadForces(car,cmd,false);
}

function applyRoadForces(car,cmd,competitive) {
  validateLabCommand(cmd);
  const condition=labCondition(car.damage);
  const c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  let forward=-s*car.vx-c*car.vz, side=c*car.vx-s*car.vz;
  const reversing=competitive && !condition.disabled && cmd.throttle===0 && cmd.brake>0 && forward<=0;
  const thrust=condition.disabled ? 0 : (reversing ? -6*cmd.brake*clamp(1+forward/9,0,1) : 12*cmd.throttle)*condition.drive;
  const resistance=.17+.0012*forward*forward+(reversing ? 0 : 17*cmd.brake);
  forward=Math.sign(forward)*Math.max(0,Math.abs(forward)-resistance*LAB_STEP)+thrust*LAB_STEP;
  side*=1-4.8*condition.grip*LAB_STEP;
  const target=-cmd.steer*condition.steer*clamp(forward/9,-1,1)*1.45/(1+.018*Math.abs(forward));
  car.spin=clamp(car.spin+(target-car.spin)*4.6*condition.damping*LAB_STEP,-12,12);
  const scale=Math.min(1,DRIVE_CAP/(Math.hypot(forward,side)||1));
  car.vx=(-s*forward+c*side)*scale; car.vz=(-c*forward-s*side)*scale;
}

function charge(damage,zone,severity) {
  const deltas={};
  for (const [component,weight] of Object.entries({[zone]:1,...allocations[zone]})) {
    const delta=Math.min(1000-damage[component],Math.floor(severity*weight));
    if (delta>0) {damage[component]+=delta; deltas[component]=delta;}
  }
  return deltas;
}

// The charging function is private. There is no public interface that accepts
// an alleged impact or recorded damage and installs it into a running trial.
export function resolveLabTick(world) {
  return resolveDamageTick(world,false);
}

function resolveDamageTick(world,competitive) {
  const result=stepImpacts(world);
  for (const contact of result.contacts) {
    const joules=Math.min(contact.dissipated,contact.normalEnergy)/contact.sites.length;
    const joulesPerPoint=competitive ? (contact.kind==='vehicle' ? 100 : 800) : 1200;
    const severity=contact.newImpact ? Math.max(0,Math.floor((joules-1500)/joulesPerPoint)) : 0;
    for (const site of contact.sites) {
      const car=world.cars.find(body=>body.id===site.id);
      site.damage=charge(car.damage,site.zone,severity);
    }
  }
  return result;
}

// Commands are in the world's ascending driver-ID order. Validate and copy
// the full batch first so a rejected rival command cannot move another car.
export function stepDerbyTick(world,commands,{competitive=false}={}) {
  if (world?.discipline!=='derby') throw TypeError('Expected a derby damage world');
  if (world.technicalStop) throw Error('Derby impact world stopped; create a fresh world');
  if (!Array.isArray(commands) || commands.length!==world.cars.length)
    throw RangeError('Expected one derby command per car');
  const accepted=world.cars.map((car,index)=>{
    const command=Object.getOwnPropertyDescriptor(commands,String(index))?.value;
    if (!command || typeof command!=='object') throw TypeError('Expected derby command data');
    const fields=Object.getOwnPropertyDescriptors(command);
    if (Reflect.ownKeys(fields).length!==3 ||
        !['throttle','brake','steer'].every(key=>fields[key] && Object.hasOwn(fields[key],'value')))
      throw TypeError('Expected throttle, brake and steer data');
    const snapshot={throttle:fields.throttle.value,brake:fields.brake.value,steer:fields.steer.value};
    validateLabCommand(snapshot);
    return labCondition(car.damage).disabled ? neutralLab : snapshot;
  });
  for (const [index,car] of world.cars.entries()) applyRoadForces(car,accepted[index],competitive);
  // Enclosed matches have shorter run-up than the diagnostic lab. The arena
  // calibration retains the entry-energy floor and localized component weights.
  return {...resolveDamageTick(world,competitive),commands:accepted};
}
