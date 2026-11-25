// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {stockVehicleBuild} from '../src/vehicle-builds.js';
import {CATALOG_REVISION, INITIAL_CREDITS, MAX_CREDITS, GARAGE_CATALOG,
  garageModel, validateGarageCatalogue} from '../src/garage-catalog.js';
import {GARAGE_VERSION, GARAGE_EDITION, BAY_COUNT, MAX_VEHICLE_ID, MAX_REVISION,
  GARAGE_SAVE_BYTES, createGarage, validateGarage, parseGarage, serializeGarage,
  vehicleId} from '../src/garage.js';

const clone = value => structuredClone(value);
const modelId = GARAGE_CATALOG[0].modelId;
const owned = (serial, model = modelId) => ({
  ownedVehicleId:'car-'+String(serial).padStart(6,'0'), modelId:model,
  build:stockVehicleBuild(model), condition:{version:1,status:'pristine'}
});
function fixture() {
  return {
    version:2, edition:'machine-shop-v1', catalogRevision:1, credits:600,
    nextVehicleId:8, activeVehicleId:'car-000007',
    bays:[owned(2),null,owned(7),null], revision:5
  };
}
const reverseKeys = value => Object.fromEntries(Object.entries(value).reverse());
function frozenTree(value) {
  if (value && typeof value === 'object') {
    assert(Object.isFrozen(value));
    for (const child of Object.values(value)) frozenTree(child);
  }
}
function rejectsChange(original, change, validate) {
  const input = clone(original);
  change(input);
  const before = Object.getOwnPropertyDescriptors(input);
  const contents = clone(input);
  assert.throws(() => validate(input),undefined,String(change));
  assert.deepEqual(Object.getOwnPropertyDescriptors(input),before,'rejection does not change caller fields');
  assert.deepEqual(clone(input),contents,'rejection does not change nested caller data');
}

