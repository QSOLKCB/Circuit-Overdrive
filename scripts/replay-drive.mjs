// SPDX-License-Identifier: Apache-2.0
// Re-run an exported drive locally using the same game revision.
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readSite} from './package-site.mjs';
import {createReplaySession,MAX_SEEK_STEPS} from '../src/replay-theatre-core.js';
import {replayCommands} from '../src/replay.js';
import {createRace,startRace,stepRace,recoverCar} from '../src/sim.js';
import {track} from '../src/track.js';
import {ridge} from '../src/ridge.js';
const path=process.argv[2];
if (!path || (await stat(path)).size>16*1024*1024) throw Error('Expected one replay file of at most 16 MiB.');
const data=JSON.parse(await readFile(path,'utf8'));
const {revision} = await readSite(fileURLToPath(new URL('../',import.meta.url)));
if (data.version === 1) console.error('Legacy recording without revision metadata. Use the original game checkout.');
let race;
if (data.version===3 || data.version===4) {
  const session=createReplaySession(data,revision);
  while (!session.finished) session.advance(MAX_SEEK_STEPS);
  race=session.race;
} else {
  race=createRace(data.seed,data.course==='ridge'?ridge:track);
  startRace(race);
  for(const {command,recover} of replayCommands(data, revision)) {
    if (race.phase==='finished') throw Error('Replay contains ticks after the finish.');
    if (recover && !recoverCar(race)) throw Error('Recovery was rejected during replay.');
    stepRace(race,command);
  }
}
console.log(JSON.stringify({revision:data.revision ?? null,course:data.course,phase:race.phase,ticks:race.elapsedTicks,recordedTicks:data.ticks,
  playerSplits:race.course.closed ? race.player.lapTicks : race.player.splitTicks,
  classification:race.order.map(e=>({driver:e.name,position:e.position,finishTicks:e.finishTicks,recoveries:e.recoveries,...(e.nitro ? {nitro:e.nitro} : {}),
    ...(data.version===4 ? {checkpoints:e.splitTicks,body:e.vehicle} : {})}))},null,2));
