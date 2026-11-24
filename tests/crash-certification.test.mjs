// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {crashCar,crashBarrier,kinetic,labRecipe} from '../src/crash-impact.js';
import {damageWorld,resolveLabTick,newDamage} from '../src/crash-damage.js';
import {createTrial,startTrial,stepTrial} from '../src/crash-trial.js';
import {CrashVoice} from '../src/crash-audio.js';

function measure(cars,fixtures) {
  const world=damageWorld(cars,fixtures);
  const before=cars.reduce((n,c)=>n+kinetic(c),0);
  const result=resolveLabTick(world);
  assert.equal(result.stats.limited,false);
  assert(result.stats.passes<=24);assert(cars.reduce((n,c)=>n+kinetic(c),0)<=before+1e-6);
  for(const h of result.contacts){
    assert(h.closing>0 && h.normalImpulse>0 && h.effectiveMass>0);
    assert(Math.abs(Math.hypot(...h.normal)-1)<1e-9);
    assert(Math.abs(h.tangentialImpulse)<=.24*h.normalImpulse+1e-7);
    assert(h.postKinetic<=h.preKinetic+1e-6 && h.dissipated>=0);
    assert(Math.abs(h.normalEnergy-.5*h.effectiveMass*h.closing**2)<1e-6);
    assert(h.time>=0 && h.time<=1/60);
  }
  assert.equal(new Set(result.contacts.map(h=>h.id)).size,result.contacts.length);
  return {cars:world.cars,...result};
}
test('cap-speed shallow side strike, rail end and pure rotating tip have witnessed geometry',()=>{
  const wall=crashBarrier(80,0,-20,0,20,.01);
  const shallow=measure([crashCar(0,{x:.99,vx:-1,vz:-119.99})],[wall]);
  const h=shallow.contacts[0];assert(h.relativeSpeed>119 && h.closing<1.01);
  assert(h.normalEnergy<.5*labRecipe.mass*1.01**2);assert.deepEqual(shallow.cars[0].damage,newDamage());
  const turning=measure([crashCar(0,{x:1.08,spin:10})],[wall]);
  assert(turning.contacts[0].closing>10);assert(turning.cars[0].vx>0);
  const corner=measure([crashCar(0,{x:1.2,z:2.8,vx:-30,vz:-65})],[crashBarrier(80,-10,0,0,0,.2)]);
  assert(corner.contacts.length);const [nx,nz]=corner.contacts[0].normal;assert(nx>.1 && nz>.1);
});
test('simultaneous rails and interacting car/fixture pairs retain order, work limits and per-body ledgers',()=>{
  const x=crashBarrier(81,0,-10,0,10,.02),z=crashBarrier(80,-10,0,10,0,.02);
  const corner=fixtures=>measure([crashCar(0,{x:1.295,z:2.52,vx:-40,vz:-40})],fixtures);
  const result=corner([x,z]);assert.deepEqual(result,corner([z,x]));
  assert.equal(new Set(result.contacts.map(c=>c.participants[1])).size,2);
  function packed(reverse){
    const cars=[crashCar(4,{z:6.68,vz:-80}),crashCar(1,{z:2.27,vz:-15})];
    return measure(reverse?cars.reverse():cars,[crashBarrier(80,-10,0,10,0,.05)]);
  }
  const box=packed(false);assert.deepEqual(box,packed(true));
  assert(box.contacts.some(h=>h.kind==='fixed') && box.contacts.some(h=>h.kind==='vehicle'));
  assert(box.contacts.some(h=>!h.newImpact));
  for(const car of box.cars){
    const expected=newDamage();
    for(const h of box.contacts)for(const site of h.sites.filter(s=>s.id===car.id)){
      if(!h.newImpact)assert.deepEqual(site.damage,{});
      for(const [k,v] of Object.entries(site.damage))expected[k]+=v;
    }
    assert.deepEqual(car.damage,expected);
  }
});
test('repeated cap-speed fixtures keep every number finite and damage bounded',()=>{
  const wall=crashBarrier(80,-10,0,10,0,.05);
  for(let i=0;i<96;i++){
    const yaw=(i%19-9)*.13,spin=(i%9-4)*2,angle=(i%11-5)*.16;
    const car=crashCar(0,{x:(i%17-8)*1.3,z:3.0,yaw,spin,vx:119*Math.sin(angle),vz:-119*Math.cos(angle)});
    const w=damageWorld([car],[wall]);const initial=kinetic(car);
    for(let n=0;n<8;n++){
      const {contacts,stats}=resolveLabTick(w);
      assert(!stats.limited);assert(kinetic(car)<=initial+1e-5);
      JSON.stringify([car,contacts],(key,v)=>{if(typeof v==='number')assert(Number.isFinite(v));return v;});
      assert(Object.values(car.damage).every(v=>Number.isInteger(v)&&v>=0&&v<=1000));
      if(Math.abs(car.x)<7)assert(car.z>0,'chassis crossed the interior of a fixed fixture');
    }
  }
});
test('PCM depends on simulation observations without modifying a trial',()=>{
  const trial=createTrial('glancing');startTrial(trial);
  const cmd={throttle:1,brake:0,steer:0};while(!trial.contacts.length)stepTrial(trial,cmd);
  const original=JSON.stringify(trial),voice=new CrashVoice(),pcm=new Float32Array(3072);
  voice.accept(trial,cmd);assert(voice.attack>0 && voice.scrape>0 && voice.spring>0);
  voice.write(pcm,{effects:1,engine:1});assert(pcm.every(Number.isFinite) && pcm.some(n=>n!==0));
  voice.accept(trial,cmd);voice.write(pcm,{effects:0,engine:0});assert(pcm.every(n=>n===0));
  assert.equal(JSON.stringify(trial),original);
});

test('an impossible initial fixture layout stops at budget with a measured residual and zero damage',()=>{
  const rail=x=>crashBarrier(x<0?80:81,x,-6,x,6,.1);
  const world=damageWorld([crashCar(0)],[rail(-.95),rail(.95)]);
  const {stats,contacts}=resolveLabTick(world);
  assert(stats.limited && stats.passes===24 && stats.residualPenetration>0);
  assert.equal(stats.unadvancedSeconds,1/60);assert.deepEqual(contacts,[]);
  assert.deepEqual(world.cars[0].damage,newDamage());
  assert.throws(()=>crashCar(0,{vx:'12'}));assert.throws(()=>damageWorld([{id:0}],[]));
});