test('six distinct original catalogue entries are inert, immutable and include an affordable starter', () => {
  assert.equal(CATALOG_REVISION,1);
  assert.equal(INITIAL_CREDITS,2400);
  assert.equal(MAX_CREDITS,99999999);
  assert.equal(GARAGE_CATALOG.length,6);
  assert.equal(new Set(GARAGE_CATALOG.map(row=>row.modelId)).size,6);
  assert.equal(new Set(GARAGE_CATALOG.map(row=>row.displayName)).size,6);
  assert.deepEqual(new Set(GARAGE_CATALOG.map(row=>row.bodyStyle)),new Set([
    'coupe','compact','grand-tourer','muscle','pickup','sports-coupe'
  ]));
  assert(GARAGE_CATALOG.some(row=>row.purchasePrice<=2400));
  frozenTree(GARAGE_CATALOG);
  for (const row of GARAGE_CATALOG) {
    assert.deepEqual(Object.keys(row).sort(),[
      'modelId','displayName','description','bodyStyle','finish','purchasePrice',
      'resalePolicy','visualModel','catalogRevision'
    ].sort());
    assert(Number.isSafeInteger(row.purchasePrice) && row.purchasePrice>0 && row.purchasePrice<=99999999);
    assert.equal(row.catalogRevision,1);
    assert.equal(row.resalePolicy,'stock-60-v1');
    assert.match(row.finish.body,/^#[0-9a-f]{6}$/);
    assert.match(row.finish.accent,/^#[0-9a-f]{6}$/);
    assert.strictEqual(garageModel(row.modelId),row);
    assert.throws(()=>{ row.finish.body='#000000'; },TypeError);
  }
  for (const id of ['unknown','__proto__','constructor','toString','',null,undefined,1,{},Symbol('id')]) {
    assert.throws(()=>garageModel(id));
  }
});

test('catalogue admission owns every row and finish without freezing or aliasing caller data', () => {
  const input=clone(GARAGE_CATALOG), before=clone(input);
  const accepted=validateGarageCatalogue(input);
  assert.deepEqual(accepted,before);
  frozenTree(accepted);
  assert.notStrictEqual(accepted,input);
  for (let i=0;i<input.length;i++) {
    assert.notStrictEqual(accepted[i],input[i]);
    assert.notStrictEqual(accepted[i].finish,input[i].finish);
  }
  assert(!Object.isFrozen(input) && !Object.isFrozen(input[0]) && !Object.isFrozen(input[0].finish));
  input[0].displayName='Changed by caller';
  input[0].finish.body='#000000';
  input.reverse();
  assert.deepEqual(accepted,before);
});

test('catalogue rejects duplicate identities, unsupported metadata, unsafe prices and excessive arrays', () => {
  const invalid=[
    d=>{d[1].modelId=d[0].modelId;}, d=>{d[1].displayName=d[0].displayName;}, d=>{d[0].modelId='';},
    d=>{d[0].modelId='../vehicle.js';}, d=>{d[0].modelId='x'.repeat(65);},
    d=>{d[0].displayName='';}, d=>{d[0].displayName='x'.repeat(49);},
    d=>{d[0].displayName='Bad\nName';}, d=>{d[0].description='x'.repeat(241);},
    d=>{d[0].description='';}, d=>{d[0].description='\u0000';},
    d=>{d[0].bodyStyle='unreviewed';}, d=>{d[0].visualModel='https://example.invalid/car.js';},
    d=>{d[0].visualModel='pickup-v1';},
    d=>{d[0].resalePolicy='free-money';}, d=>{d[0].catalogRevision=2;},
    d=>{d[0].horsepower=999;}, d=>{delete d[0].description;},
    d=>{d[0].finish.body='red';}, d=>{d[0].finish.accent='#12345g';},
    d=>{d[0].finish.name='';}, d=>{d[0].finish.url='paint.png';},
    d=>{d.pop();}, d=>{d.length=25;}, d=>{delete d[2];},
    d=>{d.extra=true;}, d=>{d[Symbol('extra')]=1;},
    d=>{for (const row of d) row.purchasePrice=2401;}
  ];
  for (const value of [-1,-0,0,1.5,NaN,Infinity,99999999+1,Number.MAX_SAFE_INTEGER+1,'1800',null]) {
    invalid.push(d=>{d[0].purchasePrice=value;});
  }
  for (const change of invalid) rejectsChange(GARAGE_CATALOG,change,validateGarageCatalogue);
  for (const value of [null,{},new Set(GARAGE_CATALOG),'catalogue']) assert.throws(()=>validateGarageCatalogue(value));
});

test('validating authored catalogue data cannot install a user-supplied ownership model', () => {
  const draft=clone(GARAGE_CATALOG);
  draft[0].modelId='uninstalled-model';
  draft[0].displayName='Uninstalled Model';
  assert.equal(validateGarageCatalogue(draft)[0].modelId,'uninstalled-model');
  assert.throws(()=>garageModel('uninstalled-model'));
  const state=fixture();
  state.bays[0].modelId='uninstalled-model';
  assert.throws(()=>validateGarage(state));
  assert.equal(garageModel(modelId).modelId,modelId);
});

test('new garages have four empty bays, no active vehicle and exactly the starting fictional credits', () => {
  assert.equal(GARAGE_VERSION,2);
  assert.equal(GARAGE_EDITION,'machine-shop-v1');
  assert.equal(BAY_COUNT,4);
  assert.equal(MAX_VEHICLE_ID,999999);
  assert.equal(MAX_REVISION,99999999);
  assert.equal(GARAGE_SAVE_BYTES,65536);
  const expected={
    version:2, edition:'machine-shop-v1', catalogRevision:1, credits:2400,
    nextVehicleId:1, activeVehicleId:null, bays:[null,null,null,null], revision:0
  };
  const first=createGarage(), second=createGarage();
  assert.deepEqual(first,expected);
  assert.deepEqual(second,expected);
  assert.notStrictEqual(first,second);
  assert.notStrictEqual(first.bays,second.bays);
  frozenTree(first);
  assert.equal(serializeGarage(first),JSON.stringify(expected));
  assert.throws(()=>{first.bays[0]=owned(1);},TypeError);
});

test('owned identity is independent from model identity and all four bays can contain the same model', () => {
  const input=fixture();
  input.bays=[owned(2),owned(4),owned(6),owned(7)];
  const accepted=validateGarage(input);
  assert.deepEqual(accepted,input);
  assert.equal(new Set(accepted.bays.map(car=>car.ownedVehicleId)).size,4);
  assert.equal(new Set(accepted.bays.map(car=>car.modelId)).size,1);
  const empty={...input,bays:[null,null,null,null],activeVehicleId:null,credits:0};
  assert.deepEqual(validateGarage(empty),empty,'sold-out state retains its allocator and zero balance');
});

test('canonical serialization preserves bay positions and owns a deeply frozen complete state', () => {
  const input=fixture(), expected=clone(input);
  const accepted=validateGarage(input);
  assert.notStrictEqual(accepted,input);
  assert.notStrictEqual(accepted.bays,input.bays);
  assert.notStrictEqual(accepted.bays[0],input.bays[0]);
  frozenTree(accepted);
  assert(!Object.isFrozen(input) && !Object.isFrozen(input.bays) && !Object.isFrozen(input.bays[0]));
  input.credits=0;
  input.bays[0].modelId=GARAGE_CATALOG[1].modelId;
  input.bays.reverse();
  assert.deepEqual(accepted,expected);
  const shuffled=reverseKeys(expected);
  shuffled.bays=shuffled.bays.map(car=>car && reverseKeys(car));
  const canonical=JSON.stringify(expected);
  assert.equal(serializeGarage(shuffled),canonical);
  const parsed=parseGarage(canonical);
  assert.deepEqual(parsed,expected);
  frozenTree(parsed);
  assert.equal(serializeGarage(parsed),canonical);
  const nullProto=Object.assign(Object.create(null),expected);
  nullProto.bays=expected.bays.map(car=>car && Object.assign(Object.create(null),car));
  assert.equal(serializeGarage(nullProto),canonical,'data records with no prototype normalize safely');
});

test('registry rejects missing and extra save fields, broken ownership, capacity and active selection', () => {
  const invalid=[
    d=>{d.version=99;}, d=>{d.edition='other-garage';}, d=>{d.catalogRevision=2;},
    d=>{delete d.credits;}, d=>{d.money=999;}, d=>{d.inventory=[];},
    d=>{d.bays.push(null);}, d=>{d.bays.pop();}, d=>{delete d.bays[1];},
    d=>{d.bays[1]=undefined;}, d=>{d.bays[0]='car-000002';}, d=>{d.bays[0]=[];},
    d=>{d.bays[0].modelId='unknown';}, d=>{d.bays[0].modelId='__proto__';},
    d=>{delete d.bays[0].modelId;}, d=>{d.bays[0].resaleValue=999999;},
    d=>{d.bays[1]=clone(d.bays[0]);},
    d=>{d.bays[0].ownedVehicleId='car-000007';},
    d=>{d.activeVehicleId='car-000006';}, d=>{d.activeVehicleId=null;},
    d=>{d.activeVehicleId=7;}, d=>{d.bays=[null,null,null,null];},
    d=>{d.nextVehicleId=7;}, d=>{d.nextVehicleId=1;},
    d=>{d.bays.extra=null;}, d=>{d.bays[Symbol('extra')]=null;},
    d=>{d[Symbol('extra')]=true;}
  ];
  for (const id of ['',1,null,{},'car-000000','car-000008','car-0000007','car-7','car-1000000','CAR-000002']) {
    invalid.push(d=>{d.bays[0].ownedVehicleId=id;});
  }
  for (const change of invalid) rejectsChange(fixture(),change,validateGarage);
  for (const value of [null,[],true,123,'garage',new Date(),new Map()]) assert.throws(()=>validateGarage(value));
});

test('integer bounds include explicit serial exhaustion and reject coercion, fractions and negative zero', () => {
  assert.equal(vehicleId(1),'car-000001');
  assert.equal(vehicleId(123456),'car-123456');
  assert.equal(vehicleId(999999),'car-999999');
  for (const value of [0,-0,-1,1.5,1000000,NaN,Infinity,'1',null,{},1n]) assert.throws(()=>vehicleId(value));
  for (const [key,min,max] of [['credits',0,99999999],['revision',0,99999999],['nextVehicleId',1,1000000]]) {
    for (const value of [-1,-0,0.5,NaN,Infinity,-Infinity,max+1,Number.MAX_SAFE_INTEGER+1,'1',null,true,1n]) {
      rejectsChange(fixture(),d=>{d[key]=value;},validateGarage);
    }
    for (const value of [min,max]) {
      const state={...createGarage(),[key]:value};
      assert.equal(validateGarage(state)[key],value);
    }
  }
  const exhausted={...fixture(),nextVehicleId:1000000,activeVehicleId:'car-999999',
    bays:[owned(999999),null,null,null]};
  assert.deepEqual(validateGarage(exhausted),exhausted,'last allocated ID remains valid at exhausted sentinel');
});

test('object admission rejects accessors, hidden fields, prototype tricks and executable serialization hooks inertly', () => {
  let executed=0;
  const getter=()=>{executed++;throw Error('getter must not run');};
  const functionValue=()=>{executed++;return fixture();};
  const badGarage=[
    d=>Object.defineProperty(d,'credits',{get:getter,enumerable:true}),
    d=>Object.defineProperty(d,'credits',{value:600,enumerable:false}),
    d=>Object.defineProperty(d,'hidden',{value:1}),
    d=>Object.defineProperty(d.bays,'0',{get:getter,enumerable:true}),
    d=>Object.defineProperty(d.bays,'0',{value:d.bays[0],enumerable:false}),
    d=>Object.defineProperty(d.bays[0],'modelId',{get:getter,enumerable:true}),
    d=>Object.defineProperty(d.bays[0],'modelId',{value:modelId,enumerable:false}),
    d=>Object.setPrototypeOf(d,{credits:600}),
    d=>Object.setPrototypeOf(d.bays[0],{modelId}),
    d=>Object.setPrototypeOf(d.bays,{}),
    d=>{d.toJSON=functionValue;}, d=>{d.bays[0].toJSON=functionValue;},
    d=>Object.defineProperty(d,'__proto__',{value:{polluted:true},enumerable:true})
  ];
  for (const change of badGarage) {
    const state=fixture();
    change(state);
    assert.throws(()=>validateGarage(state));
    assert.throws(()=>serializeGarage(state));
  }
  const badCatalogue=[
    d=>Object.defineProperty(d,'0',{get:getter,enumerable:true}),
    d=>Object.defineProperty(d[0],'purchasePrice',{get:getter,enumerable:true}),
    d=>Object.defineProperty(d[0].finish,'body',{get:getter,enumerable:true}),
    d=>Object.defineProperty(d[0].finish,'body',{value:'#123456',enumerable:false}),
    d=>Object.defineProperty(d[0],'extra',{value:1}),
    d=>Object.setPrototypeOf(d[0],{modelId}),
    d=>Object.setPrototypeOf(d[0].finish,{body:'#123456'}),
    d=>{d[0].toJSON=functionValue;}, d=>{d[0].finish[Symbol('paint')]=true;}
  ];
  for (const change of badCatalogue) {
    const rows=clone(GARAGE_CATALOG);
    change(rows);
    assert.throws(()=>validateGarageCatalogue(rows));
  }
  assert.equal(executed,0);
  assert.equal({}.polluted,undefined);
});

test('text admission is bounded in UTF-8 bytes and rejects malformed or unsupported complete saves', () => {
  const text=JSON.stringify(fixture());
  const atLimit=text+' '.repeat(65536-Buffer.byteLength(text));
  assert.deepEqual(parseGarage(atLimit),fixture());
  assert.throws(()=>parseGarage(atLimit+' '),RangeError);
  // Fewer than 64 KiB UTF-16 code units, but more than 64 KiB encoded bytes.
  assert.throws(()=>parseGarage('"'+'é'.repeat(32768)+'"'),RangeError);
  for (const raw of [undefined,null,{},new String(text),'','{','null','[]','false','42',
    text.replace('"version":2','"version":99'),
    text.replace('"credits":600','"credits":-1'),
    text.replace('"revision":5','"revision":5,"__proto__":{"polluted":true}'),
    text.replace('"revision":5','"revision":5,"constructor":{"prototype":{"polluted":true}}')]) {
    assert.throws(()=>parseGarage(raw));
  }
  assert.equal({}.polluted,undefined);
  assert.equal(serializeGarage(parseGarage(text)),text,'rejections do not change a valid input');
});

test('1,024 deterministic inventory states preserve independently specified IDs, balances and bay order', () => {
  for (let sequence=0;sequence<1024;sequence++) {
    const bays=Array.from({length:4},(_,bay)=>(sequence & (1<<bay)) ?
      owned(sequence*4+bay+1,GARAGE_CATALOG[(sequence+bay)%6].modelId) : null);
    const cars=bays.filter(Boolean);
    const expected={
      version:2, edition:'machine-shop-v1', catalogRevision:1,
      credits:(sequence*104729)%99999999,
      nextVehicleId:sequence*4+5,
      activeVehicleId:cars.length ? cars[sequence%cars.length].ownedVehicleId : null,
      bays, revision:sequence
    };
    const raw=JSON.stringify(expected);
    assert.equal(serializeGarage(validateGarage(reverseKeys(expected))),raw);
    const accepted=parseGarage(raw);
    assert.deepEqual(accepted,expected);
    assert.equal(accepted.credits,(sequence*104729)%99999999);
    assert.equal(new Set(cars.map(car=>car.ownedVehicleId)).size,cars.length);
    assert(accepted.bays.every((car,bay)=>car===null || car.ownedVehicleId==='car-'+String(sequence*4+bay+1).padStart(6,'0')));
    frozenTree(accepted);
  }
});
