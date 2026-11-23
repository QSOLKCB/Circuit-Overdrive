// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {scoreForCourse,MUSIC_TITLES} from '../src/music-scores.js';
import {musicForCourse,RaceMusic} from '../src/music.js';
import {TouringAudio} from '../src/audio.js';
import {createRace} from '../src/sim.js';
import {ridge} from '../src/ridge.js';
import {track} from '../src/track.js';

test('four original score shapes compile to bounded stereo PCM and retain exact sample identity',()=>{
  const expected=[['speedway',120,768000],['ridge',150,614400],['championship',120,768000],['night',144,640000]];
  for(const [course,bpm,samples] of expected){
    const data=scoreForCourse(course);
    assert.equal(data.bpm,bpm);
    assert.equal(data.phrases.length,8);
    assert.equal(data.phrases.every(phrase=>['bass','lead','arp','drums'].every(
      lane=>phrase[lane].length===16)),true);
    const a=musicForCourse(course);
    assert.equal(a.loopSamples,samples);
    assert.equal(a.sampleRate,48000);
    assert.deepEqual(a.renderRange(0,4096),a.renderRange(samples,4096));
    assert(a.renderRange(0,4096).some(v=>v!==0));
    assert.equal(a.renderRange(0,4096).length,8192);
    assert.equal(MUSIC_TITLES[course].length>5,true);
  }
  assert.notDeepEqual(musicForCourse('speedway').renderRange(1200,1024),
    musicForCourse('ridge').renderRange(1200,1024));
  assert.throws(()=>scoreForCourse('..'),RangeError);
  assert.throws(()=>musicForCourse('..'),RangeError);
});

test('race soundtrack is deterministic, stereo and driven only by read-only accepted state',()=>{
  for(const course of [track,ridge]) {
    const race=createRace(27,course);
    const before=structuredClone(race);
    const a=new RaceMusic(course.id),b=new RaceMusic(course.id);
    for(const [phase,tick,position] of [['countdown',0,6],['racing',1,6],['racing',2,5],['racing',3,5]]) {
      race.phase=phase;race.elapsedTicks=tick;race.player.position=position;
      a.accept(race);b.accept(race);
      const al=new Float32Array(3072),ar=new Float32Array(3072);
      const bl=new Float32Array(3072),br=new Float32Array(3072);
      a.write(al,ar);b.write(bl,br);
      assert.deepEqual(al,bl);assert.deepEqual(ar,br);
      assert(al.some(v=>v!==0));assert(al.every(Number.isFinite));
      assert(ar.every(Number.isFinite));
      assert(al.some((v,i)=>v!==ar[i]),'source pan must survive stereo playback');
    }
    a.reset();assert.equal(a.position.phrase,0);
    assert.equal(a.frame,0);
    assert.equal(before.seed,race.seed);
    assert.equal(before.player.vehicle.tick,race.player.vehicle.tick);
  }
});

