// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {GamepadInput, STANDARD_BUTTONS, standardGamepad} from '../src/gamepad.js';

const rest = {throttle:0, brake:0, steer:0};
const stopped = {command:rest, actions:[]};
function pad(index, id='USB controller', mapping='standard') {
  return {index, id, mapping, connected:true, axes:[0,0,0,0],
    buttons:Array.from({length:17}, () => ({pressed:false, value:0}))};
}
function press(pad, name, value=1) {
  pad.buttons[STANDARD_BUTTONS[name]] = {pressed:value>.5, value};
}
function fixture(...visible) {
  const slots = [];
  for (const p of visible) slots[p.index] = p;
  const target = new EventTarget(), losses = [];
  target.navigator = {getGamepads:() => slots};
  return {slots, target, losses, input:new GamepadInput(target, reason => losses.push(reason))};
}

test('only the selected standard slot drives, independent of brand and sparse slot ordering', () => {
  const first=pad(0,'Wireless Controller'), second=pad(3,'Unknown Vendor');
  const {input,slots}=fixture(first,second);
  press(first,'throttle');
  assert.deepEqual(input.devices().map(p=>p.index),[0,3]);
  assert.deepEqual(input.poll(),stopped);
  assert.equal(input.select(3),true);
  assert.deepEqual(input.poll(),stopped);
  assert.equal(input.ready,true);
  const updated = pad(3,'Unknown Vendor');
  updated.axes[0]=-.56;
  press(updated,'throttle',.51);
  press(updated,'brake',.265);
  slots[3]=updated;
  const actual=input.poll().command;
  assert(Math.abs(actual.steer+.5)<1e-12);
  assert(Math.abs(actual.throttle-.5)<1e-12);
  assert(Math.abs(actual.brake-.25)<1e-12);
  assert.equal(input.index,3);
});

test('neutral arming and action edges survive held start, clear, and profile changes', () => {
  const p=pad(2), {input}=fixture(p);
  press(p,'confirm');
  p.axes[0]=.5;
  assert(input.select(2));
  for (let i=0;i<3;i++) assert.deepEqual(input.poll(),stopped);
  press(p,'confirm',0);
  assert.deepEqual(input.poll(),stopped);
  assert.equal(input.ready,false);
  p.axes[0]=.04;
  press(p,'throttle',.01);
  input.poll();
  assert(input.ready);
  for (const action of ['confirm','back','pause','camera','recover','up','down','left','right']) {
    press(p,action);
    assert.deepEqual(input.poll().actions,[action]);
    assert.deepEqual(input.poll().actions,[]);
    press(p,action,0);
    assert.deepEqual(input.poll().actions,[]);
  }
  press(p,'throttle');
  press(p,'pause');
  assert.equal(input.poll().command.throttle,1);
  input.clear();
  assert.deepEqual(input.poll(),stopped);
  press(p,'throttle',0);
  assert.deepEqual(input.poll(),stopped);
  assert.equal(input.ready,false);
  assert(input.select(2));
  assert.deepEqual(input.poll(),stopped);
  press(p,'pause',0);
  input.poll();
  press(p,'pause');
  assert.deepEqual(input.poll().actions,['pause']);
});

test('polling disconnect, wrong identity and changed layout clear all input and require reselection', () => {
  for (const replacement of [null,pad(1,'reconnected with different ID'),
    {...pad(1),mapping:''},{...pad(1),axes:[0]}, {...pad(1),connected:false}]) {
    const p=pad(1), {input,slots,losses}=fixture(p,pad(2));
    assert(input.select(1));
    input.poll();
    press(p,'throttle');
    p.axes[0]=-1;
    assert.deepEqual(input.poll().command,{steer:-1,throttle:1,brake:0});
    slots[1]=replacement;
    assert.deepEqual(input.poll(),stopped);
    assert.equal(input.index,null);
    slots[1]=p;
    assert.deepEqual(input.poll(),stopped);
    assert.equal(losses.length,1);
    assert(input.select(1));
    assert.deepEqual(input.poll(),stopped);
    assert.equal(input.ready,false);
    press(p,'throttle',0); p.axes[0]=0;
    input.poll(); assert(input.ready);
  }
});

test('disconnect events revoke even identical slot replacements between polls', () => {
  const p=pad(0), {target,input,slots,losses}=fixture(p,pad(1));
  assert(input.select(0));
  input.poll();
  const disconnect=index => target.dispatchEvent(Object.assign(new Event('gamepaddisconnected'),{gamepad:{index}}));
  disconnect(1);
  assert.equal(input.index,0);
  slots[0]=pad(0); press(slots[0],'throttle');
  disconnect(0);
  assert.equal(input.index,null);
  assert.deepEqual(input.poll(),stopped);
  assert.equal(losses.length,1);
  input.dispose();
  disconnect(0);
  assert.equal(losses.length,1);
});

