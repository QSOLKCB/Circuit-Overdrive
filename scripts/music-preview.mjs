// SPDX-License-Identifier: Apache-2.0
// Developer-only deterministic WAV export. Does not ship in the public game.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {musicForCourse} from '../src/music.js';
import {scoreForCourse,MUSIC_TITLES} from '../src/music-scores.js';

assert.equal(process.argv.length,3,'Usage: node scripts/music-preview.mjs NEW_DIRECTORY');
const output=resolve(process.argv[2]);
await mkdir(output); // The caller supplies a non-existent directory. Never overwrite audio.
let revision=null;
try { revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); }
catch { /* For a source snapshot without .git, the source is unstamped. */ }
const receipts=[];
for(const course of ['speedway','ridge']){
  const compiled=musicForCourse(course);
  const entry={format:'qsol.circuit-overdrive.music-score.v1',revision,course,title:MUSIC_TITLES[course],
    score:scoreForCourse(course)};
  const bytes=new TextEncoder().encode(JSON.stringify(entry,null,2)+'\n');
  const wav=compiled.wavLoop();
  const files=[[course+'-score.json',bytes],[course+'-preview.wav',wav]];
  for(const [filename,data] of files) {
    await writeFile(resolve(output,filename),data,{flag:'wx'});
    receipts.push(createHash('sha256').update(data).digest('hex')+'  '+filename);
  }
  console.log(course+': '+compiled.bpm+' BPM, '+(compiled.loopSamples/compiled.sampleRate).toFixed(1)+' seconds, original stereo PCM16');
}
await writeFile(resolve(output,'SHA256SUMS'),receipts.sort().join('\n')+'\n',{flag:'wx'});
console.log('Reference WAVs, score sources and SHA256SUMS written to '+output);
