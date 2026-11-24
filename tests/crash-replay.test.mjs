// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTrial,startTrial,stepTrial} from '../src/crash-trial.js';
import {crashRecorder,crashReceipt} from '../src/crash-replay.js';
import {createReplaySession,validateTheatreReplay} from '../src/replay-theatre-core.js';
const sha='ab'.repeat(20);
function drive(scenario,revision=sha){
  const trial=createTrial(scenario,27,revision),rec=crashRecorder(trial);startTrial(trial);
  while(!trial.result){const cmd={throttle:1,brake:0,steer:0};stepTrial(trial,cmd);rec.record(cmd);}
  return {trial,rec};
}
test('v5 source-bound drives reproduce every impulse, damage increment, latch and result after rewinding',async()=>{
  for(const scenario of ['wall','glancing','opposing']){
    const {trial,rec}=drive(scenario),tape=rec.export(),session=createReplaySession(tape,sha);
    const first=trial.firstImpact;
    while(session.tick<first)session.seekBatch(first);
    assert.deepEqual(session.race.contacts[0],trial.contacts[0]);
    session.seekBatch(first-15);
    assert.equal(session.race.contacts.length,0);assert.throws(()=>session.advance(241));
    while(!session.finished)session.advance(57);
    assert.deepEqual(session.race,trial);
    assert.deepEqual(await crashReceipt(tape,session.race,'node'),await crashReceipt(tape,trial,'node'));
  }
});
test('only admitted dense own input data can reach an experiment',()=>{
  const tape=drive('wall').rec.export(),admit=data=>validateTheatreReplay(data,sha);
  for(const override of [{revision:'0'.repeat(40)},{rules:0},{scenario:'constructor'},{scenario:[]},{seed:-1},
    {discipline:'rocket'},{ticks:0},{ticks:3601},{ticks:.5},{damage:[]},{contacts:[]},{recover:true},{course:'wall'},
    {runs:new Array(2)},{runs:[[1,NaN,0,0]]},{runs:[[tape.ticks,1,0,Infinity]]},{runs:[[tape.ticks,1,0,0,true]]},
    {runs:[Object.assign([tape.ticks,1,0,0],{extra:1})]},{runs:[[tape.ticks+1,1,0,0]]}])
    assert.throws(()=>admit({...tape,...override}));
  let invoked=false;const row=[tape.ticks,1,0,0];
  Object.defineProperty(row,1,{get(){invoked=true;return 0;}});
  assert.throws(()=>admit({...tape,runs:[row]}));assert.equal(invoked,false);
  assert.throws(()=>drive('wall',null).rec.export());
});
test('terminal predicate rejects early and trailing inputs independently of race finishes',()=>{
  const tape=drive('wall').rec.export();
  for(const ticks of [tape.ticks-1,tape.ticks+1]){
    const session=createReplaySession({...tape,ticks,runs:[[ticks,1,0,0]]},sha);
    assert.throws(()=>{while(!session.finished)session.advance(240);},/experiment/);
  }
});
