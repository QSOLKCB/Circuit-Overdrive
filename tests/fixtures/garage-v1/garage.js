// SPDX-License-Identifier: Apache-2.0
import {CATALOG_REVISION, INITIAL_CREDITS, MAX_CREDITS, garageModel} from './garage-catalog.js';
import {garageArray, garageInteger, garageRecord} from './garage-data.js';

export const GARAGE_VERSION = 1;
export const GARAGE_EDITION = 'after-hours-v1';
export const BAY_COUNT = 4;
export const MAX_VEHICLE_ID = 999999;
export const MAX_REVISION = 99999999;
export const GARAGE_SAVE_BYTES = 64 * 1024;
const keys = ['version', 'edition', 'catalogRevision', 'credits', 'nextVehicleId',
  'activeVehicleId', 'bays', 'revision'];

export function vehicleId(serial) {
  return 'car-' + String(garageInteger(serial, 1, MAX_VEHICLE_ID, 'Vehicle serial')).padStart(6, '0');
}

// Admission checks one snapshot. Monotonic transitions/retry protection belong
// to CO-013B and storage conflict coordination belongs to CO-013C.
export function validateGarage(value) {
  const data = garageRecord(value, keys, 'Garage');
  if (data.version !== GARAGE_VERSION || data.edition !== GARAGE_EDITION ||
      data.catalogRevision !== CATALOG_REVISION) throw TypeError('Unsupported garage schema or catalogue');
  const credits = garageInteger(data.credits, 0, MAX_CREDITS, 'Credits');
  // MAX+1 is an exhausted allocator. No wraparound or reuse after a sale.
  const nextVehicleId = garageInteger(data.nextVehicleId, 1, MAX_VEHICLE_ID + 1, 'Next vehicle serial');
  const revision = garageInteger(data.revision, 0, MAX_REVISION, 'Garage revision');
  const seen = new Set();
  const bays = garageArray(data.bays, BAY_COUNT, BAY_COUNT, 'Garage bays').map(value => {
    if (value === null) return null;
    const car = garageRecord(value, ['ownedVehicleId', 'modelId'], 'Owned vehicle');
    const id = car.ownedVehicleId;
    if (typeof id !== 'string' || !/^car-[0-9]{6}$/.test(id) || seen.has(id)) {
      throw TypeError('Invalid or duplicate owned vehicle ID');
    }
    const serial = Number(id.slice(4));
    if (serial < 1 || serial >= nextVehicleId) throw RangeError('Vehicle ID is outside allocated history');
    const model = garageModel(car.modelId);
    seen.add(id);
    return Object.freeze({ownedVehicleId:id, modelId:model.modelId});
  });
  if (seen.size ? !seen.has(data.activeVehicleId) : data.activeVehicleId !== null) {
    throw RangeError('Active vehicle must belong to this garage, or be null when empty');
  }
  return Object.freeze({version:GARAGE_VERSION, edition:GARAGE_EDITION, catalogRevision:CATALOG_REVISION,
    credits, nextVehicleId, activeVehicleId:data.activeVehicleId, bays:Object.freeze(bays), revision});
}

export function createGarage() {
  return validateGarage({version:GARAGE_VERSION, edition:GARAGE_EDITION, catalogRevision:CATALOG_REVISION,
    credits:INITIAL_CREDITS, nextVehicleId:1, activeVehicleId:null,
    bays:[null, null, null, null], revision:0});
}

export function serializeGarage(value) {
  return JSON.stringify(validateGarage(value));
}

export function parseGarage(text) {
  // Reject long strings before allocating an encoded copy or invoking JSON.parse.
  if (typeof text !== 'string' || text.length > GARAGE_SAVE_BYTES ||
      new TextEncoder().encode(text).byteLength > GARAGE_SAVE_BYTES) {
    throw RangeError('Garage JSON exceeds 64 KiB');
  }
  return validateGarage(JSON.parse(text));
}