function fakeAudioContext(){
  const ctx={state:'suspended',currentTime:0,destination:{},buffers:[],sources:[]};
  ctx.resume=async()=>{ctx.state='running';};
  ctx.close=async()=>{ctx.state='closed';};
  ctx.createGain=()=>({gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},
    linearRampToValueAtTime(v){this.value=v;}},connect(){},disconnect(){}});
  ctx.createBuffer=(channels,length)=>{
    const data=Array.from({length:channels},()=>new Float32Array(length));
    const buffer={numberOfChannels:channels,getChannelData:index=>data[index],duration:length/48000};
    ctx.buffers.push(buffer);return buffer;
  };
  ctx.createBufferSource=()=>{
    const node={connect(){},disconnect(){},start(at){this.at=at;},stop(at){this.stopAt=at;}};
    ctx.sources.push(node);return node;
  };
  ctx.advance=seconds=>{
    ctx.currentTime+=seconds;
    for(const source of ctx.sources)if(source.onended && ctx.currentTime>
      Math.min(source.at+source.buffer.duration,source.stopAt??Infinity))source.onended();
  };
  return ctx;
}
test('soundtrack shares one gesture-owned device, remains optional and survives pause',async()=>{
  const ctx=fakeAudioContext(),race=createRace(27,track);
  let opened=0;
  const audio=new TouringAudio({contextFactory:()=>{opened++;return ctx;}});
  assert.equal(audio.selectMusic('speedway'),true);
  assert.equal(opened,0,'no audio device until explicit gesture');
  assert(await audio.start());assert.equal(opened,1);
  assert.equal(ctx.buffers.length,8,'4 mono engine + 4 stereo music buffers');
  assert.equal(ctx.buffers.filter(v=>v.numberOfChannels===2).length,4);
  race.phase='countdown';audio.update(race.player,{throttle:0,brake:0,steer:0},track,race);
  ctx.advance(.08);
  race.phase='racing';race.elapsedTicks++;
  audio.update(race.player,{throttle:1,brake:0,steer:0},track,race);
  assert(ctx.sources.some(s=>s.buffer.numberOfChannels===2 &&
    s.buffer.getChannelData(0).some(x=>x!==0)),'music PCM scheduled');
  assert(ctx.sources.some(s=>s.buffer.numberOfChannels===1),'engine PCM preserved');
  const count=ctx.sources.length;
  audio.setVolume('music',0);
  audio.stop();ctx.advance(.2);
  audio.update(race.player,{},track,race);
  assert.equal(ctx.sources.length,count);
  assert(await audio.start());audio.update(race.player,{},track,race);
  assert(ctx.sources.length>count,'music and engine start again after pause');
  assert.equal(opened,1,'no second AudioContext');
  assert.equal(ctx.buffers.length,8,'bounded buffer pool');
});

test('the live championship uses the complete v0.6.2 anthem and schedules only music on the podium', async () => {
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(JSON.stringify(scoreForCourse('championship'))),
    '4c53018c378a567cd22566085a6f1bad71e078003384f806536f7820792b7164');
  assert.equal(sha(musicForCourse('championship').wavLoop()),
    '84fc886c1d5bef8348f921cdba50f501ab59cd039c83407dd51f58a722f8ce8b');
  const ctx = fakeAudioContext();
  const audio = new TouringAudio({contextFactory:()=>ctx});
  assert(audio.selectMusic('championship'));
  assert.equal(ctx.buffers.length,0);
  assert(await audio.start());
  assert(audio.updateCelebration());
  assert(ctx.sources.length>0 && ctx.sources.every(s=>s.buffer.numberOfChannels===2));
  assert(ctx.sources.some(s=>s.buffer.getChannelData(0).some(x=>x!==0)));
  audio.stop();
  ctx.advance(.2);
  const count = ctx.sources.length;
  assert(audio.updateCelebration());
  assert.equal(ctx.sources.length,count);
  assert(await audio.start());
  ctx.state='interrupted';
  assert.equal(audio.updateCelebration(),false);
});

test('Nightshift plays the exact v0.7.0 Midnight Protocol score through the live mixer', async () => {
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const score = scoreForCourse('night');
  assert.equal(score.mode,'cyberpunk');
  assert.equal(new RaceMusic('night').title,'MIDNIGHT PROTOCOL');
  assert.equal(sha(JSON.stringify(score)),'75afc3be8595a643d426cf3dc02c6e8f6b08fdd6077099e8e882d89d0c9f0a5a');
  assert.equal(sha(musicForCourse('night').wavLoop()),'79f704e0f1cacc85fd1f03b67356dddd5cf3d6d8625b157ec0ceeb40e3c50da6');
  const ctx = fakeAudioContext(), audio = new TouringAudio({contextFactory:()=>ctx});
  const race = createRace(27,ridge);
  assert(audio.selectMusic('night'));
  assert.equal(ctx.buffers.length,0);
  assert(await audio.start());
  race.phase='countdown';
  assert(audio.update(race.player,{throttle:0,brake:0,steer:0},ridge,race));
  const stereo=ctx.sources.find(source=>source.buffer.numberOfChannels===2);
  const voice=new RaceMusic('night'),left=new Float32Array(3072),right=new Float32Array(3072);
  voice.accept(race);
  voice.write(left,right);
  assert.deepEqual(stereo.buffer.getChannelData(0),left);
  assert.deepEqual(stereo.buffer.getChannelData(1),right);
});
