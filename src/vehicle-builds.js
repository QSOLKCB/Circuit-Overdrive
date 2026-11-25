// SPDX-License-Identifier: Apache-2.0
// Game-owned build authority. No garage storage, DOM, or racing recipe imports.
import {validateVehicle, VEHICLE_FORMAT} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {garageModel} from './garage-catalog.js';
import {garageRecord} from './garage-data.js';

export const BUILD_FORMAT = 'circuit-overdrive.vehicle-build';
export const BUILD_VERSION = 1;
export const BUILD_RULES = 1;
export const BUILD_BYTES = 2048;
export const BUILD_ENGINE_REVISION = '9d95d74b355ec17add32db0b55f0f71130f9c004';
const slots = Object.freeze(['engine', 'intake', 'exhaust', 'gearbox', 'finalDrive',
  'tyres', 'suspension', 'steering', 'paint']);
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
  const build = garageRecord(value, ['format','version','rulesVersion','parts'], 'Vehicle build');
  if (build.format !== BUILD_FORMAT || build.version !== BUILD_VERSION || build.rulesVersion !== BUILD_RULES) {
    throw TypeError('Unsupported vehicle build format/version/rules');
  }
  const parts = garageRecord(build.parts, slots, 'Installed parts');
  for (const slot of slots) {
    if (parts[slot] !== (slot === 'paint' ? 'factory' : 'stock')) {
      throw RangeError('Unsupported '+slot+' part for build rules 1');
    }
  }
  const accepted = {format:BUILD_FORMAT, version:BUILD_VERSION, rulesVersion:BUILD_RULES, parts};
  if (new TextEncoder().encode(JSON.stringify(accepted)).length > BUILD_BYTES) {
    throw RangeError('Vehicle build exceeds 2 KiB');
  }
  return freeze(accepted);
}

/** Pure bounded compiler. Admission completes before an immutable result exists.
 * Rules 1 resolves only stock parts. Upgrades require the separately reviewed C.
 */
export function compileVehicleBuild(modelId, value) {
  const build = validateVehicleBuild(modelId, value);
  const recipe = validateVehicle(stockRecipe(modelId));
  return freeze({modelId, build, recipe, canonicalBuild:JSON.stringify(build),
    canonicalRecipe:JSON.stringify(recipe), rulesVersion:BUILD_RULES,
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
  const buildDigest = await hash(JSON.stringify({domain:'co.vehicle-build.v1', modelId,
    rulesVersion:BUILD_RULES, build:accepted.build}));
  const recipeDigest = await hash(JSON.stringify({domain:'co.vehicle-recipe.v1', sourceRevision,
    engineRevision:BUILD_ENGINE_REVISION, modelId, rulesVersion:BUILD_RULES, recipe:accepted.recipe}));
  return freeze({...accepted, sourceRevision, buildDigest, recipeDigest});
}
