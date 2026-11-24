// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {attachTouchInput} from '../src/touch.js';

const neutral = {throttle:0, brake:0, steer:0};
function fixture(nitroMode=()=>false) {
  const win = new EventTarget(), orientation = new EventTarget(), doc = new EventTarget();
  const buttons = {};
  let enabled = true, pauses = 0;
  function element() {
    const node = new EventTarget(), classes = new Set(), captured = new Set();
    return Object.assign(node, {
      ownerDocument:doc, dataset:{}, classList:{
        toggle(name, value) { if (value) classes.add(name); else classes.delete(name); },
        contains:name=>classes.has(name)
      },
      setAttribute() {}, replaceChildren() {},
      append(child) { if (child.dataset.touch) buttons[child.dataset.touch] = child; },
      setPointerCapture:id=>captured.add(id), hasPointerCapture:id=>captured.has(id),
      releasePointerCapture:id=>captured.delete(id),
      getBoundingClientRect:()=>({left:0,top:0,right:60,bottom:60})
    });
  }
  Object.assign(doc,{defaultView:win,createElement:element});
  win.matchMedia = () => orientation;
  const container = element();
  const touch = attachTouchInput(container,{nitroMode,enabled:()=>enabled,onPause:()=>{enabled=false; pauses++;}});
  // Delegate events as the DOM does, retaining the button as event.target.
  function fire(type, control, pointerId = 1, extras = {}) {
    const event = new Event(type,{cancelable:true});
    Object.defineProperty(event,'target',{value:buttons[control]});
    Object.assign(event,{pointerId, button:0, clientX:30, clientY:30, ...extras});
    container.dispatchEvent(event);
    return event;
  }
  return {touch,buttons,fire,win,doc,orientation,command:()=>touch.sample().command,
    down:(name,id)=>fire('pointerdown',name,id), up:(name,id)=>fire('pointerup',name,id),
    enable:value=>{enabled=value;}, pauses:()=>pauses};
}

test('each pointer owns one control; release order, opposite steering and pedal overlap are bounded',()=>{
  const t=fixture();
  assert.equal(t.down('throttle',3).defaultPrevented,true);
  t.down('left',8);
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:-1});
  t.down('right',9);
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:0});
  t.up('left',8);
  t.down('brake',17);
  assert.deepEqual(t.command(),{throttle:0,brake:1,steer:1});
  t.up('throttle',3);
  assert.deepEqual(t.command(),{throttle:0,brake:1,steer:1});
  t.up('right',9);
  t.up('brake',17);
  assert.deepEqual(t.command(),neutral);
  assert.equal(t.pauses(),0);
});

test('leaving a captured control releases that finger only, new targets need fresh contact',()=>{
  const t=fixture();
  t.down('throttle',3); t.down('throttle',5); t.down('right',6);
  t.fire('pointermove','throttle',5,{clientX:-1});
  t.fire('lostpointercapture','throttle',5);
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:1});
  t.fire('pointermove','right',6,{clientY:90});
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:0});
  t.fire('pointermove','left',6);
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:0});
  assert.equal(t.pauses(),0);
  t.up('throttle',3);
  assert.deepEqual(t.command(),neutral);
});

test('cancellation, capture loss, page interruption and rotation release every control before explicit resume',()=>{
  for(const interrupt of [
    t=>t.fire('pointercancel','throttle',1), t=>t.fire('lostpointercapture','right',2),
    t=>t.win.dispatchEvent(new Event('blur')),t=>t.win.dispatchEvent(new Event('pagehide')),
    t=>{t.doc.hidden=true; t.doc.dispatchEvent(new Event('visibilitychange'));},
    t=>t.win.dispatchEvent(new Event('orientationchange')),t=>t.orientation.dispatchEvent(new Event('change'))
  ]) {
    const t=fixture();
    t.down('throttle',1); t.down('right',2); t.down('camera',3);
    interrupt(t);
    assert.equal(t.pauses(),1);
    assert.deepEqual(t.touch.sample(),{command:neutral,camera:false,recover:false});
    t.down('throttle',1); t.enable(true); t.fire('pointermove','right',2);
    assert.deepEqual(t.command(),neutral);
    t.down('brake',7);
    assert.deepEqual(t.command(),{throttle:0,brake:1,steer:0});
  }
});

test('switch, pause, restart and discrete actions clear without suppressing simultaneous fingers',()=>{
  const t=fixture();
  t.down('throttle',1); t.down('camera',2); t.down('recover',3);
  assert.deepEqual(t.touch.sample(),{command:{throttle:1,brake:0,steer:0},camera:true,recover:true});
  t.fire('click','camera',2,{detail:1});
  assert.equal(t.touch.sample().camera,false);
  t.fire('click','camera',2,{detail:0});
  assert.equal(t.touch.sample().camera,true);
  t.down('pause',4);
  assert.equal(t.pauses(),1);
  t.enable(true);
  assert.deepEqual(t.command(),neutral);
  t.down('throttle',1); t.touch.clear();
  assert.deepEqual(t.command(),neutral);
  t.down('left',2); t.enable(false); assert.deepEqual(t.command(),neutral);
  t.enable(true); assert.deepEqual(t.command(),neutral);
  t.touch.dispose(); t.down('throttle',1);
  assert.deepEqual(t.command(),neutral);
});

test('four fingers can steer, accelerate, drift and boost; cancellation clears every owner',()=>{
  let nitro=true;
  const t=fixture(()=>nitro);
  for(const [index,control] of ['left','throttle','drift','boost'].entries()) t.down(control,index+1);
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:-1,drift:true,boost:true});
  t.up('drift',3);
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:-1,drift:false,boost:true});
  t.fire('pointercancel','boost',4);
  assert.equal(t.pauses(),1);
  t.enable(true); assert.deepEqual(t.command(),{throttle:0,brake:0,steer:0,drift:false,boost:false});
  nitro=false; assert.equal(t.down('drift',7).defaultPrevented,false);
  assert.deepEqual(t.command(),neutral);
});

test('independent Rocket touch pointers can steer, accelerate, assist, boost and issue a signed dodge',()=>{
  let mode='rocket'; const t=fixture(()=>mode);
  const clear={...neutral,boost:false,assist:false,dodge:0};
  for(const [i,k] of ['right','throttle','assist','boost','dodgeLeft'].entries()) t.down(k,i+1);
  assert.deepEqual(t.command(),{throttle:1,brake:0,steer:1,assist:true,boost:true,dodge:-1});
  t.down('dodgeRight',6); assert.equal(t.command().dodge,0);
  t.up('dodgeLeft',5); assert.equal(t.command().dodge,1);
  t.fire('pointercancel','boost',4); assert.equal(t.pauses(),1);assert.deepEqual(t.command(),clear);
  t.enable(true); assert.deepEqual(t.command(),clear);
  mode='nitro'; assert(!t.down('dodgeRight',8).defaultPrevented && !t.down('assist',9).defaultPrevented);
  assert.deepEqual(t.command(),{...neutral,drift:false,boost:false});
});
