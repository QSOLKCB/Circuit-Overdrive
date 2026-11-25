// SPDX-License-Identifier: Apache-2.0
// node tests/compare-v100.mjs /path/to/a/clean/v1.0.0-or-v1.1.1/checkout
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const releases=['47b1a5c1562136bfd6b98ca9d4ef2ce07282200b','541ba6ca27dabe644ab23fe9a061c91dda8794a6'];
const reference=realpathSync(process.argv[2]),candidate=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const sha=git(reference,'rev-parse','HEAD');
assert.notEqual(reference,candidate);assert(releases.includes(sha),'Use an exact published reference');
const head=git(candidate,'rev-parse','HEAD');
for(const dir of [reference,candidate])assert.equal(git(dir,'status','--porcelain','--','src','vendor','tracks','tests/driver.mjs','tests/orbital-driver.mjs','tests/skyway-driver.mjs'),'');
const unchanged=['src/sim.js','src/contact.js','src/ai.js','src/field.js','src/nitro-race.js','src/nitro-physics.js',
  'src/rocket-race.js','src/rocket-contact.js','src/rocket-dynamics.js','src/championship.js','src/championship-storage.js',
  'src/championship-ui.js','src/driver-command.js','src/driver-input.js','src/gamepad.js','src/profiles.js','src/touch.js',
  'src/input.js','src/replay-v2.js','src/replay.js','src/main.js','src/replay-presentation.js','src/effects.js',
  'src/scene.js','src/rocket-scene.js','tracks','vendor'];
const blobs={};
for(const path of unchanged){
  const oid=git(reference,'rev-parse','HEAD:'+path);assert.equal(git(candidate,'rev-parse','HEAD:'+path),oid,path);blobs[path]=oid;
}
const hash=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
async function load(dir){
  const mod=path=>import(pathToFileURL(join(dir,path+'.js')));
  const [sim,nitro,rocket,{track},{ridge},{skyway},{createRecording},{createReplaySession},present,{selectHeadlights}]=
    await Promise.all(['sim','nitro-race','rocket-race','track','ridge','skyway','replay','replay-theatre-core','replay-presentation','headlights'].map(n=>mod('src/'+n)));
  return {sim,nitro,rocket,track,ridge,skyway,createRecording,createReplaySession,present,selectHeadlights};
}
const [old,now]=await Promise.all([load(reference),load(candidate)]);
const driver=filename=>import(pathToFileURL(join(reference,'tests',filename+'-driver.mjs')));
const [{driverIntent},{skywayIntent},{orbitalDrive}]=await Promise.all([import(pathToFileURL(join(reference,'tests/driver.mjs'))),driver('skyway'),driver('orbital')]);
const results=[];
for(const [name,light] of [['speedway','day'],['speedway','night'],['ridge','day'],['ridge','night'],['skyway','day'],['orbital','day']]){
  const seed=27,touring=['ridge','speedway'].includes(name);
  function setup(m,revision){
    const course=name==='speedway'?m.track:m[name];let race,step;
    if(touring){race=m.sim.createRace(seed,course);m.sim.startRace(race);step=m.sim.stepRace;}
    else if(name==='skyway'){race=m.nitro.createNitroRace(seed,m.skyway);m.nitro.startNitroRace(race);step=m.nitro.stepNitroRace;}
    else {race=m.rocket.createRocketRace(seed);m.rocket.startRocketRace(race);step=m.rocket.stepRocketRace;}
    return {race,step,rec:m.createRecording(name,seed,revision),poses:m.present.createReplayPoses()};
  }
  const a=setup(old,sha),b=setup(now,head);let ticks=0,recovered=false,contactTicks=0,nightSamples=0;
  while(a.race.phase!=='finished' && ticks<24000){
    const e=a.race.player,course=a.race.course;
    const cmd=touring?driverIntent(e.current,30,contactTicks?0:course.barrierOffset+3,course):
      name==='skyway'?skywayIntent(e,course):orbitalDrive(e);
    const recover=touring && e.contact && !recovered;
    if(recover){assert(old.sim.recoverCar(a.race));assert(now.sim.recoverCar(b.race));recovered=true;}
    for(const state of [a,b]){state.rec.record(cmd,!!recover);state.step(state.race,cmd);}
    ticks++;if(e.contact)contactTicks++;
    assert.deepEqual(b.race,a.race,name+' diverged at tick '+ticks);
    if(light==='night' && ticks%3===0){
      const beams=(m,s)=>{m.present.interpolateReplayPoses(s.race,s.poses,.5);return m.selectHeadlights(s.poses,s.poses[ticks%6],true,false);};
      assert.deepEqual(beams(old,a),beams(now,b));nightSamples++;
    }
  }
  assert.equal(a.race.phase,'finished');if(touring)assert(recovered && contactTicks>0);
  const ta=a.rec.export(),tb=b.rec.export();assert.deepEqual({...tb,revision:sha},ta);
  const viewer=now.createReplaySession(tb,head);while(!viewer.finished)viewer.advance(173);
  assert.deepEqual(viewer.race,a.race);
  results.push({name,light,ticks,nightSamples,recovered,contactTicks,version:ta.version,runsSha256:hash(ta.runs),
    fieldSha256:hash(a.race.entrants),order:a.race.order.map(e=>e.id),finish:a.race.player.finishTicks});
}
console.log(JSON.stringify({baseline:sha,candidate:head,node:process.version,platform:process.platform,blobs,results},null,2));
