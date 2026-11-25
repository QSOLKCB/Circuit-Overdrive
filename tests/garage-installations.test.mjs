// SPDX-License-Identifier: Apache-2.0
// Independent ownership/money ledger. These tests never award race income.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createGarage, validateGarage, serializeGarage, MAX_REVISION} from '../src/garage.js';
import {transactGarage, transactGarageInstallation, validateInstallationAction} from '../src/garage-transactions.js';
import {createGarageVault, GARAGE_SLOT} from '../src/garage-vault.js';
import {parseVault} from '../src/garage-vault-format.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const slots=['engine','intake','exhaust','gearbox','finalDrive','tyres','suspension','steering','paint'];
const zero={finalDrive:0,spring:0,damper:0,travel:0,steering:0};
// Independently specified fictional prices and labor, not read from production
// quote/transition functions. A price change requires reviewing this contract.
const prices={engine:{stock:0,street:250,performance:550,competition:950},
  intake:{stock:0,duct:80},exhaust:{stock:0,flow:100},
  gearbox:{stock:0,short:160,long:160},finalDrive:{stock:0,adjustable:120},
  tyres:{stock:0,touring:140,performance:220,economy:90},
  suspension:{stock:0,adjustable:180},steering:{stock:0,quick:100},
  paint:{factory:0,oxide:60,seafoam:60,midnight:60}};
const initialPart=slot=>slot==='paint'?'factory':'stock';
const stockParts=()=>Object.fromEntries(slots.map(slot=>[slot,initialPart(slot)]));
const stockBuild=()=>({format:'circuit-overdrive.vehicle-build',version:1,rulesVersion:1,parts:stockParts()});
const carId=n=>'car-'+String(n).padStart(6,'0');
function buy(state,modelId='cinder-two'){
  const result=transactGarage(state,{type:'buy',targetId:modelId,expectedRevision:state.revision});
  assert(result.accepted,JSON.stringify(result));return result.state;
}
const cars=(count=1,modelId='cinder-two')=>{
  let state=createGarage();for(let i=0;i<count;i++)state=buy(state,modelId);return state;
};
function action(state,slot='engine',partId='street',ownedVehicleId=state.activeVehicleId,tuning={}){
  const current=state.bays.find(car=>car?.ownedVehicleId===ownedVehicleId);
  return {type:'install',ownedVehicleId,slot,partId,
    tuning:{...(current?.build.tuning??zero),...tuning},expectedRevision:state.revision};
}
function install(state,slot='engine',partId='street',ownedVehicleId=state.activeVehicleId,tuning={}){
  const request=action(state,slot,partId,ownedVehicleId,tuning);
  const result=transactGarageInstallation(state,request);
  assert(result.accepted,JSON.stringify(result));return result;
}
function unchanged(before,request){
  const prior=serializeGarage(before),result=transactGarageInstallation(before,request);
  assert.equal(result.accepted,false,'invalid or obsolete installation must reject');
  assert.equal(serializeGarage(before),prior,'rejection cannot mutate ownership, money or builds');
  return result;
}

test('first installation charges catalog cost plus bounded fitting labor once and preserves owned identity',()=>{
  const before=cars(2),prior=serializeGarage(before),intent=action(before),result=transactGarageInstallation(before,intent);
  assert(result.accepted);assert.equal(serializeGarage(before),prior);
  const after=result.state;
  assert.equal(before.credits,1200);assert.equal(after.credits,930,'250-credit engine plus 20-credit fitting');
  assert.equal(after.revision,before.revision+1);assert.equal(after.nextVehicleId,before.nextVehicleId);
  assert.equal(after.activeVehicleId,before.activeVehicleId);
  assert.equal(after.bays[0].ownedVehicleId,'car-000001');assert.equal(after.bays[0].modelId,'cinder-two');
  assert.deepEqual(after.bays[0].condition,before.bays[0].condition);
  assert.equal(after.bays[0].build.rulesVersion,2);
  assert.equal(after.bays[0].build.parts.engine,'street');
  assert.deepEqual(after.bays[0].build.inventory.engine,['stock','street']);
  assert.deepEqual(result.receipt,{type:'install',fromRevision:2,toRevision:3,
    ownedVehicleId:'car-000001',modelId:'cinder-two',bayIndex:0,slot:'engine',partId:'street',
    partCost:250,fittingCost:20,cost:270,alreadyOwned:false,
    creditsBefore:1200,creditsAfter:930,creditDelta:-270});
  assert.deepEqual(after.bays[1],before.bays[1],'same-model second car receives no part or payment');
  unchanged(after,intent); // A retry must retain its original expected revision.
  unchanged(after,action(after)); // A fresh duplicate fit is a no-op, not a bill.
});

