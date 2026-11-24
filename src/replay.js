// SPDX-License-Identifier: Apache-2.0
import {createRecording as touringRecording, replayCommands as touringCommands} from './replay-v2.js';
import {ROCKET_RULES,validateRocketCommand} from './rocket-dynamics.js';
import {validateNitroCommand} from './nitro-physics.js';
import {NITRO_RULES} from './nitro-race.js';
import {MAX_REPLAY_TICKS, decodeReplayRun, validateTheatreReplay} from './replay-theatre-core.js';

export function createRecording(course,seed,revision=null) {
  const rocket=course==='orbital';
  if (!rocket && course!=='skyway') return touringRecording(course,seed,revision);
  const validate=rocket ? validateRocketCommand : validateNitroCommand;
  const discipline=rocket ? 'rocket' : 'nitro';
  if (!Number.isSafeInteger(seed) || seed<0 || seed>0xffffffff ||
      (revision!==null && (typeof revision!=='string' || !/^[0-9a-f]{40}$/.test(revision)))) {
    throw RangeError('Invalid '+discipline+' recording header');
  }
  let ticks=0, overflow=false;
  const runs=[];
  return {
    record(command,recover) {
      validate(command);
      if (typeof recover!=='boolean') throw TypeError('Invalid recovery flag');
      if (ticks===MAX_REPLAY_TICKS) { overflow=true; return; }
      const {throttle,brake,steer,boost}=command;
      const row=rocket ? [1,throttle,brake,steer,boost,command.assist,command.dodge,recover] :
        [1,throttle,brake,steer,command.drift,boost,recover];
      const last=runs.at(-1);
      if (last && row.every((value,i)=>i===0 || last[i]===value)) last[0]++;
      else runs.push(row);
      ticks++;
    },
    get complete() { return revision!==null && ticks>0 && !overflow; },
    export() {
      if (!this.complete) throw RangeError('A replay requires a stamped build and at most 30 minutes.');
      const rules=rocket ? ROCKET_RULES : NITRO_RULES;
      return {version:rocket ? 4 : 3,revision,discipline,rules,course,seed,ticks,runs:runs.map(r=>r.slice())};
    }
  };
}

export function* replayCommands(data,expectedRevision) {
  const version=Object.getOwnPropertyDescriptor(data??{},'version')?.value;
  if (version!==3 && version!==4) {
    yield* touringCommands(data,expectedRevision);
    return;
  }
  const tape=validateTheatreReplay(data,expectedRevision);
  for (const row of tape.runs) {
    for (let tick=0;tick<row[0];tick++) yield decodeReplayRun(tape.version,row);
  }
}
