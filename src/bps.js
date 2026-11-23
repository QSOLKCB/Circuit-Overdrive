// SPDX-License-Identifier: Apache-2.0
// BPS-001: bounded, source-owned, sample-indexed stereo score compilation.
// Pure data-to-PCM. No browser globals, ambient randomness, I/O, or clock.
// SID/Paula *inspired* timbres, not cycle-accurate chip emulation.
export const BPS_RATE = 48000;
export const BPS_TICK_SAMPLES = 800; // one 60 Hz simulation tick
export const BPS_FORMAT = 'qsol.circuit-overdrive.bps.v1';
const STEPS = 16, MAX_PHRASES = 8, MAX_SAMPLES = 48*BPS_RATE;
const LANES = ['bass','lead','arp','drums'];
const MODES = ['synthwave','industrial','demoscene','cyberpunk','anthem'];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const int = (v,a,b,label) => {
  if (!Number.isSafeInteger(v) || v<a || v>b) throw RangeError(label);
  return v;
};
function plain(object,allowed,label) {
  if (!object || typeof object!=='object' ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(object))) throw TypeError(label);
  for (const [key,desc] of Object.entries(Object.getOwnPropertyDescriptors(object)))
    if (!allowed.includes(key) || !Object.hasOwn(desc,'value') || !desc.enumerable) throw TypeError(label+' field: '+key);
}
function dense(values,name) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values)!==Array.prototype ||
      values.length!==STEPS || Reflect.ownKeys(values).length!==STEPS+1) throw RangeError(name+' must contain 16 dense steps');
}
function scoreLength(score) {
  plain(score,['id','bpm','seed','mode','phrases'],'score');
  if (typeof score.id!=='string' || !/^[a-z][a-z0-9-]{2,35}$/.test(score.id)) throw RangeError('score id');
  int(score.bpm,90,220,'bpm');int(score.seed,0,0xffffffff,'seed');
  if (!MODES.includes(score.mode)) throw RangeError('mode');
  if (!Array.isArray(score.phrases) || Object.getPrototypeOf(score.phrases)!==Array.prototype ||
      score.phrases.length<1 || score.phrases.length>MAX_PHRASES ||
      Reflect.ownKeys(score.phrases).length!==score.phrases.length+1) throw RangeError('phrases');
  const stepSamples=BPS_RATE*60/(score.bpm*4);
  if (!Number.isSafeInteger(stepSamples)) throw RangeError('bpm must align with sample frames');
  if (score.phrases.length*STEPS*stepSamples>MAX_SAMPLES) throw RangeError('score exceeds PCM budget');
  for (const phrase of score.phrases) {
    plain(phrase,LANES,'phrase');
    for (const lane of LANES) {
      dense(phrase[lane],lane);
      for (const value of phrase[lane]) {
        if (lane==='drums') {
          if (!['.','K','S','H'].includes(value)) throw RangeError('drum symbol');
        } else if (value!==null) int(value,24,96,'MIDI pitch');
      }
    }
  }
  return stepSamples;
}
function random32(seed) {
  let s=seed>>>0||0x6d2b79f5;
  return () => {s^=s<<13;s^=s>>>17;s^=s<<5;return s>>>0;};
}
const pitch = midi => 440*2**((midi-69)/12);
const soft = sample => sample/(1+.78*Math.abs(sample));
function adsr(i,total,attack,decay,sustain,gate) {
  if(i<attack)return (i+1)/Math.max(1,attack);
  if(i<attack+decay)return 1-(1-sustain)*(i-attack+1)/Math.max(1,decay);
  if(i<gate)return sustain;
  return sustain*clamp((total-i-1)/Math.max(1,total-gate),0,1);
}
function noteInto(left,right,offset,limit,note,lane,mode,seed,stepSamples) {
  const length=Math.min(limit-offset,stepSamples*(lane==='bass'?4:lane==='lead'?2:1));
  if(length<=0)return;
  const f=pitch(note);
  const attack=Math.floor(BPS_RATE*(lane==='bass'?.004:lane==='lead'?.011:.002));
  const decay=Math.floor(BPS_RATE*(lane==='bass'?.105:.08));
  const gate=Math.max(1,length-Math.min(Math.floor(BPS_RATE*.065),Math.floor(length*.3)));
  const sustain=lane==='bass'?.68:lane==='lead'?.61:.42;
  const volume=lane==='bass'?.19:lane==='lead'?.13:.073;
  const pan=lane==='bass'?0:lane==='lead'?.33:-.36;
  const guitar=mode==='industrial'&&lane==='lead';
  const rng=random32(seed);
  const delaySize=guitar?clamp(Math.round(BPS_RATE/f),8,4096):0;
  const delay=guitar?Float64Array.from({length:delaySize},()=>((rng()&65535)/32767.5-1)*.65):null;
  let head=0;
  for(let i=0;i<length;i++){
    const t=i*f/BPS_RATE,phase=t-Math.floor(t);
    let wave;
    if(guitar){
      const x=delay[head],next=delay[(head+1)%delaySize];
      delay[head]=(x+next)*.493;
      head=(head+1)%delaySize;
      wave=soft((x+Math.sin(6.283185307179586*t)*.12)*3.2);
    } else if(lane==='bass')wave=(phase<.40?1:-1)*.76+(2*phase-1)*.24;
    else if(mode==='demoscene')wave=(phase<.25?1:-1)*.7+(1-4*Math.abs(phase-.5))*.3;
    else if(mode==='industrial')wave=soft((2*phase-1)*2.5);
    else wave=(phase<.36?1:-1)*.55+(1-4*Math.abs(phase-.5))*.45;
    const value=wave*volume*adsr(i,length,attack,decay,sustain,gate);
    left[offset+i]+=value*(1-pan*.5);
    right[offset+i]+=value*(1+pan*.5);
  }
}
function drumInto(left,right,start,limit,symbol,seed) {
  if(symbol==='.')return;
  const samples=Math.min(limit-start,Math.floor(BPS_RATE*(symbol==='K'?.22:symbol==='S'?.16:.075)));
  const rng=random32(seed);
  for(let i=0;i<samples;i++) {
    const t=i/BPS_RATE,noise=(rng()&65535)/32767.5-1;
    const env=(1-i/samples)**(symbol==='H'?2:1.5);
    const tone=symbol==='K' ? Math.sin(6.283185307179586*(45*t+2.7*(1-Math.exp(-t/.027))))*.27+noise*.013 :
      symbol==='S' ? noise*.16+Math.sin(6.283185307179586*175*t)*.06 : noise*.105;
    left[start+i]+=tone*env;
    right[start+i]+=tone*env*(symbol==='H'?.75:1);
  }
}
function phrasePCM(phrase,mode,seed,stepSamples) {
  const frames=STEPS*stepSamples,left=new Float64Array(frames),right=new Float64Array(frames);
  for(let step=0;step<STEPS;step++){
    for(let lane=0;lane<3;lane++){
      const name=LANES[lane],note=phrase[name][step];
      if(note!==null)noteInto(left,right,step*stepSamples,frames,note,name,mode,
        (seed^Math.imul(step+1,7919)^lane)>>>0,stepSamples);
    }
    drumInto(left,right,step*stepSamples,frames,phrase.drums[step],
      (seed^Math.imul(step+1,1097))>>>0);
  }
  const result=new Int16Array(frames*2),fade=96;
  for(let i=0;i<frames;i++){
    // Gentle envelope at each 16-step phrase boundary, avoiding a hard cut.
    const edge=Math.min(1,(i+1)/fade,(frames-i)/fade);
    result[2*i]=Math.round(clamp(soft(left[i]*edge),-1,1)*32760);
    result[2*i+1]=Math.round(clamp(soft(right[i]*edge),-1,1)*32760);
  }
  return result;
}
function wav(samples) {
  const data=new Uint8Array(44+samples.length*2),dv=new DataView(data.buffer);
  const ascii=(offset,str)=>{for(let i=0;i<str.length;i++)dv.setUint8(offset+i,str.charCodeAt(i));};
  ascii(0,'RIFF');dv.setUint32(4,36+samples.length*2,true);ascii(8,'WAVE');ascii(12,'fmt ');
  dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,2,true);
  dv.setUint32(24,BPS_RATE,true);dv.setUint32(28,BPS_RATE*4,true);
  dv.setUint16(32,4,true);dv.setUint16(34,16,true);ascii(36,'data');dv.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++)dv.setInt16(44+i*2,samples[i],true);
  return data;
}
/** Compile a score of up to eight 16-step phrases. Playback does not re-run filters.
 * renderRange uses *absolute output frames*, may cross loops, and is chunk-invariant.
 */
