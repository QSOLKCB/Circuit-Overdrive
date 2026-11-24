// SPDX-License-Identifier: Apache-2.0
// Run with node tests/derby-impact-bench.mjs. Time each tick after constructing the world.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {arch,cpus,platform,release} from 'node:os';
import {performance} from 'node:perf_hooks';
import {crashBarrier,crashCar,derbyImpactWorld,DERBY_IMPACT_LIMITS,stepImpacts} from '../src/crash-impact.js';
import {derbyDamageWorld,neutralLab,resolveLabTick,stepDerbyTick} from '../src/crash-damage.js';

const seed=4823921,warmup=50,worlds=1000,ticks=20;
const barriers=Array.from({length:16},(_,i)=>crashBarrier(80+i,30+i,-12,30+i,12,.005));
const commands=Array(6).fill(neutralLab);
const pairBudget=15+6*barriers.length, candidateBudget=15*9+6*barriers.length*3;

function randomFrom(state) {
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return (state>>>0)/0x100000000;
  };
}

function sparseField() {
  return Array.from({length:6},(_,id)=>crashCar(id,{x:10*(id-2.5),vz:-25}));
}

function convergingField(random) {
  const radius=5+5*random(), speed=45+70*random(), spinRange=2*random();
  return Array.from({length:6},(_,id)=>{
    const heading=id*Math.PI/3+.12*(random()-.5), r=radius+1.1*random();
    const dx=Math.sin(heading),dz=Math.cos(heading),v=speed*(.85+.15*random());
    return crashCar(id,{x:r*dx,z:r*dz,yaw:heading+.25*(random()-.5),
      vx:-v*dx,vz:-v*dz,spin:spinRange*(random()-.5)});
  });
}

function timings(samples) {
  if(!samples.length)return {count:0};
  samples.sort((a,b)=>a-b);
  const at=p=>Number(samples[Math.ceil(samples.length*p)-1].toFixed(6));
  return {count:samples.length,median:at(.5),p95:at(.95),worst:at(1)};
}

function measure(field,create,step) {
  const random=randomFrom(seed), tickMs=[], contactTickMs=[];
  const peak={passes:0,pairChecks:0,rejectedPairs:0,candidates:0,sweepSamples:0,accepted:0,impactEvents:0,damageEvents:0};
  const totals={pairChecks:0,rejectedPairs:0,candidates:0,sweepSamples:0,accepted:0,impactEvents:0,damageEvents:0};
  const limits={};
  for(let trial=0;trial<warmup+worlds;trial++){
    const world=create(field(random),barriers);
    for(let tick=0;tick<ticks;tick++){
      const start=performance.now();
      const {contacts,stats}=step(world);
      const elapsed=performance.now()-start;
      assert.equal(stats.accepted,contacts.length);
      assert(stats.passes<=DERBY_IMPACT_LIMITS.passes && stats.accepted<=stats.passes);
      assert(stats.pairChecks<=stats.passes*pairBudget && stats.rejectedPairs<=stats.pairChecks);
      assert(stats.candidates<=stats.passes*candidateBudget && stats.sweepSamples<=DERBY_IMPACT_LIMITS.sweepSamples);
      if(trial>=warmup){
        tickMs.push(elapsed);
        if(contacts.length)contactTickMs.push(elapsed);
        const impactEvents=contacts.filter(hit=>hit.newImpact).length;
        const damageEvents=contacts.reduce((count,hit)=>count+
          hit.sites.filter(site=>site.damage && Object.keys(site.damage).length).length,0);
        const counts={...stats,impactEvents,damageEvents};
        for(const key of Object.keys(peak))peak[key]=Math.max(peak[key],counts[key]);
        for(const key of Object.keys(totals))totals[key]+=counts[key];
        if(stats.limited)limits[stats.limitReason]=(limits[stats.limitReason]??0)+1;
      }
      if(stats.limited)break;
    }
  }
  return {tickMs:timings(tickMs),contactTickMs:timings(contactTickMs),peak,totals,limits};
}

const paths=['src/crash-impact.js','src/crash-damage.js','tests/derby-impact-bench.mjs'];
const sourceSha256=Object.fromEntries(paths.map(path=>[path,createHash('sha256')
  .update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex')]));
const fixtures=[['sparse',sparseField],['converging',convergingField]];
const results=Object.fromEntries(fixtures.map(([name,field])=>[name,{
  solver:measure(field,derbyImpactWorld,stepImpacts),
  collisionAndDamage:measure(field,derbyDamageWorld,resolveLabTick),
  fullTick:measure(field,derbyDamageWorld,world=>stepDerbyTick(world,commands))
}]));
console.log(JSON.stringify({
  node:process.version,os:platform()+' '+release(),arch:arch(),cpu:cpus()[0]?.model,sourceSha256,
  seed,warmupWorldsPerSample:warmup,worldsPerSample:worlds,ticksPerWorld:ticks,fixturesPerWorld:barriers.length,results
},null,2));
