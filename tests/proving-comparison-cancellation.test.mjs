// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {admitProvingSelection} from '../src/proving-ground-admission.js';
import {createProvingRun,startProvingRun,stepProvingRun,referenceProvingCommand,provingReceipt} from '../src/proving-ground.js';
import {createProvingRecording} from '../src/proving-replay.js';

// Execute the production orchestration rather than a copied version. DOM nodes
// and the yield/storage services are test doubles; builds, motion, receipts and
// complete recording admission use the actual pinned simulation modules.
const page=await readFile(new URL('../src/proving-ground-page.js',import.meta.url),'utf8');
const start=page.indexOf('async function compare(){'),end=page.indexOf("\n$('load').onclick",start);
assert(start>=0&&end>start,'Find the actual comparison controller');
const compareSource=page.slice(start,end);
const revision='57a30486fcf8674e30486d01dea972b8981bcccd';
function element(){
  return {textContent:'',value:'',children:[],append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=nodes;},
    createCaption(){const child=element();this.append(child);return child;},
    createTHead(){const child=element();this.append(child);return child;},
    createTBody(){const child=element();this.append(child);return child;},
    insertRow(){const child=element();this.append(child);return child;},
    insertCell(){const child=element();this.append(child);return child;}};
}
function harness({onFinalRecordingYield=()=>{},retentionError=null}={}){
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  $('test').value='acceleration';$('proposed-slot').value='engine';$('proposed-part').value='street';
  const messages=[],retained=[];let control,triggered=false,instrumentCalls=0;
  const dependencies={$,document:{createElement:element},sourceRevision:revision,
    pause(){},status(message){messages.push(message);$('status').textContent=message;},
    instruments(){instrumentCalls++;},vault:{load:()=>({state:null,status:'UNSAVED'})},
    selection:()=>({mode:'proposed',ownedVehicleId:null,modelId:'cinder-two',slot:$('proposed-slot').value,partId:$('proposed-part').value}),
    admitProvingSelection,createProvingRun,startProvingRun,stepProvingRun,referenceProvingCommand,provingReceipt,
    async createProvingRecording(run,options){
      return createProvingRecording(run,{...options,yieldTask:async()=>{
        if(!triggered&&run.build.parts.engine==='street'){
          triggered=true;await onFinalRecordingYield(control);
        }
        await options.yieldTask();
      }});
    },
    retainWorkshopRecording(recording,mode){if(retentionError)throw retentionError;retained.push({recording,mode});},
    setTimeout:callback=>queueMicrotask(callback)};
  const names=Object.keys(dependencies);
  control=new Function(...names,`
    let generation=0,disposed=false,comparing=false;
    ${compareSource}
    return {compare,
      changed(message='Selection changed. Load the selected build before driving.'){
        generation++;comparing=false;status(message);
      },
      dispose(){disposed=true;comparing=false;status('Page closed.');},
      selectLongGearbox(){$('proposed-slot').value='gearbox';$('proposed-part').value='long';},
      get comparing(){return comparing;}
    };
  `)(...names.map(name=>dependencies[name]));
  return {control,$,messages,retained,get instrumentCalls(){return instrumentCalls;},get triggered(){return triggered;}};
}

test('changing selection during final proposed recording admission cannot publish an obsolete comparison',async()=>{
  const h=harness({onFinalRecordingYield:control=>control.changed()});
  await h.control.compare();
  assert(h.triggered,'Cancellation occurs during the real proposed recording admission yield');
  assert.equal(h.$('comparison').textContent,'null');assert.equal(h.$('measurements').children.length,0);
  assert.equal(h.$('status').textContent,'Selection changed. Load the selected build before driving.');
  assert.equal(h.control.comparing,false);assert.equal(h.instrumentCalls,1,'Obsolete finally must not update controls');
  assert.deepEqual(h.retained.map(entry=>entry.mode),['stock'],'Cancelled proposed evidence is not retained');
});

test('page disposal during final recording admission cannot publish results, status or controls',async()=>{
  const h=harness({onFinalRecordingYield:control=>control.dispose()});
  await h.control.compare();
  assert(h.triggered);assert.equal(h.$('comparison').textContent,'null');assert.equal(h.$('measurements').children.length,0);
  assert.equal(h.$('status').textContent,'Page closed.');assert.equal(h.instrumentCalls,1);
});

test('an obsolete recording rejection cannot overwrite a newer completed physical comparison',async()=>{
  const h=harness({onFinalRecordingYield:async control=>{
    control.selectLongGearbox();await control.compare();
  }});
  await h.control.compare();
  const report=JSON.parse(h.$('comparison').textContent);
  assert(h.triggered);assert.equal(report.testId,'acceleration');assert.equal(report.results.length,2);
  const proposed=report.results.find(entry=>entry.mode==='proposed');
  assert.equal(proposed.build.parts.engine,'stock');assert.equal(proposed.build.parts.gearbox,'long');
  assert.equal(proposed.acceptedTicks,900);assert.equal(proposed.result.status,'completed');
  assert.equal(h.$('measurements').children.length,1);
  assert.equal(h.$('status').textContent,'Comparison complete. Return to The Garage and verify measured tests to inspect these exact builds.');
  assert.equal(h.control.comparing,false);assert.equal(h.instrumentCalls,3,'Only the active comparison finalizes controls');
});

test('ordinary evidence retention failure still publishes valid measured outcomes',async()=>{
  const h=harness({retentionError:new Error('test storage quota')});
  await h.control.compare();
  const report=JSON.parse(h.$('comparison').textContent);
  assert.equal(report.results.length,2);assert.equal(h.$('measurements').children.length,1);
  assert(report.results.every(entry=>entry.acceptedTicks===900&&entry.result.status==='completed'));
  const stock=report.results.find(entry=>entry.mode==='stock'),proposed=report.results.find(entry=>entry.mode==='proposed');
  assert(proposed.result.metrics.accelerationSeconds<stock.result.metrics.accelerationSeconds);
  assert.equal(h.$('status').textContent,'Comparison complete. Temporary evidence unavailable: test storage quota');
  assert.equal(h.control.comparing,false);assert.equal(h.instrumentCalls,2);
});
