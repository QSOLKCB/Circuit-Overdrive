// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createRecording} from '../src/replay.js';
import {createRace,startRace,stepRace} from '../src/sim.js';
import {track} from '../src/track.js';
import {ridge} from '../src/ridge.js';
import {driverIntent} from './driver.mjs';
import {createReplayPoses,interpolateReplayPoses} from '../src/replay-presentation.js';
import {createReplaySession,validateTheatreReplay,REPLAY_COMPATIBLE_RELEASES,
  MAX_SEEK_STEPS} from '../src/replay-theatre-core.js';

const REV='f1'.repeat(20);
const RELEASES=['020e5dc4c7e2485e01f0f47c698f80ee58fe228b',
  'd81a2d4a09286029b87c2ac201edf8ab6448e023','c97ee47e7577337032a55eb2e6ae53b855285573'];
const blank={throttle:0,brake:0,steer:0};
function tapeFor(course,ticks=600,revision=RELEASES[0]){
  const recorder=createRecording(course.id,27,revision),reference=createRace(27,course);
  startRace(reference);
  for(let i=0;i<ticks;i++){
    const command=reference.phase==='racing'?driverIntent(reference.player.current,30,0,course):blank;
    recorder.record(command,false);
    stepRace(reference,command);
  }
  return {data:recorder.export(),reference};
}

test('source-compatibility pins match the immutable v0.6.0 through v0.6.2 race authority',()=>{
  assert.deepEqual(REPLAY_COMPATIBLE_RELEASES,RELEASES);
  const root=fileURLToPath(new URL('../',import.meta.url));
  // GitHub blob hashes were read directly from v0.6.1, and compare(v0.6.0,v0.6.1)
  // returned no authoritative changes. Fail this test if later physics drift.
  const pinned={
    'src/ai.js':'9d0c560a455bb21eb8e274cfb328f6ad140f1413',
    'src/contact.js':'1c4546c27a4ab938f8eb2491bf38f1e45a854b30',
    'src/field.js':'e3a0ae52d30362dee6874eed4bdb772001b34f8d',
    'src/ridge.js':'d13853850c93793e9b73684f556199f5fc92d414',
    'src/speedway.js':'1a61b8ce5bbad92f4035d5166b68061209e92646',
    'src/sim.js':'76fd3091c36adaceb7e3e72a9f623aa4f2c2b3e8',
    'src/track.js':'8640d6ad053c63f4b2d4368e77d0dca6f32f2c27',
    'src/replay.js':'e7cd33164a077b573cbbddd1833e0a7fdb29372e',
    'tracks/overdrive-speedway.json':'16cbb83d49908657a4de73e48c7bcfc45da67d35',
    'tracks/redline-ridge.json':'34c96746ba6fd0d069443056503a5dcbfd7541c6',
    'vendor/vanillajs/provenance.json':'42c170df0b42d5c752a0dca47c6746b6bbd5cc7f'
  };
  for(const [path,sha] of Object.entries(pinned)){
    const current=execFileSync('git',['hash-object',path],{cwd:root,encoding:'utf8'}).trim();
    assert.equal(current,sha,'historical replay trust invalidated by '+path);
  }
});

