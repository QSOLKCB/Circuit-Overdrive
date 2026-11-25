// SPDX-License-Identifier: Apache-2.0
// Game-owned build authority. No garage storage, DOM, or racing recipe imports.
import {validateVehicle, VEHICLE_FORMAT} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {garageModel} from './garage-catalog.js';
import {garageArray, garageInteger, garageRecord} from './garage-data.js';
import {PART_SLOTS, PART_TUNING_LIMITS, vehiclePart, vehicleParts} from './vehicle-parts.js';

export const BUILD_FORMAT = 'circuit-overdrive.vehicle-build';
export const BUILD_VERSION = 1;
export const BUILD_RULES = 1;
export const BUILD_PART_RULES = 2;
export const SUPPORTED_BUILD_RULES = Object.freeze([BUILD_RULES,BUILD_PART_RULES]);
export const BUILD_BYTES = 2048;
export const BUILD_ENGINE_REVISION = '9d95d74b355ec17add32db0b55f0f71130f9c004';
const slots = PART_SLOTS;
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

// Original arcade specifications, SI units. Each row is complete; none inherits
// the competitive Touring/Nitro/Rocket/Derby configuration or a mutable preset.
// Wheel centres/radii match the six authored showroom silhouettes.
const specifications = {
  'cinder-two': {mass:1080, chassis:[1.75,4.25,1.20], wheel:[.34,2.465,1.75],
    suspension:[.24,.19,34000,3100], tyres:[1.02,2600,.016], steering:[.48,1.8,.035],
    torque:[105,175,210,185,130], drive:'front', finalDrive:3.9, drag:.44},
  lilt: {mass:850, chassis:[1.65,3.58,1.32], wheel:[.32,2.0764,1.65],
    suspension:[.23,.18,29000,2700], tyres:[1.06,2800,.015], steering:[.52,2.4,.030],
    torque:[85,140,170,150,105], drive:'front', finalDrive:4.1, drag:.39},
  'evening-line': {mass:1510, chassis:[1.86,4.85,1.15], wheel:[.35,2.813,1.86],
    suspension:[.26,.21,42000,4100], tyres:[1.08,3300,.014], steering:[.43,1.4,.045],
    torque:[150,260,310,280,195], drive:'rear', finalDrive:3.5, drag:.38},
  'rivet-eight': {mass:1610, chassis:[2.02,4.68,1.20], wheel:[.38,2.7144,2.02],
    suspension:[.27,.22,46000,4200], tyres:[1.08,3200,.017], steering:[.46,1.6,.040],
    torque:[230,390,450,380,260], drive:'rear', finalDrive:3.8, drag:.56},
  yardhand: {mass:1980, chassis:[1.94,4.95,1.55], wheel:[.41,2.871,1.94],
    suspension:[.32,.26,50000,4700], tyres:[.94,2900,.023], steering:[.45,1.3,.050],
    torque:[190,310,350,290,200], drive:'rear', finalDrive:4.3, drag:.78},
  'glass-comet': {mass:1260, chassis:[1.96,4.38,1.02], wheel:[.35,2.5404,1.96],
    suspension:[.22,.17,48000,4000], tyres:[1.22,4100,.014], steering:[.48,2.1,.032],
    torque:[180,300,370,340,240], drive:'all', finalDrive:3.8, drag:.32}
};
freeze(specifications);

function stockRecipe(modelId) {
  const model = garageModel(modelId), s = specifications[modelId];
  const [width,length,height] = s.chassis;
  const [radius,wheelbase,track] = s.wheel;
  const [restLength,travel,spring,damper] = s.suspension;
  const [grip,corneringStiffness,rollingResistance] = s.tyres;
  const [maxAngle,rate,speedReduction] = s.steering;
  // Box-equivalent mass moments about chassis axes X, Y, Z (kg m²).
  const inertia = [height*height+length*length, width*width+length*length,
    width*width+height*height].map(value => Math.round(s.mass*value/12));
  return {
    format:VEHICLE_FORMAT, version:1, name:model.displayName+' / stock rules 1', mass:s.mass, inertia,
    chassis:{width,length,height}, wheel:{radius,wheelbase,track},
    suspension:{restLength,travel,spring,damper}, tyres:{grip,corneringStiffness,rollingResistance},
    steering:{maxAngle,rate,speedReduction},
    engine:{idleRPM:850, redlineRPM:6800,
      torqueCurve:[850,2200,4200,5800,6800].map((rpm,i) => [rpm,s.torque[i]]), engineBrake:40},
    gearbox:{ratios:[3.1,2.05,1.48,1.12,.89], reverseRatio:2.8, finalDrive:s.finalDrive,
      efficiency:.9, shiftTime:.18, automatic:true}, drive:s.drive, drag:s.drag
  };
}

