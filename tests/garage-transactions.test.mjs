// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createGarage, parseGarage, serializeGarage} from '../src/garage.js';
import {transactGarage, garageBalance, garageResaleValue} from '../src/garage-transactions.js';

const clone = value => structuredClone(value);
const owned = (id, modelId='cinder-two') => ({ownedVehicleId:id, modelId});
const request = (state, type, targetId) => ({type, targetId, expectedRevision:state.revision});
function frozenTree(value) {
  if (value && typeof value === 'object') {
    assert(Object.isFrozen(value));
    for (const child of Object.values(value)) frozenTree(child);
  }
}
function accepted(state, type, targetId) {
  const before = clone(state), intent = request(state,type,targetId), originalIntent = clone(intent);
  const result = transactGarage(state,intent);
  assert.equal(result.accepted,true,JSON.stringify(result));
  assert.deepEqual(Object.keys(result).sort(),['accepted','receipt','state']);
  frozenTree(result);
  assert.deepEqual(state,before,'successful transition preserves its input');
  assert.deepEqual(intent,originalIntent,'request remains unchanged');
  assert.notStrictEqual(result.state,state);
  assert.notStrictEqual(result.state.bays,state.bays);
  assert.equal(result.state.revision,state.revision+1);
  assert.deepEqual(parseGarage(serializeGarage(result.state)),result.state);
  return result;
}
function rejected(state, intent, reason) {
  const before = clone(state), originalIntent = clone(intent);
  const result = transactGarage(state,intent);
  assert.deepEqual(result,{accepted:false,reason});
  assert(Object.isFrozen(result));
  assert.deepEqual(state,before,'rejection preserves all caller state');
  assert.deepEqual(intent,originalIntent,'rejection preserves the request');
  return result;
}

test('a real starter purchase changes credits, one bay, the allocator and revision atomically', () => {
  const state=clone(createGarage());
  const result=accepted(state,'buy','cinder-two');
  assert.deepEqual(result.state,{
    version:1, edition:'after-hours-v1', catalogRevision:1, credits:1800,
    nextVehicleId:2, activeVehicleId:'car-000001',
    bays:[owned('car-000001'),null,null,null], revision:1
  });
  assert.deepEqual(result.receipt,{
    type:'buy', fromRevision:0, toRevision:1, ownedVehicleId:'car-000001',
    modelId:'cinder-two', bayIndex:0, creditsBefore:2400, creditsAfter:1800, creditDelta:-600
  });
  assert(!Object.isFrozen(state) && !Object.isFrozen(state.bays),'caller was not frozen');
  state.credits=1;
  state.bays[0]=owned('car-000009');
  assert.equal(result.state.credits,1800);
  assert.equal(result.state.bays[0].ownedVehicleId,'car-000001');
});

test('four actual 600-credit purchases fill the garage and a fifth cannot allocate or charge', () => {
  let state=createGarage();
  for (let serial=1;serial<=4;serial++) {
    const result=accepted(state,'buy','cinder-two');
    assert.equal(result.receipt.bayIndex,serial-1);
    assert.equal(result.receipt.ownedVehicleId,'car-00000'+serial);
    assert.equal(result.state.credits,2400-serial*600);
    assert.equal(result.state.activeVehicleId,'car-000001','later purchases preserve active selection');
    state=result.state;
  }
  assert.deepEqual(state.bays,[1,2,3,4].map(n=>owned('car-00000'+n)));
  assert.equal(state.nextVehicleId,5);
  rejected(state,request(state,'buy','cinder-two'),'garage-full');
});

test('premium purchase uses its catalogue price and inadequate credits cannot create a partial car', () => {
  const premium=accepted(createGarage(),'buy','glass-comet');
  assert.equal(premium.state.credits,0);
  assert.equal(premium.state.bays[0].modelId,'glass-comet');
  assert.equal(premium.receipt.creditDelta,-2400);
  rejected(premium.state,request(premium.state,'buy','cinder-two'),'insufficient-credits');
  const short=clone(createGarage());
  short.credits=599;
  rejected(short,request(short,'buy','cinder-two'),'insufficient-credits');
});

