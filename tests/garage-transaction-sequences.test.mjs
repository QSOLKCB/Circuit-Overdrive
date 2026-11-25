// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createGarage, parseGarage, serializeGarage, validateGarage} from '../src/garage.js';
import {transactGarage} from '../src/garage-transactions.js';

// Independent reviewed catalogue values, not implementation valuation helpers.
const models = new Map([
  ['cinder-two',{buy:600,sell:360}], ['lilt',{buy:900,sell:540}],
  ['evening-line',{buy:1400,sell:840}], ['rivet-eight',{buy:1800,sell:1080}],
  ['yardhand',{buy:1200,sell:720}], ['glass-comet',{buy:2400,sell:1440}]
]);
const modelIds = [...models.keys()];
const id = serial => 'car-'+String(serial).padStart(6,'0');
// Independently specified stock schema, separate from compiler/transaction admission.
const stockBuild = () => ({format:'circuit-overdrive.vehicle-build',version:1,rulesVersion:1,
  parts:{engine:'stock',intake:'stock',exhaust:'stock',gearbox:'stock',finalDrive:'stock',
    tyres:'stock',suspension:'stock',steering:'stock',paint:'factory'}});
const owned = (ownedVehicleId,modelId) => ({ownedVehicleId,modelId,build:stockBuild(),
  condition:{version:1,status:'pristine'}});
const fresh = () => ({version:2,edition:'machine-shop-v1',catalogRevision:1,credits:2400,
  nextVehicleId:1,activeVehicleId:null,bays:[null,null,null,null],revision:0});
const clone = value => structuredClone(value);

