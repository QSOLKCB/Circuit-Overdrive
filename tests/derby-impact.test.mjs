// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {crashBarrier,crashCar as car,derbyImpactWorld,DRIVE_CAP,impactWorld,LAB_STEP,labRecipe,stepImpacts} from '../src/crash-impact.js';
import {derbyDamageWorld,labCondition,neutralLab,newDamage,resolveLabTick,stepDerbyTick} from '../src/crash-damage.js';

const revision='d'.repeat(40), radius=labRecipe.chassis.width/2, end=labRecipe.chassis.length/2-radius;
const stations=[-end,0,end];
const close=(actual,expected,tolerance=1e-7)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const spare=id=>car(id,{x:30+7*id,z:13});
const parked=()=>Array.from({length:6},(_,id)=>spare(id));
const field=(...active)=>parked().map(p=>active.find(a=>a.id===p.id)??p);
const permute=items=>items.filter((_,i)=>i%2).reverse().concat(items.filter((_,i)=>i%2===0));
const remoteFixtures=()=>Array.from({length:16},(_,i)=>crashBarrier(100+i,-10,40+i,-5,40+i,.05));
const withFixture=fixture=>[fixture,...remoteFixtures().slice(1)];
const ledger=world=>world.cars.map(({damage})=>({...damage}));
const kinetic=({vx,vz,spin})=>(1200*(vx**2+vz**2)+1750*spin**2)/2;
const energy=world=>world.cars.reduce((sum,c)=>sum+kinetic(c),0);

function siteCentres({x,z,yaw}) {
  return stations.map(offset=>[x+Math.sin(yaw)*offset,z+Math.cos(yaw)*offset]);
}

// Independent current-pose geometry oracle. It examines every disc even when a
// production broad phase rejects the corresponding pair.
function residual({cars,barriers}) {
  const centres=cars.map(siteCentres);
  let penetration=0;
  for(let i=0;i<centres.length;i++)for(const [x,z] of centres[i]) {
    for(const other of centres.slice(i+1))for(const [a,b] of other)
      penetration=Math.max(penetration,2*radius-Math.hypot(x-a,z-b));
    for(const {x1,z1,x2,z2,r} of barriers) {
      const dx=x2-x1,dz=z2-z1;
      const t=Math.max(0,Math.min(1,((x-x1)*dx+(z-z1)*dz)/(dx*dx+dz*dz)));
      penetration=Math.max(penetration,radius+r-Math.hypot(x-(x1+t*dx),z-(z1+t*dz)));
    }
  }
  return penetration;
}

function checkTick(world,{contacts,stats},expected,previous) {
  assert(stats.passes>0 && stats.passes<=96);
  assert(stats.pairChecks<=111*stats.passes && stats.rejectedPairs<=stats.pairChecks);
  assert(stats.candidates<=423*stats.passes && stats.sweepSamples<=65536);
  assert.equal(stats.accepted,contacts.length);
  assert(energy(world)<=previous+1e-5,'contact response and positional correction cannot create energy');
  assert.equal(new Set(contacts.map(hit=>hit.id)).size,contacts.length);
  let lastTime=0;
  for(const hit of contacts) {
    const {normalImpulse,tangentialImpulse,closing,effectiveMass,dissipated,normalEnergy,preKinetic,postKinetic}=hit;
    assert.equal(hit.discipline,'derby');
    assert.equal(hit.rules,1);
    assert.equal(hit.revision,revision);
    assert.equal(hit.tick,world.tick);
    assert(hit.time>=lastTime && hit.time<=LAB_STEP);
    lastTime=hit.time;
    close(Math.hypot(...hit.normal),1,1e-10);
    assert(normalImpulse>0 && closing>0 && effectiveMass>0);
    assert(Math.abs(tangentialImpulse)<=.24*normalImpulse+1e-8);
    close(normalEnergy,.5*effectiveMass*closing**2,1e-6);
    close(dissipated,preKinetic-postKinetic,1e-6);
    assert(dissipated>=0);
    if(hit.newImpact)assert.equal(hit.episodeId,hit.id);
    for(const site of hit.sites) {
      if(!hit.newImpact)assert.deepEqual(site.damage,{});
      for(const [component,increment] of Object.entries(site.damage)) {
        assert(Object.hasOwn(expected[site.id],component));
        assert(Number.isInteger(increment) && increment>0);
        expected[site.id][component]+=increment;
      }
    }
  }
  assert.deepEqual(ledger(world),expected);
  assert(expected.every(d=>Object.values(d).every(v=>Number.isInteger(v) && v>=0 && v<=1000)));
  JSON.stringify({cars:world.cars,contacts,stats},(_key,v)=>{
    if(typeof v==='number')assert(Number.isFinite(v));
    return v;
  });
  if(stats.limited) {
    assert(stats.unadvancedSeconds>=0 && stats.unadvancedSeconds<=LAB_STEP);
    close(stats.residualPenetration,residual(world));
  } else assert(residual(world)<=1e-7,'an accepted tick cannot leave an intersecting body');
}

