// SPDX-License-Identifier: Apache-2.0
// Original QSOL-IMC race scores. Compact data, not sampled music or copyrighted melodies.
// BPS-001 owns synthesis, timing and PCM. These are authored mathematical arrangements.
export const MUSIC_TITLES=Object.freeze({speedway:'NEON HORIZON',ridge:'IRON HORSEPOWER'});

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

export function scoreForCourse(course) {
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