test('reject legacy, mismatched, corrupt and accessor-backed JSON before simulating',()=>{
  const data=tapeFor(track,400).data;
  for (const revision of RELEASES) assert.equal(validateTheatreReplay({...data,revision},REV).compatibility,'verified-compatible');
  assert.equal(validateTheatreReplay({...data,revision:REV},REV).compatibility,'exact');
  assert.throws(()=>validateTheatreReplay(data,''),/Source revision unavailable/);
  assert.throws(()=>validateTheatreReplay({...data,version:1},REV),/Legacy/);
  assert.throws(()=>validateTheatreReplay({...data,revision:'aa'.repeat(20)},REV),/needs revision/);
  assert.throws(()=>validateTheatreReplay({...data,ticks:data.ticks-1},REV),/exceed/);
  assert.throws(()=>validateTheatreReplay({...data,runs:[[1,1,0,0,false]]},REV),/Truncated/);
  assert.throws(()=>validateTheatreReplay({...data,runs:[[1,NaN,0,0,false]]},REV),/Invalid/);
  assert.throws(()=>validateTheatreReplay({...data,extra:'inert'},REV),/unknown/);
  const hostile={...data};
  let calls=0;
  Object.defineProperty(hostile.runs,0,{enumerable:true,get(){calls++;return [1,0,0,0,false]}});
  assert.throws(()=>validateTheatreReplay(hostile,REV),/own data/);
  assert.equal(calls,0);
  const note=tapeFor(track,400).data;
  Object.defineProperty(note.runs[0],2,{enumerable:true,get(){calls++;return 0}});
  assert.throws(()=>validateTheatreReplay(note,REV),/own data/);
  assert.equal(calls,0);
});

test('forward/rewind/seek batches preserve authoritative six-car state on both courses',()=>{
  for(const course of [track,ridge]){
    const {data,reference}=tapeFor(course,920);
    const spectator=createReplaySession(data,REV);
    assert.equal(spectator.tick,0);
    assert.equal(spectator.advance(240),240);
    const middle=structuredClone(spectator.race);
    spectator.seekBatch(120);
    assert.equal(spectator.tick,120);
    while(spectator.tick<240)spectator.seekBatch(240);
    assert.deepEqual(spectator.race,middle);
    while(spectator.tick<919)spectator.seekBatch(919);
    const direct=createRace(data.seed,course);
    startRace(direct);
    let i=0;
    for(const row of data.runs){
      for(let j=0;j<row[0]&&i<919;j++,i++)stepRace(direct,{
        throttle:row[1],brake:row[2],steer:row[3]
      });
      if(i===919)break;
    }
    assert.deepEqual(spectator.race,direct);
    assert.throws(()=>spectator.advance(MAX_SEEK_STEPS+1),/batch/);
    assert.throws(()=>spectator.seekBatch(data.ticks+1),/target/);
    assert.throws(()=>spectator.step(),/ended before/,'partial tape must not claim a finish');
    assert.equal(reference.phase,'racing');
  }
});

test('spectator interpolates accepted snapshots at fractional speed without modifying race authority',()=>{
  const race=createRace(27,track);
  startRace(race);
  for(let tick=0;tick<180;tick++)stepRace(race);
  for(let tick=0;tick<80;tick++)stepRace(race,{throttle:1,brake:0,steer:0});
  const before=structuredClone(race);
  const poses=createReplayPoses();
  const atStart=interpolateReplayPoses(race,poses,0).map(p=>({...p,compression:p.compression.slice()}));
  const mid=interpolateReplayPoses(race,poses,.5).map(p=>({...p,compression:p.compression.slice()}));
  const atEnd=interpolateReplayPoses(race,poses,1).map(p=>({...p,compression:p.compression.slice()}));
  for(let i=0;i<poses.length;i++){
    assert.equal(mid[i].x,(atStart[i].x+atEnd[i].x)/2);
    assert.equal(mid[i].speed,(atStart[i].speed+atEnd[i].speed)/2);
    assert.equal(mid[i].compression[0],(atStart[i].compression[0]+atEnd[i].compression[0])/2);
  }
  assert.deepEqual(race,before,'presentation interpolation is read-only to simulation');
  assert.throws(()=>interpolateReplayPoses(race,poses,NaN),RangeError);
  assert.throws(()=>interpolateReplayPoses(race,poses,1.1),RangeError);
  const driver=race.player;
  const previous=driver.previous.yaw,current=driver.current.yaw;
  const delta=Math.atan2(Math.sin(current-previous),Math.cos(current-previous));
  assert(Math.abs(mid[driver.id].yaw-(previous+delta*.5))<1e-12);
});