function run(cars,fixtures,ticks,damage=undefined) {
  const world=derbyDamageWorld(cars,fixtures,revision);
  const expected=damage?damage.map(d=>({...d})):ledger(world);
  if(damage)world.cars.forEach((body,i)=>Object.assign(body.damage,damage[i]));
  const steps=[];
  for(let i=0;i<ticks;i++) {
    const before=energy(world), result=resolveLabTick(world);
    checkTick(world,result,expected,before);
    steps.push(result);
    if(result.stats.limited)break;
  }
  return {world,steps};
}

test('derby admission holds 15 distinct vehicle pairs and 96 fixture pairs while the laboratory keeps its own limits',()=>{
  const cars=parked(), fixtures=remoteFixtures(), world=derbyDamageWorld(permute(cars),permute(fixtures),revision);
  assert.equal(world.cars.length,6);
  assert.equal(world.barriers.length,16);
  assert.equal(world.pairs.filter(p=>!p.wall).length,15);
  assert.equal(world.pairs.filter(p=>p.wall).length,96);
  assert.deepEqual(world.cars.map(c=>c.id),[0,1,2,3,4,5]);
  assert.deepEqual(world.barriers.map(b=>b.id),fixtures.map(b=>b.id));
  assert.equal(new Set(world.cars.map(c=>c.damage)).size,6);
  for(const [id,body] of world.cars.entries()) {
    assert.notEqual(body,cars[id]);
    assert.deepEqual(body.damage,newDamage());
    assert.throws(()=>{body.id=7;},TypeError);
  }
  assert.throws(()=>impactWorld(cars));
  assert.throws(()=>impactWorld(cars.slice(0,4),fixtures.slice(0,9)));
  assert.throws(()=>derbyImpactWorld([...cars,spare(6)]));
  assert.throws(()=>derbyImpactWorld(cars,[...fixtures,crashBarrier(120,0,0,1,0,.1)]));
  assert.throws(()=>derbyImpactWorld([...cars.slice(0,5),cars[0]]));
  assert.throws(()=>derbyImpactWorld(cars,[crashBarrier(2,0,0,1,0,.1)]));
  assert.throws(()=>derbyImpactWorld(field({...spare(2),vz:NaN})));
  assert.throws(()=>derbyImpactWorld(cars,fixtures,'wrong'));
  const {stats,contacts}=resolveLabTick(world);
  assert.equal(stats.pairChecks,111);
  assert.equal(stats.rejectedPairs,111);
  assert.equal(stats.candidates,0);
  assert.equal(stats.sweepSamples,0);
  assert.deepEqual(contacts,[]);
});

