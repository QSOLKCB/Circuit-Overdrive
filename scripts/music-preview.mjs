// SPDX-License-Identifier: Apache-2.0
// Developer-only deterministic WAV export. Does not ship in the public game.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readSite} from './package-site.mjs';
import {createBoundedPhraseSequencer} from '../src/bps.js';
import {musicForCourse} from '../src/music.js';
import {scoreForCourse,MUSIC_TITLES,scoreForFutureMode,FUTURE_MUSIC_TITLES} from '../src/music-scores.js';

assert.equal(process.argv.length,3,'Usage: node scripts/music-preview.mjs NEW_DIRECTORY');
const output=resolve(process.argv[2]);
// Stamp only the immutable Git revision whose runtime blobs match these bytes.
// A dirty development checkout is allowed to preview music, but is unstamped.
const {revision}=await readSite(fileURLToPath(new URL('../',import.meta.url)));
await mkdir(output); // The caller supplies a non-existent directory. Never overwrite audio.
const receipts=[];
for(const mode of [...Object.keys(MUSIC_TITLES),...Object.keys(FUTURE_MUSIC_TITLES)]){
  const live=Object.hasOwn(MUSIC_TITLES,mode);
  const source=live?scoreForCourse(mode):scoreForFutureMode(mode);
  const compiled=live?musicForCourse(mode):createBoundedPhraseSequencer(source);
  const entry={format:'qsol.circuit-overdrive.music-score.v1',revision,
    mode,status:live?'playable':'future-mode-only',
    title:live?MUSIC_TITLES[mode]:FUTURE_MUSIC_TITLES[mode],score:source};
  const bytes=new TextEncoder().encode(JSON.stringify(entry,null,2)+'\n');
  const wav=compiled.wavLoop();
  const files=[[mode+'-score.json',bytes],[mode+'-preview.wav',wav]];
  for(const [filename,data] of files) {
    await writeFile(resolve(output,filename),data,{flag:'wx'});
    receipts.push(createHash('sha256').update(data).digest('hex')+'  '+filename);
  }
  console.log(mode+' ('+(live?'live':'future')+'): '+compiled.bpm+' BPM, '+(compiled.loopSamples/compiled.sampleRate).toFixed(1)+' seconds, original stereo PCM16');
}
await writeFile(resolve(output,'SHA256SUMS'),receipts.sort().join('\n')+'\n',{flag:'wx'});
console.log('Reference WAVs, score sources and SHA256SUMS written to '+output);
