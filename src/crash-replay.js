// SPDX-License-Identifier: Apache-2.0
import {LAB_RULES} from './crash-impact.js';
import {LAB_TICKS} from './crash-trial.js';
import {validateLabCommand} from './crash-damage.js';

export function crashRecorder(trial) {
  const runs=[];let ticks=0;
  return {
    record(cmd){
      validateLabCommand(cmd);
      if(trial.world.tick!==ticks+1 || ticks>=LAB_TICKS)throw Error('Record each accepted experiment tick once');
      const last=runs.at(-1);
      if(last && last[1]===cmd.throttle && last[2]===cmd.brake && last[3]===cmd.steer)last[0]++;
      else runs.push([1,cmd.throttle,cmd.brake,cmd.steer]);
      ticks++;
    },
    export(){
      if(trial.phase!=='finished' || !trial.world.revision || ticks!==trial.world.tick || ticks<1)
        throw Error('A complete source-stamped experiment is required');
      return {version:5,revision:trial.world.revision,discipline:'crash-lab',rules:LAB_RULES,
        scenario:trial.scenario,seed:trial.seed,ticks,runs:runs.map(row=>row.slice())};
    }
  };
}
async function digest(data) {
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function crashReceipt(tape,trial,runtime) {
  const {world}=trial;
  if(trial.phase!=='finished' || tape.version!==5 || tape.revision!==world.revision ||
      tape.scenario!==trial.scenario || tape.seed!==trial.seed || tape.ticks!==world.tick)
    throw Error('Receipt requires matching input and a terminal experiment');
  const final={tick:world.tick,result:trial.result,cars:structuredClone(world.cars),
    contactLatches:world.pairs.map(p=>[p.a.id,p.b.id,p.active])};
  const contacts=structuredClone(trial.contacts);
  const [inputSha256,contactsSha256,finalStateSha256]=await Promise.all([digest(tape.runs),digest(contacts),digest(final)]);
  return {format:'circuit-overdrive.crash-receipt.1',revision:tape.revision,discipline:'crash-lab',rules:LAB_RULES,
    scenario:trial.scenario,seed:trial.seed,ticks:world.tick,runtime,inputSha256,contactsSha256,finalStateSha256,
    impactIds:contacts.filter(c=>c.newImpact).map(c=>c.id),contacts,final};
}
