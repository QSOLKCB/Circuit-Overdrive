// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {admitProvingSelection} from '../src/proving-ground-admission.js';
import {createGarage,serializeGarage,validateGarage} from '../src/garage.js';
import {transactGarage,transactGarageInstallation} from '../src/garage-transactions.js';
import {compileVehicleBuild,stockVehicleBuild} from '../src/vehicle-builds.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const zero={finalDrive:0,spring:0,damper:0,travel:0,steering:0};
const selection=(changes={})=>({mode:'current',ownedVehicleId:'car-000001',modelId:'cinder-two',slot:null,partId:null,...changes});
function buy(state,modelId='cinder-two'){
  const result=transactGarage(state,{type:'buy',targetId:modelId,expectedRevision:state.revision});
  assert(result.accepted,JSON.stringify(result));return result.state;
}
function install(state,slot,partId,ownedVehicleId='car-000001',tuning={}){
  const current=state.bays.find(car=>car?.ownedVehicleId===ownedVehicleId);
  const result=transactGarageInstallation(state,{type:'install',ownedVehicleId,slot,partId,
    tuning:{...zero,...current.build.tuning,...tuning},expectedRevision:state.revision});
  assert(result.accepted,JSON.stringify(result));return result.state;
}
function unchanged(state,callback){
  const before=serializeGarage(state),value=callback();assert.equal(serializeGarage(state),before);
  return value;
}

test('admission selects the exact owned build independently of active selection and same-model cars',()=>{
  let garage=buy(buy(createGarage()));garage=install(garage,'engine','street');
  assert.equal(garage.activeVehicleId,'car-000001');assert(Object.isFrozen(garage));
  const first=unchanged(garage,()=>admitProvingSelection(garage,selection()));
  const second=unchanged(garage,()=>admitProvingSelection(garage,selection({ownedVehicleId:'car-000002'})));
  assert.equal(first.ownedVehicleId,'car-000001');assert.equal(first.build.parts.engine,'street');
  assert.equal(second.ownedVehicleId,'car-000002');assert.equal(second.build.parts.engine,'stock');
  assert.equal(first.scope,'owned-saved-build');assert.equal(second.scope,'owned-saved-build');
  assert.equal(first.garageRevision,garage.revision);assert.equal(second.garageRevision,garage.revision);
  assert.deepEqual(first.build,garage.bays[0].build);assert.deepEqual(second.build,garage.bays[1].build);
  assert.notDeepEqual(first.recipe.engine.torqueCurve,second.recipe.engine.torqueCurve);
  assert.deepEqual(first.recipe,compileVehicleBuild(first.modelId,garage.bays[0].build).recipe);
  assert(Object.isFrozen(first));assert(Object.isFrozen(first.build));assert(Object.isFrozen(first.recipe));
  assert.throws(()=>{first.build.parts.engine='competition';},TypeError);
  assert.equal(garage.credits,930);assert.deepEqual(garage.bays[1].build,stockVehicleBuild('cinder-two'));
});

test('six free stock simulations require no garage, allocation, inventory or owned identity',()=>{
  for(const modelId of ['cinder-two','lilt','evening-line','rivet-eight','yardhand','glass-comet']){
    const accepted=admitProvingSelection(null,selection({mode:'stock',ownedVehicleId:null,modelId}));
    assert.equal(accepted.scope,'stock-simulation');assert.equal(accepted.modelId,modelId);
    assert.equal(accepted.ownedVehicleId,null);assert.equal(accepted.garageRevision,null);
    assert.deepEqual(accepted.build,stockVehicleBuild(modelId));
    assert.deepEqual(accepted.recipe,compileVehicleBuild(modelId,stockVehicleBuild(modelId)).recipe);
  }
});

test('owned stock comparison is explicitly stock while retaining its actual attribution',()=>{
  const garage=install(buy(createGarage()),'engine','street');
  const accepted=unchanged(garage,()=>admitProvingSelection(garage,selection({mode:'stock'})));
  assert.equal(accepted.ownedVehicleId,'car-000001');assert.equal(accepted.scope,'stock-simulation');
  assert.equal(accepted.build.parts.engine,'stock');assert.equal(garage.bays[0].build.parts.engine,'street');
});