test('resale is a fixed catalogue amount and a buy/sell cycle reduces the balance for every model', () => {
  const expected=[['cinder-two',600,360],['lilt',900,540],['evening-line',1400,840],
    ['rivet-eight',1800,1080],['yardhand',1200,720],['glass-comet',2400,1440]];
  for (const [modelId,price,resale] of expected) {
    assert.equal(garageResaleValue(modelId),resale);
    assert(Number.isSafeInteger(resale) && resale<price);
    const bought=accepted(createGarage(),'buy',modelId).state;
    const sold=accepted(bought,'sell','car-000001');
    assert.equal(sold.state.credits,2400-price+resale);
    assert.deepEqual(sold.state.bays,[null,null,null,null]);
    assert.equal(sold.state.activeVehicleId,null);
    assert.equal(sold.state.nextVehicleId,2,'selling the last car retains serial history');
    assert.deepEqual(sold.receipt,{
      type:'sell', fromRevision:1, toRevision:2, ownedVehicleId:'car-000001',
      modelId, bayIndex:0, creditsBefore:2400-price, creditsAfter:2400-price+resale, creditDelta:resale
    });
  }
  for (const model of ['missing','__proto__',null,{},1]) assert.throws(()=>garageResaleValue(model));
});

test('selling inactive cars preserves selection and selling the active car chooses the lowest occupied bay', () => {
  let state=createGarage();
  for (let i=0;i<4;i++) state=accepted(state,'buy','cinder-two').state;
  state=accepted(state,'sell','car-000001').state;
  assert.equal(state.activeVehicleId,'car-000002');
  state=accepted(state,'sell','car-000004').state;
  assert.equal(state.activeVehicleId,'car-000002');
  assert.deepEqual(state.bays,[null,owned('car-000002'),owned('car-000003'),null]);
  const repurchase=accepted(state,'buy','cinder-two');
  state=repurchase.state;
  assert.equal(repurchase.receipt.bayIndex,0);
  assert.equal(repurchase.receipt.ownedVehicleId,'car-000005','empty bay reuse never reuses an instance ID');
  assert.equal(state.activeVehicleId,'car-000002');
  state=accepted(state,'sell','car-000002').state;
  assert.equal(state.activeVehicleId,'car-000005','fallback follows bay order rather than oldest serial');
  assert.deepEqual(state.bays,[owned('car-000005'),null,owned('car-000003'),null]);
  assert.equal(state.nextVehicleId,6);
});

test('selection only changes the active owned ID and consumes exactly one revision', () => {
  let state=accepted(createGarage(),'buy','cinder-two').state;
  state=accepted(state,'buy','lilt').state;
  const selected=accepted(state,'select','car-000002');
  assert.deepEqual(selected.state,{...state,activeVehicleId:'car-000002',revision:3});
  assert.deepEqual(selected.receipt,{
    type:'select',fromRevision:2,toRevision:3,ownedVehicleId:'car-000002',modelId:'lilt',
    bayIndex:1,creditsBefore:900,creditsAfter:900,creditDelta:0
  });
  const again=accepted(selected.state,'select','car-000002');
  assert.deepEqual(again.state,{...selected.state,revision:4},'already-active selection still consumes its intent');
  assert.equal(again.receipt.creditDelta,0);
  rejected(selected.state,{type:'select',targetId:'car-000002',expectedRevision:2},'stale-revision');
});

test('retrying a previously committed purchase or sale cannot duplicate ownership or proceeds', () => {
  const initial=createGarage();
  const buy=request(initial,'buy','cinder-two');
  const first=transactGarage(initial,buy), recomputed=transactGarage(initial,buy);
  assert.equal(first.accepted,true);
  assert.deepEqual(recomputed,first,'pure recomputation of the same old snapshot gives the same proposed transition');
  rejected(first.state,buy,'stale-revision');
  const sale=request(first.state,'sell','car-000001');
  const sold=transactGarage(first.state,sale);
  assert.equal(sold.accepted,true);
  assert.equal(sold.state.credits,2160);
  rejected(sold.state,sale,'stale-revision');
  rejected(sold.state,request(sold.state,'sell','car-000001'),'vehicle-not-owned');
  rejected(sold.state,request(sold.state,'select','car-000001'),'vehicle-not-owned');
  const second=accepted(sold.state,'buy','cinder-two');
  assert.equal(second.receipt.ownedVehicleId,'car-000002');
  assert.equal(second.state.credits,1560);
});

