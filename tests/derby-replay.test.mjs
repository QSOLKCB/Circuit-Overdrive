// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createDerbyRound,DERBY_RULES,DERBY_TICK_LIMIT} from '../src/derby.js';
import {createDerbyRecorder} from '../src/derby-replay.js';
import {PLAYER_ID} from '../src/field.js';
import {createReplaySession,MAX_SEEK_STEPS,validateTheatreReplay} from '../src/replay-theatre-core.js';

const revision='27'.repeat(20);
const runtime='Node '+process.version+' '+process.platform+' '+process.arch;
const throttle={throttle:1,brake:0,steer:0};
const shortTape={version:6,discipline:'derby',rules:DERBY_RULES,revision,arena:'crucible',
  seed:27,ticks:2,terminal:'last-car-standing',runs:[[2,1,0,0]]};
const sha256=text=>createHash('sha256').update(text).digest('hex');

function seek(session,target) {
  do {session.seekBatch(target);} while (session.tick!==target);
}

test('derby v6 admits only its exact source and owns validated input data',()=>{
  const source=structuredClone(shortTape);
  const admitted=validateTheatreReplay(source,revision);
  assert.equal(admitted.compatibility,'exact');
  source.runs[0][1]=0;
  assert.deepEqual(admitted.runs,shortTape.runs);
  assert(Object.isFrozen(admitted.runs[0]));
  assert.throws(()=>validateTheatreReplay(shortTape,''),/Source revision unavailable/);
  assert.throws(()=>validateTheatreReplay(shortTape,'00'.repeat(20)),/exact source revision/);
  for(const change of [
    {arena:'constructor'}, {arena:[]}, {discipline:'crash-lab'}, {rules:9}, {revision:'latest'},
    {seed:-1}, {seed:2**32}, {seed:NaN}, {seed:.5}, {seed:'27'},
    {ticks:DERBY_TICK_LIMIT+1}, {ticks:-1}, {ticks:0}, {ticks:2.5}, {ticks:Infinity}, {ticks:2n},
    {terminal:'winner'}, {terminal:'time-limit'}, {terminal:'technical-stop'},
    {winnerId:PLAYER_ID}, {standings:[]}, {damage:[]},
    {runs:[]}, {runs:new Array(1)}, {runs:[[2,1,,0]]}, {runs:[[3,1,0,0]]}, {runs:[[1,1,0,0]]},
    {runs:[[0,1,0,0]]}, {runs:[[2.5,1,0,0]]}, {runs:[[2,1,0,0,false]]},
    {runs:[[2,true,0,0]]}, {runs:[[2,1.001,0,0]]}, {runs:[[2,1,-1,0]]},
    {runs:[[2,1,0,Infinity]]}, {runs:[[2,1,0,-1.01]]}
  ]) assert.throws(()=>validateTheatreReplay({...shortTape,...change},revision));

  const getter=()=>{throw Error('getter invoked');};
  const field=Object.defineProperty({...shortTape},'arena',{get:getter});
  assert.throws(()=>validateTheatreReplay(field,revision),/accessor fields/);
  const outer=Object.defineProperty([[2,1,0,0]],'0',{get:getter});
  const row=Object.defineProperty([2,1,0,0],'2',{get:getter});
  assert.throws(()=>validateTheatreReplay({...shortTape,runs:outer},revision),/own data/);
  assert.throws(()=>validateTheatreReplay({...shortTape,runs:[row]},revision),/own data/);
  const extra=Object.assign([2,1,0,0],{ignored:1});
  assert.throws(()=>validateTheatreReplay({...shortTape,runs:[extra]},revision),/extra or sparse/);
});

test('an attempted stop and a partial match cannot impersonate a terminal derby',()=>{
  const partial=createReplaySession(shortTape,revision);
  assert.equal(partial.step(),true);
  assert.throws(()=>partial.step(),/terminal reason or accepted tick count/);
  assert.equal(partial.finished,false);
  assert.throws(()=>partial.derbyEvidence(runtime),/full derby/);
  assert.throws(()=>partial.step(),/terminal reason or accepted tick count/);
  partial.reset();
  assert.equal(partial.tick,0);
  assert.throws(()=>partial.seekBatch(3),/target/);
  assert.throws(()=>partial.advance(MAX_SEEK_STEPS+1),/work batch/);

  const falseStop={...shortTape,ticks:0,runs:[[1,1,0,0]],terminal:'technical-stop'};
  const attempted=createReplaySession(falseStop,revision);
  assert.equal(attempted.totalTicks,1);
  assert.throws(()=>attempted.step(),/terminal reason or accepted tick count/);
  assert.equal(attempted.finished,false);
  const raw=createDerbyRecorder(createDerbyRound({arena:'crucible',seed:27}));
  assert.equal(raw.available,false);
  assert.throws(()=>raw.export(),/source-stamped/);
});