// The oracle holds ownership separately from four ordered ID slots. It never
// calls the transaction engine, catalogue lookup, resale or identity helpers.
function ledger(state) {
  return {money:state.credits,serial:state.nextVehicleId,revision:state.revision,
    active:state.activeVehicleId,slots:state.bays.map(car=>car?.ownedVehicleId??null),
    cars:new Map(state.bays.filter(Boolean).map(car=>[car.ownedVehicleId,car.modelId]))};
}
function snapshot(book) {
  return {version:2,edition:'machine-shop-v1',catalogRevision:1,credits:book.money,
    nextVehicleId:book.serial,activeVehicleId:book.active,
    bays:book.slots.map(key=>key===null?null:owned(key,book.cars.get(key))),
    revision:book.revision};
}
function oracle(book, request) {
  const reject = reason => ({accepted:false,reason});
  if (Object.keys(request).length!==3 || !['buy','sell','select'].includes(request.type) ||
      typeof request.targetId!=='string' || !request.targetId.length || request.targetId.length>48 ||
      !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision<0 ||
      request.expectedRevision>99999999 || Object.is(request.expectedRevision,-0)) {
    return reject('invalid-request');
  }
  if (request.expectedRevision!==book.revision) return reject('stale-revision');
  if (book.revision===99999999) return reject('revision-exhausted');
  const next={...book,slots:[...book.slots],cars:new Map(book.cars)};
  let carId=request.targetId, modelId, bayIndex, creditDelta=0;
  if (request.type==='buy') {
    const prices=models.get(request.targetId);
    if (!prices) return reject('invalid-model');
    bayIndex=book.slots.indexOf(null);
    if (bayIndex<0) return reject('garage-full');
    if (book.money<prices.buy) return reject('insufficient-credits');
    if (book.serial===1000000) return reject('vehicle-id-exhausted');
    carId=id(book.serial);
    modelId=request.targetId;
    next.cars.set(carId,modelId);
    next.slots[bayIndex]=carId;
    next.serial++;
    if (book.cars.size===0) next.active=carId;
    creditDelta=-prices.buy;
  } else {
    if (!/^car-[0-9]{6}$/.test(carId) || carId==='car-000000') return reject('invalid-vehicle-id');
    if (!book.cars.has(carId)) return reject('vehicle-not-owned');
    modelId=book.cars.get(carId);
    bayIndex=book.slots.indexOf(carId);
    if (request.type==='sell') {
      creditDelta=models.get(modelId).sell;
      if (book.money+creditDelta>99999999) return reject('credit-overflow');
      next.cars.delete(carId);
      next.slots[bayIndex]=null;
      if (book.active===carId) next.active=next.slots.find(value=>value!==null)??null;
    } else next.active=carId;
  }
  next.money+=creditDelta;
  next.revision++;
  return {accepted:true,book:next,state:snapshot(next),receipt:{type:request.type,
    fromRevision:book.revision,toRevision:next.revision,ownedVehicleId:carId,modelId,bayIndex,
    creditsBefore:book.money,creditsAfter:next.money,creditDelta}};
}
function liquidationValue(book) {
  return book.money+[...book.cars.values()].reduce((sum,model)=>sum+models.get(model).sell,0);
}
function checkInvariants(state) {
  assert(Number.isSafeInteger(state.credits) && state.credits>=0 && state.credits<=99999999);
  assert.equal(state.bays.length,4);
  const cars=state.bays.filter(Boolean), ids=cars.map(car=>car.ownedVehicleId);
  assert.equal(new Set(ids).size,cars.length);
  assert(cars.length ? ids.includes(state.activeVehicleId) : state.activeVehicleId===null);
  for (const key of ids) assert(Number(key.slice(4))<state.nextVehicleId);
  assert.deepEqual(parseGarage(serializeGarage(state)),state);
}
function nextRandom(seed) {
  let state=(seed+1)>>>0;
  return () => {
    state^=state<<13; state^=state>>>17; state^=state<<5;
    return state>>>0;
  };
}
function initialFixture(sequence) {
  const state=fresh();
  // 768 real starting states, then explicitly synthetic admitted boundary data.
  if (sequence<768) return state;
  if (sequence<832) {
    state.credits=99999999-sequence%5;
    state.nextVehicleId=2;
    state.activeVehicleId=id(1);
    state.bays[sequence%4]=owned(id(1),modelIds[sequence%6]);
  } else if (sequence<896) state.credits=100000;
  else if (sequence<960) {
    state.nextVehicleId=1000000;
    state.activeVehicleId=id(999999);
    state.bays[sequence%4]=owned(id(999999),modelIds[sequence%6]);
  } else state.revision=99999998;
  return state;
}
function requestFor(book, random, step, sequence, previous, retired) {
  const keys=book.slots.filter(Boolean), roll=random();
  const key=keys.length?keys[(roll>>>8)%keys.length]:id(500000);
  const request={type:'buy',targetId:modelIds[(roll>>>16)%6],expectedRevision:book.revision};
  // Guarantee full fresh garages in 96 sequences through legitimate purchases.
  if (sequence<768 && sequence%8===0 && step<5) return {...request,targetId:'cinder-two'};
  switch (roll%16) {
    case 0: case 1: case 2: case 3: case 4: return request;
    case 5: return {...request,targetId:'not-a-catalogue-model'};
    case 6: return {...request,type:'select',targetId:key};
    case 7: return {...request,type:'select',targetId:book.active??id(500000)};
    case 8: case 9: case 10: return {...request,type:'sell',targetId:key};
    case 11: return {...request,type:'sell',targetId:retired??id(500000)};
    case 12: return previous?clone(previous):{...request,expectedRevision:book.revision+1};
    case 13: return {...request,expectedRevision:book.revision?book.revision-1:1};
    case 14: return {...request,type:'select',targetId:'car-0'};
    case 15: return {...request,price:0};
  }
}

