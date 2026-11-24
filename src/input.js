// SPDX-License-Identifier: Apache-2.0
import {Actions, attachKeyboard} from '../vendor/vanillajs/modules/input/index.js';

const bindings = {KeyW:'throttle', ArrowUp:'throttle', KeyS:'brake', ArrowDown:'brake',
  KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right', KeyR:'recover', KeyC:'camera'};

// Driving sources return one command and consume momentary actions per fixed tick.
// Arming and pausing must also work when the simulation clock is stopped.
export function attachRaceInput(target, enabled, onAction = () => false, nitroMode = () => false) {
  const actions = new Actions();
  function transition(event) {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    const action = event.code === 'Escape' ? 'pause' : bindings[event.code] === 'throttle' ? 'arm' : null;
    if (action && onAction(action)) event.preventDefault();
  }
  target.addEventListener('keydown',transition,{capture:true});
  const keyboard = attachKeyboard(target, actions, {bindings, enabled});
  const stuntActions = new Actions();
  const stuntKeys = attachKeyboard(target, stuntActions, {
    bindings:{Space:'drift',ShiftLeft:'boost',ShiftRight:'boost'}, enabled:() => enabled() && nitroMode()
  });
  function command() {
    const cmd = {throttle:actions.value('throttle'), brake:actions.value('brake'), steer:actions.axis('left','right')};
    if (nitroMode()) {
      cmd.drift = Boolean(stuntActions.value('drift'));
      cmd.boost = Boolean(stuntActions.value('boost'));
    }
    return cmd;
  }
  const recover = () => actions.consume('recover');
  const camera = () => actions.consume('camera');
  return {
    clear() { keyboard.clear(); stuntKeys.clear(); }, command, recover, camera,
    sample:() => ({command:command(), recover:recover(), camera:camera()}),
    dispose() {
      target.removeEventListener('keydown',transition,{capture:true});
      keyboard.dispose();
      stuntKeys.dispose();
    }
  };
}