test('one complete validated command snapshot drives the sorted field, and an invalid snapshot is atomic',()=>{
  const world=derbyDamageWorld(permute(parked()),[],revision);
  const throttle={...neutralLab,throttle:1}, commands=[neutralLab,throttle,...Array(4).fill(neutralLab)];
  const before=structuredClone(world);
  const sparse=commands.slice();delete sparse[5];
  let reads=0;
  const accessor=commands.slice();
  Object.defineProperty(accessor,5,{get(){reads++;return neutralLab;}});
  const getter=Object.defineProperty({brake:0,steer:0},'throttle',{get(){reads++;return 1;}});
  for(const invalid of [commands.slice(0,5),sparse,accessor,
    [...commands.slice(0,5),getter],[...commands.slice(0,5),{...neutralLab,steer:Infinity}]]) {
    assert.throws(()=>stepDerbyTick(world,invalid));
    assert.deepEqual(world,before);
  }
  assert.equal(reads,0);
  const result=stepDerbyTick(world,commands);
  assert.equal(result.stats.limited,false);
  assert.equal(world.tick,1);
  for(const body of world.cars) {
    close(body.vz,body.id===1?-.2:0);
    close(body.z,13+LAB_STEP*body.vz);
  }
  assert.deepEqual(result.contacts,[]);
});

test('six accepted command streams move a fresh field from rest into physical impacts',()=>{
  const cars=Array.from({length:6},(_,id)=>car(id,{x:(Math.floor(id/2)-1)*10,z:id%2?-8:8,yaw:id%2?Math.PI:0}));
  const world=derbyDamageWorld(permute(cars),remoteFixtures(),revision);
  const commands=Array(6).fill({...neutralLab,throttle:1});
  let contacts=[];
  while(!contacts.length && world.tick<90) {
    const tick=stepDerbyTick(world,commands);
    assert.deepEqual(tick.commands,commands);
    assert.notEqual(tick.commands[0],commands[0]);
    assert(!tick.stats.limited);
    contacts=tick.contacts;
  }
  assert(world.tick>1 && world.tick<90);
  const entries=contacts.filter(hit=>hit.newImpact);
  assert.deepEqual(entries.map(hit=>hit.participants).sort(),[[0,1],[2,3],[4,5]]);
  assert(entries.every(hit=>hit.closing>20 && hit.normalImpulse>0));
  assert(world.cars.every(body=>body.damage.front>0 && body.damage.engine>0));
});

test('each of the 15 pairs can produce the analytic equal-and-opposite response at the velocity cap',()=>{
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++) {
    const cars=field(car(a,{z:2.7,vz:-DRIVE_CAP}),car(b,{z:-2.7,yaw:Math.PI,vz:DRIVE_CAP}));
    const {world,steps:[{stats,contacts}]}=run(cars,remoteFixtures(),1);
    assert.equal(stats.limited,false);
    assert.equal(contacts.length,1);
    const [hit]=contacts;
    assert.deepEqual(hit.participants,[a,b]);
    assert.deepEqual(hit.sites.map(s=>s.zone),['front','front']);
    close(hit.time,1/240);
    close(hit.closing,240);
    close(hit.effectiveMass,600);
    close(hit.normalImpulse,164160);
    close(hit.tangentialImpulse,0);
    close(world.cars[a].vz,16.8);
    close(world.cars[b].vz,-16.8);
    for(const body of world.cars) {
      const expected=newDamage();
      if(body.id===a || body.id===b)for(const name of ['front','engine','steering','tyres','suspension'])expected[name]=1000;
      assert.deepEqual(body.damage,expected);
    }
  }
});

test('three exact simultaneous pairs settle in stable ID order, independent of all input array orders',()=>{
  const cars=[car(0,{x:-10,z:2.8,vz:-66}),car(5,{x:-10,z:-2.8,vz:66}),
    car(1,{z:2.8,vz:-66}),car(4,{z:-2.8,vz:66}),car(2,{x:10,z:2.8,vz:-66}),car(3,{x:10,z:-2.8,vz:66})];
  const fixtures=remoteFixtures(), result=run(cars,fixtures,2);
  assert.deepEqual(run(permute(cars),permute(fixtures),2),result);
  const [{contacts,stats},later]=result.steps;
  assert(!stats.limited && !later.stats.limited);
  assert.deepEqual(contacts.map(c=>c.participants),[[0,5],[1,4],[2,3]]);
  for(const hit of contacts)close(hit.time,1.2/132);
  assert.equal(later.contacts.length,0);
  close(result.world.cars.reduce((n,c)=>n+c.vz,0),0);
});