test('1,024 deterministic 64-operation sequences reconcile against an independent ownership and money ledger', t => {
  const counts={buy:0,sell:0,select:0,rejected:0}, reasons=new Set();
  let checked=0;
  for (let sequence=0;sequence<1024;sequence++) {
    const initial=initialFixture(sequence);
    let state=sequence<768?createGarage():validateGarage(initial);
    assert.deepEqual(state,initial);
    let book=ledger(initial), previous=null, retired=null;
    const random=nextRandom(sequence), allocated=new Set(book.cars.keys());
    for (let step=0;step<64;step++) {
      const request=requestFor(book,random,step,sequence,previous,retired);
      const expected=oracle(book,request), before=clone(state), requestBefore=clone(request);
      // Supply mutable caller data, so aliasing and accidental mutation are visible.
      const input=clone(state), actual=transactGarage(input,request);
      assert.deepEqual(input,before,'caller state changed at '+sequence+'/'+step);
      assert.deepEqual(request,requestBefore,'caller request changed');
      assert.equal(actual.accepted,expected.accepted,'acceptance at '+sequence+'/'+step);
      checked++;
      if (!expected.accepted) {
        assert.deepEqual(actual,expected,'rejection at '+sequence+'/'+step);
        counts.rejected++;
        reasons.add(actual.reason);
        continue;
      }
      assert.deepEqual(actual,{accepted:true,state:expected.state,receipt:expected.receipt},
        'accepted ledger at '+sequence+'/'+step);
      assert.deepEqual(transactGarage(input,request),actual,'same input recomputes the same allocation');
      assert.deepEqual(transactGarage(actual.state,request),{accepted:false,reason:'stale-revision'},
        'committed retry never applies a second time');
      assert.equal(actual.state.credits-before.credits,expected.receipt.creditDelta);
      assert.equal(actual.state.revision,before.revision+1);
      assert(actual.state.nextVehicleId>=before.nextVehicleId);
      assert(liquidationValue(expected.book)<=liquidationValue(book));
      if (request.type==='buy') {
        assert(!allocated.has(actual.receipt.ownedVehicleId),'sold IDs are never reused');
        allocated.add(actual.receipt.ownedVehicleId);
        assert(liquidationValue(expected.book)<liquidationValue(book));
      } else {
        assert.equal(actual.state.nextVehicleId,before.nextVehicleId);
        assert.equal(liquidationValue(expected.book),liquidationValue(book));
      }
      if (request.type==='sell') retired=actual.receipt.ownedVehicleId;
      counts[request.type]++;
      state=actual.state;
      book=expected.book;
      previous=clone(request);
      checkInvariants(state);
    }
    assert.deepEqual(state,snapshot(book));
  }
  assert.equal(checked,65536);
  for (const type of ['buy','sell','select']) assert(counts[type]>1000,type+' coverage');
  for (const reason of ['invalid-model','garage-full','insufficient-credits','vehicle-id-exhausted',
    'invalid-vehicle-id','vehicle-not-owned','credit-overflow','stale-revision','revision-exhausted','invalid-request']) {
    assert(reasons.has(reason),'missing generated rejection '+reason);
  }
  t.diagnostic(JSON.stringify({sequences:1024,operations:checked,freshSequences:768,
    syntheticBoundarySequences:256,...counts}));
});

test('repeated fresh-garage buy/sell cycles strictly spend credits and never recycle an owned ID', () => {
  for (const [model,prices] of models) {
    let state=createGarage(), cycles=0;
    const issued=new Set();
    while (state.credits>=prices.buy) {
      const before=state.credits;
      const bought=transactGarage(state,{type:'buy',targetId:model,expectedRevision:state.revision});
      assert.equal(bought.accepted,true);
      const key=bought.receipt.ownedVehicleId;
      assert(!issued.has(key));
      issued.add(key);
      const sold=transactGarage(bought.state,{type:'sell',targetId:key,expectedRevision:bought.state.revision});
      assert.equal(sold.accepted,true);
      state=sold.state;
      cycles++;
      assert.equal(state.credits,2400-cycles*(prices.buy-prices.sell));
      assert(state.credits<before);
      assert.deepEqual(state.bays,[null,null,null,null]);
      assert.equal(state.activeVehicleId,null);
      assert.equal(state.nextVehicleId,cycles+1);
      assert(cycles<=8,'strictly losing trade must terminate within the opening balance');
    }
    assert.deepEqual(transactGarage(state,{type:'buy',targetId:model,expectedRevision:state.revision}),
      {accepted:false,reason:'insufficient-credits'});
    checkInvariants(state);
  }
});
