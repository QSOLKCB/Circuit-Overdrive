// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRecording,replayCommands} from '../src/replay.js';
import {NEUTRAL_ROCKET} from '../src/rocket-dynamics.js';
import {createRocketRace,startRocketRace,stepRocketRace} from '../src/rocket-race.js';
import {createReplaySession,validateTheatreReplay,MAX_REPLAY_TICKS,MAX_SEEK_STEPS} from '../src/replay-theatre-core.js';
import {createReplayPoses,interpolateReplayPoses} from '../src/replay-presentation.js';

const revision='7d'.repeat(20), published='f7f45d1b6c3521dd728945b71cf20ab406603cb4';
const record=()=>createRecording('orbital',123,revision);
function controlsTape() {
  const tape=record();
  tape.record(NEUTRAL_ROCKET,false); tape.record(NEUTRAL_ROCKET,false);
  tape.record({...NEUTRAL_ROCKET,throttle:.5,steer:-.75,assist:true,dodge:-1},false);
  tape.record({...NEUTRAL_ROCKET,boost:true,dodge:1},true);
  return tape.export();
}
test('v4 stores signed dodge, held assistance, boost, analog controls and accepted recovery separately',()=>{
  const data=controlsTape();
  assert.deepEqual(data,{version:4,discipline:'rocket',rules:2,course:'orbital',revision,seed:123,ticks:4,runs:[
    [2,0,0,0,false,false,0,false],[1,.5,0,-.75,false,true,-1,false],[1,0,0,0,true,false,1,true]
  ]});
  const commands=[...replayCommands(data,revision)];
  assert.deepEqual(commands[2],{command:{...NEUTRAL_ROCKET,throttle:.5,steer:-.75,assist:true,dodge:-1},recover:false});
  assert.deepEqual(commands[3],{command:{...NEUTRAL_ROCKET,boost:true,dodge:1},recover:true});
  const unstamped=createRecording('orbital',123);
  unstamped.record(NEUTRAL_ROCKET,false);
  assert.equal(unstamped.complete,false);
  assert.throws(()=>unstamped.export(),/stamped/);
  const invalid=record();
  assert.throws(()=>invalid.record({...NEUTRAL_ROCKET,dodge:2},false));
  assert.throws(()=>invalid.record(NEUTRAL_ROCKET,1));
  assert.equal(invalid.complete,false);
});
test('v4 rejects incompatible headers, indefinite numbers, malformed rows and accessor properties',()=>{
  const data=controlsTape(), row=data.runs[0], short=[1,0,0,0,false,false,0,false];
  for (const change of [{version:3},{version:2},{version:5},{course:'skyway'},{discipline:'nitro'},
    {rules:0},{rules:1},{seed:2**32},{revision:published},{ticks:MAX_REPLAY_TICKS+1},{ticks:5},{extra:0}]) {
    assert.throws(()=>validateTheatreReplay({...data,...change},revision));
  }
  for (const [i,values] of [[0,[0,1.5,1e20]],[1,[NaN,Infinity,1.01]],[3,[-2]],
    [4,[1]],[5,[1]],[6,[true,.5,2,-2,NaN]],[7,[0]]]) {
    for (const value of values) {
      const bad=row.slice(); bad[i]=value;
      assert.throws(()=>validateTheatreReplay({...data,runs:[bad,...data.runs.slice(1)]},revision));
    }
  }
  let calls=0;
  const getter={get(){calls++;throw Error('executed foreign accessor');},enumerable:true};
  const header={...data}; Object.defineProperty(header,'rules',getter);
  const accessor=row.slice(); Object.defineProperty(accessor,6,getter);
  const rows=data.runs.slice(); Object.defineProperty(rows,0,getter);
  for (const bad of [header,{...data,runs:[accessor]},{...data,runs:rows},{...data,runs:[Array(8)]}]) {
    assert.throws(()=>createReplaySession(bad,revision));
  }
  assert.equal(calls,0);
  const session=createReplaySession({...data,ticks:1,runs:[short]},revision);
  assert.throws(()=>session.advance(1),/before.*finish/);
  assert.throws(()=>createReplaySession({...data,ticks:1,runs:[[...short.slice(0,-1),true]]},revision).step(),/invalid recovery/);
});
test('bounded v4 seek reproduces every entrant, integrates its quaternion, and isolates observer state',()=>{
  const recorder=record(), reference=createRocketRace(123);
  startRocketRace(reference);
  for(let tick=0;tick<592;tick++) {
    const command={...NEUTRAL_ROCKET,throttle:1,assist:tick>200,boost:tick>250 && tick<320,dodge:tick===310?-1:0};
    recorder.record(command,false); stepRocketRace(reference,command);
  }
  // A longer tape allows inspection at the 592nd tick while the race is live.
  recorder.record(NEUTRAL_ROCKET,false);
  const spectator=createReplaySession(recorder.export(),revision);
  assert.throws(()=>spectator.advance(MAX_SEEK_STEPS+1));
  for(const target of [592,87,592]) while(spectator.tick!==target)spectator.seekBatch(target);
  assert.deepEqual(spectator.race.entrants,reference.entrants);
  const poses=createReplayPoses();
  for(const alpha of [0,.5,1]) {
    const result=interpolateReplayPoses(spectator.race,poses,alpha);
    for (const [i,pose] of result.entries()) {
      assert(Math.abs(Math.hypot(...pose.orientation)-1)<1e-9);
      const driver=reference.entrants[i], dot=(q,v)=>q.reduce((n,x,k)=>n+x*v[k],0);
      if(alpha===0) assert(Math.abs(dot(pose.orientation,driver.previous.orientation))>1-1e-9);
      if(alpha===1) assert(Math.abs(dot(pose.orientation,driver.current.orientation))>1-1e-9);
    }
  }
  assert.deepEqual(spectator.race.entrants,reference.entrants);
  const finished=structuredClone(reference.entrants[2]);
  finished.finishTicks=521;
  finished.previous={...finished.previous,x:finished.current.x-8,orientation:[0,1,0,0]};
  const entrants=reference.entrants.slice();entrants[2]=finished;
  const held=interpolateReplayPoses({course:reference.course,entrants},poses,0)[2];
  assert.equal(held.x,finished.current.x);
  const q=finished.current.orientation;
  assert(Math.abs(held.orientation.reduce((sum,v,i)=>sum+v*q[i],0))>1-1e-9);
});
test('v0.9.0 uses the published Skyway tape semantics only for v3 and touring',()=>{
  const evidence=JSON.parse(readFileSync(new URL('../docs/evidence/co-009d/skyway-replay.json',import.meta.url),'utf8'));
  // A run made with the original v0.9.0 recorder generated these same 952 rows.
  assert.equal(createHash('sha256').update(JSON.stringify(evidence.runs)).digest('hex'),
    '596ad8d87cc8a1546bd2486a22d6a045be272a7c8d66536350aa56b28a7cf20f');
  const session=createReplaySession({...evidence,revision:published},revision);
  assert.equal(session.recording.compatibility,'verified-compatible');
  while (!session.finished) session.advance(MAX_SEEK_STEPS);
  assert.equal(session.race.player.finishTicks,3745);
  assert.deepEqual(session.race.order.map(e=>e.id),[1,2,3,0,4,5]);
  assert.throws(()=>validateTheatreReplay({...controlsTape(),revision:published},revision),/needs revision/);
  assert.throws(()=>validateTheatreReplay({...evidence,revision:'dc'.repeat(20)},revision),/needs revision/);
});
