// SPDX-License-Identifier: Apache-2.0
import {createRecording as touringRecording, replayCommands as touringCommands} from './replay-v2.js';
import {validateNitroCommand} from './nitro-physics.js';
import {MAX_REPLAY_TICKS, validateTheatreReplay} from './replay-theatre-core.js';

export function createRecording(course,seed,revision=null) {
  if (course !== 'skyway') return touringRecording(course,seed,revision);
  if (!Number.isSafeInteger(seed) || seed<0 || seed>0xffffffff ||
      (revision!==null && (typeof revision!=='string' || !/^[0-9a-f]{40}$/.test(revision)))) {
    throw RangeError('Invalid Nitro recording header');
  }
  let ticks=0, overflow=false;
  const runs=[];
  return {
    record(command,recover) {
      validateNitroCommand(command);
      if (typeof recover!=='boolean') throw TypeError('Invalid recovery flag');
      if (ticks===MAX_REPLAY_TICKS) { overflow=true; return; }
      const {throttle,brake,steer,drift,boost}=command;
      const last=runs.at(-1);
      if (last && last[1]===throttle && last[2]===brake && last[3]===steer &&
          last[4]===drift && last[5]===boost && last[6]===recover) last[0]++;
      else runs.push([1,throttle,brake,steer,drift,boost,recover]);
      ticks++;
    },
    get complete() { return revision!==null && ticks>0 && !overflow; },
    export() {
      if (!this.complete) throw RangeError('Nitro replay requires a stamped build and at most 30 minutes.');
      return {version:3,revision,discipline:'nitro',rules:1,course,seed,ticks,runs:runs.map(r=>r.slice())};
    }
  };
}

export function* replayCommands(data,expectedRevision) {
  if (Object.getOwnPropertyDescriptor(data??{},'version')?.value!==3) {
    yield* touringCommands(data,expectedRevision);
    return;
  }
  const tape=validateTheatreReplay(data,expectedRevision);
  for (const [length,throttle,brake,steer,drift,boost,recover] of tape.runs) {
    for (let tick=0;tick<length;tick++) yield {command:{throttle,brake,steer,drift,boost},recover};
  }
}
