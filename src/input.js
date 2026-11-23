// SPDX-License-Identifier: Apache-2.0
import {Actions, attachKeyboard} from '../vendor/vanillajs/modules/input/index.js';

const bindings = {KeyW:'throttle', ArrowUp:'throttle', KeyS:'brake', ArrowDown:'brake',
  KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right', KeyR:'recover', KeyC:'camera'};

export function attachRaceInput(target, enabled) {
  const actions = new Actions();
  const keyboard = attachKeyboard(target, actions, {bindings, enabled});
  return {
    clear: keyboard.clear,
    command: () => ({throttle:actions.value('throttle'), brake:actions.value('brake'), steer:actions.axis('left','right')}),
    recover: () => actions.consume('recover'),
    camera: () => actions.consume('camera')
  };
}