test('refitting paid inventory charges labor only, stock is retained, and setup-only changes have explicit costs',()=>{
  let state=cars();
  state=install(state).state;assert.equal(state.credits,1530);
  state=install(state,'engine','competition').state;assert.equal(state.credits,560);
  state=install(state).state;assert.equal(state.credits,540,'returning paid street engine costs only fitting');
  assert.deepEqual(state.bays[0].build.inventory.engine,['competition','stock','street']);
  state=install(state,'engine','stock').state;assert.equal(state.credits,520,'stock engine is already owned, fitting still costs 20');
  state=install(state,'finalDrive','adjustable',state.activeVehicleId,{finalDrive:1}).state;
  assert.equal(state.credits,380);
  state=install(state,'finalDrive','adjustable',state.activeVehicleId,{finalDrive:2}).state;
  assert.equal(state.credits,370,'same part, changed quantized setup costs 10');
  unchanged(state,action(state,'finalDrive','adjustable',state.activeVehicleId,{finalDrive:2}));
  state=install(state,'paint','oxide').state;assert.equal(state.credits,300,'60-credit finish plus 10-credit paint labor');
});

test('insufficient money, missing ownership, stale intent and unsupported changes reject without state loss',()=>{
  const poor=cars(4);assert.equal(poor.credits,0);
  unchanged(poor,action(poor));
  const state=cars(),request=action(state);
  for(const modify of [
    a=>{a.ownedVehicleId='car-000099';},a=>{a.ownedVehicleId='car-000000';},
    a=>{a.expectedRevision=0;},a=>{a.slot='turbo-script';},a=>{a.partId='missing';},
    a=>{a.price=0;},a=>{a.type='repair';},a=>{a.tuning.finalDrive=1;},
    a=>{a.tuning.spring=NaN;},a=>{a.tuning.steering=Infinity;},
    a=>{a.tuning.finalDrive=1.5;},a=>{a.tuning.travel=99;},
    a=>{delete a.tuning.damper;},a=>{a.tuning.script='return 999';}
  ]){const bad=clone(request);modify(bad);unchanged(state,bad);}
  const exhausted=validateGarage({...state,revision:MAX_REVISION});
  unchanged(exhausted,action(exhausted));
});

test('installation admission owns inert data and never executes accessors or serialization hooks',()=>{
  const state=cars();let executions=0;
  const getter=()=>{executions++;throw Error('must remain inert');};
  for(const change of [
    a=>Object.defineProperty(a,'partId',{enumerable:true,get:getter}),
    a=>Object.defineProperty(a.tuning,'spring',{enumerable:true,get:getter}),
    a=>{a.toJSON=getter;},a=>{a[Symbol('extra')]=true;},
    a=>Object.setPrototypeOf(a,{partId:'street'}),
    a=>Object.defineProperty(a,'slot',{value:'engine',enumerable:false})
  ]){
    const request=action(state);change(request);
    assert.throws(()=>validateInstallationAction(request));unchanged(state,request);
  }
  assert.equal(executions,0);
  const request=action(state),admitted=validateInstallationAction(request);
  request.partId='competition';request.tuning.spring=2;
  assert.equal(admitted.partId,'street');assert.equal(admitted.tuning.spring,0);
  assert(Object.isFrozen(admitted));assert(Object.isFrozen(admitted.tuning));
});

