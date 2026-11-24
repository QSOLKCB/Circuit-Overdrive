// SPDX-License-Identifier: Apache-2.0
import {clamp} from '../vendor/vanillajs/modules/math/index.js';
import {DRIVE_CAP,LAB_STEP,impactWorld,stepImpacts} from './crash-impact.js';

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
  const world=impactWorld(cars,fixtures,revision);
  for (const car of world.cars) car.damage=newDamage();
  return world;
}

// Integrate horizontal road forces once per tick. Collision integration alone
// owns pose. In particular the tyre law never replaces velocity with heading.
export function driveLabCar(car,cmd) {
  validateLabCommand(cmd);
  const condition=labCondition(car.damage);
  const c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  let forward=-s*car.vx-c*car.vz, side=c*car.vx-s*car.vz;
  const thrust=condition.disabled ? 0 : 12*cmd.throttle*condition.drive;
  const resistance=.17+.0012*forward*forward+17*cmd.brake;
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
  const result=stepImpacts(world);
  for (const contact of result.contacts) {
    const joules=Math.min(contact.dissipated,contact.normalEnergy)/contact.sites.length;
    const severity=contact.newImpact ? Math.max(0,Math.floor((joules-1500)/1200)) : 0;
    for (const site of contact.sites) {
      const car=world.cars.find(body=>body.id===site.id);
      site.damage=charge(car.damage,site.zone,severity);
    }
  }
  return result;
}