test('standard mapping validates its controls, rejects name-based guesses and clamps finite input', () => {
  const unknown=pad(0,'Xbox Wireless Controller','');
  assert.equal(standardGamepad(unknown),null);
  const {input}=fixture(unknown);
  assert.equal(input.select(0),false);
  assert.equal(input.available,true);
  for (const breakControl of [
    p=>{p.axes[0]=NaN;}, p=>{p.buttons[6].value=Infinity;},
    p=>{delete p.buttons[9];}, p=>{p.axes=undefined;}
  ]) {
    const p=pad(0), {input,losses}=fixture(p);
    input.select(0); input.poll(); press(p,'throttle');
    breakControl(p);
    assert.deepEqual(input.poll(),stopped);
    assert.equal(losses.length,1);
    assert.equal(input.select(0),false);
  }
  const p=pad(0); p.axes[0]=-2; press(p,'throttle',1.2); press(p,'brake',-.1);
  assert.deepEqual(standardGamepad(p).command,{steer:-1,throttle:1,brake:0});
});

test('custom layout uses the same neutral and action boundary, including cancelled digital inputs', () => {
  const p=pad(1,'Original',''), {input}=fixture(p);
  let mapped={command:{...rest},held:[],neutral:false};
  assert(input.select(1,()=>mapped));
  input.poll(); assert.equal(input.ready,false);
  mapped.neutral=true;
  input.poll(); assert(input.ready);
  mapped={command:{throttle:1,brake:0,steer:-1},held:['camera']};
  assert.deepEqual(input.poll(),{command:{throttle:1,brake:0,steer:-1},actions:['camera']});
  mapped.command.brake=NaN;
  assert.deepEqual(input.poll(),stopped);
  assert.equal(input.index,null);
  assert.equal(input.select(1,()=>{throw Error('invalid mapping');}),false);
  assert.equal(input.select(1,()=>({command:rest,held:['unknown']})),false);
});

test('permission denial, missing API, and empty device lists keep controls neutral', () => {
  const p=pad(2), {input,target,losses}=fixture(p);
  assert.equal(input.select(10),false);
  assert(input.select(2));
  input.poll();
  target.navigator.getGamepads=()=>{throw Error('permission policy');};
  assert.deepEqual(input.poll(),stopped);
  assert.equal(input.available,false);
  assert.deepEqual(input.devices(),[]);
  assert.equal(losses.length,1);
  delete target.navigator.getGamepads;
  assert.deepEqual(input.devices(),[]);
  assert.equal(input.available,false);
  assert.equal(input.select(0),false);
  target.navigator.getGamepads=()=>[];
  assert.deepEqual(input.devices(),[]);
  assert(input.available);
});

test('Nitro bumpers are held tick commands with neutral arming and disconnect clearance',()=>{
  const p=pad(2), {input,slots}=fixture(p), zero={...rest,drift:false,boost:false};
  press(p,'drift'); press(p,'boost');
  assert(input.select(2));
  assert.deepEqual(input.poll(true),{command:zero,actions:[]});
  assert.equal(input.ready,false);
  press(p,'drift',0); press(p,'boost',0); input.poll(true); assert(input.ready);
  press(p,'drift'); press(p,'boost'); press(p,'throttle');
  for(let i=0;i<3;i++) assert.deepEqual(input.poll(true),{command:{...zero,throttle:1,drift:true,boost:true},actions:[]});
  assert.deepEqual(input.poll(),{command:{...rest,throttle:1},actions:[]});
  slots[2]=null;
  assert.deepEqual(input.poll(true),{command:zero,actions:[]});
  assert.equal(input.index,null);
});

test('Rocket boost and lateral D-pad require a neutral grid, preserve signed dodge and clear on loss',()=>{
  const p=pad(0), {input,slots}=fixture(p), mode='rocket';
  const clear={...rest,boost:false,dodge:0};
  press(p,'drift'); press(p,'boost'); press(p,'dodgeLeft');
  assert(input.select(0)); assert.deepEqual(input.poll(mode).command,clear); assert(!input.ready);
  for(const name of ['boost','dodgeLeft']) press(p,name,0);
  input.poll(mode); assert(input.ready);
  press(p,'drift'); press(p,'boost'); press(p,'dodgeLeft');
  assert.deepEqual(input.poll(mode).command,{...clear,boost:true,dodge:-1});
  press(p,'dodgeRight'); assert.equal(input.poll(mode).command.dodge,0);
  press(p,'dodgeLeft',0); assert.equal(input.poll(mode).command.dodge,1);
  assert.deepEqual(input.poll(true).command,{...rest,drift:true,boost:true});
  assert.deepEqual(input.poll(false).command,rest);
  slots[0]=null;
  assert.deepEqual(input.poll(mode).command,clear); assert(!input.ready);
});