test('combined physical compilation failure never spends credits or installs a partial stack',()=>{
  // Synthetic valid imported balance, explicitly not earned career money or
  // browser purchase evidence: it reaches the otherwise unaffordable boundary.
  let state=validateGarage({...cars(1,'rivet-eight'),credits:5000});
  state=install(state,'engine','competition').state;
  state=install(state,'intake','duct').state;
  assert.equal(state.credits,3930);
  const before=serializeGarage(state),result=transactGarageInstallation(state,action(state,'exhaust','flow'));
  assert.equal(result.accepted,false,'540 Nm competition + 9 Nm duct + 10 Nm flow exceeds the declared 550 Nm cap');
  assert.equal(serializeGarage(state),before);
  assert.equal(state.bays[0].build.parts.exhaust,'stock');
  assert.deepEqual(state.bays[0].build.inventory.exhaust,['stock']);
});

test('selling an upgraded car pays only stock resale and transfers no paid inventory to a new identity',()=>{
  let state=install(cars()).state;
  const sold=transactGarage(state,{type:'sell',targetId:state.activeVehicleId,expectedRevision:state.revision});
  assert(sold.accepted);assert.equal(sold.state.credits,1890);assert.equal(sold.receipt.creditDelta,360);
  assert.deepEqual(sold.state.bays,[null,null,null,null]);assert.equal(sold.state.nextVehicleId,2);
  state=buy(sold.state);assert.equal(state.credits,1290);
  assert.equal(state.bays[0].ownedVehicleId,'car-000002');
  assert.deepEqual(state.bays[0].build,stockBuild());
});

const generation='0123456789abcdef0123456789abcdef';
function memory(){
  let raw=null,denyNextRead=false;
  return {writes:0,fault:null,
    getItem(key){assert.equal(key,GARAGE_SLOT);if(denyNextRead){denyNextRead=false;throw Error('readback interrupted');}return raw;},
    setItem(key,value){assert.equal(key,GARAGE_SLOT);if(this.fault==='quota')throw Error('quota');
      if(this.fault!=='drop'){raw=value;this.writes++;}if(this.fault==='readback')denyNextRead=true;},
    peek:()=>raw};
}
const coordinator=()=>({held:false,async request(name,options,callback){
  assert.equal(name,GARAGE_SLOT);assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
  if(this.held)return callback(null);this.held=true;
  try{return await callback({name,mode:'exclusive'});}finally{this.held=false;}
}});
function vaultSession(store=memory(),locks=coordinator()){
  const vault=createGarageVault({getStorage:()=>store,getLocks:()=>locks,makeGeneration:()=>generation,eventTarget:null});
  return {vault,store,locks};
}
async function startVault(vault){
  vault.load();assert((await vault.confirm(vault.prepareReset().ticket)).accepted);
  const a={type:'buy',targetId:'cinder-two',expectedRevision:vault.view.state.revision};
  assert((await vault.confirm(vault.prepareTransaction(a).ticket)).accepted);
}

test('prepared installation is copied and published only after one verified whole-save write',async()=>{
  const {vault,store}=vaultSession();await startVault(vault);
  const prior=store.peek(),before=vault.view.state,request=action(before);
  const prepared=vault.prepareInstallation(request);assert(prepared.accepted);
  assert.equal(store.peek(),prior);assert.strictEqual(vault.view.state,before);
  assert.equal(prepared.preview.state.credits,1530);
  request.partId='competition';request.tuning.finalDrive=4;
  const writes=store.writes,result=await vault.confirm(prepared.ticket);
  assert(result.accepted);assert.equal(result.state.credits,1530);
  assert.equal(result.state.bays[0].build.parts.engine,'street');
  assert.equal(store.writes,writes+1);
  assert.deepEqual(parseVault(store.peek()).garage,result.state);
  assert.equal((await vault.confirm(prepared.ticket)).accepted,false);
  assert.equal(vault.prepareInstallation(action(result.state)).accepted,false);
});

