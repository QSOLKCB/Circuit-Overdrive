// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {runProvingMenuEntryChecks} from './proving-menu-entry.mjs';

// Stop at the first real-navigation boundary. These tests exercise the actual
// runner's admission checks, not a second implementation of stamp validation.
function pageWithStamp(value,{admitClick=false}={}){
  let clicks=0;
  const stamps=Array.isArray(value)?[...value]:[value];
  const boundary=new Error('Valid stamp reached the menu click');
  const page={
    viewportSize:()=>({width:1440,height:1080}),
    async goto(){},async waitForFunction(){},async waitForURL(){},async evaluate(){return null;},
    locator(selector){
      if(selector==='meta[name="game-revision"]')return {async getAttribute(){return stamps.shift();}};
      assert.equal(selector,'#enter-proving-ground');
      return {async click(){clicks++;if(!admitClick)throw boundary;}};
    }
  };
  return {page,boundary,clicks:()=>clicks};
}
async function withExpectedSource(value,callback){
  const previous=process.env.SOURCE_SHA;
  try{
    if(value===undefined)delete process.env.SOURCE_SHA;else process.env.SOURCE_SHA=value;
    await callback();
  }finally{
    if(previous===undefined)delete process.env.SOURCE_SHA;else process.env.SOURCE_SHA=previous;
  }
}
const run=fixture=>runProvingMenuEntryChecks(fixture.page,'http://example.test/Circuit-Overdrive/');

test('menu entry rejects missing, empty and malformed source stamps without SOURCE_SHA',async()=>{
  await withExpectedSource(undefined,async()=>{
    for(const value of [null,'','a'.repeat(39),'a'.repeat(41),'g'.repeat(40),'A'.repeat(40),' '+'a'.repeat(40)]){
      const fixture=pageWithStamp(value);
      await assert.rejects(run(fixture),/Menu entry checks require a source-stamped package/);
      assert.equal(fixture.clicks(),0,'Invalid provenance must reject before menu navigation');
    }
  });
});

test('a valid menu stamp cannot admit a facility with missing, malformed or different provenance',async()=>{
  await withExpectedSource(undefined,async()=>{
    const revision='a'.repeat(40);
    for(const value of [null,'bad','b'.repeat(40)]){
      const fixture=pageWithStamp([revision,value],{admitClick:true});
      await assert.rejects(run(fixture),error=>{
        assert.equal(error.code,'ERR_ASSERTION');
        if(value==='b'.repeat(40)){
          assert.equal(error.actual,value);assert.equal(error.expected,revision);
        }else assert.match(error.message,/Menu entry checks require a source-stamped package/);
        return true;
      });
      assert.equal(fixture.clicks(),1,'The valid first page permits navigation before facility admission rejects');
    }
  });
});

test('a matching SOURCE_SHA cannot admit a malformed revision stamp',async()=>{
  await withExpectedSource('not-a-revision',async()=>{
    const fixture=pageWithStamp('not-a-revision');
    await assert.rejects(run(fixture),/Menu entry checks require a source-stamped package/);
    assert.equal(fixture.clicks(),0);
  });
});

test('a valid revision reaches navigation without SOURCE_SHA and with a matching SOURCE_SHA',async()=>{
  const revision='a'.repeat(40);
  for(const expected of [undefined,revision])await withExpectedSource(expected,async()=>{
    const fixture=pageWithStamp(revision);
    await assert.rejects(run(fixture),error=>error===fixture.boundary);
    assert.equal(fixture.clicks(),1);
  });
});

test('a valid revision still rejects when SOURCE_SHA names a different source',async()=>{
  await withExpectedSource('b'.repeat(40),async()=>{
    const fixture=pageWithStamp('a'.repeat(40));
    await assert.rejects(run(fixture),{code:'ERR_ASSERTION',actual:'a'.repeat(40),expected:'b'.repeat(40)});
    assert.equal(fixture.clicks(),0);
  });
});
