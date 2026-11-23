// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {BPS_RATE,BPS_TICK_SAMPLES,createBoundedPhraseSequencer} from '../src/bps.js';

const pattern = Object.freeze({
  bass:[45,null,null,null,43,null,null,null,41,null,null,null,43,null,null,null],
  lead:[69,null,72,null,76,null,72,null,69,null,67,null,64,null,67,null],
  arp:[57,64,69,64,55,62,67,62,53,60,65,60,55,62,67,62],
  drums:['K','H','H','H','S','H','K','H','K','H','H','H','S','H','K','H']
});
const score=()=>({id:'neon-test',bpm:120,mode:'synthwave',seed:27,phrases:[structuredClone(pattern),structuredClone(pattern)]});
test('bounded phrase compiler renders repeatable, non-silent 48 kHz stereo PCM',()=>{
  const a=createBoundedPhraseSequencer(score()),b=createBoundedPhraseSequencer(score());
  assert.equal(a.sampleRate,BPS_RATE);assert.equal(a.stepSamples,6000);
  assert.equal(a.loopSamples,192000);
  assert.deepEqual(a.renderLoop(),b.renderLoop());
  assert(a.renderRange(0,1024).some(n=>n!==0));
  assert(a.renderLoop().every(n=>Number.isFinite(n)&&Math.abs(n)<=32767));
  assert.equal(a.atTick(1).sample,BPS_TICK_SAMPLES);
  assert.equal(a.position(a.loopSamples).phrase,0);
});
test('arbitrary chunking and loop wrap reproduce the same exact samples',()=>{
  const a=createBoundedPhraseSequencer(score()),start=a.loopSamples-951;
  const whole=a.renderRange(start,4096);
  const chunks=[a.renderRange(start,1),a.renderRange(start+1,1517),a.renderRange(start+1518,2578)];
  assert.deepEqual(whole,Int16Array.from(chunks.flatMap(c=>Array.from(c))));
  const wrapped=a.renderRange(a.loopSamples,1024);
  assert.deepEqual(wrapped,a.renderRange(0,1024));
  const wav=a.wavLoop();assert.equal(String.fromCharCode(...wav.slice(0,4)),'RIFF');
  assert.equal(new DataView(wav.buffer).getUint32(24,true),BPS_RATE);
});
test('seed and genre affect timbre while all four available phrases remain bounded',()=>{
  const a=createBoundedPhraseSequencer(score());
  const other=score();other.seed=28;
  const industrial=score();industrial.mode='industrial';
  assert.notDeepEqual(a.renderRange(0,3000),createBoundedPhraseSequencer(other).renderRange(0,3000));
  assert.notDeepEqual(a.renderRange(20000,3000),createBoundedPhraseSequencer(industrial).renderRange(20000,3000));
});
test('rejects hostile score shapes, non-aligned BPM, sparse patterns and invalid frame spans',()=>{
  const bad=[{...score(),bpm:127},{...score(),seed:-1},{...score(),id:'bad id'},
    {...score(),mode:'javascript'},{...score(),phrases:[]},
    {...score(),phrases:Array.from({length:9},()=>structuredClone(pattern))}];
  for(const data of bad)assert.throws(()=>createBoundedPhraseSequencer(data));
  const hole=score();delete hole.phrases[0].bass[3];
  assert.throws(()=>createBoundedPhraseSequencer(hole));
  const accessor=score();Object.defineProperty(accessor,'mode',{get(){throw Error('getter executed');},enumerable:true});
  assert.throws(()=>createBoundedPhraseSequencer(accessor),/score field/);
  const a=createBoundedPhraseSequencer(score());
  assert.throws(()=>a.renderRange(-1,10),RangeError);
  assert.throws(()=>a.renderRange(Number.MAX_SAFE_INTEGER,20),RangeError);
  assert.throws(()=>a.renderRange(0,49*BPS_RATE),RangeError);
});
