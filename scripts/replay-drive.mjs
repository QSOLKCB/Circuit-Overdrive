// SPDX-License-Identifier: Apache-2.0
// Re-run an exported drive locally using the same game revision.
import {readFile,stat} from 'node:fs/promises';
import {replayCommands} from '../src/replay.js';
import {createRace,startRace,stepRace,recoverCar} from '../src/sim.js';
import {track} from '../src/track.js';
import {ridge} from '../src/ridge.js';
const path=process.argv[2];
if (!path || (await stat(path)).size>16*1024*1024) throw Error('Expected one replay file of at most 16 MiB.');
const data=JSON.parse(await readFile(path,'utf8'));
const race=createRace(data.seed,data.course==='ridge'?ridge:track);
startRace(race);
for(const {command,recover} of replayCommands(data)) {
  if (race.phase==='finished') throw Error('Replay contains ticks after the finish.');
  if (recover && !recoverCar(race)) throw Error('Recovery was rejected during replay.');
  stepRace(race,command);
}
console.log(JSON.stringify({course:data.course,phase:race.phase,ticks:race.elapsedTicks,
  classification:race.order.map(e=>({driver:e.name,position:e.position,finishTicks:e.finishTicks,recoveries:e.recoveries}))},null,2));
