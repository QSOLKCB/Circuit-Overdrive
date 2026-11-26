// SPDX-License-Identifier: Apache-2.0
// Development certification only. Synthetic opening balances are validator
// fixtures, never game rewards or mutations of a browser's ownership save.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createGarage,validateGarage,serializeGarage,parseGarage,migrateLegacyGarage,parseGarageImport} from '../src/garage.js';
import {transactGarage,transactGarageInstallation} from '../src/garage-transactions.js';
import {compileVehicleBuild,stockUpgradeBuild,stockVehicleBuild} from '../src/vehicle-builds.js';
import {vehicleParts} from '../src/vehicle-parts.js';
import {parseVault,serializeVault} from '../src/garage-vault-format.js';
import {validateGarage as validatePublished} from '../tests/fixtures/garage-v1/garage.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const published='1c745a90258d0f6cb968935f773354cff702b276';
const slots=['engine','intake','exhaust','gearbox','finalDrive','tyres','suspension','steering','paint'];
const zero={finalDrive:0,spring:0,damper:0,travel:0,steering:0};
// Independent reviewed financial and combination contracts. Do not import the
// production quote, catalogue price or compiler to calculate an expected bill.
const models={
  'cinder-two':{buy:600,sell:360,peak:210},lilt:{buy:900,sell:540,peak:170},
  'evening-line':{buy:1400,sell:840,peak:310},'rivet-eight':{buy:1800,sell:1080,peak:450},
  yardhand:{buy:1200,sell:720,peak:350},'glass-comet':{buy:2400,sell:1440,peak:370}
};
const prices={engine:{stock:0,street:250,performance:550,competition:950},intake:{stock:0,duct:80},
  exhaust:{stock:0,flow:100},gearbox:{stock:0,short:160,long:160},finalDrive:{stock:0,adjustable:120},
  tyres:{stock:0,touring:140,performance:220,economy:90},suspension:{stock:0,adjustable:180},
  steering:{stock:0,quick:100},paint:{factory:0,oxide:60,seafoam:60,midnight:60}};
const tuneSlot={finalDrive:'finalDrive',spring:'suspension',damper:'suspension',travel:'suspension',steering:'steering'};
const initial=slot=>slot==='paint'?'factory':'stock';
const stockParts=()=>Object.fromEntries(slots.map(slot=>[slot,initial(slot)]));
const id=n=>'car-'+String(n).padStart(6,'0');
const clone=value=>structuredClone(value);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

function bookCar(model){return {model,rules:1,parts:stockParts(),tuning:{...zero},
  inventory:Object.fromEntries(slots.map(slot=>[slot,[initial(slot)]]))};}
function freshBook(money){return {money,opening:money,serial:1,revision:0,active:null,
  bays:[null,null,null,null],cars:new Map(),spentCars:0,spentParts:0,spentLabor:0,sales:0};}