test('six inward trajectories resolve a dense pileup with finite impulses and independent lasting damage',t=>{
  const cars=Array.from({length:6},(_,i)=>{
    const angle=i*Math.PI/3,x=Math.cos(angle),z=Math.sin(angle);
    return car(i,{x:6.5*x,z:6.5*z,yaw:Math.atan2(x,z),vx:-68*x,vz:-68*z});
  });
  const fixtures=remoteFixtures(), result=run(cars,fixtures,24);
  assert.deepEqual(run(cars.slice().reverse(),permute(fixtures),24),result);
  assert.equal(result.steps.length,24);
  assert(result.steps.every(({stats})=>!stats.limited));
  const contacts=result.steps.flatMap(({contacts})=>contacts);
  assert(contacts.length>=6);
  assert.deepEqual([...new Set(contacts.flatMap(hit=>hit.participants))].sort(),[0,1,2,3,4,5]);
  assert(contacts.some(hit=>!hit.newImpact));
  assert(result.world.cars.every(c=>Object.values(c.damage).some(v=>v>0)));
  close(result.world.cars.reduce((n,c)=>n+c.vx,0),0);
  close(result.world.cars.reduce((n,c)=>n+c.vz,0),0);
  const peak=key=>Math.max(...result.steps.map(step=>step.stats[key]));
  t.diagnostic(`${contacts.length} receipts in 24 ticks, peak ${peak('passes')} passes, ${peak('candidates')} feature sweeps and ${peak('sweepSamples')} sweep samples`);
});

test('the swept envelope catches thin barriers, rotating tips and rounded corner fixtures',()=>{
  const plate=crashBarrier(99,0,-10,0,10,.005,'steel');
  const choices=[
    {body:car(0,{x:1,vx:-DRIVE_CAP}),fixture:plate,check(hit,body) {
      assert(1-LAB_STEP*DRIVE_CAP<-radius-plate.r,'the free tick crosses both fixture surfaces');
      assert(hit.closing>119 && body.x>0);
    }},
    {body:car(0,{x:1.08,spin:10}),fixture:plate,check(hit,body) {
      assert(hit.closing>10 && body.vx>0 && Math.abs(body.spin)<10);
    }},
    {body:car(0,{x:1.2,z:2.8,vx:-30,vz:-65}),fixture:crashBarrier(99,-10,0,0,0,.2),check(hit) {
      assert(hit.normal[0]>.1 && hit.normal[1]>.1,'normal points out of the round fixture end');
    }}
  ];
  for(const {body,fixture,check} of choices) {
    const {world,steps:[{contacts,stats}]}=run(field(body),withFixture(fixture),1);
    assert.equal(stats.limited,false);
    assert(contacts.length>0);
    const [hit]=contacts;
    assert.deepEqual(hit.participants,[0,99]);
    assert.equal(hit.kind,'fixed');
    check(hit,world.cars[0]);
  }
});

test('rear and side witnesses identify the local panel, and equal-speed translating cars remain contact-free',()=>{
  const cases=[
    {a:car(0,{z:5.4,vz:-68}),zones:['front','rear'],friction:false},
    {a:car(0,{x:2.95,vx:-80}),zones:['left','right'],friction:false},
    {a:car(0,{x:2.04,vx:-12,vz:35}),zones:['left','right'],friction:true}
  ];
  for(const {a,zones,friction} of cases) {
    const {steps:[{contacts,stats}]}=run(field(a,car(1)),[],1);
    assert(!stats.limited && contacts.length>0);
    assert.deepEqual(contacts[0].sites.map(site=>site.zone),zones);
    if(friction)assert(Math.abs(contacts[0].tangentialImpulse)>0);
  }
  const fleet=Array.from({length:6},(_,id)=>car(id,{x:2.1*id,vz:-70}));
  const {world,steps}=run(fleet,[],6);
  assert(steps.every(({contacts,stats})=>!stats.limited && contacts.length===0));
  assert(world.cars.every(c=>c.vz===-70));
});

