// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline='47b1a5c1562136bfd6b98ca9d4ef2ce07282200b';
test('the published v1.0.0 field, input tape and classification agree at every accepted tick',async t=>{
  let reference=process.env.CO_V100_CHECKOUT;
  if(!reference){
    const temp=await mkdtemp(join(tmpdir(),'circuit-v100-'));
    t.after(()=>rm(temp,{recursive:true,force:true}));
    const local=spawnSync('git',['cat-file','-e',baseline+'^{commit}'],{cwd:root}).status===0;
    // A full checkout already contains the reference. Shallow CI fetches just
    // this immutable published source into the disposable test directory.
    const source=local?root:'https://github.com/QSOLKCB/Circuit-Overdrive.git';
    await run('git',['init','--quiet','--template=',temp]);
    await run('git',['-C',temp,'fetch','--quiet','--no-tags','--depth=1','--',source,baseline]);
    await run('git',['-C',temp,'checkout','--quiet','--detach',baseline]);
    reference=temp;
  }
  const {stdout}=await run(process.execPath,['tests/compare-v100.mjs',reference],{cwd:root});
  const receipt=JSON.parse(stdout);
  assert.equal(receipt.baseline,baseline);assert.equal(receipt.results.length,6);
  const ticks=receipt.results.reduce((n,r)=>n+r.ticks,0);
  assert.equal(ticks,45225);
  t.diagnostic(receipt.candidate+' · '+ticks+' matching legacy ticks across six course/environment combinations');
});