function snapshot(book){
  return {version:2,edition:'machine-shop-v1',catalogRevision:1,credits:book.money,nextVehicleId:book.serial,
    activeVehicleId:book.active,bays:book.bays.map(key=>{
      if(key===null)return null;
      const car=book.cars.get(key),build={format:'circuit-overdrive.vehicle-build',version:1,rulesVersion:car.rules,parts:{...car.parts}};
      if(car.rules===2){build.tuning={...car.tuning};build.inventory=clone(car.inventory);}
      return {ownedVehicleId:key,modelId:car.model,build,condition:{version:1,status:'pristine'}};
    }),revision:book.revision};
}
function liquidation(book){return book.money+[...book.cars.values()].reduce((total,car)=>total+models[car.model].sell,0);}
function oracle(book,action){
  const reject=reason=>({accepted:false,reason});
  if(action.expectedRevision!==book.revision)return reject('stale-revision');
  if(book.revision===99999999)return reject('revision-exhausted');
  if(action.type==='buy'){
    const price=models[action.targetId];if(!price)return reject('invalid-model');
    const bay=book.bays.indexOf(null);if(bay<0)return reject('garage-full');
    if(book.money<price.buy)return reject('insufficient-credits');
    if(book.serial===1000000)return reject('vehicle-id-exhausted');
    return {accepted:true,cost:price.buy,apply(){const key=id(book.serial++);book.bays[bay]=key;book.cars.set(key,bookCar(action.targetId));
      book.money-=price.buy;book.spentCars+=price.buy;book.active??=key;book.revision++;}};
  }
  if(action.type==='sell'||action.type==='select'){
    const car=book.cars.get(action.targetId);if(!car)return reject('vehicle-not-owned');
    return {accepted:true,cost:action.type==='sell'?-models[car.model].sell:0,apply(){
      if(action.type==='sell'){book.bays[book.bays.indexOf(action.targetId)]=null;book.cars.delete(action.targetId);
        book.money+=models[car.model].sell;book.sales+=models[car.model].sell;
        if(book.active===action.targetId)book.active=book.bays.find(Boolean)??null;
      }else book.active=action.targetId;book.revision++;
    }};
  }
  if(action.type!=='install')return reject('invalid-request');
  const car=book.cars.get(action.ownedVehicleId);if(!car)return reject('vehicle-not-owned');
  if(!Object.hasOwn(prices,action.slot)||!Object.hasOwn(prices[action.slot],action.partId))return reject('invalid-request');
  const tune=action.tuning;
  if(Object.keys(zero).some(key=>!Number.isSafeInteger(tune[key])||Math.abs(tune[key])>(key==='finalDrive'?4:2)))return reject('invalid-request');
  if(Object.keys(zero).some(key=>tuneSlot[key]!==action.slot&&tune[key]!==car.tuning[key]))return reject('unrelated-tuning');
  const changed=car.parts[action.slot]!==action.partId;
  const changedSetup=Object.keys(zero).some(key=>tune[key]!==car.tuning[key]);
  if(!changed&&!changedSetup)return reject('already-fitted');
  const partCost=car.inventory[action.slot].includes(action.partId)?0:prices[action.slot][action.partId];
  const labor=changed?(action.slot==='paint'?10:20):10;
  if(book.money<partCost+labor)return reject('insufficient-credits');
  const nextParts={...car.parts,[action.slot]:action.partId};
  const peak=models[car.model].peak+{stock:0,street:32,performance:70,competition:90}[nextParts.engine]+
    (nextParts.intake==='duct'?9:0)+(nextParts.exhaust==='flow'?10:0);
  if(peak>550)return reject('invalid-build');
  if(nextParts.finalDrive!=='adjustable'&&tune.finalDrive!==0||nextParts.suspension!=='adjustable'&&['spring','damper','travel'].some(key=>tune[key]!==0)||nextParts.steering!=='quick'&&tune.steering!==0)return reject('invalid-build');
  return {accepted:true,cost:partCost+labor,partCost,labor,apply(){car.rules=2;car.parts=nextParts;car.tuning={...tune};
    if(!car.inventory[action.slot].includes(action.partId))car.inventory[action.slot]=[...car.inventory[action.slot],action.partId].sort();
    book.money-=partCost+labor;book.spentParts+=partCost;book.spentLabor+=labor;book.revision++;}};
}
function check(state,book){
  assert.deepEqual(state,snapshot(book),'Full independent ownership/build journal');
  assert.equal(state.credits,book.opening-book.spentCars-book.spentParts-book.spentLabor+book.sales);
  assert(liquidation(book)<=book.opening,'No invented value from fitting, selecting or selling');
  assert.deepEqual(parseGarage(serializeGarage(state)),state);
  assert.equal(state.bays.length,4);assert.equal(new Set(state.bays.filter(Boolean).map(c=>c.ownedVehicleId)).size,book.cars.size);
  for(const car of state.bays.filter(Boolean)){
    const a=compileVehicleBuild(car.modelId,car.build),b=compileVehicleBuild(car.modelId,car.build);
    assert.equal(a.canonicalRecipe,b.canonicalRecipe,'Repeated compilation is deterministic');
    assert(Object.isFrozen(a.recipe));assert.deepEqual(car.condition,{version:1,status:'pristine'});
  }
}

