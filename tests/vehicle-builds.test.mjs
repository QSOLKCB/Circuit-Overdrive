// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {validateVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {BUILD_BYTES, compileVehicleBuild, stockVehicleBuild, identifyVehicleBuild,
  validateVehicleBuild} from '../src/vehicle-builds.js';

const source = '1c745a90258d0f6cb968935f773354cff702b276';
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stock = () => copy(stockVehicleBuild('cinder-two'));
function deeplyFrozen(value) {
  assert(Object.isFrozen(value));
  for (const child of Object.values(value)) if (child && typeof child === 'object') deeplyFrozen(child);
}

test('six stock builds compile deterministically into complete owned immutable recipes', () => {
  const identities = new Set();
  for (const {modelId} of GARAGE_CATALOG) {
    const input = copy(stockVehicleBuild(modelId)), before = copy(input);
    const a = compileVehicleBuild(modelId,input), b = compileVehicleBuild(modelId,input);
    assert.deepEqual(input,before);
    assert.deepEqual(a,b);
    assert.notEqual(a.recipe,b.recipe);
    assert.notEqual(a.build,input);
    assert.deepEqual(validateVehicle(a.recipe),a.recipe);
    assert.equal(a.canonicalRecipe,JSON.stringify(a.recipe));
    assert.equal(a.canonicalBuild,JSON.stringify(a.build));
    assert(Buffer.byteLength(a.canonicalBuild) <= BUILD_BYTES);
    deeplyFrozen(a);
    identities.add(a.canonicalRecipe);
    input.parts.engine='tampered';
    assert.equal(a.build.parts.engine,'stock');
    assert.throws(() => {a.recipe.engine.torqueCurve[0][1]=999;},TypeError);
  }
  assert.equal(identities.size,6);
});

test('strict build admission rejects unsupported versions, slots, tuning and raw recipes', () => {
  for (const mutate of [
    b => {b.version=2;}, b => {b.rulesVersion=2;}, b => {b.format='other';},
    b => {delete b.parts.engine;}, b => {b.parts.engine='street';},
    b => {b.parts.intake='constructor';}, b => {b.parts.paint='fast-red';},
    b => {b.parts.tyres=NaN;}, b => {b.parts.steering=Infinity;},
    b => {b.parts.suspension={spring:1e100};}, b => {b.parts.gearbox={ratios:[6,1,3]};},
    b => {b.parts.engine={torqueCurve:[[850,1e9],[6800,-1]]};},
    b => {b.tune={spring:NaN};}, b => {b.recipe={mass:1};},
    b => {b.parts.engine='x'.repeat(BUILD_BYTES+1);},
    b => {b[Symbol('extra')]=1;}, b => {Object.setPrototypeOf(b,{inherited:true});}
  ]) {
    const b=stock(); mutate(b);
    assert.throws(() => compileVehicleBuild('cinder-two',b));
    assert.equal(compileVehicleBuild('cinder-two',stock()).build.parts.engine,'stock');
  }
  for (const id of ['missing','__proto__',{},null]) assert.throws(() => stockVehicleBuild(id));
  for (const value of [null,[],1,'stock',()=>{}]) {
    assert.throws(() => validateVehicleBuild('cinder-two',value));
  }
});

test('accessors never execute and canonical ordering ignores input field order', () => {
  let reads=0;
  for (const slot of [false,true]) {
    const value=stock();
    Object.defineProperty(slot?value.parts:value,slot?'engine':'version',{
      enumerable:true,get(){reads++;throw Error('must not execute');}});
    assert.throws(() => compileVehicleBuild('cinder-two',value));
  }
  const hidden=stock();Object.defineProperty(hidden.parts,'engine',{value:'stock',enumerable:false});
  assert.throws(() => compileVehicleBuild('cinder-two',hidden));
  assert.equal(reads,0);
  const b=stock(), reverse=Object.fromEntries(Object.entries(b).reverse());
  reverse.parts=Object.fromEntries(Object.entries(b.parts).reverse());
  assert.deepEqual(compileVehicleBuild('cinder-two',reverse),compileVehicleBuild('cinder-two',b));
});

test('SHA-256 recipe receipts bind exact source, model, rules, engine and every recipe field', async () => {
  const a=await identifyVehicleBuild('cinder-two',stock(),source);
  assert.deepEqual(a,await identifyVehicleBuild('cinder-two',stock(),source));
  assert.equal(a.buildDigest,hash({domain:'co.vehicle-build.v1',modelId:a.modelId,
    rulesVersion:1,build:a.build}));
  assert.equal(a.recipeDigest,hash({domain:'co.vehicle-recipe.v1',sourceRevision:source,
    engineRevision:a.engineRevision,modelId:a.modelId,rulesVersion:1,recipe:a.recipe}));
  const otherSource=await identifyVehicleBuild('cinder-two',stock(),'f'.repeat(40));
  assert.equal(a.buildDigest,otherSource.buildDigest);
  assert.notEqual(a.recipeDigest,otherSource.recipeDigest);
  const otherModel=await identifyVehicleBuild('lilt',stockVehicleBuild('lilt'),source);
  assert.notEqual(a.buildDigest,otherModel.buildDigest);
  assert.notEqual(a.recipeDigest,otherModel.recipeDigest);
  deeplyFrozen(a);
  for(const invalid of [null,'main','v1.3.0','F'.repeat(40),'a'.repeat(39)]) {
    await assert.rejects(identifyVehicleBuild('cinder-two',stock(),invalid));
  }
});
