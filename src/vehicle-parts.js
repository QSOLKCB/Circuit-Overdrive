// SPDX-License-Identifier: Apache-2.0
// Original finite parts catalogue. Prices are fictional integer credits;
// specification changes are resolved by the separately validated compiler.
import {garageModel} from './garage-catalog.js';

const freeze=value=>{
  if(value && typeof value==='object'){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const PART_CATALOG_REVISION=1;
export const MAX_PART_PRICE=950;
export const PART_SLOTS=Object.freeze(['engine','intake','exhaust','gearbox','finalDrive',
  'tyres','suspension','steering','paint']);
export const PART_TUNING_LIMITS=freeze({finalDrive:[-4,4],spring:[-2,2],damper:[-2,2],travel:[-2,2],steering:[-2,2]});
const authored={
  engine:[
    ['stock','Stock engine',0,'Original model-specific five-point torque curve.'],
    ['street','Street rebuild',250,'Adds 18 / 28 / 32 / 28 / 18 Nm at the stock RPM points.'],
    ['performance','Performance engine',550,'Adds 35 / 60 / 70 / 60 / 35 Nm at the stock RPM points.'],
    ['competition','Competition engine',950,'Adds 50 / 80 / 90 / 90 / 55 Nm; combined torque must remain at or below 550 Nm.']
  ],
  intake:[['stock','Stock intake',0,'Original intake torque contribution.'],
    ['duct','Ducted intake',80,'Adds 2 / 6 / 9 / 12 / 7 Nm at the five stock RPM points.']],
  exhaust:[['stock','Stock exhaust',0,'Original exhaust torque contribution.'],
    ['flow','Free-flow exhaust',100,'Adds 3 / 5 / 10 / 13 / 8 Nm at the five stock RPM points.']],
  gearbox:[['stock','Balanced gearbox',0,'Original 3.1 / 2.05 / 1.48 / 1.12 / 0.89 ratios.'],
    ['short','Short gearbox',160,'3.45 / 2.3 / 1.65 / 1.25 / 1.0 ratios multiply wheel torque and change shift speeds.'],
    ['long','Long gearbox',160,'2.8 / 1.8 / 1.3 / 1.0 / 0.75 ratios reduce RPM at a given road speed.']],
  finalDrive:[['stock','Stock final drive',0,'Original model-specific final-drive ratio.'],
    ['adjustable','Adjustable final drive',120,'Stock ratio + 0.2, with integer trims of 0.1 from -4 to +4.']],
  tyres:[['stock','Stock tyres',0,'Original model-specific grip, velocity cornering stiffness and rolling resistance.'],
    ['touring','Touring tyres',140,'Grip +0.04, cornering stiffness +250 Ns/m, rolling resistance -0.002.'],
    ['performance','Performance tyres',220,'Grip +0.18, cornering stiffness +850 Ns/m, rolling resistance +0.001.'],
    ['economy','Economy tyres',90,'Grip -0.12, cornering stiffness -400 Ns/m, rolling resistance -0.003.']],
  suspension:[['stock','Stock suspension',0,'Original spring, damper, rest length and suspension travel.'],
    ['adjustable','Adjustable suspension',180,'Spring +10%, damper +5%, rest/travel +0.01 m, plus bounded integer setup trims.']],
  steering:[['stock','Stock steering',0,'Original steering angle, rate and speed reduction.'],
    ['quick','Quick steering',100,'Angle +0.02 rad and rate +0.4 rad/s, plus bounded setup trims.']],
  paint:[['factory','Factory finish',0,'Original finish. Cosmetic only; no physical recipe fields change.'],
    ['oxide','Oxide Ember',60,'Original oxide red and pale copper finish. Cosmetic only.'],
    ['seafoam','Seafoam Wire',60,'Original sea-green and cream finish. Cosmetic only.'],
    ['midnight','Midnight Alloy',60,'Original midnight blue and silver finish. Cosmetic only.']]
};
const catalogue=freeze(Object.fromEntries(PART_SLOTS.map(slot=>[slot,
  authored[slot].map(([id,name,price,description])=>({id,slot,name,price,description}))])));

export function vehicleParts(slot){
  if(typeof slot!=='string'||!PART_SLOTS.includes(slot))throw RangeError('Unknown vehicle part slot');
  return catalogue[slot];
}
export function vehiclePart(slot,id){
  const part=vehicleParts(slot).find(part=>part.id===id);
  if(!part)throw RangeError('Unknown '+slot+' part');
  return part;
}

const finishes=freeze({
  oxide:{name:'Oxide Ember',body:'#9b4335',accent:'#e9c07a'},
  seafoam:{name:'Seafoam Wire',body:'#4c9e8c',accent:'#e8edcc'},
  midnight:{name:'Midnight Alloy',body:'#243451',accent:'#b8c5de'}
});
export function vehiclePaint(id,modelId){
  vehiclePart('paint',id);
  const model=garageModel(modelId);
  return id==='factory'?model.finish:finishes[id];
}
