// SPDX-License-Identifier: Apache-2.0
// Original QSOL-IMC race scores. Compact data, not sampled music or copyrighted melodies.
// BPS-001 owns synthesis, timing and PCM. These are authored mathematical arrangements.
export const MUSIC_TITLES=Object.freeze({speedway:'NEON HORIZON',ridge:'IRON HORSEPOWER',championship:'DIGITAL DOMINION',night:'MIDNIGHT PROTOCOL',nitro:'NITRO PULSE',rocket:'RASTER VELOCITY',derby:'STEEL RIOT'});

function phrase(root,melody,variation) {
  if (!Array.isArray(melody) || melody.length!==16) throw RangeError('16 melody steps required');
  const bass=Array.from({length:16},(_,i)=>
    i===0||i===8?root:i===4?root+7:i===12?root+12:null);
  const intervals=variation%2===0?[12,19,24,19,12,19,22,19]:[12,15,19,22,12,15,19,24];
  const arp=Array.from({length:16},(_,i)=>root+intervals[(i+variation)%intervals.length]);
  const drums=Array.from({length:16},(_,i)=>{
    if(i===0||i===8||variation%3===2&&i===10)return 'K';
    if(i===4||i===12)return 'S';
    return i%2===0||variation%2===1&&i%4===3?'H':'.';
  });
  return {bass,lead:melody.slice(),arp,drums};
}
const N=null;
// Pedal-point bass under an off-beat pickup. The second half answers the
// opening motif a fifth higher, then walks down into the looping first note.
function nitroPulse() {
  const roots = [42,42,38,45,42,47,38,37];
  const leads = [
    [N,24,27,N,31,N,26,27,N,24,N,19,22,N,N,26],
    [27,N,26,24,N,19,N,22,24,N,31,N,29,27,N,26],
    [N,28,N,26,23,26,N,28,31,N,30,N,26,23,N,19],
    [24,N,28,31,N,26,28,N,23,N,21,19,N,16,N,23],
    [N,31,34,N,38,N,33,34,N,31,N,26,29,N,33,36],
    [31,N,28,26,N,23,N,21,19,N,26,N,28,N,31,33],
    [35,N,33,N,31,30,N,26,28,N,26,N,23,21,N,19],
    [N,31,N,29,26,N,24,N,22,N,19,17,N,14,17,24]
  ];
  return {id:'nitro-pulse',mode:'demoscene',bpm:160,seed:0x9df05a37,
    phrases:roots.map((root,bar)=>{
      const upper = [0,1,4,7].includes(bar) ? 3 : 4;
      const shimmer = [12,19,12+upper,24,19,26,12+upper,19];
      const bassLine = [0,N,0,12,N,7,N,0,0,N,12,N,7,N,bar%2 ? 10 : 7,N];
      const beat = bar===7 ? 'K.H.S.HKK.H.SSHS' : bar%2===0 ? 'K.H.SHK.H.K.S.HH' : 'K.HKS.H.KH.HS.HK';
      return {lead:leads[bar].map(n=>n===N?N:root+n),bass:bassLine.map(n=>n===N?N:root+n),
        arp:Array.from({length:16},(_,i)=>i%8===7 && bar<4 ? N : root+shimmer[(i+Math.floor(bar/2))%8]),
        drums:Array.from(beat)};
    })};
}
const NEON=Object.freeze([
  [45,[69,N,72,N,76,N,79,N,76,N,72,N,69,N,67,N]],
  [41,[69,N,72,N,76,N,72,N,69,N,67,N,64,N,67,N]],
  [43,[67,N,71,N,74,N,79,N,74,N,71,N,67,N,71,N]],
  [40,[64,N,67,N,72,N,76,N,79,N,76,N,72,N,67,N]],
  [45,[81,N,79,N,76,N,72,N,76,N,79,N,84,N,79,N]],
  [41,[76,N,72,N,69,N,72,N,76,N,79,N,76,N,72,N]],
  [38,[74,N,77,N,81,N,77,N,74,N,72,N,69,N,65,N]],
  [43,[71,N,74,N,79,N,74,N,71,N,67,N,69,N,72,N]]
]);
const IRON=Object.freeze([
  [40,[52,N,52,N,55,N,52,57,52,N,50,N,52,N,59,N]],
  [43,[55,N,55,55,58,N,55,N,62,N,58,N,55,N,53,N]],
  [38,[50,N,50,N,53,N,57,53,50,N,45,N,48,N,50,N]],
  [45,[57,N,57,N,60,N,64,N,60,N,57,55,57,N,64,N]],
  [40,[64,N,59,N,55,N,52,55,59,N,64,N,67,N,64,N]],
  [43,[55,N,58,N,62,N,65,N,62,N,58,55,53,N,55,N]],
  [38,[62,N,57,N,53,N,50,N,53,N,57,N,62,60,57,N]],
  [40,[52,52,N,55,52,N,59,N,52,N,50,N,52,N,64,N]]
]);


