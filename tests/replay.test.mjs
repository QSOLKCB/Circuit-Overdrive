// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRecording,replayCommands} from '../src/replay.js';
import {createRace,startRace,stepRace,recoverCar,STEP} from '../src/sim.js';
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {ridge} from '../src/ridge.js';
import {track} from '../src/track.js';

test('saved analog commands and recovery reproduce all six cars across presentation cadences without a device',()=>{
  for (const course of [track,ridge]) {
    const reference=createRace(27,course), recording=createRecording(course.id,27);
    startRace(reference);
    for(let i=0;i<540;i++) {
      const command={throttle:i<430?.823:0,brake:i>460?.37:0,steer:i%70<12?-.31:.07};
      const recover=i===390 && recoverCar(reference);
      recording.record(command,recover);
      stepRace(reference,command);
    }
    const saved=JSON.parse(JSON.stringify(recording.export()));
    for(const hz of [30,60,144]) {
      const race=createRace(saved.seed,course), tape=replayCommands(saved), clock=new FixedClock({step:STEP});
      startRace(race);
      let ticks=0;
      while(ticks<saved.ticks) clock.advance(1/hz,()=>{
        if (ticks === saved.ticks) return;
        const {command,recover}=tape.next().value;
        if(recover) assert(recoverCar(race));
        stepRace(race,command); ticks++;
      });
      assert.deepEqual(race,reference);
    }
  }
});
test('recording owns its snapshots and rejects corrupt/truncated or unbounded playback',()=>{
  const r=createRecording('ridge',4), cmd={throttle:.5,brake:0,steer:0};
  r.record(cmd,false); r.record(cmd,false); cmd.throttle=1;
  const exported=r.export();
  assert.deepEqual(exported.runs,[[2,.5,0,0,false]]);
  for (const invalid of [{...exported,ticks:1},{...exported,ticks:3},{...exported,version:2},
    {...exported,runs:[[2,1,0,NaN,false]]},{...exported,runs:[[2,1,0,0,'yes']]}]) {
    assert.throws(()=>[...replayCommands(invalid)],RangeError);
  }
  exported.runs[0][2]=.75;
  assert.equal(r.export().runs[0][2],0);
  for(let i=2;i<=108000;i++) r.record(cmd,false);
  assert.equal(r.complete,false); assert.throws(()=>r.export());
});

test('published recordings identify their revision before playback and keep legacy inputs readable', () => {
  const revision = 'a1'.repeat(20);
  const recording = createRecording('speedway', 27, revision);
  recording.record({throttle:0.4,brake:0,steer:0.15},false);
  const data = recording.export();
  assert.equal(data.version,2);
  assert.equal(data.revision,revision);
  assert.equal([...replayCommands(data,revision)].length,1);
  assert.throws(() => [...replayCommands(data,'b2'.repeat(20))],/requires game revision/);
  for (const invalid of ['', 'main', 27, 'A'.repeat(40), null]) {
    assert.throws(() => [...replayCommands({...data,revision:invalid})],/Invalid replay header/);
  }
  assert.throws(() => [...replayCommands({...data,version:1})],/Invalid replay header/);
  // A touring tape cannot become a stunt recording by changing its version.
  assert.throws(() => [...replayCommands({...data,version:3},revision)],/missing, unknown or accessor fields/);
  assert.throws(() => [...replayCommands({...data,version:4})],/Invalid replay header/);
  assert.throws(() => createRecording('ridge',27,'unreleased'),/Invalid replay header/);
});
