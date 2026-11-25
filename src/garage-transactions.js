// SPDX-License-Identifier: Apache-2.0
import {garageModel, MAX_CREDITS} from './garage-catalog.js';
import {garageInteger, garageRecord} from './garage-data.js';
import {MAX_REVISION, MAX_VEHICLE_ID, validateGarage, vehicleId, pristineVehicleCondition} from './garage.js';
import {compileVehicleBuild, stockUpgradeBuild, stockVehicleBuild} from './vehicle-builds.js';
import {PART_SLOTS, vehiclePart} from './vehicle-parts.js';

const reject = reason => Object.freeze({accepted:false, reason});
const ownedId = id => /^car-[0-9]{6}$/.test(id) && id !== 'car-000000';

export function garageBalance(state) {
  return validateGarage(state).credits;
}

// stock-60-v1: every intermediate is an exact safe integer. Neither the request
// nor an owned record supplies a price, condition, upgrade or resale override.
export function garageResaleValue(modelId) {
  const scaled = garageModel(modelId).purchasePrice * 3;
  return (scaled - scaled % 5) / 5;
}

function request(value) {
  const data = garageRecord(value, ['type', 'targetId', 'expectedRevision'], 'Garage transaction');
  if (!['buy', 'sell', 'select'].includes(data.type) ||
      typeof data.targetId !== 'string' || !data.targetId.length || data.targetId.length > 48) {
    throw TypeError('Invalid garage transaction type or target');
  }
  garageInteger(data.expectedRevision, 0, MAX_REVISION, 'Expected revision');
  return data;
}

// Pure transition proposal, not a persistence acknowledgement. A caller must
// commit against the same previous state before publishing this result. C owns
// that storage lock/compare/write protocol. Retrying an intent must retain its
// expectedRevision; never silently rebase it onto newly loaded state.
export function transactGarage(state, action) {
  let before, intent;
  try { before = validateGarage(state); }
  catch { return reject('invalid-state'); }
  try { intent = request(action); }
  catch { return reject('invalid-request'); }
  const {type, targetId, expectedRevision} = intent;
  if (expectedRevision !== before.revision) return reject('stale-revision');
  if (before.revision === MAX_REVISION) return reject('revision-exhausted');

  const bays = before.bays.slice();
  let credits = before.credits, nextVehicleId = before.nextVehicleId;
  let activeVehicleId = before.activeVehicleId, bayIndex, car;
  if (type === 'buy') {
    let model;
    try { model = garageModel(targetId); }
    catch { return reject('invalid-model'); }
    bayIndex = bays.indexOf(null);
    if (bayIndex === -1) return reject('garage-full');
    if (credits < model.purchasePrice) return reject('insufficient-credits');
    if (nextVehicleId > MAX_VEHICLE_ID) return reject('vehicle-id-exhausted');
    car = {ownedVehicleId:vehicleId(nextVehicleId), modelId:model.modelId,
      build:stockVehicleBuild(model.modelId), condition:pristineVehicleCondition()};
    bays[bayIndex] = car;
    credits -= model.purchasePrice;
    nextVehicleId++;
    if (activeVehicleId === null) activeVehicleId = car.ownedVehicleId;
  } else {
    if (!ownedId(targetId)) return reject('invalid-vehicle-id');
    bayIndex = bays.findIndex(vehicle => vehicle?.ownedVehicleId === targetId);
    if (bayIndex === -1) return reject('vehicle-not-owned');
    car = bays[bayIndex];
    if (type === 'sell') {
      const proceeds = garageResaleValue(car.modelId);
      if (credits > MAX_CREDITS - proceeds) return reject('credit-overflow');
      credits += proceeds;
      bays[bayIndex] = null;
      if (activeVehicleId === targetId) {
        activeVehicleId = bays.find(vehicle => vehicle !== null)?.ownedVehicleId ?? null;
      }
    } else {
      activeVehicleId = targetId;
    }
  }

  // Selecting the already active vehicle also consumes its intent revision.
  // This keeps retry admission uniform without a growing request-history log.
  const next = validateGarage({...before, credits, nextVehicleId, activeVehicleId,
    bays, revision:before.revision + 1});
  const receipt = Object.freeze({type, fromRevision:before.revision, toRevision:next.revision,
    ownedVehicleId:car.ownedVehicleId, modelId:car.modelId, bayIndex,
    creditsBefore:before.credits, creditsAfter:next.credits, creditDelta:next.credits - before.credits});
  return Object.freeze({accepted:true, state:next, receipt});
}

