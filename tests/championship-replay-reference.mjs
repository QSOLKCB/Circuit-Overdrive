// SPDX-License-Identifier: Apache-2.0
// The producer runs the two pure Node replays. Every consumer still drives
// the live championship and independently checks its own six-car results.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants, createReadStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {cpus,release} from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {MAX_SEEK_STEPS} from '../src/replay-theatre-core.js';

export const replayBatches=Object.freeze([MAX_SEEK_STEPS,63]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function referenceIdentity() {
  const env=process.env;
  if (!env.GITHUB_REPOSITORY || !/^\d+$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) return null;
  const cwd=new URL('../',import.meta.url);
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
  assert.equal(revision,env.GITHUB_SHA,'CI checkout differs from the requested replay revision');
  if (execFileSync('git',['status','--porcelain','--','src','tracks','vendor','tests'],
    {cwd,encoding:'utf8'}).trim()) return null;
  const binary=createHash('sha256');
  for await (const chunk of createReadStream(process.execPath)) binary.update(chunk);
  const runtime=hash(JSON.stringify([binary.digest('hex'),process.versions,process.execArgv,env.NODE_OPTIONS ?? '',
    process.platform,process.arch,release(),cpus()[0]?.model,env.ImageOS ?? '',env.ImageVersion ?? '']));
  return {version:1,repository:env.GITHUB_REPOSITORY,run:env.GITHUB_RUN_ID,revision,runtime,batches:replayBatches};
}

export function encodeReference(identity,rounds) {
  const digest=hash(JSON.stringify([identity,rounds]));
  return JSON.stringify({identity,rounds,digest})+'\n';
}

// Only the workflow supplies this filename. Data in the artifact cannot name
// any file. A miss or damaged download falls back to the same cold assertions.
export async function readReference(path,identity) {
  if (!path || !identity) return [];
  let file;
  try {
    file=await open(path,constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat=await file.stat();
    if (!stat.isFile() || stat.size>32768) return [];
    const saved=JSON.parse(await file.readFile('utf8'));
    if (!isDeepStrictEqual(saved.identity,identity) || !Array.isArray(saved.rounds) || saved.rounds.length!==4 ||
        saved.digest!==hash(JSON.stringify([saved.identity,saved.rounds]))) return [];
    return saved.rounds;
  } catch {
    return [];
  } finally {
    await file?.close();
  }
}

export function verifyRoundReference(bytes,expected,cached,reconstruct) {
  const tape=hash(bytes);
  const expectedBatches=replayBatches.map(()=>expected);
  if (cached?.tape===tape && isDeepStrictEqual(cached.classifications,expectedBatches)) {
    return {reference:cached,reused:true};
  }
  const classifications=reconstruct();
  assert.deepEqual(classifications,expectedBatches);
  return {reference:{tape,classifications},reused:false};
}