export function stockVehicleBuild(modelId) {
  garageModel(modelId);
  return freeze({format:BUILD_FORMAT, version:BUILD_VERSION, rulesVersion:BUILD_RULES,
    parts:Object.fromEntries(slots.map(slot => [slot, slot === 'paint' ? 'factory' : 'stock']))});
}

export function validateVehicleBuild(modelId, value) {
  garageModel(modelId);
  // Read the discriminant through its descriptor, never through an accessor.
  const descriptor = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value,'rulesVersion') : null;
  const rules = descriptor && Object.hasOwn(descriptor,'value') ? descriptor.value : null;
  const build = garageRecord(value, rules===BUILD_PART_RULES ?
    ['format','version','rulesVersion','parts','tuning','inventory'] :
    ['format','version','rulesVersion','parts'], 'Vehicle build');
  if (build.format !== BUILD_FORMAT || build.version !== BUILD_VERSION || !SUPPORTED_BUILD_RULES.includes(build.rulesVersion)) {
    throw TypeError('Unsupported vehicle build format/version/rules');
  }
  const parts = garageRecord(build.parts, slots, 'Installed parts');
  let accepted;
  if (rules===BUILD_RULES) {
    for (const slot of slots) {
      if (parts[slot] !== (slot === 'paint' ? 'factory' : 'stock')) {
        throw RangeError('Unsupported '+slot+' part for build rules 1');
      }
    }
    accepted = {format:BUILD_FORMAT, version:BUILD_VERSION, rulesVersion:BUILD_RULES, parts};
  } else {
    const tuning = garageRecord(build.tuning,Object.keys(PART_TUNING_LIMITS),'Vehicle tuning');
    for (const [key,[min,max]] of Object.entries(PART_TUNING_LIMITS)) {
      tuning[key] = garageInteger(tuning[key],min,max,'Tuning '+key);
    }
    const inventory = garageRecord(build.inventory,slots,'Per-car parts inventory');
    for (const slot of slots) {
      vehiclePart(slot,parts[slot]);
      const base = slot==='paint'?'factory':'stock';
      const ids = garageArray(inventory[slot],1,vehicleParts(slot).length,'Inventory '+slot);
      for (const id of ids)vehiclePart(slot,id);
      if (new Set(ids).size!==ids.length || !ids.includes(base) || !ids.includes(parts[slot])) {
        throw RangeError('Inventory '+slot+' must contain unique owned IDs including stock and fitted part');
      }
      inventory[slot] = ids.slice().sort();
    }
    if (parts.finalDrive!=='adjustable' && tuning.finalDrive!==0)throw RangeError('Final-drive tuning requires the adjustable final drive');
    if (parts.suspension!=='adjustable' && ['spring','damper','travel'].some(key=>tuning[key]!==0)) {
      throw RangeError('Suspension tuning requires adjustable suspension');
    }
    if (parts.steering!=='quick' && tuning.steering!==0)throw RangeError('Steering tuning requires quick steering');
    accepted = {format:BUILD_FORMAT,version:BUILD_VERSION,rulesVersion:BUILD_PART_RULES,parts,tuning,inventory};
  }
  if (new TextEncoder().encode(JSON.stringify(accepted)).length > BUILD_BYTES) {
    throw RangeError('Vehicle build exceeds 2 KiB');
  }
  return freeze(accepted);
}

/** Explicit inert upgrade of legacy installed data; no payment or fitting. */
export function stockUpgradeBuild(modelId,value) {
  const accepted=validateVehicleBuild(modelId,value);
  if(accepted.rulesVersion===BUILD_PART_RULES)return accepted;
  return validateVehicleBuild(modelId,{...accepted,rulesVersion:BUILD_PART_RULES,
    tuning:Object.fromEntries(Object.keys(PART_TUNING_LIMITS).map(key=>[key,0])),
    inventory:Object.fromEntries(slots.map(slot=>[slot,[accepted.parts[slot]]]))});
}