test('fixture constraints preserve episode IDs and only award damage again after actual separation',()=>{
  const wall=crashBarrier(99,-10,0,10,0,.05);
  const world=derbyDamageWorld(field(car(0,{z:2.735,vz:-30})),withFixture(wall),revision);
  const body=world.cars[0];
  const result=()=>resolveLabTick(world).contacts;
  const [first]=result();
  assert(first.newImpact && first.id===first.episodeId && body.damage.front>0);
  const before={...body.damage};
  // Prescribe closing/retreat velocities for the fixture. The solver alone
  // advances poses and observes the release clearance between episodes.
  body.vz=-18;
  const [support]=result();
  assert(!support.newImpact && support.episodeId===first.id);
  assert.deepEqual(support.sites[0].damage,{});
  assert.deepEqual(body.damage,before);
  body.vz=40;
  assert.deepEqual(result(),[]);
  body.vz=0;
  assert.deepEqual(result(),[]);
  body.vz=-55;
  const [next]=result();
  assert(next.newImpact && next.episodeId===next.id && next.id!==first.id);
  assert(body.damage.front>before.front);
});

test('six close spawns separate without damage, and moving initial penetration is recovery rather than a new impact',()=>{
  const neighbours=Array.from({length:6},(_,id)=>car(id,{x:(id-2.5)*1.949}));
  const early=run(neighbours,remoteFixtures(),1);
  assert.deepEqual(run(permute(neighbours),permute(remoteFixtures()),1),early);
  assert(!early.steps[0].stats.limited);
  assert.deepEqual(early.steps[0].contacts,[]);
  assert(early.world.cars.every(body=>kinetic(body)===0));
  const wall=crashBarrier(99,-10,0,10,0,.05);
  const {world,steps:[{contacts,stats}]}=run(field(car(0,{z:2.225,vz:-35})),[wall],1);
  assert(!stats.limited && contacts.length>0);
  assert(contacts.every(hit=>!hit.newImpact && hit.episodeId===null));
  assert.deepEqual(world.cars[0].damage,newDamage());
  close(world.cars[0].vz,0);
});

test('a previously disabled car has no thrust but stays a physical participant with its own cumulative ledger',()=>{
  const damage=Array.from({length:6},newDamage);
  Object.assign(damage[1],{engine:1000,front:830,right:175});
  damage[3].steering=450;
  damage[4].suspension=365;
  const cars=field(car(0,{z:5.35,vz:-70}),car(1));
  const fixtureWorld=derbyDamageWorld(parked(),remoteFixtures(),revision);
  Object.assign(fixtureWorld.cars[1].damage,damage[1]);
  const input=Array(6).fill({...neutralLab,throttle:1});
  const accepted=stepDerbyTick(fixtureWorld,input).commands;
  assert.deepEqual(accepted[1],neutralLab);
  assert.deepEqual(accepted[2],input[2]);
  assert.equal(kinetic(fixtureWorld.cars[1]),0);
  const {world,steps:[{contacts,stats}]}=run(cars,remoteFixtures(),1,damage);
  assert(!stats.limited && contacts.length>0);
  assert.deepEqual(contacts[0].participants,[0,1]);
  assert(world.cars[1].vz<0,'a genuine impact moves the disabled wreck');
  assert(labCondition(world.cars[1].damage).disabled);
  assert.equal(world.cars[1].damage.front,830);
  assert(world.cars[1].damage.rear>0);
  for(const id of [2,3,4,5])assert.deepEqual(world.cars[id].damage,damage[id]);
});

test('impossible fixture overlap stops with a finite residual and no invented contact or damage',()=>{
  const rails=[crashBarrier(98,-.95,-10,-.95,10,.1),crashBarrier(99,.95,-10,.95,10,.1)];
  const cars=field(car(0),car(1,{x:30,vx:12})), fixtures=[...rails,...remoteFixtures().slice(2)];
  const result=run(cars,fixtures,2),{world,steps:[{stats,contacts}]}=result;
  assert.deepEqual(run(permute(cars),permute(fixtures),2),result);
  assert(stats.limited && stats.limitReason==='passes');
  assert.equal(stats.passes,96);
  assert.equal(stats.unadvancedSeconds,LAB_STEP);
  assert(stats.residualPenetration>0);
  assert(Object.isFrozen(world.technicalStop));
  assert.deepEqual(contacts,[]);
  assert(ledger(world).every(d=>Object.values(d).every(v=>v===0)));
  assert.equal(world.cars[1].x,30);
  const stopped=structuredClone(world);
  assert.throws(()=>stepImpacts(world));
  assert.throws(()=>resolveLabTick(world));
  assert.throws(()=>stepDerbyTick(world,Array(6).fill(neutralLab)));
  assert.deepEqual(world,stopped);
});

