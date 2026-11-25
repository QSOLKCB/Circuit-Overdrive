// SPDX-License-Identifier: Apache-2.0
import {garageInteger, garageRecord} from './garage-data.js';
import {validateGarage} from './garage.js';
import {validateLegacyGarage} from './garage-legacy.js';

export const VAULT_BYTES = 65536;
export const MAX_VAULT_SEQUENCE = 99999999;

export function validateVault(value) {
  const data = garageRecord(value, ['version', 'generation', 'sequence', 'garage', 'legacyBackup'], 'Garage vault');
  if (data.version !== 2 || typeof data.generation !== 'string' || !/^[0-9a-f]{32}$/.test(data.generation)) {
    throw TypeError('Unsupported garage vault version or generation');
  }
  return Object.freeze({version:2, generation:data.generation,
    sequence:garageInteger(data.sequence, 0, MAX_VAULT_SEQUENCE, 'Vault sequence'),
    garage:validateGarage(data.garage),
    legacyBackup:data.legacyBackup === null ? null : validateLegacyGarage(data.legacyBackup)});
}

function legacyVault(value) {
  const data = garageRecord(value, ['version','generation','sequence','garage'], 'Legacy garage vault');
  if (data.version !== 1 || typeof data.generation !== 'string' || !/^[0-9a-f]{32}$/.test(data.generation)) {
    throw TypeError('Unsupported legacy garage vault');
  }
  return Object.freeze({version:1,generation:data.generation,
    sequence:garageInteger(data.sequence,0,MAX_VAULT_SEQUENCE,'Vault sequence'),
    garage:validateLegacyGarage(data.garage)});
}

export function parseVault(text) {
  if (typeof text !== 'string' || text.length > VAULT_BYTES ||
      new TextEncoder().encode(text).byteLength > VAULT_BYTES) throw RangeError('Garage vault exceeds 64 KiB');
  const data = JSON.parse(text);
  return data?.version === 1 ? legacyVault(data) : validateVault(data);
}

export function serializeVault(value) {
  const text = JSON.stringify(validateVault(value));
  if (new TextEncoder().encode(text).byteLength > VAULT_BYTES) throw RangeError('Garage vault exceeds 64 KiB');
  return text;
}
