// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRecording,replayCommands} from '../src/replay.js';
import {validateTheatreReplay,createReplaySession,MAX_REPLAY_TICKS} from '../src/replay-theatre-core.js';
import {NEUTRAL_NITRO} from '../src/nitro-physics.js';

const revision='c1'.repeat(20), older='8204da56fce6b40ab33cb66c684a2e780f3e3001';
function tape() {
  const r=createRecording('skyway',345,revision);
  for(let n=0;n<4;n++) r.record(NEUTRAL_NITRO,false);
  r.record({...NEUTRAL_NITRO,steer:.4,drift:true},false);
  r.record({...NEUTRAL_NITRO,throttle:.75,boost:true},true);
  return r.export();
}
test('Nitro v3 encodes the two independent held controls and accepted recovery',()=>{
  const data=tape();
  assert.deepEqual(data.runs,[[4,0,0,0,false,false,false],[1,0,0,.4,true,false,false],[1,.75,0,0,false,true,true]]);
  const commands=[...replayCommands(data,revision)];
  assert.equal(commands.length,6);
  assert.deepEqual(commands.at(-1),{command:{throttle:.75,brake:0,steer:0,drift:false,boost:true},recover:true});
  const raw=createRecording('skyway',0);
  raw.record(NEUTRAL_NITRO,false);
  assert.equal(raw.complete,false);
  assert.throws(()=>raw.export(),/stamped/);
  const recorder=createRecording('skyway',0,revision);
  assert.throws(()=>recorder.record({...NEUTRAL_NITRO,steer:NaN},false));
  assert.throws(()=>recorder.record(NEUTRAL_NITRO,1));
  assert.equal(recorder.complete,false);
});
test('Nitro v3 rejects mixed schemas, invalid bounds, accessors and unverified sources',()=>{
  const good=tape(), valid=good.runs[0];
  for(const changes of [{revision:older},{version:2},{course:'ridge'},{rules:2},{discipline:'touring'},
    {seed:-1},{seed:NaN},{ticks:good.ticks+1},{ticks:MAX_REPLAY_TICKS+1},{runs:[[6,1,0,0,false]]},
    {runs:[[6,1,0,Infinity,true,true,false]]},{runs:[[6,1,0,0,1,false,false]]},
    {runs:[[6,1,0,0,false,1,false]]},{runs:[[6,1,0,0,false,false,0]]},{runs:[Array(7)]},
    {runs:[[0,...valid.slice(1)]]},{extra:3}]) {
    assert.throws(()=>validateTheatreReplay({...good,...changes},revision));
  }
  let reads=0;
  const row=valid.slice();
  Object.defineProperty(row,5,{get(){reads++;return true;}});
  assert.throws(()=>createReplaySession({...good,runs:[row]},revision));
  const obj={...good};Object.defineProperty(obj,'version',{get(){reads++;return 3;}});
  assert.throws(()=>createReplaySession(obj,revision));
  assert.equal(reads,0);
  const short=createReplaySession({...good,ticks:1,runs:[[1,0,0,0,false,false,false]]},revision);
  assert.throws(()=>short.step(),/before.*finish/);
  const recovery=createReplaySession({...good,ticks:1,runs:[[1,0,0,0,false,false,true]]},revision);
  assert.throws(()=>recovery.step(),/invalid recovery/);
  const touring=createRecording('ridge',1,older);
  touring.record({throttle:0,brake:0,steer:0},false);
  assert.equal(validateTheatreReplay(touring.export(),revision).compatibility,'verified-compatible');
  assert.throws(()=>validateTheatreReplay({...touring.export(),course:'skyway'},revision));
});
