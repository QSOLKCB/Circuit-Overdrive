// SPDX-License-Identifier: Apache-2.0
// node tests/compare-legacy-races.mjs /path/to/clean/v0.8.0
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createReplaySession} from '../src/replay-theatre-core.js';

const baseline='8204da56fce6b40ab33cb66c684a2e780f3e3001';
const root=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
assert.equal(process.argv.length,3,'Pass a clean checkout of v0.8.0');
const referenceRoot=realpathSync(process.argv[2]);
assert.notEqual(referenceRoot,root);
function git(dir,...args) {
  return execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
}
function checkedRevision(dir) {
  const sha=git(dir,'rev-parse','HEAD');
  assert.equal(git(dir,'status','--porcelain','--','src','tracks','vendor','tests/driver.mjs'),'',
    'The code and data used for the comparison must match '+sha);
  return sha;
}
assert.equal(checkedRevision(referenceRoot),baseline);
const candidate=checkedRevision(root);
async function load(dir) {
  const module=filename=>import(pathToFileURL(join(dir,filename)).href);
  const [sim,{track},{ridge},{createRecording}]=await Promise.all([
    module('src/sim.js'),module('src/track.js'),module('src/ridge.js'),module('src/replay.js')]);
  return {sim,speedway:track,ridge,createRecording};
}
const prior=await load(referenceRoot), current=await load(root);
const {driverIntent}=await import(pathToFileURL(join(referenceRoot,'tests/driver.mjs')).href);
const seed=708;
const results=[];
for (const name of ['speedway','ridge']) {
  const course=prior[name], a=prior.sim.createRace(seed,course), b=current.sim.createRace(seed,current[name]);
  // Give both encoders the same real release stamp, so all tape bytes must match.
  const original=prior.createRecording(name,seed,baseline), exported=current.createRecording(name,seed,baseline);
  prior.sim.startRace(a);
  current.sim.startRace(b);
  let contactTicks=0, recovered=false, ticks=0;
  const checkpoints=createHash('sha256');
  while (a.phase!=='finished' && ticks<24000) {
    const command=driverIntent(a.player.current,30,contactTicks ? 0 : course.barrierOffset+3,course);
    let request=false;
    if (a.player.contact && !recovered) {
      request=prior.sim.recoverCar(a);
      assert(request && current.sim.recoverCar(b));
      recovered=true;
    }
    original.record(command,request);
    exported.record(command,request);
    prior.sim.stepRace(a,command);
    current.sim.stepRace(b,command);
    ticks++;
    assert.deepEqual(b,a,'field divergence in '+name+' at accepted tick '+ticks);
    if (a.player.contact) contactTicks++;
    if (ticks%600===0 || a.phase==='finished') checkpoints.update(JSON.stringify([ticks,a]));
  }
  assert.equal(a.phase,'finished');
  assert.equal(a.entrants.length,6);
  assert(contactTicks && recovered && a.player.recoveries===1);
  const tape=original.export(), bytes=JSON.stringify(tape);
  assert.equal(tape.version,2);
  assert.equal(JSON.stringify(exported.export()),bytes);
  const playback=createReplaySession(tape,candidate);
  while (!playback.finished) playback.advance(113);
  assert.equal(playback.tick,ticks);
  assert.deepEqual(playback.race,a);
  results.push({course:name,ticks,contactTicks,recoveries:a.player.recoveries,
    finishTicks:a.player.finishTicks,order:a.order.map(e=>e.id),
    v2Sha256:createHash('sha256').update(bytes).digest('hex'),fieldCheckpointsSha256:checkpoints.digest('hex')});
}
console.log(JSON.stringify({baseline,candidate,node:process.version,platform:process.platform,arch:process.arch,seed,results},null,2));