test('near-tangent rotation can exhaust one feature sweep and preserve its last certified pose',()=>{
  const wall=crashBarrier(80,0,-8,0,8,.005);
  const spin=12, tangency=-.0005, at=.013, vx=-end*spin*Math.cos(tangency);
  const x=radius+wall.r+1.01e-8-vx*at-end*Math.sin(tangency);
  const cars=field(car(0,{x,vx,spin,yaw:tangency-spin*at}));
  const {world,steps:[{stats,contacts}]}=run(cars,withFixture(wall),1);
  assert(stats.limited && stats.limitReason==='sweep');
  assert(stats.unadvancedSeconds>0 && stats.unadvancedSeconds<LAB_STEP);
  assert.equal(stats.residualPenetration,0);
  assert.equal(contacts.length,0);
  close(world.cars[0].x,x+vx*(LAB_STEP-stats.unadvancedSeconds));
  assert.deepEqual(world.cars[0].damage,newDamage());
});

test('the aggregate sample cap holds the whole unresolved interval of a densely obstructed field',()=>{
  const cars=[car(0,{x:-10}),...Array.from({length:5},(_,i)=>car(i+1,{x:.98+1e-8,z:.5,vz:-120}))];
  const fixtures=[crashBarrier(80,-10.9,-6,-10.9,6,.005),crashBarrier(81,-9.1,-6,-9.1,6,.005),
    ...Array.from({length:14},(_,i)=>crashBarrier(82+i,-.01,0,0,0,.005))];
  const ordered=run(cars,fixtures,1),{world,steps:[{stats,contacts}]}=ordered;
  assert.deepEqual(run(permute(cars),permute(fixtures),1),ordered);
  assert(stats.limited && stats.limitReason==='samples');
  assert.equal(stats.sweepSamples,65536);
  assert.equal(stats.unadvancedSeconds,LAB_STEP);
  assert.equal(contacts.length,0);
  assert(world.cars.slice(1).every(body=>body.z===.5));
});

function random(seed) {
  let state=seed;
  return ()=>{
    state=(Math.imul(1664525,state)+1013904223)>>>0;
    return state/0x100000000;
  };
}

test('1,000 reproducible six-car fixture cases match their permuted full state and receipts',t=>{
  const sample=random(0x012a005f);
  let accepted=0;
  for(let caseId=0;caseId<1000;caseId++) {
    const fixtures=remoteFixtures(),cars=parked();
    // Alternate independently rotating opposing pairs with narrow stationary
    // walls. Width, heading, spin and speed vary without intersecting spawns.
    for(let lane=0;lane<3;lane++) {
      const x=(lane-1)*10, approach=55+sample()*55, yaw=(sample()-.5)*.22, spin=(sample()-.5)*2;
      if(caseId%2===0) {
        cars[lane*2]=car(lane*2,{x,z:3+sample()*.3,yaw,spin,vz:-approach});
        cars[lane*2+1]=car(lane*2+1,{x:x+(sample()-.5)*.25,z:-3-sample()*.3,yaw:Math.PI-yaw,spin:-spin,vz:approach});
      } else {
        cars[lane*2]=car(lane*2,{x,z:3+sample()*.2,yaw,spin,vz:-approach});
        fixtures[lane]=crashBarrier(100+lane,x-2,0,x+2,0,.02+sample()*.07,'steel');
      }
    }
    const ordered=run(cars,fixtures,2);
    assert.deepEqual(run(permute(cars),permute(fixtures),2),ordered,`permuted fixture ${caseId}`);
    assert(ordered.steps.every(({stats})=>!stats.limited),`fixture ${caseId} did not complete`);
    accepted+=ordered.steps.reduce((n,{contacts})=>n+contacts.length,0);
  }
  assert.equal(accepted,3000);
  t.diagnostic(`${accepted} witnessed impulses over 2,000 ordered ticks, repeated with permuted inputs`);
});
