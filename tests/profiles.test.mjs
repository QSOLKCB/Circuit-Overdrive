// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {TUNING,captureNeutral,centredSteering,deviceKey,movedControls,profileError,profileMapper,
  saveProfile,savedProfile,standardProfile} from '../src/profiles.js';
import {standardGamepad} from '../src/gamepad.js';

const axis=(index,rest,full)=>({type:'axis',index,rest,full});
const button=index=>({type:'button',index,rest:0,full:1});
function device(id,axes=[],buttons=12,mapping='') {
  return {id,mapping,index:2,connected:true,axes,buttons:Array.from({length:buttons},()=>({value:0,pressed:false}))};
}
function press(pad,index,value) { pad.buttons[index]={pressed:value>.5,value}; }
function wheel() {
  return {family:'wheel',steering:{left:axis(0,.1,.95),right:axis(0,.1,-.8)},
    throttle:axis(1,1,-1),brake:axis(2,-.8,.7),
    actions:{confirm:button(1),pause:button(3),back:button(2),camera:button(2)},tuning:{...TUNING}};
}
function retro() {
  return {family:'generic',steering:{left:button(7),right:button(2)},throttle:button(4),brake:button(3),
    actions:{confirm:button(5),pause:button(8),left:button(7),right:button(2)},tuning:{...TUNING}};
}
const neutral={throttle:0,brake:0,steer:0};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('standard editable profile uses browser layout and drives both triggers independently',()=>{
  const pad=device('one',[0],17,'standard'), profile=standardProfile(pad), map=profileMapper(profile,pad);
  for (const power of [0,.005,.4,.7,1]) {
    pad.axes[0]=power;
    press(pad,6,power); press(pad,7,power);
    const actual=map(pad).command, expected=standardGamepad(pad).command;
    for (const key of Object.keys(actual)) close(actual[key],expected[key]);
  }
  assert.equal(standardProfile({...pad,mapping:''}),null);
  assert.equal(standardProfile(device('kit',[0],4,'standard')),null);
});
test('asymmetric wheel and reversed separate pedals retain their measured neutral and full spans',()=>{
  const pad=device('wheel',[.1,1,-.8]), p=wheel(), map=profileMapper(p,pad);
  assert.deepEqual(map(pad).command,neutral);
  pad.axes=[.95,-1,-.05];
  close(map(pad).command.steer,-1); close(map(pad).command.throttle,1); close(map(pad).command.brake,(.5-.02)/.98);
  pad.axes=[-.8,1,.7]; close(map(pad).command.steer,1); close(map(pad).command.brake,1);
  p.tuning.invertSteer=true; p.tuning.brakeRange=.5;
  pad.axes[2]=-.05;
  assert.equal(profileMapper(p,pad)(pad).command.steer,-1);
  assert.equal(profileMapper(p,pad)(pad).command.brake,1);
  assert.equal(map(pad).command.steer,1);
});
test('combined axis pedals share a rest and produce mutually exclusive positive commands',()=>{
  const pad=device('combined',[0,.15]), p=wheel();
  p.steering={left:axis(0,0,-1),right:axis(0,0,1)};
  p.throttle=axis(1,.15,-.9); p.brake=axis(1,.15,.85);
  const map=profileMapper(p,pad);
  assert.deepEqual(map(pad).command,neutral);
  for (const pos of [-1,-.5,0,.15,.2,.8,1]) {
    pad.axes[1]=pos;
    const c=map(pad).command;
    assert(c.throttle>=0 && c.throttle<=1 && c.brake>=0 && c.brake<=1);
    assert.equal(c.throttle*c.brake,0);
  }
  assert.equal(map(pad).command.brake,1);
  p.brake.full=-1; assert.match(profileError(p,pad),/opposite/);
  p.brake={...p.throttle,rest:.35,full:1};
  assert.match(profileError(p,pad),/neutral/);
});
test('digital steering detects two held directions even when steering cancels; menu and race pairings are explicit',()=>{
  const pad=device('digital'), p=retro(), map=profileMapper(p,pad);
  press(pad,7,1); press(pad,4,1);
  assert.deepEqual(map(pad),{command:{throttle:1,brake:0,steer:-1},held:['left'],neutral:false});
  press(pad,2,1); press(pad,7,1);
  assert.equal(map(pad).command.steer,0); assert.equal(map(pad).neutral,false);
  press(pad,4,0); press(pad,7,0); press(pad,2,0); press(pad,3,1);
  assert.equal(map(pad).command.brake,1);
  p.actions.pause=button(4);
  assert.match(profileError(p,pad),/pedal/);
});
test('centred wheel calibration inspects all candidate channels and rejects unsafe or ambiguous limits',()=>{
  const pad=device('axis hat',[.08,1]), rest=captureNeutral(pad);
  pad.axes[0]=-.85; const [left]=movedControls(rest,pad);
  pad.axes[0]=.86; press(pad,1,.8);
  const options=movedControls(rest,pad);
  assert.equal(options.length,2);
  assert.throws(()=>centredSteering(left,options[0],pad),/Release/);
  pad.axes[0]=.09;
  const s=centredSteering(left,options[0],pad);
  close(s.left.rest,.09); close(s.right.rest,.09);
  assert.throws(()=>centredSteering(left,left,pad),/opposite/);
  assert.deepEqual(movedControls(rest,{...pad,axes:[]}),[]);
  pad.axes[0]=Infinity; assert.equal(captureNeutral(pad),null);
});
test('inputs stay bounded under sensitivity, curve, saturation and rejected calibration values',()=>{
  const pad=device('bounds',[.1,1,-.8]), p=wheel();
  Object.assign(p.tuning,{sensitivity:.75,curve:2,deadzone:.2});
  const map=profileMapper(p,pad);
  pad.axes[0]=.2; assert.equal(map(pad).command.steer,0);
  pad.axes[0]=.1+.85*.6; close(map(pad).command.steer,-.1875);
  for (const invalid of [NaN,Infinity,-Infinity,2,-1.1]) {
    pad.axes[0]=invalid; assert.equal(map(pad),null);
  }
  pad.axes[0]=.1;
  pad.buttons[1].value=NaN; assert.equal(map(pad),null);
  assert.equal(map({...pad,axes:[0]}),null);
  for (const [key,value] of [['deadzone',.41],['curve',0],['sensitivity',Infinity],['invertSteer',1],['brakeRange',.1]]) {
    const invalid={...p,tuning:{...p.tuning,[key]:value}};
    assert.equal(profileMapper(invalid,pad),null);
  }
  p.throttle=axis(2,-.5,-.45); assert.equal(profileMapper(p,pad),null);
  p.throttle=axis(12,-1,1); assert.equal(profileMapper(p,pad),null);
  p.throttle=axis(0,-1,1); assert.equal(profileMapper(p,pad),null);
});
test('versioned storage requires intentional neutral save, isolates device layouts and handles denial and corruption',()=>{
  const records=new Map(), store={getItem:k=>records.get(k),setItem:(k,v)=>records.set(k,v)};
  const pad=device('saved'), p=retro();
  assert.equal(savedProfile(pad,store),null);
  press(pad,4,1); assert.throws(()=>saveProfile(pad,p,store),/Release/);
  assert.equal(records.size,0);
  press(pad,4,0);
  assert.equal(saveProfile(pad,p,store),true);
  const [key]=records.keys(); const parsed=JSON.parse(records.get(key));
  assert.equal(parsed.version,1); assert.deepEqual(parsed.devices[0].profile,p);
  assert.deepEqual(savedProfile({...pad,index:4},store),p);
  assert.equal(savedProfile({...pad,buttons:[...pad.buttons,{value:0}]},store),null);
  const other=device('read from storage');
  for (const corrupt of ['{',JSON.stringify({version:0,devices:[]}), JSON.stringify({version:1,devices:Array(17).fill({})})]) {
    records.set(key,corrupt); assert.equal(savedProfile(other,store),null);
  }
  const invalid=structuredClone(p); invalid.actions.confirm.index=199;
  records.set(key,JSON.stringify({version:1,devices:[{key:deviceKey(other),profile:invalid}]}));
  assert.equal(savedProfile(other,store),null);
  records.set(key,JSON.stringify({version:1,devices:[{key:deviceKey(other),profile:p}]}));
  assert.deepEqual(savedProfile(other,store),p);
  assert.equal(saveProfile(other,p,{getItem(){throw Error();},setItem(){throw Error();}}),false);
  assert.deepEqual(savedProfile(other,null),p);
  assert.equal(saveProfile(other,null,store),true); assert.equal(savedProfile(other,store),null);
});

test('explicit hat learns observed positions around an out-of-range neutral; unmapped diagonals cannot arm or steer',()=>{
  const pad=device('direct hat',[3.28]), p=retro(), rest=captureNeutral(pad);
  pad.axes[0]=.71; const [left]=movedControls(rest,pad,{hat:true});
  pad.axes[0]=-.43; const [right]=movedControls(rest,pad,{hat:true});
  pad.axes[0]=3.28; p.steering=centredSteering(left,right,pad);
  Object.assign(p.actions,{left,right,up:{...left,full:-1},down:{...right,full:.14}});
  const map=profileMapper(p,pad);
  assert(map(pad).neutral);
  for (const [position,steer,held] of [[.71,-1,['left']],[-.43,1,['right']],[-1,0,['up']],[.14,0,['down']],[.42,0,[]]]) {
    pad.axes[0]=position;
    const output=map(pad);
    assert.equal(output.command.steer,steer); assert.deepEqual(output.held,held); assert.equal(output.neutral,false);
  }
  p.steering.right.full=.75;
  assert.match(profileError(p,pad),/separate directions/);
  pad.axes[0]=999; assert.equal(map(pad),null);
});
