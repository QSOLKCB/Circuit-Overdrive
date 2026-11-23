// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {attachRaceInput} from '../src/input.js';

test('alias releases, focus loss and OS repeat preserve a neutral input boundary', () => {
  const target = new EventTarget();
  let enabled = true;
  const input = attachRaceInput(target, () => enabled);
  function key(type, code, repeat=false) {
    const event = Object.assign(new Event(type, {cancelable:true}), {code,repeat});
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }
  assert.equal(key('keydown', 'ArrowUp'), true);
  key('keydown', 'KeyW');
  key('keyup', 'KeyW');
  assert.equal(input.command().throttle, 1);
  key('keydown', 'ArrowLeft');
  key('keydown', 'KeyR');
  target.dispatchEvent(new Event('blur'));
  enabled = false;
  key('keydown', 'ArrowRight');
  enabled = true;
  key('keydown', 'KeyW', true);
  assert.deepEqual(input.command(), {throttle:0,brake:0,steer:0});
  assert.equal(input.recover(), false);
  key('keyup', 'ArrowUp');
  key('keydown', 'KeyW');
  assert.equal(input.command().throttle, 1);
});

test('sample separates held pedals from single-tick actions and immediate pause/arming', () => {
  const target = new EventTarget(), transitions = [];
  const input = attachRaceInput(target, () => true, action => {transitions.push(action);return true;});
  const key = (code,options={}) => target.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code,...options}));
  key('Escape'); key('Escape',{repeat:true}); key('Escape',{ctrlKey:true});
  key('KeyW'); key('KeyD'); key('KeyR'); key('KeyC');
  assert.deepEqual(transitions,['pause','arm']);
  const command={throttle:1,brake:0,steer:1};
  assert.deepEqual(input.sample(),{command,camera:true,recover:true});
  assert.deepEqual(input.sample(),{command,camera:false,recover:false});
  input.clear();
  assert.equal(input.sample().command.steer,0);
  input.dispose();
  key('Escape');
  assert.deepEqual(transitions,['pause','arm']);
});

test('Space and either Shift belong only to focused Nitro driving and need a fresh press after blur',()=>{
  const target=new EventTarget();
  let nitro=false, focused=true;
  const input=attachRaceInput(target,()=>focused,()=>false,()=>nitro);
  function key(type, code, repeat=false) {
    const event=Object.assign(new Event(type,{cancelable:true}),{code,repeat});
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }
  for(const code of ['Space','ShiftLeft','ShiftRight']) assert.equal(key('keydown',code),false);
  assert.deepEqual(input.command(),{throttle:0,brake:0,steer:0});
  nitro=true;
  for(const code of ['KeyW','Space','ShiftLeft','ShiftRight']) assert(key('keydown',code));
  key('keyup','ShiftLeft');
  assert.deepEqual(input.sample().command,{throttle:1,brake:0,steer:0,drift:true,boost:true});
  target.dispatchEvent(new Event('blur')); focused=false;
  assert.equal(key('keyup','Space'),false);
  assert.equal(key('keydown','ShiftRight'),false);
  focused=true; key('keydown','ShiftRight',true);
  assert.deepEqual(input.sample().command,{throttle:0,brake:0,steer:0,drift:false,boost:false});
  input.dispose();
});
