// SPDX-License-Identifier: Apache-2.0
// W3C standard layout. The browser, rather than the product name, selects it.
export const STANDARD_BUTTONS = Object.freeze({
  throttle:7, brake:6, confirm:0, back:1, pause:9, camera:3, recover:2,
  up:12, down:13, left:14, right:15
});
const actionNames = ['confirm','back','pause','camera','recover','up','down','left','right'];
const idle = Object.freeze({
  command:Object.freeze({throttle:0, brake:0, steer:0}), actions:Object.freeze([])
});
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
function outsideDeadzone(value, deadzone) {
  if (Math.abs(value) <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - deadzone) / (1 - deadzone));
}

export function standardGamepad(pad) {
  if (pad?.mapping !== 'standard' || !Number.isFinite(pad.axes?.[0])) return null;
  const buttons = pad.buttons;
  const throttle = buttons?.[STANDARD_BUTTONS.throttle]?.value;
  const brake = buttons?.[STANDARD_BUTTONS.brake]?.value;
  if (!Number.isFinite(throttle) || !Number.isFinite(brake)) return null;
  const held = [];
  for (const action of actionNames) {
    const button = buttons[STANDARD_BUTTONS[action]];
    if (!Number.isFinite(button?.value) || typeof button.pressed !== 'boolean') return null;
    if (button.pressed) held.push(action);
  }
  return {
    command:{
      throttle:outsideDeadzone(Math.max(0, throttle), .02),
      brake:outsideDeadzone(Math.max(0, brake), .02),
      steer:outsideDeadzone(pad.axes[0], .12)
    },
    held
  };
}

function readMapping(mapper, pad) {
  let mapped;
  try { mapped = mapper(pad); } catch { return null; }
  if (!mapped || !Array.isArray(mapped.held) || mapped.held.length > actionNames.length
    || !mapped.held.every(action => actionNames.includes(action))) return null;
  const command = mapped.command;
  if (![command?.throttle, command?.brake, command?.steer].every(Number.isFinite)) return null;
  return {
    command:{
      throttle:clamp(command.throttle, 0, 1),
      brake:clamp(command.brake, 0, 1),
      steer:clamp(command.steer, -1, 1)
    },
    held:mapped.held,
    neutral:mapped.neutral !== false
  };
}

// Own one connection. Re-read its slot on every poll because browsers may
// replace the Gamepad object between samples. A disconnect permanently drops
// the selection, including when an identical pad reconnects in the same slot.
export class GamepadInput {
  #selected = null;
  #mapper = null;
  #ready = false;
  #held = new Set();
  #blocked = false;

  constructor(target, onLost = () => {}) {
    this.target = target;
    this.onLost = onLost;
    this.disconnect = event => {
      if (this.#selected && event.gamepad?.index === this.index) this.#lose('Controller disconnected.');
    };
    target.addEventListener('gamepaddisconnected', this.disconnect);
  }
  get index() { return this.#selected?.index ?? null; }
  get ready() { return this.#ready; }
  get available() { return !this.#blocked && typeof this.target.navigator?.getGamepads === 'function'; }

  #pads() {
    try {
      const pads = this.target.navigator?.getGamepads?.() ?? [];
      this.#blocked = false;
      return pads;
    } catch {
      // Browser permissions policy or page lifecycle may restrict Gamepad API access.
      this.#blocked = true;
      return [];
    }
  }
  devices() {
    return Array.from(this.#pads()).filter(pad => pad?.connected && Number.isInteger(pad.index) && pad.index >= 0);
  }

  select(index, mapper = standardGamepad) {
    this.deselect();
    if (!Number.isInteger(index) || index < 0 || typeof mapper !== 'function') return false;
    const pad = this.#pads()[index];
    if (!pad?.connected || pad.index !== index || !Number.isSafeInteger(pad.axes?.length)
      || !Number.isSafeInteger(pad.buttons?.length) || !readMapping(mapper, pad)) return false;
    this.#selected = {index, id:pad.id, mapping:pad.mapping, axes:pad.axes.length, buttons:pad.buttons.length};
    this.#mapper = mapper;
    return true;
  }
  clear() {
    this.#ready = false;
    this.#held.clear();
  }
  deselect() {
    this.clear();
    this.#selected = null;
    this.#mapper = null;
  }
  #lose(reason) {
    this.deselect();
    this.onLost(reason);
    return idle;
  }
  poll() {
    const owner = this.#selected;
    if (!owner) return idle;
    const pad = this.#pads()[owner.index];
    if (!pad?.connected || pad.index !== owner.index || pad.id !== owner.id || pad.mapping !== owner.mapping) {
      return this.#lose('Selected controller is unavailable. Select a controller to reconnect.');
    }
    if (pad.axes?.length !== owner.axes || pad.buttons?.length !== owner.buttons) {
      return this.#lose('Controller layout changed. Check the profile before driving.');
    }
    const sample = readMapping(this.#mapper, pad);
    if (!sample) return this.#lose('A mapped controller input is unreadable. Check the profile before driving.');
    const {command, held} = sample;
    if (!this.#ready) {
      this.#ready = sample.neutral && !held.length && !command.throttle && !command.brake && !command.steer;
      return idle;
    }
    const actions = held.filter(action => !this.#held.has(action));
    this.#held.clear();
    for (const action of held) this.#held.add(action);
    return {command, actions};
  }
  dispose() {
    this.deselect();
    this.target.removeEventListener('gamepaddisconnected', this.disconnect);
  }
}
