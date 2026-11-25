// SPDX-License-Identifier: Apache-2.0
import {garageModel, MAX_CREDITS} from './garage-catalog.js';
import {garageInteger, garageRecord} from './garage-data.js';
import {MAX_REVISION, MAX_VEHICLE_ID, validateGarage, vehicleId, pristineVehicleCondition} from './garage.js';
import {stockVehicleBuild} from './vehicle-builds.js';

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
