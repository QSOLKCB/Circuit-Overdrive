// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import * as damage from '../src/crash-damage.js';
import * as impact from '../src/crash-impact.js';
import * as replay from '../src/crash-replay.js';
import * as trial from '../src/crash-trial.js';
import {createReplaySession,validateTheatreReplay} from '../src/replay-theatre-core.js';

const published='541ba6ca27dabe644ab23fe9a061c91dda8794a6';
const live={damage,impact,replay,trial};
const gas=Object.freeze({throttle:1,brake:0,steer:0});
const rounds=[
  {scenario:'wall',ticks:273,first:220,result:'settled',
    trace:'9bb9f7ff36839c393639bfe574733c7359f396c0d3c246c383d18227c2c58dc0',
    contacts:'45e12ce06b10e7c179ee4af969e4835754bc615b91f49dbbcba32291b16bc4ea',
    final:'a2ede31edd7233fcc3b7a75588bd634bd989e0d812e895191820390d8fb1b69d'},
  {scenario:'glancing',ticks:325,first:209,result:'impact and run-off',
    trace:'a6437f96a35d51d63da3f042e296fc0133f9991abf4ff46ca1b1b93f69df6d82',
    contacts:'92b882cabfcbcda5340a1b76e9811e13d4b7dc367446b65919e277a7a9e4a851',
    final:'2550e9d33b3321c40e72b2cf92a47ef64ed52610ae5d58a5009ea735bf432354'},
  {scenario:'opposing',ticks:360,first:180,result:'post-impact run complete',
    trace:'746158bebf53eb26a32913619cc48c74629ff60378b13ba15300ae60c54a32dc',
    contacts:'3d5431d0f1ae15321f5b147e5e7701e7a53ead6785e033991cb7a23bee049e2e',
    final:'3cfe892dd2594a6b02fe6321a5da2f6f65508630adb6caf37d806b1be1859853'}
];

// The offline fixtures were generated from the published tree on Node 22.18.
// The optional clean reference checkout also checks the raw ticks in the same
// runtime, without depending on cross-runtime libm rounding.
let reference;
if(process.env.CO_V111_CHECKOUT) {
  const cwd=resolve(process.env.CO_V111_CHECKOUT);
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
  assert.equal(git('rev-parse','HEAD'),published);
  assert.equal(git('status','--porcelain','--','src','vendor','tracks'),'');
  const names=Object.keys(live);
  const modules=await Promise.all(names.map(name=>import(pathToFileURL(resolve(cwd,'src',`crash-${name}.js`)))));
  reference=Object.fromEntries(names.map((name,i)=>[name,modules[i]]));
}

function state(world) {
  const {tick,cars,pairs}=world;
  return {tick,cars,latches:pairs.map(({a,b,active})=>[a.id,b.id,active])};
}

function frame(run) {
  const {phase,result,firstImpact,previous,lastStep,lastContacts}=run;
  return {...state(run.world),phase,result,firstImpact,previous,lastStep,lastContacts};
}

function traceHash(rows) {
  const round=(key,value)=>{
    if(typeof value!=='number')return value;
    assert(Number.isFinite(value),key);
    return Number(value.toFixed(6));
  };
  const hash=createHash('sha256');
  for(const row of rows)hash.update(JSON.stringify(row,round)+'\n');
  return hash.digest('hex');
}

function drive(authority,scenario,limit) {
  const {createTrial,startTrial,stepTrial}=authority.trial;
  const run=createTrial(scenario,27,published);
  const recorder=authority.replay.crashRecorder(run),rows=[];
  startTrial(run);
  while(run.phase==='running' && rows.length<limit) {
    stepTrial(run,gas);
    recorder.record(gas);
    rows.push(structuredClone(frame(run)));
  }
  return {run,rows,tape:recorder.export()};
}

for(const expected of rounds)test(`published v1.1.1 ${expected.scenario} retains its accepted ticks and v5 replay`,async()=>{
  const {scenario,ticks,first,result}=expected;
  const {run,rows,tape}=drive(live,scenario,ticks);
  assert.equal(run.firstImpact,first);
  assert.equal(run.result,result);
  assert.equal(traceHash(rows),expected.trace);
  assert.deepEqual(tape,{version:5,revision:published,discipline:'crash-lab',rules:1,scenario,seed:27,
    ticks,runs:[[ticks,1,0,0]]});
  const receipt=await replay.crashReceipt(tape,run,'node');
  assert.equal(receipt.contactsSha256,expected.contacts);
  assert.equal(receipt.finalStateSha256,expected.final);
  assert.throws(()=>validateTheatreReplay(tape,'b'.repeat(40)),/exact source revision/);

  if(reference) {
    const before=drive(reference,scenario,ticks);
    assert.deepEqual(tape,before.tape);
    for(let i=0;i<rows.length;i++)assert.deepEqual(rows[i],before.rows[i],`tick ${i+1}`);
    assert.deepEqual(run,before.run);
  }

  const session=createReplaySession(tape,published);
  assert.equal(session.race.contacts.length,0);
  session.seekBatch(first);
  assert.deepEqual(frame(session.race),rows[first-1]);
  session.seekBatch(first-1);
  assert.deepEqual(frame(session.race),rows[first-2]);
  for(const batch of [1,63,240]) {
    while(!session.finished)session.advance(batch);
    assert.deepEqual(session.race,run);
    session.seekBatch(0);
  }
});

function fixture(authority,pinched) {
  const {crashCar,crashBarrier}=authority.impact;
  const {damageWorld,resolveLabTick}=authority.damage;
  const rail=(id,x)=>crashBarrier(id,x,-6,x,6,.1);
  const world=pinched ? damageWorld([crashCar(0)],[rail(80,-.95),rail(81,.95)],published) :
    damageWorld([crashCar(4,{z:6.68,vz:-80}),crashCar(1,{z:2.27,vz:-15})],
      [crashBarrier(80,-10,0,10,0,.05)],published);
  const {contacts,stats}=resolveLabTick(world);
  return {...state(world),contacts,stats};
}

test('legacy packed contacts and impossible fixture diagnostics retain the published order and budget',()=>{
  const packed=fixture(live,false),pinched=fixture(live,true);
  assert.deepEqual(packed.stats,{passes:20,candidates:300,accepted:19,limited:false});
  assert.deepEqual(pinched.stats,{
    passes:24,candidates:144,accepted:0,limited:true,unadvancedSeconds:1/60,residualPenetration:.252
  });
  assert.deepEqual(pinched.contacts,[]);
  assert.deepEqual(pinched.cars[0].damage,damage.newDamage());
  assert.equal(traceHash([packed]),'96e166b8c811b923320072ef296ca6a21a9f8fe4cecebdee5d13119cd9ed9e2f');
  assert.equal(traceHash([pinched]),'fa4942927e5a67c6084fd0e5a45e5720e9388f972895136e595539a5e4ff9a7c');
  if(reference) {
    assert.deepEqual(packed,fixture(reference,false));
    assert.deepEqual(pinched,fixture(reference,true));
  }
});

test('Crash Lab continues to admit four cars and eight fixtures at most',()=>{
  const cars=Array.from({length:5},(_,id)=>impact.crashCar(id,{x:id*6}));
  const barriers=Array.from({length:9},(_,i)=>impact.crashBarrier(80+i,-30,50+i,30,50+i,.1));
  assert.equal(impact.impactWorld(cars.slice(0,4),barriers.slice(0,8)).pairs.length,38);
  assert.throws(()=>impact.impactWorld(cars),RangeError);
  assert.throws(()=>impact.impactWorld(cars.slice(0,4),barriers),RangeError);
});