test('owned proposed parts compile in an independent sandbox without money, inventory or identity mutation',()=>{
  const garage=install(buy(buy(createGarage())),'engine','street'),before=serializeGarage(garage);
  const accepted=admitProvingSelection(garage,selection({mode:'proposed',slot:'gearbox',partId:'short'}));
  assert.equal(accepted.scope,'proposed-simulation');assert.equal(accepted.ownedVehicleId,'car-000001');
  assert.equal(accepted.build.parts.engine,'street');assert.equal(accepted.build.parts.gearbox,'short');
  assert(accepted.build.inventory.gearbox.includes('short'));
  assert.deepEqual(garage.bays[0].build.inventory.gearbox,['stock']);
  assert.deepEqual(garage.bays[1].build,stockVehicleBuild('cinder-two'));
  assert.equal(garage.credits,930);assert.equal(serializeGarage(garage),before);
  const free=admitProvingSelection(null,selection({mode:'proposed',ownedVehicleId:null,slot:'engine',partId:'competition'}));
  assert.equal(free.ownedVehicleId,null);assert.equal(free.garageRevision,null);assert.equal(free.scope,'proposed-simulation');
  assert.equal(free.build.parts.engine,'competition');assert.equal(serializeGarage(garage),before);
});

test('a proposed return to stock resets only the associated bounded tuning',()=>{
  let garage=buy(createGarage());
  garage=install(garage,'finalDrive','adjustable','car-000001',{finalDrive:2});
  garage=install(garage,'suspension','adjustable','car-000001',{spring:1,damper:1,travel:1});
  garage=install(garage,'steering','quick','car-000001',{steering:1});
  for(const [slot,keys] of [['finalDrive',['finalDrive']],['suspension',['spring','damper','travel']],['steering',['steering']]]){
    const accepted=unchanged(garage,()=>admitProvingSelection(garage,selection({mode:'proposed',slot,partId:'stock'})));
    for(const key of Object.keys(zero))assert.equal(accepted.build.tuning[key],keys.includes(key)?0:garage.bays[0].build.tuning[key]);
  }
});

test('missing, malformed, stale or unsupported choices reject rather than falling back to another car',()=>{
  const garage=buy(createGarage());
  for(const change of [
    {ownedVehicleId:null},{ownedVehicleId:'car-000002'},{ownedVehicleId:'car-000000'},
    {ownedVehicleId:'cinder-two'},{ownedVehicleId:1},{ownedVehicleId:'car-000001 '},
    {mode:'unknown'},{slot:'engine',partId:'street'},
    {mode:'stock',ownedVehicleId:null,modelId:'unknown'},
    {mode:'proposed',slot:'unknown',partId:'street'},
    {mode:'proposed',slot:'engine',partId:'unknown'},
    {mode:'proposed',slot:null,partId:null}
  ])unchanged(garage,()=>assert.throws(()=>admitProvingSelection(garage,selection(change))));
  assert.throws(()=>admitProvingSelection(null,selection()));
  assert.throws(()=>admitProvingSelection(createGarage(),selection()));
  const bad=clone(garage);bad.bays[0].condition={version:1,status:'damaged'};
  assert.throws(()=>admitProvingSelection(bad,selection()));
});

test('a physically unsupported proposed combination fails without a partial recipe or granted part',()=>{
  // An explicitly funded inert fixture reaches the existing 550 Nm combined
  // cap. This is not browser purchase evidence or an implemented reward source.
  let garage=validateGarage({...buy(createGarage(),'rivet-eight'),credits:5000});
  garage=install(garage,'engine','competition');garage=install(garage,'intake','duct');
  unchanged(garage,()=>assert.throws(()=>admitProvingSelection(garage,
    selection({mode:'proposed',slot:'exhaust',partId:'flow'})),/torque|550|limit/i));
  assert.equal(garage.bays[0].build.parts.exhaust,'stock');
  assert.deepEqual(garage.bays[0].build.inventory.exhaust,['stock']);
});

test('selection admission rejects executable or extended records without invoking their accessors',()=>{
  const garage=buy(createGarage());let calls=0;
  for(const mutate of [
    value=>{value.unexpected='engine';},value=>{delete value.slot;},
    value=>{value[Symbol('slot')]='engine';},
    value=>Object.setPrototypeOf(value,{mode:'stock'}),
    value=>Object.defineProperty(value,'ownedVehicleId',{enumerable:true,get(){calls++;return 'car-000001';}}),
    value=>{value.toJSON=()=>{calls++;return selection();};}
  ]){
    const value=selection();mutate(value);
    unchanged(garage,()=>assert.throws(()=>admitProvingSelection(garage,value)));
  }
  assert.equal(calls,0);
});