test('stale competing intents reject before spending and never rebase themselves onto a newer revision', () => {
  const initial=createGarage();
  const otherTab={type:'buy',targetId:'glass-comet',expectedRevision:0};
  const committed=accepted(initial,'buy','cinder-two').state;
  rejected(committed,otherTab,'stale-revision');
  rejected(committed,{type:'sell',targetId:'car-000001',expectedRevision:0},'stale-revision');
  rejected(committed,{type:'buy',targetId:'cinder-two',expectedRevision:2},'stale-revision');
  assert.equal(committed.credits,1800);
  assert.equal(committed.bays.filter(Boolean).length,1);
});

test('sale at the money ceiling is exact and one-credit overflow rejects the entire transaction', () => {
  // Imported-state boundary fixtures exercise the ceiling without adding a reward operation.
  const basis={...createGarage(),nextVehicleId:2,activeVehicleId:'car-000001',
    bays:[owned('car-000001'),null,null,null],revision:1};
  const exact={...basis,credits:99999639};
  assert.equal(accepted(exact,'sell','car-000001').state.credits,99999999);
  const over={...basis,credits:99999640};
  rejected(over,request(over,'sell','car-000001'),'credit-overflow');
  const capped={...basis,credits:99999999};
  rejected(capped,request(capped,'sell','car-000001'),'credit-overflow');
});

test('serial and revision exhaustion never wrap and the last representable purchase remains valid', () => {
  let state={...createGarage(),nextVehicleId:999999};
  state=accepted(state,'buy','cinder-two').state;
  assert.equal(state.bays[0].ownedVehicleId,'car-999999');
  assert.equal(state.nextVehicleId,1000000);
  rejected(state,request(state,'buy','cinder-two'),'vehicle-id-exhausted');
  state=accepted(state,'sell','car-999999').state;
  assert.equal(state.nextVehicleId,1000000);
  rejected(state,request(state,'buy','cinder-two'),'vehicle-id-exhausted');
  const penultimate={...createGarage(),revision:99999998};
  const final=accepted(penultimate,'buy','cinder-two').state;
  assert.equal(final.revision,99999999);
  for (const type of ['buy','sell','select']) {
    rejected(final,request(final,type,type==='buy'?'cinder-two':'car-000001'),'revision-exhausted');
  }
  rejected(final,{type:'sell',targetId:'car-000001',expectedRevision:99999998},'stale-revision');
});

test('requests cannot override prices, resale, bay placement, IDs or the revision contract', () => {
  const state=clone(createGarage()), valid=request(state,'buy','cinder-two');
  const invalid=[null,[],true,'buy',{},
    {...valid,type:'reset'},{...valid,type:'reward'},{...valid,type:'BUY'},
    {...valid,targetId:''},{...valid,targetId:'x'.repeat(49)},
    ...[undefined,null,1,{},[],1n].map(targetId=>({...valid,targetId})),
    ...[-1,-0,0.5,NaN,Infinity,100000000,'0',null,true,1n].map(expectedRevision=>({...valid,expectedRevision})),
    ...[-100,0,0.5,600].map(price=>({...valid,price})),
    {...valid,bayIndex:3},{...valid,ownedVehicleId:'car-000002'},
    {...valid,resaleValue:99999999},{...valid,nextVehicleId:1}
  ];
  for (const key of ['type','targetId','expectedRevision']) {
    const missing={...valid};delete missing[key];invalid.push(missing);
  }
  for (const value of invalid) rejected(state,value,'invalid-request');
  const bought=accepted(state,'buy','cinder-two').state;
  rejected(bought,{...request(bought,'sell','car-000001'),resaleValue:99999999},'invalid-request');
});

test('invalid catalogue identities and malformed or unowned vehicle IDs return distinct rejection reasons', () => {
  const state=createGarage();
  for (const model of ['missing','constructor','__proto__','CINDER-TWO','../car.js']) {
    rejected(state,request(state,'buy',model),'invalid-model');
  }
  for (const type of ['sell','select']) {
    for (const id of ['car-000000','car-1','car-1000000','CAR-000001','cinder-two','car-00001x']) {
      rejected(state,request(state,type,id),'invalid-vehicle-id');
    }
    rejected(state,request(state,type,'car-000001'),'vehicle-not-owned');
    rejected(state,request(state,type,'car-999999'),'vehicle-not-owned');
  }
});

