// SPDX-License-Identifier: Apache-2.0
// Read-only workshop descriptions and proposals. The Vault owns persistence.
import {garageModel} from './garage-catalog.js';
import {validateGarage} from './garage.js';
import {PART_SLOTS,vehiclePart} from './vehicle-parts.js';
import {compileVehicleBuild,stockUpgradeBuild} from './vehicle-builds.js';
import {transactGarageInstallation,validateInstallationAction} from './garage-transactions.js';

export const MACHINE_SHOP_SECTIONS=Object.freeze([
  ['engine','Engine bay'],['intake','Intake'],['exhaust','Exhaust'],['gearbox','Gearbox'],
  ['finalDrive','Final drive'],['tyres','Tyres'],['suspension','Suspension'],
  ['steering','Steering'],['paint','Paint shop']
].map(Object.freeze));
const reasons={
  'already-fitted':'Already fitted with these settings.',
  'insufficient-credits':'Insufficient credits for acquisition and fitting.',
  'revision-exhausted':'Garage revision is exhausted; fitting is unavailable.',
  'unrelated-tuning':'A fitting may change only the selected part and its supported setup.',
  'invalid-state':'The garage is not a valid current save.',
  'invalid-request':'The part or setup is outside the supported workshop choices.',
  'invalid-build':'The proposed combination exceeds the supported physical limits.'
};
export function machineShopOverview(state,ownedVehicleId){
  const accepted=validateGarage(state);
  const car=accepted.bays.find(car=>car?.ownedVehicleId===ownedVehicleId);
  if(!car)throw RangeError('Select an actually owned vehicle for the Machine Shop');
  const compiled=compileVehicleBuild(car.modelId,car.build);
  return Object.freeze({car,model:garageModel(car.modelId),credits:accepted.credits,revision:accepted.revision,
    build:compiled.build,recipe:compiled.recipe,
    installed:Object.freeze(PART_SLOTS.map(slot=>Object.freeze({slot,part:vehiclePart(slot,car.build.parts[slot])}))),
    repairs:'No repairs required.'});
}

export function machineShopProposal(state,ownedVehicleId,slot,partId,tuning){
  let action=null,proposed=null;
  try{
    const overview=machineShopOverview(state,ownedVehicleId),prior=stockUpgradeBuild(overview.car.modelId,overview.build);
    action=validateInstallationAction({type:'install',ownedVehicleId,slot,partId,tuning,expectedRevision:overview.revision});
    const inventory=Object.fromEntries(Object.entries(prior.inventory).map(([key,ids])=>[key,
      key===slot?[...new Set([...ids,partId])]:ids.slice()]));
    try{proposed=compileVehicleBuild(overview.car.modelId,{...prior,parts:{...prior.parts,[slot]:partId},tuning:action.tuning,inventory});}
    catch(error){return Object.freeze({accepted:false,reason:'invalid-build',detail:error.message,action,proposed:null,receipt:null});}
    const transition=transactGarageInstallation(state,action);
    return Object.freeze({accepted:transition.accepted,reason:transition.reason??null,
      detail:transition.accepted?'Ready for explicit acquisition/fitting review.':reasons[transition.reason]??transition.reason,
      action,proposed,receipt:transition.receipt??null});
  }catch(error){return Object.freeze({accepted:false,reason:'invalid-request',detail:error.message,action:null,proposed:null,receipt:null});}
}

// These are compiler fields with their physical units, never measured speed or
// acceleration scores. The Proving Grounds owns benchmark measurements.
export function machineShopSpecificationRows(recipe,slot){
  const n=value=>String(Number(value.toFixed(6)));
  const rows={
    engine:[['Effective torque curve',recipe.engine.torqueCurve.map(([rpm,torque])=>rpm+' rpm: '+n(torque)+' Nm').join(' · ')],
      ['Idle / redline',recipe.engine.idleRPM+' / '+recipe.engine.redlineRPM+' rpm'],['Engine braking',n(recipe.engine.engineBrake)+' Nm']],
    gearbox:[['Forward gear ratios',recipe.gearbox.ratios.map(n).join(' / ')],['Final-drive ratio',n(recipe.gearbox.finalDrive)],
      ['Shift interruption',n(recipe.gearbox.shiftTime)+' s'],['Drivetrain efficiency',n(recipe.gearbox.efficiency)]],
    tyres:[['Grip coefficient',n(recipe.tyres.grip)],['Cornering stiffness',n(recipe.tyres.corneringStiffness)+' Ns/m'],
      ['Rolling-resistance coefficient',n(recipe.tyres.rollingResistance)]],
    suspension:[['Spring rate per wheel',n(recipe.suspension.spring)+' N/m'],['Damper per wheel',n(recipe.suspension.damper)+' Ns/m'],
      ['Rest length',n(recipe.suspension.restLength)+' m'],['Available travel',n(recipe.suspension.travel)+' m'],
      ['Static compression on level ground',n(recipe.mass*9.81/(4*recipe.suspension.spring))+' m']],
    steering:[['Maximum steering angle',n(recipe.steering.maxAngle)+' rad'],['Steering rate',n(recipe.steering.rate)+' rad/s'],
      ['Speed-reduction coefficient',n(recipe.steering.speedReduction)+' s/m']],
    paint:[['Physical changes','None. Paint is cosmetic.']]
  };
  rows.intake=rows.exhaust=rows.engine;rows.finalDrive=rows.gearbox;
  if(slot==='overview')return Object.freeze([
    ['Mass',n(recipe.mass)+' kg'],['Chassis width / length / height',[recipe.chassis.width,recipe.chassis.length,recipe.chassis.height].map(n).join(' / ')+' m'],
    ['Wheel radius',n(recipe.wheel.radius)+' m'],['Wheelbase / track',n(recipe.wheel.wheelbase)+' / '+n(recipe.wheel.track)+' m'],
    ['Drive wheels',recipe.drive],['Quadratic drag coefficient',n(recipe.drag)+' kg/m']
  ].map(Object.freeze));
  if(!Object.hasOwn(rows,slot))throw RangeError('Unknown Machine Shop section');
  return Object.freeze(rows[slot].map(Object.freeze));
}
