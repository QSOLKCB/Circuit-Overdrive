// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreForCourse,MUSIC_TITLES} from '../src/music-scores.js';
import {musicForCourse,RaceMusic} from '../src/music.js';
import {TouringAudio} from '../src/audio.js';
import {createRace} from '../src/sim.js';
import {ridge} from '../src/ridge.js';
import {track} from '../src/track.js';

test('two original score shapes compile to bounded stereo PCM and retain exact sample identity',()=>{
  const expected=[['speedway',120,768000],['ridge',150,614400]];
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