for(const fault of ['quota','drop','readback']){
  test('installation '+fault+' persistence fault never awards an unverified free part',async()=>{
    const {vault,store}=vaultSession();await startVault(vault);
    const before=vault.view.state,raw=store.peek(),prepared=vault.prepareInstallation(action(before));
    assert(prepared.accepted);store.fault=fault;
    const result=await vault.confirm(prepared.ticket);assert.equal(result.accepted,false);
    assert.deepEqual(vault.view.state,before);assert.equal(vault.view.state.bays[0].build.parts.engine,'stock');
    assert.equal(vault.prepareInstallation(action(before)).accepted,false,'uncertain persistence requires explicit reload');
    store.fault=null;vault.load();
    if(fault==='readback'){
      assert.equal(vault.view.state.credits,1530);assert.equal(vault.view.state.bays[0].build.parts.engine,'street');
      assert.equal(vault.prepareInstallation(action(vault.view.state)).accepted,false,'reloaded installed part is not paid twice');
    }else{
      assert.equal(store.peek(),raw);assert.equal(vault.view.state.credits,1800);
      assert((await vault.confirm(vault.prepareInstallation(action(vault.view.state)).ticket)).accepted);
      assert.equal(vault.view.state.credits,1530);
    }
    assert.equal((await vault.confirm(prepared.ticket)).accepted,false);
  });
}

test('another tab cannot install against an obsolete build or charge the same owned car twice',async()=>{
  const store=memory(),locks=coordinator(),a=vaultSession(store,locks).vault,b=vaultSession(store,locks).vault;
  await startVault(a);b.load();
  const old=b.prepareInstallation(action(b.view.state,'engine','performance'));
  assert(old.accepted);
  const accepted=await a.confirm(a.prepareInstallation(action(a.view.state)).ticket);assert(accepted.accepted);
  const raw=store.peek(),rejected=await b.confirm(old.ticket);
  assert.deepEqual(rejected,{accepted:false,reason:'conflict'});assert.equal(store.peek(),raw);
  assert.equal(b.view.state.credits,1800);b.load();assert.equal(b.view.state.credits,1530);
  assert.equal(b.view.state.bays[0].build.parts.engine,'street');
  assert.deepEqual(b.view.state.bays[0].build.inventory.engine,['stock','street']);
});

function freshBook(){return {money:2400,serial:1,revision:0,active:null,slots:[null,null,null,null],cars:new Map(),
  receipts:{carsSpent:0,partsSpent:0,laborSpent:0,sales:0}};}
function bookCar(model='cinder-two'){
  return {model,rules:1,parts:stockParts(),tuning:{...zero},
    inventory:Object.fromEntries(slots.map(slot=>[slot,new Set([initialPart(slot)])]))};
}
function assertBook(state,book,label){
  assert.equal(state.credits,book.money,label+' credits');
  assert.equal(state.credits,2400-book.receipts.carsSpent-book.receipts.partsSpent-book.receipts.laborSpent+book.receipts.sales,
    label+' independent cash journal');
  assert.equal(state.nextVehicleId,book.serial);assert.equal(state.revision,book.revision);
  assert.equal(state.activeVehicleId,book.active);assert.equal(state.bays.length,4);
  for(let i=0;i<4;i++){
    const id=book.slots[i],actual=state.bays[i];
    if(id===null){assert.equal(actual,null);continue;}
    const expected=book.cars.get(id);assert.equal(actual.ownedVehicleId,id);assert.equal(actual.modelId,expected.model);
    assert.deepEqual(actual.condition,{version:1,status:'pristine'});
    assert.equal(actual.build.rulesVersion,expected.rules);assert.deepEqual(actual.build.parts,expected.parts);
    if(expected.rules===1)assert.deepEqual(actual.build,stockBuild());
    else{
      assert.deepEqual(actual.build.tuning,expected.tuning);
      for(const slot of slots)assert.deepEqual(actual.build.inventory[slot],[...expected.inventory[slot]].sort());
    }
  }
  assert.deepEqual(validateGarage(state),state);assert.equal(serializeGarage(state),JSON.stringify(state));
  assert(state.credits>=0);assert.equal(new Set(state.bays.filter(Boolean).map(c=>c.ownedVehicleId)).size,book.cars.size);
}

