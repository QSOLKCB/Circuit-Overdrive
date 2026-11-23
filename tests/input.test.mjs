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
