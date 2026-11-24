// SPDX-License-Identifier: Apache-2.0
import {drivingCommand} from './driver-command.js';
import {attachRaceInput} from './input.js';
import {attachTouchInput} from './touch.js';
import {GamepadInput} from './gamepad.js';

const neutral = mode => ({command:drivingCommand({throttle:0,brake:0,steer:0},mode,()=>false),camera:false,recover:false});

// Exactly one device owns each fixed-tick snapshot. Menu polling may consume UI
// edges while the race clock is stopped, but never supplies a cached driving value.
export function attachDriverInput(target, enabled, onAction, onLost, touchControls, discipline = () => false) {
  let source = 'keyboard';
  const keyboard = attachRaceInput(target, () => source === 'keyboard' && enabled(),
    action => source === 'keyboard' && onAction(action), discipline);
  const pads = new GamepadInput(target, reason => {
    if (source === 'gamepad') onLost(reason);
  });
  const touch = touchControls && typeof target.PointerEvent === 'function' ? attachTouchInput(touchControls, {
    enabled:() => source === 'touch' && enabled(), onPause:() => onAction('pause'), discipline
  }) : null;
  function clear() {
    touch?.clear();
    keyboard.clear();
    pads.clear();
  }
  function select(kind, index, mapper) {
    if (kind === 'gamepad') {
      if (!pads.select(index,mapper)) return false;
    } else if (kind === 'keyboard' || (kind === 'touch' && touch)) pads.deselect();
    else return false;
    source = kind;
    clear();
    return true;
  }
  function readPad(menu) {
    const mode = discipline(), sample = pads.poll(mode);
    for (const action of sample.actions) {
      if ((menu || action === 'pause') && onAction(action)) return neutral(mode);
    }
    if (menu || !enabled()) return neutral(mode);
    return {command:sample.command, camera:sample.actions.includes('camera'), recover:sample.actions.includes('recover')};
  }
  return {pads, clear, select, hasTouch:!!touch,
    get source() { return source; },
    canStart() { return source !== 'gamepad' || (pads.index !== null && pads.ready); },
    menu() { if (source === 'gamepad') readPad(true); },
    sample() { if (source === 'touch') return touch.sample(); return source === 'gamepad' ? readPad(false) : keyboard.sample(); }
  };
}