const tuneSlots = Object.freeze({finalDrive:'finalDrive',spring:'suspension',
  damper:'suspension',travel:'suspension',steering:'steering'});

// A capability ticket owns this copied request; a save cannot supply a cost,
// executable configuration, inventory grant or raw physical recipe.
export function validateInstallationAction(value) {
  const action = garageRecord(value, ['type','ownedVehicleId','slot','partId','tuning','expectedRevision'], 'Installation');
  if (action.type !== 'install' || typeof action.ownedVehicleId !== 'string' || !ownedId(action.ownedVehicleId) ||
      !PART_SLOTS.includes(action.slot)) throw TypeError('Invalid installation target or slot');
  vehiclePart(action.slot,action.partId);
  const data = garageRecord(action.tuning,Object.keys(tuneSlots),'Installation tuning');
  const tuning = Object.freeze(Object.fromEntries(Object.keys(tuneSlots).map(key =>
    [key,garageInteger(data[key],key === 'finalDrive' ? -4 : -2,key === 'finalDrive' ? 4 : 2,'Tuning '+key)])));
  return Object.freeze({...action,tuning,
    expectedRevision:garageInteger(action.expectedRevision,0,MAX_REVISION,'Expected revision')});
}

export function transactGarageInstallation(state, action) {
  let before, intent;
  try { before = validateGarage(state); } catch { return reject('invalid-state'); }
  try { intent = validateInstallationAction(action); } catch { return reject('invalid-request'); }
  if (intent.expectedRevision !== before.revision) return reject('stale-revision');
  if (before.revision === MAX_REVISION) return reject('revision-exhausted');
  const bayIndex = before.bays.findIndex(car => car?.ownedVehicleId === intent.ownedVehicleId);
  if (bayIndex === -1) return reject('vehicle-not-owned');
  const car = before.bays[bayIndex], prior = stockUpgradeBuild(car.modelId,car.build);
  const {slot,partId,tuning} = intent, part = vehiclePart(slot,partId);
  for (const key of Object.keys(tuneSlots)) {
    if (tuneSlots[key] !== slot && tuning[key] !== prior.tuning[key]) return reject('unrelated-tuning');
  }
  const changingPart = prior.parts[slot] !== partId;
  if (!changingPart && Object.keys(tuneSlots).every(key => tuning[key] === prior.tuning[key])) return reject('already-fitted');
  const alreadyOwned = prior.inventory[slot].includes(partId);
  const partCost = alreadyOwned ? 0 : part.price;
  const fittingCost = changingPart ? (slot === 'paint' ? 10 : 20) : 10;
  const cost = partCost + fittingCost;
  if (before.credits < cost) return reject('insufficient-credits');
  const inventory = Object.fromEntries(PART_SLOTS.map(key => [key,
    key === slot ? [...new Set([...prior.inventory[key],partId])].sort() : prior.inventory[key].slice()]));
  let build;
  try { build = compileVehicleBuild(car.modelId,{...prior,parts:{...prior.parts,[slot]:partId},tuning,inventory}).build; }
  catch { return reject('invalid-build'); }
  const bays = before.bays.slice();
  bays[bayIndex] = {...car,build};
  const next = validateGarage({...before,bays,credits:before.credits-cost,revision:before.revision+1});
  const receipt = Object.freeze({type:'install',fromRevision:before.revision,toRevision:next.revision,
    ownedVehicleId:car.ownedVehicleId,modelId:car.modelId,bayIndex,slot,partId,
    partCost,fittingCost,cost,alreadyOwned,creditsBefore:before.credits,creditsAfter:next.credits,
    creditDelta:-cost});
  return Object.freeze({accepted:true,state:next,receipt});
}