export function createBoundedPhraseSequencer(score) {
  const stepSamples=scoreLength(score),phraseSamples=stepSamples*STEPS;
  const phrases=score.phrases.map((p,i)=>phrasePCM(p,score.mode,
    (score.seed^Math.imul(i+1,0x9e3779b9))>>>0,stepSamples));
  const loopSamples=phraseSamples*phrases.length;
  const position=frame=> {
    int(frame,0,Number.MAX_SAFE_INTEGER,'absolute sample');
    const local=frame%loopSamples;
    return {phrase:Math.floor(local/phraseSamples),sample:local%phraseSamples};
  };
  return Object.freeze({
    format:BPS_FORMAT,id:score.id,mode:score.mode,seed:score.seed,bpm:score.bpm,
    sampleRate:BPS_RATE,stepSamples,phraseSamples,phraseCount:phrases.length,loopSamples,
    position,
    atTick(tick) {
      int(tick,0,Math.floor(Number.MAX_SAFE_INTEGER/BPS_TICK_SAMPLES),'tick');
      return position(tick*BPS_TICK_SAMPLES);
    },
    renderRange(start,count) {
      int(start,0,Number.MAX_SAFE_INTEGER,'absolute sample');
      int(count,0,MAX_SAMPLES,'range samples');
      if(start+count>Number.MAX_SAFE_INTEGER)throw RangeError('range overflow');
      const out=new Int16Array(count*2);
      let written=0;
      while(written<count) {
        const {phrase,sample}=position(start+written);
        const take=Math.min(count-written,phraseSamples-sample);
        out.set(phrases[phrase].subarray(sample*2,(sample+take)*2),written*2);
        written+=take;
      }
      return out;
    },
    renderLoop() {return this.renderRange(0,loopSamples);},
    wavLoop(){return wav(this.renderLoop());}
  });
}