for(const arena of ['crucible','iron-pit']) {
  test(arena+' reconstructs a physical six-car derby through player elimination and settlement',async()=>{
    const round=createDerbyRound({arena,seed:27,revision});
    const recorder=createDerbyRecorder(round);
    let playerOut,atExit,liveContactCount=0;
    const chunkDigests=[],chunk=[];
    assert.equal(recorder.available,false);
    while (!round.result) {
      const next=round.ticks+1;
      const command=arena==='iron-pit' && next>=55 && next<=84 ? {...throttle,steer:1} : throttle;
      const step=recorder.step(command);
      chunk.push(JSON.stringify(step.contacts));
      liveContactCount+=step.contacts.length;
      if (chunk.length===120) {
        chunkDigests.push(sha256('['+chunk.join(',')+']'));
        chunk.length=0;
      }
      if (step.eliminations.some(event=>event.id===PLAYER_ID)) {
        playerOut=round.ticks;
        atExit=structuredClone(round);
      }
    }
    if (chunk.length) chunkDigests.push(sha256('['+chunk.join(',')+']'));
    assert.equal(recorder.available,true);
    assert(playerOut>0 && round.ticks>playerOut);
    assert(liveContactCount>0);
    const tape=recorder.export();
    const surviving=arena==='crucible';
    assert.equal(round.result.reason,surviving?'time-limit':'simultaneous-elimination');
    assert.deepEqual(tape.runs,surviving ?
      [[playerOut,1,0,0],[tape.ticks-playerOut,0,0,0]] :
      [[54,1,0,0],[30,1,0,1],[playerOut-84,1,0,0],[tape.ticks-playerOut,0,0,0]]);
    if (!surviving) {
      const player=round.eliminations.find(entry=>entry.id===PLAYER_ID);
      const rival=round.eliminations.find(entry=>entry.id===player.attackerId);
      assert.equal(player.impactId,rival.impactId);
      assert.equal(rival.attackerId,PLAYER_ID);
      assert.equal(round.result.winnerId,null);
    }
    const live=await recorder.receipt(runtime);
    assert.equal(live.contactsSha256,sha256(JSON.stringify(chunkDigests)));
    assert.equal(live.contactCount,liveContactCount);
    assert.equal(live.inputSha256,sha256(JSON.stringify(tape.runs)));

    const theatre=createReplaySession(structuredClone(tape),revision);
    seek(theatre,playerOut);
    assert.deepEqual(theatre.race,atExit);
    assert(theatre.lastStep.eliminations.some(event=>event.id===PLAYER_ID));
    seek(theatre,playerOut-1);
    assert(theatre.race.standings.find(row=>row.id===PLAYER_ID).active);
    seek(theatre,theatre.totalTicks);
    assert(theatre.finished);
    assert.deepEqual(theatre.race,round);
    assert.deepEqual(await theatre.derbyEvidence(runtime),live);
    assert.throws(()=>recorder.step(throttle),/settled/);

    if (arena==='crucible') {
      const stale=createReplaySession({...tape,runs:[[tape.ticks,1,0,0]]},revision);
      seek(stale,playerOut);
      assert.throws(()=>stale.step(),/Non-neutral derby control/);
    }
  });
}

for(const scenario of [
  {arena:'crucible',seed:10,driverSeed:3569180769,reason:'last-car-standing',ticks:8459,winner:1},
  {arena:'iron-pit',seed:39,driverSeed:1279102825,reason:'technical-stop',ticks:6589,winner:null}
]) {
  test('reconstructs '+scenario.reason+' from accepted controls',async()=>{
    const {arena,seed,reason,ticks,winner}=scenario;
    const round=createDerbyRound({arena,seed,revision});
    const recorder=createDerbyRecorder(round);
    let randomState=scenario.driverSeed,command,lastStep;
    function random() {
      randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;
      return randomState/2**32;
    }
    while (!round.result) {
      if (round.ticks%90===0) command={throttle:random()<.84?1:0,brake:0,steer:Math.floor(random()*3)-1};
      lastStep=recorder.step(command);
    }
    assert.equal(round.ticks,ticks);
    assert.equal(round.result.reason,reason);
    assert.equal(round.result.winnerId,winner);
    const tape=recorder.export(),theatre=createReplaySession(tape,revision);
    seek(theatre,ticks);
    if (reason==='technical-stop') {
      assert.equal(tape.runs.reduce((sum,[length])=>sum+length,0),ticks+1);
      assert.equal(theatre.race.result,null);
      assert.equal(theatre.finished,false);
      assert(lastStep.contacts.length>0);
      assert.equal(lastStep.eliminations.length,0);
      assert(lastStep.stats.unadvancedSeconds>0);
      assert.equal(theatre.step(),true);
      assert.deepEqual(theatre.lastStep,lastStep);
    }
    assert(theatre.finished);
    assert.deepEqual(theatre.race,round);
    assert.deepEqual(await theatre.derbyEvidence(runtime),await recorder.receipt(runtime));
  });
}
