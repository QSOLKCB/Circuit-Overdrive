// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createDerbyRound,DERBY_TICK_LIMIT,stepDerbyRound} from '../src/derby.js';
import {arenaContainsCar} from '../src/derby-arenas.js';
import {PLAYER_ID} from '../src/field.js';

// The stress schedule generates only ordinary driving commands. All starting
// states, contacts, ledgers and results come from the unmodified match API.
function drive(arena,seed,state,verify) {
  const round=createDerbyRound({arena,seed});
  const hash=createHash('sha256'),eliminated=new Set();
  const credits=Array(6).fill(0);
  const rand=()=>{
    state=(Math.imul(1664525,state)+1013904223)>>>0;
    return state/2**32;
  };
  let attempt=0,command,impactCount=0,contactTicks=0,knockouts=0;
  while(!round.result && attempt<DERBY_TICK_LIMIT){
    if(attempt++%90===0){
      const throttle=rand(),steer=Math.floor(rand()*3)-1;
      command={throttle:throttle<.75?1:0,brake:throttle>.93?1:0,steer};
    }
    const before=round.standings;
    const step=stepDerbyRound(round,command);
    if(step.contacts.length){
      hash.update(JSON.stringify(step.contacts));
      impactCount+=step.contacts.length;
      contactTicks++;
    }
    if(!verify)continue;
    if(step.technicalStop){
      assert.equal(round.standings,before);
      assert.equal(step.result.winnerId,null);
      assert.equal(step.eliminations.length,0);
      continue;
    }
    assert.equal(round.ticks,attempt);
    if(eliminated.has(PLAYER_ID))assert.deepEqual(step.commands[PLAYER_ID],{throttle:0,brake:0,steer:0});
    for(const car of round.world.cars){
      assert(arenaContainsCar(round.world.arena,car));
      assert([car.vx,car.vz,car.spin].every(Number.isFinite));
    }
    if(!step.eliminations.length)continue;
    for(const event of step.eliminations){
      assert(!eliminated.has(event.id),'each driver can fail once');
      eliminated.add(event.id);
      assert.equal(event.sequence,eliminated.size);
      assert.equal(event.tick,round.ticks);
      const hit=step.contacts.find(row=>row.id===event.impactId);
      assert(hit?.newImpact && hit.participants.includes(event.id));
      assert.equal(event.damage[event.reason],1000);
      assert(hit.sites.find(site=>site.id===event.id).damage[event.reason]>0);
      if(hit.kind==='fixed')assert.equal(event.attackerId,null);
      if(event.attackerId!==null){
        assert.equal(hit.kind,'vehicle');
        assert(hit.participants.includes(event.attackerId) && event.attackerId!==event.id);
        credits[event.attackerId]++;
        knockouts++;
      }
    }
    for(const row of round.standings){
      assert.equal(row.knockouts,credits[row.id]);
      assert.equal(row.active,!eliminated.has(row.id));
    }
  }
  assert(round.result,'every seed must settle within the accepted clock bound');
  const {reason,winnerId,ticks,standings}=round.result;
  if(reason==='time-limit')assert.equal(ticks,DERBY_TICK_LIMIT);
  if(reason==='last-car-standing')assert.deepEqual(standings.filter(d=>d.active).map(d=>d.id),[winnerId]);
  if(reason==='simultaneous-elimination')assert(standings.every(d=>!d.active) && winnerId===null);
  return {seed,arena,round,impactCount,contactTicks,knockouts,contactsSha256:hash.digest('hex')};
}

test('rules and raw contact receipts repeat through twelve seeded full rounds',t=>{
  const aggregate={rounds:0,ticks:0,contacts:0,contactTicks:0,knockouts:0,results:{}};
  for(const arena of ['crucible','iron-pit'])for(const seed of [7,27,39,80,155,2026]){
    const commandSeed=(0x414127+Math.imul(seed,0x25a3))>>>0;
    const a=drive(arena,seed,commandSeed,true),b=drive(arena,seed,commandSeed,false);
    assert.deepEqual(a.round,b.round);
    assert.equal(a.contactsSha256,b.contactsSha256);
    const {reason,ticks}=a.round.result;
    aggregate.rounds++;aggregate.ticks+=ticks;aggregate.contacts+=a.impactCount;
    aggregate.contactTicks+=a.contactTicks;aggregate.knockouts+=a.knockouts;
    aggregate.results[reason]=(aggregate.results[reason]??0)+1;
  }
  assert(aggregate.contacts>100 && aggregate.knockouts>10);
  t.diagnostic(JSON.stringify(aggregate));
});

test('a zero-damage final tick settles tied scores by stable driver ID',()=>{
  const round=createDerbyRound({arena:'iron-pit',seed:27});
  // Isolate the accepted time-limit boundary; the last tick uses real commands
  // and the legal untouched grid so it cannot fabricate damage or a knockout.
  round.ticks=round.world.tick=DERBY_TICK_LIMIT-1;
  const command={throttle:0,brake:0,steer:0};
  const {result,contacts,eliminations}=stepDerbyRound(round,command);
  assert.equal(result.reason,'time-limit');
  assert.equal(result.winnerId,0);
  assert.deepEqual(contacts,[]);
  assert.deepEqual(eliminations,[]);
  assert.deepEqual(result.standings.map(row=>[row.id,row.active,row.knockouts,row.condition]),
    Array.from({length:6},(_,i)=>[i,true,0,4000]));
  assert.throws(()=>stepDerbyRound(round,command),/Derby settled/);
});
