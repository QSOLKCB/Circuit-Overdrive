// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDerbyRound,DERBY_TICK_LIMIT,stepDerbyRound} from '../src/derby.js';
import {labCondition,neutralLab} from '../src/crash-damage.js';
import {FIELD,PLAYER_ID} from '../src/field.js';

function launch(arena='crucible',seed=27) {
  return createDerbyRound({arena,seed,revision:'1'.repeat(40)});
}

// Direct drive-state placement is confined to these unit fixtures. The game
// still has to find the collision, allocate damage and produce its receipt.
function opposingPair(round,id,x,speed=60) {
  const [a,b]=round.world.cars.slice(id,id+2);
  Object.assign(a,{x,z:2.25,yaw:0,vx:0,vz:-speed,spin:0});
  Object.assign(b,{x,z:-2.25,yaw:Math.PI,vx:0,vz:speed,spin:0});
  return [a,b];
}

test('derby owns six ordered identities and rejects malformed player input before moving any car',()=>{
  const round=launch();
  assert.deepEqual(round.world.cars.map(x=>x.id),FIELD.map(x=>x.id));
  assert.deepEqual(round.standings.map(x=>[x.rank,x.id,x.active,x.condition]),
    FIELD.map(x=>[x.id+1,x.id,true,4000]));
  assert.throws(()=>launch('unknown'),/Unknown derby arena/);
  for (const seed of [-1,NaN,2**32,1.5,'27']) assert.throws(()=>launch('crucible',seed),/uint32/);
  const before=structuredClone(round);
  const getter={get throttle(){assert.fail('read accessor');},brake:0,steer:0};
  for (const command of [getter,{throttle:Infinity,brake:0,steer:0},{...neutralLab,boost:true}])
    assert.throws(()=>stepDerbyRound(round,command));
  assert.deepEqual(round,before);
  const step=stepDerbyRound(round,neutralLab);
  assert.equal(step.commands.length,6);
  assert.deepEqual(step.commands[PLAYER_ID],neutralLab);
  assert.ok(step.commands.slice(0,PLAYER_ID).every(x=>x.throttle>0));
  assert.ok(round.world.cars.every(car=>Object.values(car.damage).every(value=>value===0)));
});

test('three simultaneous opposing entries can disable all six with mutual credit and no surviving winner',()=>{
  const round=launch();
  for (const [id,x] of [[0,-12],[2,0],[4,12]]) opposingPair(round,id,x);
  const step=stepDerbyRound(round,neutralLab);
  assert.equal(step.result.reason,'simultaneous-elimination');
  assert.equal(step.result.winnerId,null);
  assert.equal(step.eliminations.length,FIELD.length);
  assert.deepEqual(round.eliminations.map(e=>e.id).sort(),FIELD.map(({id})=>id));
  assert.deepEqual(round.eliminations.map(e=>e.id),
    step.contacts.filter(x=>x.newImpact).flatMap(x=>x.participants));
  for (const [index,event] of round.eliminations.entries()) {
    const receipt=step.contacts.find(x=>x.id===event.impactId);
    assert.ok(receipt.newImpact);
    assert.ok(receipt.participants.includes(event.id));
    assert.equal(event.tick,1);
    assert.equal(event.attackerId,event.id^1);
    assert.equal(event.sequence,index+1);
    assert.equal(event.reason,'engine');
    assert.equal(event.damage.engine,1000);
  }
  const before=structuredClone(round);
  assert.throws(()=>stepDerbyRound(round,neutralLab),/Derby settled/);
  assert.deepEqual(round,before);
  assert.ok(Object.isFrozen(step.result));
  assert.ok(Object.isFrozen(round.eliminations));
  assert.ok(launch().world.cars.every(car=>!labCondition(car.damage).disabled));
});

for (const winnerId of [4,5]) test(`last active driver ${winnerId} wins exactly once`,()=>{
  const round=launch();
  opposingPair(round,0,-13);
  opposingPair(round,2,0);
  const first=stepDerbyRound(round,neutralLab);
  assert.equal(first.eliminations.length,4);
  assert.equal(first.result,null);
  const [a,b]=opposingPair(round,4,13,6);
  const victim=winnerId===4 ? b : a;
  victim.damage.engine=999;
  const last=stepDerbyRound(round,neutralLab);
  assert.equal(last.eliminations.length,1);
  assert.equal(last.eliminations[0].attackerId,winnerId);
  assert.equal(last.eliminations[0].id,victim.id);
  assert.equal(last.result.winnerId,winnerId);
  assert.equal(last.result.reason,'last-car-standing');
  assert.deepEqual(last.result.standings.filter(row=>row.active).map(row=>row.id),[winnerId]);
  assert.equal(last.result.standings[1].id,victim.id);
});

