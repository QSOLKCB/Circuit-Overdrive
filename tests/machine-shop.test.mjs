// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createGarage,serializeGarage,validateGarage} from '../src/garage.js';
import {transactGarage,transactGarageInstallation} from '../src/garage-transactions.js';
import {stockUpgradeBuild,compileVehicleBuild} from '../src/vehicle-builds.js';
import {MACHINE_SHOP_SECTIONS,machineShopOverview,machineShopProposal,machineShopSpecificationRows} from '../src/machine-shop.js';

const zero={finalDrive:0,spring:0,damper:0,travel:0,steering:0};
function buy(state,modelId='cinder-two'){
  const result=transactGarage(state,{type:'buy',targetId:modelId,expectedRevision:state.revision});
  assert(result.accepted);return result.state;
}
function fit(state,slot,partId,tuning={},ownedVehicleId=state.activeVehicleId){
  const car=state.bays.find(car=>car?.ownedVehicleId===ownedVehicleId);
  const result=transactGarageInstallation(state,{type:'install',ownedVehicleId,slot,partId,
    tuning:{...zero,...car.build.tuning,...tuning},expectedRevision:state.revision});
  assert(result.accepted,JSON.stringify(result));return result.state;
}
function quote(state,slot,partId,tuning={},id=state.activeVehicleId){
  const car=state.bays.find(car=>car?.ownedVehicleId===id);
  return machineShopProposal(state,id,slot,partId,{...zero,...car.build.tuning,...tuning});
}

test('Machine Shop overview resolves selected owned identity independently of active car and same-model neighbours',()=>{
  let state=buy(buy(createGarage()));state=fit(state,'engine','street',{},'car-000002');
  const first=machineShopOverview(state,'car-000001'),second=machineShopOverview(state,'car-000002');
  assert.equal(state.activeVehicleId,'car-000001');
  assert.equal(second.model.displayName,'Cinder Two');assert.equal(second.car.ownedVehicleId,'car-000002');
  assert.equal(second.build.parts.engine,'street');assert.equal(first.build.parts.engine,'stock');
  assert.equal(second.recipe.engine.torqueCurve[2][1],242);assert.equal(first.recipe.engine.torqueCurve[2][1],210);
  assert.equal(first.repairs,'No repairs required.');assert.equal(second.repairs,'No repairs required.');
  assert.equal(second.credits,930);assert.equal(second.revision,3);
  assert.throws(()=>machineShopOverview(state,'car-999999'),/actually owned/);
});

test('mechanical proposal compiles a real independent configuration without fitting, charging or granting inventory',()=>{
  const state=buy(buy(createGarage())),before=serializeGarage(state);
  const proposed=quote(state,'engine','street',{},'car-000002');
  assert(proposed.accepted);assert.equal(proposed.action.expectedRevision,2);
  assert.equal(proposed.receipt.partCost,250);assert.equal(proposed.receipt.fittingCost,20);assert.equal(proposed.receipt.cost,270);
  assert.equal(proposed.receipt.creditsAfter,930);assert.equal(proposed.action.ownedVehicleId,'car-000002');
  assert.deepEqual(proposed.proposed.recipe.engine.torqueCurve,[[850,123],[2200,203],[4200,242],[5800,213],[6800,148]]);
  assert.deepEqual(proposed.proposed.build.inventory.engine,['stock','street']);
  assert.equal(serializeGarage(state),before);assert.equal(state.bays[0].build.parts.engine,'stock');
  assert.equal(state.bays[1].build.parts.engine,'stock');assert(Object.isFrozen(proposed.proposed.recipe));
});

test('unsupported combined mechanical build reports the compiler reason with no partial installation or credit mutation',()=>{
  let state=buy(createGarage(),'rivet-eight');state=fit(state,'intake','duct');state=fit(state,'exhaust','flow');
  const before=serializeGarage(state),proposed=quote(state,'engine','competition');
  assert.equal(proposed.accepted,false);assert.equal(proposed.reason,'invalid-build');
  assert.match(proposed.detail,/Combined.*550 Nm/);assert.equal(proposed.proposed,null);assert.equal(proposed.receipt,null);
  assert.equal(serializeGarage(state),before);assert.equal(state.bays[0].build.parts.engine,'stock');
});

