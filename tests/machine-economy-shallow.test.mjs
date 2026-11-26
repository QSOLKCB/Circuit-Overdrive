// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const run=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const published='1c745a90258d0f6cb968935f773354cff702b276';
const repository='https://github.com/QSOLKCB/Circuit-Overdrive.git';

test('published ownership audit verifies immutable source from a depth-one checkout without changing its history',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'circuit-economy-shallow-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const reference=join(temp,'reference'),checkout=join(temp,'checkout'),auditTemp=join(temp,'audit-temp');
  await mkdir(auditTemp);
  const local=spawnSync('git',['cat-file','-e',published+'^{commit}'],{cwd:root,stdio:'ignore'}).status===0;
  // Shallow CI obtains only the immutable reference, as crash-legacy.test does.
  // Child audits then use a local URL rewrite so their fallback is network-free.
  await run('git',['init','--quiet','--template=',reference]);
  await run('git',['-C',reference,'fetch','--quiet','--no-tags','--depth=1','--',local?root:repository,published]);
  await run('git',['clone','--quiet','--no-tags','--depth=1','--',pathToFileURL(root).href,checkout]);
  // Exercise the working implementation when running this regression before a
  // commit, rather than silently importing the previous committed script.
  await writeFile(join(checkout,'scripts/certify-machine-economy.mjs'),await readFile(new URL('../scripts/certify-machine-economy.mjs',import.meta.url)));
  const git=async args=>(await run('git',['-C',checkout,...args])).stdout.trim();
  assert.equal(await git(['rev-parse','--is-shallow-repository']),'true');
  assert.notEqual(spawnSync('git',['-C',checkout,'cat-file','-e',published+'^{commit}'],{stdio:'ignore'}).status,0);
  const snapshot=async()=>({
    head:await git(['rev-parse','HEAD']),refs:await git(['for-each-ref','--format=%(refname) %(objectname)']),
    shallow:await readFile(join(checkout,'.git/shallow'),'utf8'),status:await git(['status','--porcelain=v1'])
  });
  const before=await snapshot();
  const audit=async source=>{
    const env={...process.env,TMPDIR:auditTemp,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',
      GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'url.'+pathToFileURL(source).href+'.insteadOf',GIT_CONFIG_VALUE_0:repository,GIT_ALLOW_PROTOCOL:'file'};
    const code=`try { const {auditPublishedOwnership}=await import(${JSON.stringify(pathToFileURL(join(checkout,'scripts/certify-machine-economy.mjs')).href)}); console.log(JSON.stringify({ok:true,report:auditPublishedOwnership()})); }
      catch(error) { console.log(JSON.stringify({ok:false,message:error.message,status:error.status})); }`;
    const {stdout}=await run(process.execPath,['--input-type=module','-e',code],{cwd:checkout,env});
    assert.deepEqual(await readdir(auditTemp),[],'temporary reference must be removed on success and failure');
    return JSON.parse(stdout);
  };

  const accepted=await audit(reference);
  assert.equal(accepted.ok,true,accepted.message);
  const manifest=JSON.parse(await readFile(join(checkout,'tests/fixtures/garage-v1/provenance.json'),'utf8'));
  assert.equal(accepted.report.published,published);
  assert.deepEqual(accepted.report.sourceClosureSha256,manifest.sha256);
  assert.equal(Object.keys(accepted.report.sourceClosureSha256).length,6);
  assert.equal(accepted.report.fixtures.length,18);
  assert.deepEqual(await snapshot(),before);
  assert.notEqual(spawnSync('git',['-C',checkout,'cat-file','-e',published+'^{commit}'],{stdio:'ignore'}).status,0);

  const fixture=join(checkout,'tests/fixtures/garage-v1/garage.js'),original=await readFile(fixture);
  await writeFile(fixture,Buffer.concat([original,Buffer.from('\n// Deliberately altered integrity fixture.\n')]));
  const corrupt=await audit(reference);
  assert.equal(corrupt.ok,false,'shallow fallback must still compare exact published bytes');
  assert.match(corrupt.message,/Fixture must equal exact published source: garage\.js/);
  await writeFile(fixture,original);
  assert.deepEqual(await snapshot(),before);

  const unavailable=await audit(join(temp,'missing-reference'));
  assert.equal(unavailable.ok,false,'missing published source must fail instead of skipping the audit');
  assert.equal(unavailable.status,128);
  assert.match(unavailable.message,/fetch/);
  assert.deepEqual(await snapshot(),before);
});