test('solid wrecks receive and transfer impulses after elimination without new credit',()=>{
  const round=launch();
  const [wreck]=opposingPair(round,0,-12);
  stepDerbyRound(round,neutralLab);
  const prior=round.scores[wreck.id].knockouts;
  const player=round.world.cars[PLAYER_ID];
  Object.assign(wreck,{x:9,z:2.25,yaw:0,vx:0,vz:0,spin:0});
  Object.assign(player,{x:9,z:-2.25,yaw:Math.PI,vx:0,vz:12,spin:0});
  player.damage.engine=999;
  const step=stepDerbyRound(round,neutralLab);
  const event=step.eliminations.find(e=>e.id===PLAYER_ID);
  assert.ok(event);
  assert.equal(event.attackerId,null);
  assert.ok(step.contacts.some(x=>x.id===event.impactId && x.participants.includes(wreck.id) && x.normalImpulse>0));
  assert.equal(round.scores[wreck.id].knockouts,prior);
  assert.notEqual(wreck.vz,0);
  assert.equal(round.targets[PLAYER_ID],null);
  assert.ok(!round.targets.includes(PLAYER_ID));
  const after=stepDerbyRound(round,{throttle:1,brake:0,steer:1});
  assert.equal(after.eliminations.filter(e=>e.id===PLAYER_ID).length,0);
  assert.deepEqual(after.commands[PLAYER_ID],neutralLab);
});

test('competitive reverse supplies road forces and real contact behind the player',()=>{
  const round=launch();
  const player=round.world.cars[PLAYER_ID];
  Object.assign(player,{x:14.3,z:-15,yaw:Math.PI});
  Object.assign(round.world.cars[4],{x:14.3,z:-20,yaw:Math.PI});
  stepDerbyRound(round,{throttle:0,brake:1,steer:0});
  assert.ok(player.vz<0);
  let entry;
  for (let i=0;i<60 && !entry;i++) {
    const step=stepDerbyRound(round,{throttle:0,brake:1,steer:0});
    entry=step.contacts.find(x=>x.kind==='vehicle' && x.newImpact && x.participants.includes(PLAYER_ID));
  }
  assert.ok(entry && entry.normalImpulse>0);
  assert.equal(entry.sites.find(site=>site.id===PLAYER_ID).zone,'rear');
});

test('technical stop freezes the official classification and never awards a knockout',()=>{
  const round=launch();
  const certified=round.standings;
  round.world.cars[0].x=Infinity;
  const stopped=stepDerbyRound(round,neutralLab);
  assert.equal(stopped.technicalStop.reason,'invalid-motion');
  assert.equal(stopped.result.reason,'technical-stop');
  assert.equal(stopped.result.winnerId,null);
  assert.equal(stopped.result.ticks,0);
  assert.equal(stopped.result.standings,certified);
  assert.deepEqual(stopped.eliminations,[]);
  assert.throws(()=>stepDerbyRound(round,neutralLab),/Derby settled/);
});

test('The Crucible accepts a complete round after the player hits a wall and spectates',()=>{
  const round=launch();
  let damageTicks=0,wallFailure;
  while (!round.result) {
    const step=stepDerbyRound(round,{throttle:1,brake:0,steer:0});
    if (step.contacts.some(x=>x.sites.some(site=>Object.keys(site.damage).length))) damageTicks++;
    if (wallFailure) assert.deepEqual(step.commands[PLAYER_ID],neutralLab);
    const out=step.eliminations.find(event=>event.id===PLAYER_ID);
    if (out) {
      wallFailure=out;
      assert.equal(out.attackerId,null);
      assert.equal(step.contacts.find(x=>x.id===out.impactId).kind,'fixed');
    }
  }
  assert.ok(damageTicks>10);
  assert.equal(wallFailure.tick,2274);
  assert.equal(round.ticks,DERBY_TICK_LIMIT);
  assert.equal(round.result.reason,'time-limit');
  assert.equal(round.result.winnerId,0);
  assert.equal(round.eliminations.length,4);
  assert.ok(round.standings[0].knockouts>0);
});

test('Iron Pit reproduces every command and accepted receipt through a complete spectator period',()=>{
  const a=launch('iron-pit'),b=launch('iron-pit');
  let contacts=0;
  while (!a.result) {
    const tick=a.ticks+1;
    const command={throttle:1,brake:0,steer:tick>=55 && tick<85 ? 1 : 0};
    const step=stepDerbyRound(a,command);
    assert.deepEqual(step,stepDerbyRound(b,command));
    assert.deepEqual(a.world.cars,b.world.cars);
    contacts+=step.contacts.length;
  }
  assert.ok(contacts>10);
  assert.deepEqual(a,b);
  assert.equal(a.eliminations.find(x=>x.id===PLAYER_ID).tick,112);
  assert.equal(a.eliminations.find(x=>x.id===PLAYER_ID).attackerId,2);
  assert.equal(a.ticks,5414);
  assert.equal(a.result.reason,'simultaneous-elimination');
  assert.equal(a.result.winnerId,null);
});
