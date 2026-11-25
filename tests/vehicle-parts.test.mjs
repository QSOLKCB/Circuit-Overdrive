// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GARAGE_CATALOG,garageModel} from '../src/garage-catalog.js';
import {BUILD_BYTES,BUILD_RULES,BUILD_PART_RULES,SUPPORTED_BUILD_RULES,compileVehicleBuild,
  identifyVehicleBuild,stockVehicleBuild,stockUpgradeBuild,validateVehicleBuild} from '../src/vehicle-builds.js';
import {MAX_PART_PRICE,PART_SLOTS,PART_TUNING_LIMITS,vehiclePart,vehicleParts,vehiclePaint} from '../src/vehicle-parts.js';

const copy=value=>structuredClone(value);
const model='cinder-two';
const fresh=(id=model)=>copy(stockUpgradeBuild(id,stockVehicleBuild(id)));
const fit=(slot,part,id=model)=>{
  const build=fresh(id);build.parts[slot]=part;
  if(!build.inventory[slot].includes(part))build.inventory[slot].push(part);
  return build;
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function frozen(value){
  assert(Object.isFrozen(value));
  for(const child of Object.values(value))if(child&&typeof child==='object')frozen(child);
}

test('authored parts prices, slot membership and paint finishes are finite immutable data',()=>{
  assert.deepEqual(PART_SLOTS,['engine','intake','exhaust','gearbox','finalDrive','tyres','suspension','steering','paint']);
  assert.equal(MAX_PART_PRICE,950);
  const expected={engine:[0,250,550,950],intake:[0,80],exhaust:[0,100],gearbox:[0,160,160],
    finalDrive:[0,120],tyres:[0,140,220,90],suspension:[0,180],steering:[0,100],paint:[0,60,60,60]};
  for(const slot of PART_SLOTS){
    const parts=vehicleParts(slot);frozen(parts);
    assert.equal(parts[0].id,slot==='paint'?'factory':'stock');
    assert.deepEqual(parts.map(p=>p.price),expected[slot]);
    assert.equal(new Set(parts.map(p=>p.id)).size,parts.length);
    for(const part of parts){
      assert.deepEqual(Object.keys(part),['id','slot','name','price','description']);
      assert.equal(part.slot,slot);assert.equal(vehiclePart(slot,part.id),part);
      assert(Number.isSafeInteger(part.price)&&part.price>=0&&part.price<=MAX_PART_PRICE);
      assert(part.description.length>0&&part.description.length<300);
    }
  }
  for(const slot of [null,{},'__proto__','unknown'])assert.throws(()=>vehicleParts(slot));
  assert.throws(()=>vehiclePart('gearbox','street'));
  for(const {modelId} of GARAGE_CATALOG){
    assert.deepEqual(vehiclePaint('factory',modelId),garageModel(modelId).finish);
    for(const id of ['oxide','seafoam','midnight']){
      const paint=vehiclePaint(id,modelId);frozen(paint);
      assert.match(paint.body,/^#[0-9a-f]{6}$/);assert.match(paint.accent,/^#[0-9a-f]{6}$/);
    }
  }
  assert.throws(()=>vehiclePaint('oxide','missing'));
});

test('explicit rules conversion owns copied inventory and retains all legacy build and recipe bytes',async()=>{
  assert.equal(BUILD_RULES,1);assert.equal(BUILD_PART_RULES,2);assert.deepEqual(SUPPORTED_BUILD_RULES,[1,2]);
  const receipt=JSON.parse(await readFile(new URL('../docs/evidence/co-014b/stock-physical.json',import.meta.url)));
  for(const {modelId} of GARAGE_CATALOG){
    const input=copy(stockVehicleBuild(modelId)),untouched=copy(input);
    const before=compileVehicleBuild(modelId,input),recorded=receipt.measurements.find(row=>row.modelId===modelId);
    assert.equal(before.canonicalBuild,recorded.canonicalBuild);
    assert.equal(before.canonicalRecipe,recorded.canonicalRecipe);
    const identity=await identifyVehicleBuild(modelId,input,recorded.sourceRevision);
    assert.equal(identity.buildDigest,recorded.buildDigest);
    assert.equal(identity.recipeDigest,recorded.recipeDigest);
    const current=stockUpgradeBuild(modelId,input);frozen(current);
    assert.deepEqual(input,untouched);assert(!Object.isFrozen(input));
    assert.equal(current.rulesVersion,2);
    assert.deepEqual(current.parts,input.parts);
    assert.deepEqual(current.tuning,{finalDrive:0,spring:0,damper:0,travel:0,steering:0});
    for(const slot of PART_SLOTS)assert.deepEqual(current.inventory[slot],[input.parts[slot]]);
    assert.deepEqual(compileVehicleBuild(modelId,current).recipe,before.recipe,'conversion alone changes no recipe field');
    const again=stockUpgradeBuild(modelId,current);
    assert.notEqual(again,current);assert.notEqual(again.parts,current.parts);assert.deepEqual(again,current);
  }
});

test('all single catalogue parts compile on all six machines without changing body or wheel dimensions',()=>{
  for(const {modelId} of GARAGE_CATALOG){
    const before=compileVehicleBuild(modelId,stockVehicleBuild(modelId)).recipe;
    for(const slot of PART_SLOTS)for(const part of vehicleParts(slot)){
      const proposal=fit(slot,part.id,modelId),untouched=copy(proposal);
      const accepted=compileVehicleBuild(modelId,proposal);frozen(accepted);
      assert.deepEqual(proposal,untouched);
      assert.deepEqual(accepted.recipe.chassis,before.chassis);
      assert.deepEqual(accepted.recipe.wheel,before.wheel);
      assert.equal(accepted.recipe.mass,before.mass);
      assert.deepEqual(accepted.recipe.inertia,before.inertia);
    }
  }
});

test('engine, intake and exhaust compose explicit additive Nm curves without RPM or braking inventions',()=>{
  const before=compileVehicleBuild(model,stockVehicleBuild(model)).recipe;
  const combined=fit('engine','street');
  for(const [slot,id] of [['intake','duct'],['exhaust','flow']]){
    combined.parts[slot]=id;combined.inventory[slot].push(id);
  }
  const next=compileVehicleBuild(model,combined).recipe;
  assert.deepEqual(before.engine.torqueCurve,[[850,105],[2200,175],[4200,210],[5800,185],[6800,130]]);
  assert.deepEqual(next.engine.torqueCurve,[[850,128],[2200,214],[4200,261],[5800,238],[6800,163]]);
  assert.equal(next.engine.idleRPM,850);assert.equal(next.engine.redlineRPM,6800);assert.equal(next.engine.engineBrake,40);
  const rivet=fit('engine','competition','rivet-eight');
  rivet.parts.intake='duct';rivet.inventory.intake.push('duct');
  assert.equal(Math.max(...compileVehicleBuild('rivet-eight',rivet).recipe.engine.torqueCurve.map(p=>p[1])),549);
  rivet.parts.exhaust='flow';rivet.inventory.exhaust.push('flow');
  assert.throws(()=>compileVehicleBuild('rivet-eight',rivet),/550 Nm/);
  assert.equal(compileVehicleBuild('rivet-eight',stockVehicleBuild('rivet-eight')).recipe.engine.torqueCurve[2][1],450);
});

test('gearbox and final-drive changes alter supported ratios with explicit quantized trims',()=>{
  assert.deepEqual(compileVehicleBuild(model,fit('gearbox','short')).recipe.gearbox.ratios,[3.45,2.3,1.65,1.25,1]);
  assert.deepEqual(compileVehicleBuild(model,fit('gearbox','long')).recipe.gearbox.ratios,[2.8,1.8,1.3,1,.75]);
  const finalDrive=fit('finalDrive','adjustable');
  for(const [step,ratio] of [[-4,3.7],[0,4.1],[4,4.5]]){
    finalDrive.tuning.finalDrive=step;
    assert.equal(compileVehicleBuild(model,finalDrive).recipe.gearbox.finalDrive,ratio);
  }
});

test('tyres, suspension and steering resolve documented field units and preserve support bounds',()=>{
  const tyres=compileVehicleBuild(model,fit('tyres','performance')).recipe.tyres;
  assert.deepEqual(tyres,{grip:1.2,corneringStiffness:3450,rollingResistance:.017});
  const suspension=compileVehicleBuild(model,fit('suspension','adjustable')).recipe.suspension;
  assert.deepEqual(suspension,{restLength:.25,travel:.2,spring:37400,damper:3255});
  const steering=compileVehicleBuild(model,fit('steering','quick')).recipe.steering;
  assert.deepEqual(steering,{maxAngle:.5,rate:2.2,speedReduction:.035});
  for(const {modelId} of GARAGE_CATALOG)for(const step of [-2,2]){
    const build=fit('suspension','adjustable',modelId);
    for(const key of ['spring','damper','travel'])build.tuning[key]=step;
    const {recipe}=compileVehicleBuild(modelId,build);
    assert(recipe.mass*9.81/(4*recipe.suspension.spring)<=recipe.suspension.travel*.75);
    assert(recipe.suspension.travel<=recipe.suspension.restLength);
  }
});

test('paint changes no full recipe field, including first rules1 to rules2 installation',()=>{
  for(const {modelId} of GARAGE_CATALOG){
    const stock=compileVehicleBuild(modelId,stockVehicleBuild(modelId));
    for(const paint of ['oxide','seafoam','midnight']){
      const painted=fit('paint',paint,modelId);
      assert.equal(compileVehicleBuild(modelId,painted).canonicalRecipe,stock.canonicalRecipe);
      painted.parts.engine='street';painted.inventory.engine.push('street');
      const engine=fit('engine','street',modelId);
      assert.equal(compileVehicleBuild(modelId,painted).canonicalRecipe,compileVehicleBuild(modelId,engine).canonicalRecipe);
    }
  }
});

test('unknown or non-quantized tuning, invalid inventory and raw mechanical data reject without partial acceptance',()=>{
  for(const mutate of [
    b=>{b.rulesVersion=3;},b=>{delete b.inventory;},b=>{b.extra=1;},
    b=>{b.inventory.engine=[];},b=>{b.inventory.engine=['stock','stock'];},
    b=>{b.inventory.engine=['street'];},b=>{b.parts.engine='street';},
    b=>{b.inventory.engine=['stock','forged'];},b=>{b.inventory.unknown=['stock'];},
    b=>{b.inventory.engine.push('x'.repeat(BUILD_BYTES+1));},b=>{delete b.inventory.engine[0];},
    b=>{b.inventory.engine.extra='street';},b=>{b.parts.tyres={grip:999};},
    b=>{b.parts.gearbox={ratios:[6,1,3]};},b=>{b.tuning.spring=1;},
    b=>{b.tuning.finalDrive=1;},b=>{b.tuning.steering=1;},b=>{b.tuning.extra=1;},
    b=>{b.recipe={mass:1};},b=>{b[Symbol('extra')]=true;}
  ]){
    const build=fresh();mutate(build);assert.throws(()=>compileVehicleBuild(model,build));
  }
  for(const [key,[min,max]] of Object.entries(PART_TUNING_LIMITS)){
    for(const value of [min-1,max+1,.5,-0,NaN,Infinity,'0',null]){
      const build=fresh();build.tuning[key]=value;assert.throws(()=>compileVehicleBuild(model,build));
    }
  }
});

test('nested inventory/tuning and version accessors never execute during admission',()=>{
  let calls=0;const getter=()=>{calls++;throw Error('must not execute');};
  for(const where of ['rules','tuning','inventory','id']){
    const build=fresh();
    if(where==='rules')Object.defineProperty(build,'rulesVersion',{enumerable:true,get:getter});
    if(where==='tuning')Object.defineProperty(build.tuning,'spring',{enumerable:true,get:getter});
    if(where==='inventory')Object.defineProperty(build.inventory,'engine',{enumerable:true,get:getter});
    if(where==='id')Object.defineProperty(build.inventory.engine,'0',{enumerable:true,get:getter});
    assert.throws(()=>validateVehicleBuild(model,build));
  }
  assert.equal(calls,0);
});

test('canonical owned inventory is sorted, bounded and independent of installed build/recipe digests',async()=>{
  const source='20e0b2bf8f242901ed21a056815eaf5926af99d2';
  const first=fit('engine','street'),more=copy(first);
  more.inventory.engine.push('performance','competition');
  const accepted=compileVehicleBuild(model,more);
  assert.deepEqual(accepted.build.inventory.engine,['competition','performance','stock','street']);
  const a=await identifyVehicleBuild(model,first,source),b=await identifyVehicleBuild(model,more,source);
  assert.equal(a.buildDigest,b.buildDigest);assert.equal(a.recipeDigest,b.recipeDigest);
  assert.notEqual(a.canonicalBuild,b.canonicalBuild);
  assert.equal(a.buildDigest,hash({domain:'co.vehicle-build.v1',modelId:model,rulesVersion:2,
    build:{format:a.build.format,version:1,rulesVersion:2,parts:a.build.parts,tuning:a.build.tuning}}));
  assert.equal(a.recipeDigest,hash({domain:'co.vehicle-recipe.v1',sourceRevision:source,
    engineRevision:a.engineRevision,modelId:model,rulesVersion:2,recipe:a.recipe}));
  const reordered=copy(more);reordered.inventory.engine.reverse();
  assert.deepEqual(compileVehicleBuild(model,reordered),accepted);
  const maximum=fresh();for(const slot of PART_SLOTS)maximum.inventory[slot]=vehicleParts(slot).map(p=>p.id);
  assert(new TextEncoder().encode(compileVehicleBuild(model,maximum).canonicalBuild).length<BUILD_BYTES);
});