test('invalid states reject before requests and query helpers validate the complete garage', () => {
  const fresh=createGarage(), valid=request(fresh,'buy','cinder-two');
  const invalid=[null,[],{},
    ...[-1,-0,NaN,Infinity,1.5,100000000,'2400'].map(credits=>({...fresh,credits})),
    {...fresh,version:2},{...fresh,bays:[null,null,null]},
    {...fresh,nextVehicleId:2,activeVehicleId:'car-000001',bays:[owned('car-000001'),owned('car-000001'),null,null]},
    {...fresh,nextVehicleId:2,activeVehicleId:'car-000001',bays:[owned('car-000001','missing'),null,null,null]},
    {...fresh,activeVehicleId:'car-000001'}
  ];
  for (const state of invalid) {
    rejected(state,valid,'invalid-state');
    assert.deepEqual(transactGarage(state,null),{accepted:false,reason:'invalid-state'});
    assert.throws(()=>garageBalance(state));
  }
  assert.equal(garageBalance(fresh),2400);
  assert.equal(garageBalance(accepted(fresh,'buy','cinder-two').state),1800);
});

test('successful transitions own all records and cannot be changed through mutable input aliases', () => {
  let state=accepted(createGarage(),'buy','cinder-two').state;
  state=accepted(state,'buy','lilt').state;
  const input=clone(state), intent=request(input,'select','car-000002');
  const result=transactGarage(input,intent), expected=clone(result);
  assert.equal(result.accepted,true);
  for (let bay=0;bay<2;bay++) assert.notStrictEqual(result.state.bays[bay],input.bays[bay]);
  input.bays[0].modelId='glass-comet';
  input.bays[1].ownedVehicleId='car-000099';
  input.bays.reverse();
  input.credits=0;
  intent.targetId='car-000001';
  assert.deepEqual(result,expected);
  frozenTree(result);
  assert.throws(()=>{result.receipt.creditDelta=999;},TypeError);
  assert.throws(()=>{result.state.bays[0].modelId='glass-comet';},TypeError);
});

test('request and state accessors, hidden fields and prototype tricks reject without executing code', () => {
  let executed=0;
  const getter=()=>{executed++;throw Error('must not execute');};
  const hook=()=>{executed++;return 'cinder-two';};
  const initial=createGarage(), base=request(initial,'buy','cinder-two');
  const badRequests=[
    r=>Object.defineProperty(r,'type',{get:getter,enumerable:true}),
    r=>Object.defineProperty(r,'targetId',{get:getter,enumerable:true}),
    r=>Object.defineProperty(r,'expectedRevision',{get:getter,enumerable:true}),
    r=>Object.defineProperty(r,'type',{value:'buy',enumerable:false}),
    r=>Object.defineProperty(r,'hidden',{value:1}),
    r=>{r[Symbol('extra')]=true;},r=>{r.toJSON=hook;},
    r=>Object.setPrototypeOf(r,{type:'buy'}),
    r=>Object.defineProperty(r,'__proto__',{value:{polluted:true},enumerable:true})
  ];
  for (const alter of badRequests) {
    const intent={...base};alter(intent);
    assert.deepEqual(transactGarage(initial,intent),{accepted:false,reason:'invalid-request'});
  }
  for (const targetId of [Symbol('model'),hook,{toString:hook,valueOf:hook}]) {
    assert.deepEqual(transactGarage(initial,{...base,targetId}),{accepted:false,reason:'invalid-request'});
  }
  const basis=accepted(initial,'buy','cinder-two').state;
  const badStates=[
    s=>Object.defineProperty(s,'credits',{get:getter,enumerable:true}),
    s=>Object.defineProperty(s.bays,'0',{get:getter,enumerable:true}),
    s=>Object.defineProperty(s.bays[0],'modelId',{get:getter,enumerable:true}),
    s=>{delete s.bays[3];},s=>{s.bays[0].resaleValue=999;},s=>{s.toJSON=hook;},
    s=>Object.setPrototypeOf(s,{credits:2400})
  ];
  for (const alter of badStates) {
    const state=clone(basis);alter(state);
    assert.deepEqual(transactGarage(state,{type:'sell',targetId:'car-000001',expectedRevision:1}),
      {accepted:false,reason:'invalid-state'});
  }
  assert.equal(executed,0);
  assert.equal({}.polluted,undefined);
  const nullPrototype=Object.assign(Object.create(null),base);
  assert.equal(transactGarage(initial,nullPrototype).accepted,true,'plain inert null-prototype intent remains valid');
});
