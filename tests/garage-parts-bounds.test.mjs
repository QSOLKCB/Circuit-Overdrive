// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {PART_SLOTS,vehicleParts} from '../src/vehicle-parts.js';
import {BUILD_BYTES,stockUpgradeBuild,stockVehicleBuild,compileVehicleBuild} from '../src/vehicle-builds.js';
import {GARAGE_SAVE_BYTES,migrateLegacyGarage,serializeGarage} from '../src/garage.js';
import {VAULT_BYTES,serializeVault} from '../src/garage-vault-format.js';

test('largest canonical rules2 inventory/build and four-car envelope retain existing UTF-8 bounds',()=>{
  let maximum=[0,0,0];
  for(const {modelId} of GARAGE_CATALOG){
    // Synthetic validator boundary data, not earned credits or UI purchases.
    const legacy={version:1,edition:'after-hours-v1',catalogRevision:1,credits:99999999,
      nextVehicleId:1000000,revision:99999999,activeVehicleId:'car-999999',
      bays:[999996,999997,999998,999999].map(n=>({ownedVehicleId:'car-'+n,modelId}))};
    const draft=structuredClone(stockUpgradeBuild(modelId,stockVehicleBuild(modelId)));
    // Choose maximum-length valid fitted IDs and complete per-slot inventories.
    const longest={engine:'competition',intake:'stock',exhaust:'stock',gearbox:'stock',
      finalDrive:'adjustable',tyres:'performance',suspension:'adjustable',steering:'quick',paint:'midnight'};
    for(const slot of PART_SLOTS){draft.parts[slot]=longest[slot];draft.inventory[slot]=vehicleParts(slot).map(p=>p.id);}
    draft.tuning={finalDrive:-4,spring:-2,damper:-2,travel:-2,steering:-2};
    const build=compileVehicleBuild(modelId,draft).build;
    const migrated=migrateLegacyGarage(legacy),state={...migrated,bays:migrated.bays.map(car=>({...car,build}))};
    const counts=[Buffer.byteLength(JSON.stringify(build)),Buffer.byteLength(serializeGarage(state)),
      Buffer.byteLength(serializeVault({version:2,generation:'f'.repeat(32),sequence:99999999,garage:state,legacyBackup:legacy}))];
    assert(counts[0]<=BUILD_BYTES&&counts[1]<=GARAGE_SAVE_BYTES&&counts[2]<=VAULT_BYTES);
    maximum=maximum.map((value,i)=>Math.max(value,counts[i]));
  }
  assert.deepEqual(maximum,[708,3444,3942]);
  assert.equal(BUILD_BYTES,2048);assert.equal(GARAGE_SAVE_BYTES,65536);assert.equal(VAULT_BYTES,65536);
});
