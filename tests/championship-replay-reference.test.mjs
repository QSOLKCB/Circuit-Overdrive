// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {encodeReference,readReference,verifyRoundReference} from './championship-replay-reference.mjs';

const identity={version:1,repository:'QSOLKCB/Circuit-Overdrive',run:'123',revision:'a'.repeat(40),
  runtime:'b'.repeat(64),batches:[240,63]};
const bytes=Buffer.from('{"ticks":9200}');
const order=Array.from({length:6},(_,id)=>({id,finishTicks:9100+id*7,recoveries:0}));

test('reuse requires exact download bytes and both independently checked race classifications',()=>{
  let calls=0;
  const reconstruct=()=>{calls++;return [order,order];};
  const cold=verifyRoundReference(bytes,order,undefined,reconstruct);
  assert.equal(cold.reused,false);
  assert.equal(calls,1);
  assert.equal(verifyRoundReference(bytes,order,cold.reference,reconstruct).reused,true);
  assert.equal(calls,1);
  assert.equal(verifyRoundReference(Buffer.concat([bytes,Buffer.from('\n')]),order,cold.reference,reconstruct).reused,false);
  for (const classifications of [[],[order],[order,[...order].reverse()],[null,order]]) {
    assert.equal(verifyRoundReference(bytes,order,{...cold.reference,classifications},reconstruct).reused,false);
  }
  assert.equal(calls,6);
  assert.throws(()=>verifyRoundReference(bytes,[...order].reverse(),cold.reference,reconstruct),assert.AssertionError);
  assert.throws(()=>verifyRoundReference(bytes,order,undefined,()=>[order,[...order].reverse()]),assert.AssertionError);
});

test('read only bounded intact four-round results from the exact workflow and runner',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'woc-replay-reference-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'replay-reference.json');
  const rounds=Array(4).fill(verifyRoundReference(bytes,order,undefined,()=>[order,order]).reference);
  assert.deepEqual(await readReference(path,identity),[]);
  await writeFile(path,encodeReference(identity,rounds));
  assert.deepEqual(await readReference(path,identity),rounds);
  for (const other of [null,{...identity,run:'124'},{...identity,repository:'another/repo'},
    {...identity,revision:'c'.repeat(40)},{...identity,runtime:'c'.repeat(64)},{...identity,batches:[63,240]}]) {
    assert.deepEqual(await readReference(path,other),[]);
  }
  const damaged=JSON.parse(encodeReference(identity,rounds));
  damaged.rounds[0].classifications[1][0].finishTicks++;
  for (const contents of ['{',JSON.stringify(damaged),encodeReference(identity,rounds.slice(1)),'x'.repeat(32769)]) {
    await writeFile(path,contents);
    assert.deepEqual(await readReference(path,identity),[]);
  }
});