const torqueChanges=freeze({
  engine:{stock:[0,0,0,0,0],street:[18,28,32,28,18],performance:[35,60,70,60,35],competition:[50,80,90,90,55]},
  intake:{stock:[0,0,0,0,0],duct:[2,6,9,12,7]},
  exhaust:{stock:[0,0,0,0,0],flow:[3,5,10,13,8]}
});
function applyParts(recipe,build,modelId) {
  if(build.rulesVersion===BUILD_RULES)return recipe;
  const {parts,tuning}=build;
  if(slots.some(slot=>slot!=='paint' && parts[slot]!=='stock') || Object.values(tuning).some(value=>value!==0)) {
    recipe.name=garageModel(modelId).displayName+' / workshop rules 2';
  }
  recipe.engine.torqueCurve=recipe.engine.torqueCurve.map(([rpm,torque],index)=>[
    rpm,torque+torqueChanges.engine[parts.engine][index]+torqueChanges.intake[parts.intake][index]+torqueChanges.exhaust[parts.exhaust][index]]);
  if(recipe.engine.torqueCurve.some(([,torque])=>torque>550))throw RangeError('Combined engine/intake/exhaust torque exceeds 550 Nm');
  if(parts.gearbox==='short')recipe.gearbox.ratios=[3.45,2.3,1.65,1.25,1];
  if(parts.gearbox==='long')recipe.gearbox.ratios=[2.8,1.8,1.3,1,.75];
  if(parts.finalDrive==='adjustable')recipe.gearbox.finalDrive=Number((recipe.gearbox.finalDrive+.2+tuning.finalDrive*.1).toFixed(6));
  const tyreChanges={stock:[0,0,0],touring:[.04,250,-.002],performance:[.18,850,.001],economy:[-.12,-400,-.003]};
  const [grip,stiffness,rolling]=tyreChanges[parts.tyres];
  recipe.tyres.grip=Number((recipe.tyres.grip+grip).toFixed(6));
  recipe.tyres.corneringStiffness+=stiffness;
  recipe.tyres.rollingResistance=Number((recipe.tyres.rollingResistance+rolling).toFixed(6));
  if(parts.suspension==='adjustable'){
    recipe.suspension.spring=Math.round(recipe.suspension.spring*1.10*(1+.1*tuning.spring));
    recipe.suspension.damper=Math.round(recipe.suspension.damper*1.05*(1+.1*tuning.damper));
    const extension=.01+.01*tuning.travel;
    recipe.suspension.restLength=Number((recipe.suspension.restLength+extension).toFixed(6));
    recipe.suspension.travel=Number((recipe.suspension.travel+extension).toFixed(6));
  }
  if(parts.steering==='quick'){
    recipe.steering.maxAngle=Number((recipe.steering.maxAngle+.02+.02*tuning.steering).toFixed(6));
    recipe.steering.rate=Number((recipe.steering.rate+.4+.1*tuning.steering).toFixed(6));
  }
  if(recipe.mass*9.81/(4*recipe.suspension.spring)>recipe.suspension.travel*.75) {
    throw RangeError('Combined suspension setup must support static weight within 75% of travel');
  }
  return recipe;
}

/** Pure bounded compiler. Admission completes before an immutable result exists.
 * Rules 1 retains the exact published stock mapping; rules 2 adds owned parts.
 */
export function compileVehicleBuild(modelId, value) {
  const build = validateVehicleBuild(modelId, value);
  const recipe = validateVehicle(applyParts(stockRecipe(modelId),build,modelId));
  return freeze({modelId, build, recipe, canonicalBuild:JSON.stringify(build),
    canonicalRecipe:JSON.stringify(recipe), rulesVersion:build.rulesVersion,
    engineRevision:BUILD_ENGINE_REVISION});
}

/** Cryptographic identity is separate from synchronous physical admission.
 * The caller supplies a source stamp verified by the package/recording boundary.
 * A user-provided revision alone is not evidence that its runtime matches.
 */
export async function identifyVehicleBuild(modelId, build, sourceRevision) {
  if (typeof sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(sourceRevision)) {
    throw TypeError('Build identity requires an exact game source revision');
  }
  const accepted = compileVehicleBuild(modelId, build);
  const hash = async value => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2,'0')).join('');
  const installed = accepted.rulesVersion===BUILD_RULES ? accepted.build :
    {format:accepted.build.format,version:accepted.build.version,rulesVersion:accepted.rulesVersion,
      parts:accepted.build.parts,tuning:accepted.build.tuning};
  const buildDigest = await hash(JSON.stringify({domain:'co.vehicle-build.v1', modelId,
    rulesVersion:accepted.rulesVersion, build:installed}));
  const recipeDigest = await hash(JSON.stringify({domain:'co.vehicle-recipe.v1', sourceRevision,
    engineRevision:BUILD_ENGINE_REVISION, modelId, rulesVersion:accepted.rulesVersion, recipe:accepted.recipe}));
  return freeze({...accepted, sourceRevision, buildDigest, recipeDigest});
}