export function certifyGeneratedEconomy(sequenceCount=1024){
  assert(Number.isSafeInteger(sequenceCount)&&sequenceCount>=12&&sequenceCount<=4096);
  const counts={sequences:sequenceCount,operations:0,accepted:0,rejected:0,installs:0,refits:0,setupChanges:0,
    sameIntentRetries:0,unchangedDuplicateFits:0,duplicateModelSequences:0,publishedOpeningSequences:0,
    syntheticOpeningSequences:0,rejectionReasons:{},modelInstalls:{},slotInstalls:Object.fromEntries(slots.map(s=>[s,0]))};
  const journal=createHash('sha256'),modelIds=Object.keys(models);
  for(const model of modelIds)counts.modelInstalls[model]=Object.fromEntries(slots.map(s=>[s,0]));
  for(let sequence=0;sequence<sequenceCount;sequence++){
    const model=modelIds[sequence%6],synthetic=Math.floor(sequence/6)%2===1,opening=synthetic?100000:2400;
    synthetic?counts.syntheticOpeningSequences++:counts.publishedOpeningSequences++;
    let state=validateGarage({...createGarage(),credits:opening}),book=freshBook(opening),rng=(sequence+1)>>>0;
    const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng;};
    for(let tick=0;tick<24;tick++){
      const ids=[...book.cars.keys()],target=tick<11?id(1):ids.length?ids[random()%ids.length]:id(1);
      const car=book.cars.get(target),choice=tick<2?'buy':tick<11?'install':['buy','sell','select','install','install','stale','invalid','repair'][random()%8];
      let action;
      if(choice==='buy')action={type:'buy',targetId:tick<2?model:modelIds[random()%6],expectedRevision:book.revision};
      else if(choice==='sell'||choice==='select'||choice==='repair')action={type:choice,targetId:target,expectedRevision:book.revision};
      else{
        const slot=tick<11?slots[tick-2]:slots[random()%slots.length],parts=Object.keys(prices[slot]);
        const part=tick<11?parts[1]:parts[random()%parts.length],tuning={...(car?.tuning??zero)};
        if(slot==='finalDrive')tuning.finalDrive=part==='adjustable'?(random()%9)-4:0;
        if(slot==='suspension')for(const key of ['spring','damper','travel'])tuning[key]=part==='adjustable'?(random()%5)-2:0;
        if(slot==='steering')tuning.steering=part==='quick'?(random()%5)-2:0;
        action={type:'install',ownedVehicleId:target,slot,partId:part,tuning,expectedRevision:book.revision};
        if(choice==='stale')action.expectedRevision=Math.max(0,book.revision-1);
        if(choice==='invalid'){if(random()%2)action.partId='unlisted-part';else action.tuning.finalDrive=5;}
      }
      const before=serializeGarage(state),priorValue=liquidation(book),expected=oracle(book,action);
      const result=action.type==='install'?transactGarageInstallation(state,action):transactGarage(state,action);
      assert.equal(serializeGarage(state),before,'A transition does not mutate its input');
      assert.equal(result.accepted,expected.accepted,JSON.stringify({sequence,tick,action,result,expected:expected.reason}));
      counts.operations++;
      if(result.accepted){
        const priorCar=action.type==='install'?clone(book.cars.get(target)):null;
        expected.apply();state=result.state;counts.accepted++;
        assert.equal(result.receipt.creditDelta,expected.cost===0?0:-expected.cost,'Journal cost equals accepted receipt');
        if(action.type==='install'){
          counts.installs++;counts.modelInstalls[priorCar.model][action.slot]++;counts.slotInstalls[action.slot]++;
          if(expected.partCost===0&&priorCar.parts[action.slot]!==action.partId)counts.refits++;
          if(priorCar.parts[action.slot]===action.partId)counts.setupChanges++;
          const again=transactGarageInstallation(state,action);assert.equal(again.accepted,false);counts.sameIntentRetries++;
          const duplicate=transactGarageInstallation(state,{...action,expectedRevision:state.revision});
          assert.equal(duplicate.accepted,false);assert.equal(duplicate.reason,'already-fitted');counts.unchangedDuplicateFits++;
        }
      }else{counts.rejected++;counts.rejectionReasons[result.reason]=(counts.rejectionReasons[result.reason]??0)+1;}
      assert(liquidation(book)<=priorValue,'No transition increases liquidated owned value');
      check(state,book);journal.update(JSON.stringify({sequence,tick,action,accepted:result.accepted,state}));
    }
    if(synthetic)counts.duplicateModelSequences++;
  }
  assert(Object.values(counts.slotInstalls).every(n=>n>0));
  assert(Object.values(counts.modelInstalls).every(model=>Object.values(model).every(n=>n>0)),'All models fit all nine slots');
  return {...counts,journalSha256:journal.digest('hex'),
    policy:'Each operation checks an independent authored cost/ownership/inventory ledger, unchanged input, exact receipt settlement, full serialization, repeated compiled recipe and pristine condition. Opening synthetic 100000-credit validator fixtures are explicit test data, never career rewards or live ownership.'};
}