test('1,024 generated purchase/installation/sale sequences preserve an independent money and per-car inventory ledger',t=>{
  let accepted=0,rejected=0,installs=0,refits=0,setups=0,retries=0;
  const slotInstalls=Object.fromEntries(slots.map(slot=>[slot,0]));
  for(let sequence=0;sequence<1024;sequence++){
    let state=createGarage(),book=freshBook(),rng=(sequence+1)>>>0;
    const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng;};
    for(let tick=0;tick<32;tick++){
      const choice=tick<2?0:tick<=6?4:random()%10;
      const ids=[...book.cars.keys()],target=tick>=2&&tick<=6?carId(1):ids.length?ids[random()%ids.length]:'car-000099';
      let request,result,expected=false,update=()=>{};
      if(choice<2){
        request={type:'buy',targetId:'cinder-two',expectedRevision:book.revision};
        expected=book.money>=600&&book.slots.includes(null);
        result=transactGarage(state,request);
        update=()=>{const id=carId(book.serial++);book.slots[book.slots.indexOf(null)]=id;book.cars.set(id,bookCar());
          book.money-=600;book.receipts.carsSpent+=600;book.active??=id;book.revision++;};
      }else if(choice===2){
        request={type:'sell',targetId:target,expectedRevision:book.revision};expected=book.cars.has(target);
        result=transactGarage(state,request);
        update=()=>{book.slots[book.slots.indexOf(target)]=null;book.cars.delete(target);
          book.money+=360;book.receipts.sales+=360;if(book.active===target)book.active=book.slots.find(Boolean)??null;book.revision++;};
      }else if(choice===3){
        request={type:'select',targetId:target,expectedRevision:book.revision};expected=book.cars.has(target);
        result=transactGarage(state,request);update=()=>{book.active=target;book.revision++;};
      }else{
        const slot=tick===2||tick===3?'finalDrive':tick>=4&&tick<=6?'engine':slots[random()%slots.length];
        const options=Object.keys(prices[slot]),part=tick===2||tick===3?'adjustable':tick===4||tick===6?'street':tick===5?'stock':options[random()%options.length],car=book.cars.get(target);
        const tuning={...(car?.tuning??zero)};
        if(slot==='finalDrive')tuning.finalDrive=part==='adjustable'?(random()%5)-2:0;
        if(slot==='suspension')for(const key of ['spring','damper','travel'])tuning[key]=part==='adjustable'?(random()%3)-1:0;
        if(slot==='steering')tuning.steering=part==='quick'?(random()%5)-2:0;
        if(tick===2)tuning.finalDrive=1;
        if(tick===3)tuning.finalDrive=2;
        request={type:'install',ownedVehicleId:target,slot,partId:part,tuning,expectedRevision:book.revision};
        const changedPart=!!car&&car.parts[slot]!==part;
        const changedSetup=!!car&&Object.keys(zero).some(key=>tuning[key]!==car.tuning[key]);
        const price=car&&!car.inventory[slot].has(part)?prices[slot][part]:0;
        const labor=changedPart?(slot==='paint'?10:20):changedSetup?10:0;
        expected=!!car&&(changedPart||changedSetup)&&book.money>=price+labor;
        result=transactGarageInstallation(state,request);
        update=()=>{car.rules=2;car.parts[slot]=part;car.tuning=tuning;car.inventory[slot].add(part);
          book.money-=price+labor;book.receipts.partsSpent+=price;book.receipts.laborSpent+=labor;book.revision++;
          installs++;slotInstalls[slot]++;if(price===0&&changedPart)refits++;if(!changedPart)setups++;};
      }
      assert.equal(result.accepted,expected,`sequence ${sequence} tick ${tick}: ${JSON.stringify(request)} -> ${JSON.stringify(result)}`);
      if(expected){
        accepted++;update();state=result.state;
        if(request.type==='install'){
          const old=serializeGarage(state),again=transactGarageInstallation(state,request);
          assert.equal(again.accepted,false,'the accepted intent cannot be replayed at its obsolete revision');
          assert.equal(serializeGarage(state),old);retries++;
        }
      }else rejected++;
      assertBook(state,book,`sequence ${sequence} tick ${tick}`);
    }
  }
  t.diagnostic(JSON.stringify({sequences:1024,operations:32768,accepted,rejected,installs,refits,setups,retries,slotInstalls}));
  assert(installs>1000,'generated coverage accepts at least one meaningful installation per sequence on average');
  assert(refits>0&&setups>0&&rejected>0&&retries===installs);
  assert(Object.values(slotInstalls).every(count=>count>0),'every declared part slot has accepted generated installation coverage');
});
