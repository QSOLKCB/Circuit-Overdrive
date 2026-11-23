// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createBoundedPhraseSequencer} from '../src/bps.js';
import {musicForCourse} from '../src/music.js';
import {MUSIC_TITLES,FUTURE_MUSIC_TITLES,scoreForCourse,scoreForFutureMode} from '../src/music-scores.js';

const catalogue=[
  {id:'rocket',title:'RASTER VELOCITY',mode:'demoscene',bpm:180,frames:512000},
  {id:'night',title:'MIDNIGHT PROTOCOL',mode:'cyberpunk',bpm:144,frames:640000},
  {id:'derby',title:'STEEL RIOT',mode:'industrial',bpm:150,frames:614400}
];
test('three future scores have separate authored material and reproducible PCM, without activating future races',()=>{
  assert.deepEqual(Object.keys(MUSIC_TITLES),['speedway','ridge','championship']);
  assert.deepEqual(Object.keys(FUTURE_MUSIC_TITLES),catalogue.map(c=>c.id));
  const hashes=new Set();
  for(const {id,title,mode,bpm,frames} of catalogue){
    const source=scoreForFutureMode(id);
    assert.equal(FUTURE_MUSIC_TITLES[id],title);
    assert.equal(source.mode,mode);assert.equal(source.bpm,bpm);
    assert.equal(source.phrases.length,8);
    assert.notDeepEqual(source.phrases[0],source.phrases[1]);
    for(const phrase of source.phrases){
      for(const key of ['bass','lead','arp','drums'])assert.equal(phrase[key].length,16);
      assert(phrase.lead.some(value=>value!==null));
    }
    assert.deepEqual(scoreForFutureMode(id),source);
    const a=createBoundedPhraseSequencer(source),b=createBoundedPhraseSequencer(scoreForFutureMode(id));
    assert.equal(a.loopSamples,frames);
    const pcm=a.renderRange(4000,3072);
    assert.deepEqual(pcm,b.renderRange(4000,3072));
    assert(pcm.some(x=>x!==0));assert(pcm.every(v=>Number.isFinite(v)&&Math.abs(v)<=32767));
    const digest=createHash('sha256').update(new Uint8Array(pcm.buffer)).digest('hex');
    assert(!hashes.has(digest));hashes.add(digest);
    const off=frames-173;
    assert.deepEqual(a.renderRange(off,4096),Int16Array.from([
      ...a.renderRange(off,173),...a.renderRange(frames,3923)
    ]));
    assert.throws(()=>scoreForCourse(id),RangeError);
    assert.throws(()=>musicForCourse(id),RangeError);
  }
  for(const bad of ['unknown','__proto__'])assert.throws(()=>scoreForFutureMode(bad),RangeError);
});

test('WAV export emits six distinct score/WAV pairs and twelve valid SHA-256 receipts',async t=>{
  const tmp=await mkdtemp(join(tmpdir(),'circuit-music-catalogue-'));
  t.after(()=>rm(tmp,{recursive:true,force:true}));
  const root=fileURLToPath(new URL('../',import.meta.url));
  const dest=join(tmp,'soundtrack');
  const run=()=>spawnSync(process.execPath,['scripts/music-preview.mjs',dest],
    {cwd:root,encoding:'utf8',timeout:120000});
  const first=run();
  assert.equal(first.status,0,first.stderr||first.stdout);
  const ids=[...Object.keys(MUSIC_TITLES),...Object.keys(FUTURE_MUSIC_TITLES)];
  const files=await readdir(dest);
  assert.deepEqual(files.sort(),[...ids.flatMap(id=>[id+'-score.json',id+'-preview.wav']),'SHA256SUMS'].sort());
  const lines=(await readFile(join(dest,'SHA256SUMS'),'utf8')).trim().split('\n');
  assert.equal(lines.length,12);
  for(const line of lines){
    const match=/^([0-9a-f]{64})  ([a-z-]+\.(?:json|wav))$/.exec(line);
    assert(match,'well-formed local receipt');
    const contents=await readFile(join(dest,match[2]));
    assert.equal(createHash('sha256').update(contents).digest('hex'),match[1]);
  }
  const hashes=new Set();
  for(const id of ids){
    const wav=await readFile(join(dest,id+'-preview.wav'));
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.equal(wav.readUInt32LE(24),48000);
    assert.equal(wav.readUInt16LE(22),2);
    assert(wav.length>500000);
    hashes.add(createHash('sha256').update(wav).digest('hex'));
    const meta=JSON.parse(await readFile(join(dest,id+'-score.json'),'utf8'));
    assert.equal(meta.status,Object.hasOwn(MUSIC_TITLES,id)?'playable':'future-mode-only');
    assert.equal(meta.score.phrases.length,8);
  }
  assert.equal(hashes.size,6,'six distinct original scores');
  assert.notEqual(run().status,0,'an existing output folder must not be overwritten');
});
