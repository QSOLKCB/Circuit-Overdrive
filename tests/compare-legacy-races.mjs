// SPDX-License-Identifier: Apache-2.0
// node tests/compare-legacy-races.mjs /path/to/clean/v0.8.0-or-v0.9.0
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createReplaySession} from '../src/replay-theatre-core.js';

const v080='8204da56fce6b40ab33cb66c684a2e780f3e3001',v090='f7f45d1b6c3521dd728945b71cf20ab406603cb4';
const root=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
assert.equal(process.argv.length,3,'Pass a clean checkout of v0.8.0 or v0.9.0');
const referenceRoot=realpathSync(process.argv[2]);
assert.notEqual(referenceRoot,root);
function git(dir,...args) {
  return execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
}
function checkedRevision(dir) {
  const sha=git(dir,'rev-parse','HEAD');
  assert.equal(git(dir,'status','--porcelain','--','src','tracks','vendor','tests/driver.mjs','tests/skyway-driver.mjs',
    'docs/evidence/co-009d/skyway-replay.json'),'',
    'The code and data used for the comparison must match '+sha);
  return sha;
}
const baseline=checkedRevision(referenceRoot);
assert([v080,v090].includes(baseline),'Reference must be an exact published baseline');
const candidate=checkedRevision(root);
async function load(dir) {
  const module=filename=>import(pathToFileURL(join(dir,filename)).href);
  const [sim,{track},{ridge},{createRecording}]=await Promise.all([
    module('src/sim.js'),module('src/track.js'),module('src/ridge.js'),module('src/replay.js')]);
  const presentation=await module('src/replay-presentation.js');
  const {selectHeadlights}=await module('src/headlights.js');
  function nightObserver() {
    const poses=presentation.createReplayPoses();
    return (race,tick)=>{
      presentation.interpolateReplayPoses(race,poses,.5);
      const follow=poses[Math.floor(tick/3)%poses.length];
      return selectHeadlights(poses,follow,tick%2===0,false);
    };
  }
  return {sim,speedway:track,ridge,createRecording,module,nightObserver};
}
const prior=await load(referenceRoot), current=await load(root);
const {driverIntent}=await import(pathToFileURL(join(referenceRoot,'tests/driver.mjs')).href);
const seed=708;
const results=[];
const environments=baseline===v090 ? ['day','night'] : ['day'];
for (const name of ['speedway','ridge']) for(const environment of environments) {
  const course=prior[name], a=prior.sim.createRace(seed,course), b=current.sim.createRace(seed,current[name]);
  // Give both encoders the same real release stamp, so all tape bytes must match.
  const original=prior.createRecording(name,seed,baseline), exported=current.createRecording(name,seed,baseline);
  prior.sim.startRace(a);
  current.sim.startRace(b);
  let contactTicks=0, recovered=false, ticks=0;
  const priorNight=prior.nightObserver(),currentNight=current.nightObserver();
  let lightSamples=0;
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
    if(environment==='night' && ticks%3===0) {
      assert.deepEqual(currentNight(b,ticks),priorNight(a,ticks),'night source divergence at tick '+ticks);
      lightSamples++;
    }
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
  results.push({course:name,environment,ticks,contactTicks,recoveries:a.player.recoveries,lightSamples,
    finishTicks:a.player.finishTicks,order:a.order.map(e=>e.id),
    v2Sha256:createHash('sha256').update(bytes).digest('hex'),fieldCheckpointsSha256:checkpoints.digest('hex')});
}
if(baseline===v090) {
  for(const name of ['speedway','ridge']) {
    const [day,night]=results.filter(row=>row.course===name);
    assert.equal(day.v2Sha256,night.v2Sha256);
    assert.equal(day.fieldCheckpointsSha256,night.fieldCheckpointsSha256);
  }
  const {createNitroRace,startNitroRace,stepNitroRace}=await prior.module('src/nitro-race.js');
  const {NEUTRAL_NITRO}=await prior.module('src/nitro-physics.js');
  const {skyway}=await prior.module('src/skyway.js');
  const {skywayIntent}=await prior.module('tests/skyway-driver.mjs');
  const archive=JSON.parse(readFileSync(join(referenceRoot,'docs/evidence/co-009d/skyway-replay.json'),'utf8'));
  const race=createNitroRace(archive.seed,skyway),encoder=prior.createRecording('skyway',archive.seed,baseline);
  startNitroRace(race);
  for(let tick=0;tick<archive.ticks;tick++) {
    const command=race.phase==='racing' ? skywayIntent(race.player,skyway) : NEUTRAL_NITRO;
    encoder.record(command,false);
    stepNitroRace(race,command);
  }
  const tape=encoder.export(),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(race.phase,'finished');
  assert.equal(tape.revision,baseline);
  assert.deepEqual(tape.runs,archive.runs);
  const oldTheatre=await prior.module('src/replay-theatre-core.js');
  const a=oldTheatre.createReplaySession(tape,baseline), b=createReplaySession(tape,candidate);
  let boosts=0,airTicks=0,landings=0;
  while(!a.finished) {
    a.step();b.step();
    assert.deepEqual(b.race,a.race,'Skyway field divergence at accepted tick '+a.tick);
    const p=b.race.player.nitro;
    boosts+=p.boosting;airTicks+=p.airborne;landings+=p.landed;
  }
  assert(b.finished && b.race.entrants.length===6);
  assert.deepEqual(b.race,race);
  const field=hash(race.entrants);
  // Original v0.9.0 six-driver state from the CO-010D compatibility review.
  assert.equal(field,'5a3295dde8531429690bc46776a5d08efa93961c9c7e784303c3800015da4bad');
  results.push({course:'skyway',environment:'day',seed:archive.seed,ticks:a.tick,
    archivedBrowserRevision:archive.revision,recordingRevision:tape.revision,
    runs:tape.runs.length,runsSha256:hash(tape.runs),v3Sha256:hash(tape),fieldSha256:field,
    boosts,airTicks,landings,stunts:race.player.nitro.stunts,points:race.player.nitro.points,
    finishTicks:race.player.finishTicks,order:race.order.map(e=>e.id),splits:race.player.splitTicks});
}
console.log(JSON.stringify({baseline,candidate,node:process.version,platform:process.platform,arch:process.arch,seed,results},null,2));
