// SPDX-License-Identifier: Apache-2.0
// Read-only racing soundtrack presentation. No race physics mutations or ambient RNG.
import {createBoundedPhraseSequencer,BPS_RATE} from './bps.js';
import {scoreForCourse,MUSIC_TITLES} from './music-scores.js';

const cache=new Map();
export function musicForCourse(course) {
  if(!Object.hasOwn(MUSIC_TITLES,course))throw RangeError('Unknown soundtrack');
  if(!cache.has(course))cache.set(course,createBoundedPhraseSequencer(scoreForCourse(course)));
  return cache.get(course);
}
/** Deterministic PCM reader. Audio is rendered in sample-indexed chunks, never wall-time indexed.
 * The accepted simulation state controls intensity only, not the score's note positions.
 * The Web Audio clock is used to schedule speaker output, not to compose it.
 */
export class RaceMusic {
  constructor(course) {
    this.score=musicForCourse(course);
    this.course=course;
    this.reset();
  }
  reset() {
    this.frame=0;
    this.level=0;
    this.target=.34; // filtered countdown accompaniment
    this.tick=0;
    this.lastPosition=6;
    this.accentUntil=0;
  }
  accept(race) {
    if(!race || !race.player || !Number.isSafeInteger(race.elapsedTicks) || race.elapsedTicks<0)
      throw RangeError('Invalid music race snapshot');
    const tick=race.elapsedTicks,player=race.player;
    if(!Number.isSafeInteger(player.position)||player.position<1||player.position>6)
      throw RangeError('Invalid music race position');
    if(tick<this.tick)throw RangeError('Music race tick moved backwards');
    if(race.phase==='countdown') this.target=.34;
    else if(race.phase==='racing') {
      const final= race.course.closed ? player.lap>=3 : player.splitTicks.length>=5;
      this.target=final?1.03:.80;
      if(player.position<this.lastPosition)this.accentUntil=tick+90;
    } else this.target=0;
    this.tick=tick;
    this.lastPosition=player.position;
  }
  write(left,right) {
    if(!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length!==right.length ||
       left.length>4096)throw RangeError('Expected bounded stereo buffers');
    const pcm=this.score.renderRange(this.frame,left.length);
    const accent=this.tick<this.accentUntil?.09:0;
    for(let i=0;i<left.length;i++){
      // Smooth state changes over ~30 ms without changing the authored waveform.
      this.level+=(this.target-this.level)*.0007;
      const gain=Math.min(1.13,this.level+accent);
      left[i]=(pcm[2*i]/32768)*gain;
      right[i]=(pcm[2*i+1]/32768)*gain;
    }
    this.frame+=left.length;
    return left.length;
  }
  get position(){return this.score.position(this.frame);}
  get title(){return MUSIC_TITLES[this.course];}
  get sampleRate(){return BPS_RATE;}
}