function readPublishedSources(names){
  let temporary=null,reference=root;
  try{
    if(spawnSync('git',['-C',root,'cat-file','-e',published+'^{commit}'],{stdio:'ignore'}).status!==0){
      // Default CI checkouts contain only the candidate. Fetch the immutable
      // published source in isolation, preserving the caller's refs/history.
      temporary=mkdtempSync(join(tmpdir(),'circuit-v130-audit-'));reference=temporary;
      execFileSync('git',['init','--quiet','--bare','--template=',reference],{stdio:['ignore','pipe','pipe']});
      execFileSync('git',['-C',reference,'fetch','--quiet','--no-tags','--depth=1','--',
        'https://github.com/QSOLKCB/Circuit-Overdrive.git',published],{stdio:['ignore','pipe','pipe']});
      const fetched=execFileSync('git',['-C',reference,'rev-parse','FETCH_HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
      assert.equal(fetched,published,'Audit requires the exact published commit');
    }
    return Object.fromEntries(names.map(name=>[name,execFileSync('git',['-C',reference,'show',published+':src/'+name],{stdio:['ignore','pipe','pipe']})]));
  }finally{
    if(temporary)rmSync(temporary,{recursive:true,force:true});
  }
}

export function auditPublishedOwnership(){
  const dir=new URL('../tests/fixtures/garage-v1/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('provenance.json',dir))),files={};
  assert.equal(manifest.commit,published);assert.deepEqual(manifest.localChanges,[]);
  const sources=readPublishedSources(Object.keys(manifest.sha256));
  for(const [name,expected] of Object.entries(manifest.sha256)){
    const local=readFileSync(new URL(name,dir)),upstream=sources[name];
    assert.deepEqual(local,upstream,'Fixture must equal exact published source: '+name);assert.equal(sha(local),expected);files[name]=expected;
  }
  const bytes=readFileSync(new URL('states.json',dir));assert.equal(sha(bytes),manifest.fixturesSha256['states.json']);
  const data=JSON.parse(bytes);assert.equal(data.source,published);
  const results=data.fixtures.map(f=>{
    const old=validatePublished(f.garage),before=JSON.stringify(old),migrated=migrateLegacyGarage(old);
    assert.equal(JSON.stringify(old),before);for(const key of ['credits','nextVehicleId','activeVehicleId','revision','catalogRevision'])assert.equal(migrated[key],old[key]);
    for(let i=0;i<4;i++){
      const prior=old.bays[i],current=migrated.bays[i];if(!prior){assert.equal(current,null);continue;}
      assert.equal(current.ownedVehicleId,prior.ownedVehicleId);assert.equal(current.modelId,prior.modelId);
      assert.deepEqual(current.build,stockVehicleBuild(prior.modelId));assert.deepEqual(current.condition,{version:1,status:'pristine'});
    }
    assert.deepEqual(parseGarageImport(before),{state:migrated,legacy:true});assert.deepEqual(parseGarage(serializeGarage(migrated)),migrated);
    const key='a'.repeat(32),raw=serializeVault({version:2,generation:key,sequence:42,garage:migrated,legacyBackup:old});
    const envelope=parseVault(raw);assert.deepEqual(envelope.legacyBackup,old);assert.deepEqual(envelope.garage,migrated);
    return {name:f.name,synthetic:f.synthetic,ownedIds:old.bays.map(c=>c?.ownedVehicleId??null),credits:old.credits,
      activeVehicleId:old.activeVehicleId,nextVehicleId:old.nextVehicleId,revision:old.revision,currentSha256:sha(serializeGarage(migrated))};
  });
  return {published,sourceClosureSha256:files,statesSha256:sha(bytes),fixtures:results};
}

export function measureOwnershipBounds(){
  const maxima={buildBytes:0,garageBytes:0,vaultBytes:0};
  for(const modelId of Object.keys(models)){
    const legacy={version:1,edition:'after-hours-v1',catalogRevision:1,credits:99999999,nextVehicleId:1000000,
      activeVehicleId:'car-999999',revision:99999999,bays:[999996,999997,999998,999999].map(n=>({ownedVehicleId:id(n),modelId}))};
    const draft=clone(stockUpgradeBuild(modelId,stockVehicleBuild(modelId)));
    for(const slot of slots){draft.inventory[slot]=vehicleParts(slot).map(p=>p.id);draft.parts[slot]=Object.keys(prices[slot]).reduce((a,b)=>a.length>=b.length?a:b);}
    draft.parts.steering='quick'; // Same five-byte width as stock; permits signed setup.
    // The longest torque-combination names can be mechanically incompatible on
    // Rivet Eight. Stock intake/exhaust are longer IDs and preserve the bound.
    draft.tuning={finalDrive:-4,spring:-2,damper:-2,travel:-2,steering:-2};
    const build=compileVehicleBuild(modelId,draft).build,migrated=migrateLegacyGarage(legacy),garage={...migrated,bays:migrated.bays.map(car=>({...car,build}))};
    maxima.buildBytes=Math.max(maxima.buildBytes,Buffer.byteLength(JSON.stringify(build)));
    maxima.garageBytes=Math.max(maxima.garageBytes,Buffer.byteLength(serializeGarage(garage)));
    maxima.vaultBytes=Math.max(maxima.vaultBytes,Buffer.byteLength(serializeVault({version:2,generation:'f'.repeat(32),sequence:99999999,garage,legacyBackup:legacy})));
  }
  assert.deepEqual(maxima,{buildBytes:708,garageBytes:3444,vaultBytes:3942});
  return {...maxima,limits:{buildBytes:2048,garageBytes:65536,vaultBytes:65536},policy:'Complete finite inventories, longest compatible fitted IDs, signed maximum-width tuning, four longest-model identities, maximum counters/credits and recoverable legacy backup. Synthetic admission boundaries, not earned funds.'};
}

export function certifyMachineEconomy(sequenceCount=1024){
  return {kind:'co-014f-machine-economy-v1',sequences:certifyGeneratedEconomy(sequenceCount),
    publishedOwnership:auditPublishedOwnership(),utf8Bounds:measureOwnershipBounds()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert.equal(process.argv.length,2,'Usage: node scripts/certify-machine-economy.mjs');
  const paths=['src/garage.js','src/garage-transactions.js','src/garage-vault.js','src/garage-vault-format.js','src/vehicle-builds.js',
    'src/vehicle-parts.js','scripts/certify-machine-economy.mjs','tests/machine-economy-certification.test.mjs'];
  const modified=git('status','--porcelain','--',...paths),source={head:git('rev-parse','HEAD'),workingTreeMatchesHead:modified==='',modified,
    sha256:Object.fromEntries(paths.map(path=>[path,sha(readFileSync(new URL('../'+path,import.meta.url)))]))};
  console.log(JSON.stringify({...certifyMachineEconomy(),source,runtime:{node:process.version,platform:process.platform,arch:process.arch}},null,2));
}
