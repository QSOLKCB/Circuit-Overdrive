// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createNitroRace,startNitroRace,stepNitroRace} from '../src/nitro-race.js';
import {NEUTRAL_NITRO} from '../src/nitro-physics.js';
import {skyway} from '../src/skyway.js';
import {skywayIntent} from './skyway-driver.mjs';

function green() {
  const race=createNitroRace(27,skyway);
  startNitroRace(race);
  while(race.phase==='countdown') stepNitroRace(race,NEUTRAL_NITRO);
  return race;
}
test('six seeded drivers run the full Skyway with physical slides, paid boosts and validated landings',()=>{
  let firstLanding,firstAward;
  function run() {
    const race=green(),p=race.player,landings=[],awards=[];
    for(let i=0;i<6000 && race.phase==='racing';i++) {
      stepNitroRace(race,skywayIntent(p,skyway));
      if(p.nitro.landed) {
        landings.push([p.nitro.takeoffS,p.current.s,p.nitro.lastAirTicks,p.nitro.peakHeight]);
        firstLanding ??= structuredClone(race);
      }
      if(p.nitro.rewarded) {
        awards.push(p.nitro.lastRewardRamp);
        const {lastRewardRamp,stunts,points}=p.nitro;
        firstAward ??= {lastRewardRamp,stunts,points};
      }
    }
    assert.equal(race.phase,'finished');
    assert.deepEqual(awards,[0,1,2]);
    assert.equal(p.nitro.stunts,3);
    assert.equal(landings.length,3);
    for(const [takeoff,landing,ticks,height] of landings) {
      assert(landing-takeoff>30 && ticks>45 && height>2);
    }
    assert(race.entrants.every(e=>e.recoveries===0 && e.finishTicks>0 &&
      e.nextGate===skyway.gates.length && e.splitTicks.length===skyway.gates.length-2));
    assert(race.entrants.every(e=>e.nitro.chargedTotal>0 && e.nitro.spentTotal>0 && e.nitro.stunts>0));
    assert(p.nitro.spentTotal>5000);
    return race;
  }
  const race=run();
  assert.deepEqual(run().entrants,race.entrants);
  const landed=firstLanding.player.nitro;
  assert(landed.landed && landed.pendingStunt);
  assert.equal(landed.takeoffRamp,firstAward.lastRewardRamp);
  function replayLanding(lastRewardRamp) {
    const replay=structuredClone(firstLanding);
    Object.defineProperty(replay,'course',{value:skyway});
    const player=replay.player;
    // The live tick already opened a pending award. Re-submit that physical
    // landing from its original pose against the ledger from just after payout.
    Object.assign(player.nitro,firstAward,{lastRewardRamp,pendingStunt:null});
    skyway.settleStunt(player);
    for(let i=0;i<45;i++) stepNitroRace(replay,skywayIntent(player,skyway));
    return [player.nitro.stunts,player.nitro.points];
  }
  const value=firstAward.points-landed.points;
  assert(value>0);
  // The branches differ only in whether this ramp has already paid.
  assert.deepEqual(replayLanding(landed.lastRewardRamp),[firstAward.stunts+1,firstAward.points+value]);
  assert.deepEqual(replayLanding(firstAward.lastRewardRamp),[firstAward.stunts,firstAward.points]);
});