// Registration for catalogue-only tracks, used by the local WAV exporter.
export const FUTURE_MUSIC_TITLES=Object.freeze({});
const FUTURE_PROFILES=Object.freeze({
  rocket:Object.freeze({id:'raster-velocity',mode:'demoscene',bpm:180,seed:0x0510f00d,
    roots:[40,43,45,38,40,45,47,43]}),
  night:Object.freeze({id:'midnight-protocol',mode:'cyberpunk',bpm:144,seed:0x00c7b009,
    roots:[36,39,41,38,36,43,41,39]}),
  championship:Object.freeze({id:'digital-dominion',mode:'anthem',bpm:120,seed:0x07c0ffee,
    roots:[45,41,38,43,45,41,43,45]}),
  derby:Object.freeze({id:'steel-riot',mode:'industrial',bpm:150,seed:0x057ee17a,
    roots:[33,36,38,31,33,38,36,33]})
});
// The melodies are original relative semitone contours, not excerpts from any
// external track. Each motif is sixteen sixteenth-note positions with rests.
const FUTURE_MELODIES=Object.freeze({
  rocket:[
    [24,N,27,31,36,N,31,27,24,22,19,N,22,27,31,N],
    [19,24,N,31,27,N,24,19,15,19,N,24,27,24,N,22],
    [27,31,34,31,27,N,24,22,19,22,24,27,31,N,34,N],
    [24,N,31,24,27,31,N,36,34,31,27,N,24,22,19,N]
  ],
  night:[
    [12,N,N,15,N,19,N,N,17,N,15,N,12,N,10,N],
    [10,N,12,N,N,19,N,17,N,15,N,N,12,N,10,N],
    [12,N,18,N,19,N,N,15,N,12,N,10,N,7,N,N],
    [19,N,17,N,15,N,N,12,N,10,N,7,N,12,N,N]
  ],
  championship:[
    [24,N,28,N,31,N,36,N,31,N,28,N,24,28,31,N],
    [19,N,24,28,31,N,36,N,38,N,36,N,31,N,28,N],
    [24,26,28,N,31,33,35,N,36,N,35,N,33,31,28,N],
    [31,N,28,N,24,28,31,36,40,N,36,N,31,N,28,N]
  ],
  derby:[
    [12,12,N,19,12,N,15,12,N,19,12,10,N,12,19,N],
    [12,N,12,19,N,12,15,N,12,12,19,N,10,12,N,12],
    [19,N,12,N,10,12,19,N,24,N,19,15,12,N,10,N],
    [12,12,12,N,19,N,12,10,12,19,12,N,15,12,10,N]
  ]
});
function futurePhrase(root,motif,index,mode) {
  const lead=motif.map(interval=>interval===N?N:root+interval+(index>=4 && index%2===0 ? 2 : 0));
  const bass=Array.from({length:16},(_,step)=>{
    if(mode==='demoscene')
      return [0,3,6,8,11,14].includes(step) ? root+(step===6||step===14?7:step===8?12:0):N;
    if(mode==='cyberpunk')
      return [0,6,8,14].includes(step) ? root+(step===8?12:0):N;
    if(mode==='anthem')
      return [0,4,8,12].includes(step) ? root+(step===4?7:step===8?12:0):N;
    return [0,2,3,6,8,10,11,14].includes(step) ? root+(step===6||step===14?7:0):N;
  });
  const patterns={
    demoscene:[12,19,24,31,24,19,15,12],
    cyberpunk:[12,15,19,22,19,15,10,7],
    anthem:[12,16,19,24,28,24,19,16],
    industrial:[12,19,12,19,0,7,12,19]
  };
  const intervals=patterns[mode];
  const arp=Array.from({length:16},(_,step)=>{
    if(mode==='cyberpunk' && ![0,3,6,10,13].includes(step))return N;
    if(mode==='anthem' && step%2!==0)return N;
    if(mode==='industrial' && step%2!==0 && step!==7 && step!==15)return N;
    return root+intervals[(step+index)%intervals.length];
  });
  const drums=Array.from({length:16},(_,step)=>{
    if(mode==='demoscene'){
      if([0,6,8,14].includes(step))return 'K';
      if([4,12].includes(step))return 'S';
      return step%2!==0?'H':'.';
    }
    if(mode==='cyberpunk'){
      if([0,8,11].includes(step))return 'K';
      if([4,12].includes(step))return 'S';
      return [2,6,10,14].includes(step)?'H':'.';
    }
    if(mode==='anthem'){
      if([0,8].includes(step))return 'K';
      if([4,12].includes(step))return 'S';
      return step%2===0?'H':'.';
    }
    if([0,3,6,8,11,14].includes(step))return 'K';
    if([4,12].includes(step))return 'S';
    return step%2===0||step===15?'H':'.';
  });
  return {bass,lead,arp,drums};
}
function catalogueScore(mode) {
  const profile=FUTURE_PROFILES[mode],motifs=FUTURE_MELODIES[mode];
  return {id:profile.id,mode:profile.mode,bpm:profile.bpm,seed:profile.seed,
    phrases:profile.roots.map((root,index)=>futurePhrase(root,motifs[index%motifs.length],index,profile.mode))};
}

export function scoreForFutureMode(mode) {
  if (!Object.hasOwn(FUTURE_MUSIC_TITLES,mode)) throw RangeError('Unknown future soundtrack');
  return catalogueScore(mode);
}

export function scoreForCourse(course) {
  if (course==='nitro') return nitroPulse();
  if (course==='championship' || course==='night' || course==='rocket' || course==='derby') return catalogueScore(course);
  if(!Object.hasOwn(MUSIC_TITLES,course))throw RangeError('Unknown music course');
  const ridge=course==='ridge',form=ridge?IRON:NEON;
  return {
    id:ridge?'iron-horsepower':'neon-horizon',
    mode:ridge?'industrial':'synthwave',
    bpm:ridge?150:120,
    seed:ridge?0x1a70babe:0x0ea02727,
    phrases:form.map(([root,melody],index)=>phrase(root,melody,index))
  };
}
