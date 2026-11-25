// SPDX-License-Identifier: Apache-2.0
// Source-bound derby input and accepted contact evidence.
import {DERBY_RULES,DERBY_TICK_LIMIT,stepDerbyRound} from './derby.js';
import {PLAYER_ID} from './field.js';
import {neutralLab} from './crash-damage.js';

export const DERBY_REPLAY_VERSION=6;
export const DERBY_TERMINALS=Object.freeze([
  'last-car-standing','simultaneous-elimination','time-limit','technical-stop'
]);

const SHA=/^[0-9a-f]{40}$/;
const CONTACT_BATCH=120;
const encoder=new TextEncoder();
async function sha256(text) {
  const hash=await crypto.subtle.digest('SHA-256',encoder.encode(text));
  return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
}

/** Keep a fixed-length batch of exact compact contact JSON and submit its hash
 * asynchronously. A session retains only the batch hashes and each driver's
 * most recent entry receipt for inspection. The digest includes empty ticks.
 */
export function createDerbyContactLog() {
  const chunks=[];
  const latest=[];
  let batch=[],attempts=0,contactCount=0;
  return {
    record(contacts) {
      if (attempts>=DERBY_TICK_LIMIT) throw Error('Derby contact log exceeds the match limit');
      attempts++;
      contactCount+=contacts.length;
      batch.push(JSON.stringify(contacts));
      for (const contact of contacts) {
        if (contact.newImpact) for (const site of contact.sites) latest[site.id]=contact;
      }
      if (batch.length===CONTACT_BATCH) {
        // Attach a rejection handler immediately for runs in a browser context
        // without SubtleCrypto. Gameplay can still proceed to its actual result.
        chunks.push(sha256('['+batch.join(',')+']').catch(()=>null));
        batch=[];
      }
    },
    latestImpact(id) {return latest[id]??null;},
    async digest(expectedAttempts) {
      if (attempts!==expectedAttempts) throw Error('Contact log does not cover the terminal derby');
      const pending=chunks.slice();
      if (batch.length) pending.push(sha256('['+batch.join(',')+']'));
      const count=contactCount;
      const hashes=await Promise.all(pending);
      if (hashes.includes(null)) throw Error('SHA-256 requires Web Crypto in a secure context');
      return {contactCount:count,contactsSha256:await sha256(JSON.stringify(hashes))};
    }
  };
}

export function derbyAttempts(tape) {
  return tape.ticks+Number(tape.terminal==='technical-stop');
}

export function createDerbyRecorder(round) {
  if (round.ticks!==0 || round.result) throw Error('Record a derby from its starting grid');
  const {arena,revision}=round.world;
  const enabled=typeof revision==='string' && SHA.test(revision);
  const log=enabled ? createDerbyContactLog() : null;
  const runs=[];
  let attempts=0;
  function exportTape() {
    if (!enabled || !round.result || attempts!==round.ticks+Number(round.result.reason==='technical-stop'))
      throw Error('A complete source-stamped derby is required');
    return {version:DERBY_REPLAY_VERSION,discipline:'derby',rules:DERBY_RULES,revision,
      arena:arena.id,seed:round.seed,ticks:round.ticks,terminal:round.result.reason,runs:runs.map(row=>row.slice())};
  }
  return {
    step(command) {
      const attempt=round.standings.find(driver=>driver.id===PLAYER_ID).active ? command : neutralLab;
      const result=stepDerbyRound(round,command);
      if (enabled) {
        const accepted=result.commands[PLAYER_ID]??attempt;
        const {throttle,brake,steer}=accepted;
        const last=runs.at(-1);
        if (last && last[1]===throttle && last[2]===brake && last[3]===steer) last[0]++;
        else runs.push([1,throttle,brake,steer]);
        attempts++;
        log.record(result.contacts);
      }
      return result;
    },
    get available() {return enabled && !!round.result;},
    export:exportTape,
    receipt(runtime) {return derbyReceipt(exportTape(),round,log,runtime);}
  };
}

export async function derbyReceipt(tape,round,log,runtime) {
  const {result,world}=round;
  if (!result || tape.version!==DERBY_REPLAY_VERSION || tape.discipline!=='derby' ||
      tape.rules!==DERBY_RULES || tape.revision!==world.revision || tape.arena!==world.arena.id ||
      tape.seed!==round.seed || tape.ticks!==round.ticks || tape.terminal!==result.reason)
    throw Error('Receipt requires inputs and matching terminal derby');
  if (typeof runtime!=='string' || !runtime.trim()) throw TypeError('Declare the replay runtime');
  // Snapshot terminal data before the asynchronous hash operations.
  const eliminations=JSON.parse(JSON.stringify(round.eliminations));
  const finalDamage=world.cars.map(car=>({id:car.id,damage:{...car.damage}}));
  const classification=JSON.parse(JSON.stringify(result.standings));
  const finalState=JSON.stringify({result,cars:world.cars,
    latches:world.pairs.map(pair=>[pair.a.id,pair.b.id,pair.active,pair.episodeId??null])});
  const [inputSha256,contacts,classificationSha256,finalStateSha256]=await Promise.all([
    sha256(JSON.stringify(tape.runs)),log.digest(derbyAttempts(tape)),
    sha256(JSON.stringify(classification)),sha256(finalState)
  ]);
  return {format:'circuit-overdrive.derby-receipt.1',revision:tape.revision,discipline:tape.discipline,
    arena:tape.arena,rules:tape.rules,seed:tape.seed,ticks:tape.ticks,terminal:tape.terminal,
    attempts:derbyAttempts(tape),runtime,contactBatchSize:CONTACT_BATCH,inputSha256,...contacts,
    eliminations,finalDamage,classification,classificationSha256,finalStateSha256,
    winnerId:result.winnerId,technicalStop:result.technicalStop};
}