test('unaffordable proposal can describe valid mechanics but never grants a part or charges the car',()=>{
  const state=validateGarage({...buy(createGarage()),credits:0}),before=serializeGarage(state);
  const proposed=quote(state,'engine','competition');
  assert.equal(proposed.accepted,false);assert.equal(proposed.reason,'insufficient-credits');
  assert.match(proposed.detail,/Insufficient credits/);assert(proposed.proposed);
  assert.equal(proposed.proposed.recipe.engine.torqueCurve[2][1],300);
  assert.equal(state.bays[0].build.parts.engine,'stock');assert.equal(serializeGarage(state),before);
});

test('paint proposal is explicitly cosmetic and preserves the exact accepted physical recipe',()=>{
  const state=buy(createGarage()),overview=machineShopOverview(state,state.activeVehicleId),proposed=quote(state,'paint','oxide');
  assert(proposed.accepted);assert.equal(proposed.receipt.cost,70);
  assert.deepEqual(proposed.proposed.recipe,overview.recipe);assert.equal(proposed.proposed.build.parts.paint,'oxide');
  assert.equal(overview.build.parts.paint,'factory');
  assert.deepEqual(machineShopSpecificationRows(proposed.proposed.recipe,'paint'),[['Physical changes','None. Paint is cosmetic.']]);
});

test('quantized setup preview uses supported physical units and rejects unrelated changes',()=>{
  const state=fit(buy(createGarage()),'suspension','adjustable');
  const proposed=quote(state,'suspension','adjustable',{spring:2,damper:1,travel:1});
  assert(proposed.accepted);assert.equal(proposed.receipt.cost,10);
  const rows=Object.fromEntries(machineShopSpecificationRows(proposed.proposed.recipe,'suspension'));
  assert.equal(rows['Spring rate per wheel'],'44880 N/m');assert.equal(rows['Damper per wheel'],'3581 Ns/m');
  assert.equal(rows['Rest length'],'0.26 m');assert.equal(rows['Available travel'],'0.21 m');
  assert.equal(rows['Static compression on level ground'],'0.059017 m');
  const unrelated=quote(state,'engine','street',{spring:1});
  assert.equal(unrelated.accepted,false);assert.equal(unrelated.reason,'unrelated-tuning');
  assert.equal(state.bays[0].build.tuning.spring,0);
});

test('already-fitted choices and malformed/executable setup never become a reviewable payment',()=>{
  const state=fit(buy(createGarage()),'engine','street'),before=serializeGarage(state);
  const same=quote(state,'engine','street');assert.equal(same.accepted,false);assert.equal(same.reason,'already-fitted');
  assert.match(same.detail,/Already fitted/);assert.equal(same.receipt,null);
  for(const [slot,part,tuning] of [['engine','unknown',zero],['steering','quick',{...zero,steering:Infinity}],['finalDrive','adjustable',{...zero,finalDrive:5}]]){
    const bad=machineShopProposal(state,state.activeVehicleId,slot,part,tuning);assert.equal(bad.accepted,false);assert.equal(bad.action,null);
  }
  let accesses=0;const executable={...zero};Object.defineProperty(executable,'spring',{get(){accesses++;return 0;},enumerable:true});
  const bad=machineShopProposal(state,state.activeVehicleId,'suspension','adjustable',executable);
  assert.equal(bad.accepted,false);assert.equal(accesses,0);assert.equal(serializeGarage(state),before);
});

test('all named workshop sections describe only actual compiled specifications',()=>{
  const state=buy(createGarage()),overview=machineShopOverview(state,state.activeVehicleId);
  assert.deepEqual(MACHINE_SHOP_SECTIONS.map(([slot])=>slot),['engine','intake','exhaust','gearbox','finalDrive','tyres','suspension','steering','paint']);
  for(const [slot] of MACHINE_SHOP_SECTIONS){
    const rows=machineShopSpecificationRows(overview.recipe,slot);assert(rows.length);
    assert(!JSON.stringify(rows).match(/horsepower|0–100|benchmark|improvement/i));
  }
  assert.throws(()=>machineShopSpecificationRows(overview.recipe,'unknown'),/Unknown/);
  const repeated=stockUpgradeBuild(overview.car.modelId,overview.build);
  assert.deepEqual(compileVehicleBuild(overview.car.modelId,repeated).recipe,overview.recipe);
});
