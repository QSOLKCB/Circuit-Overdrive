// SPDX-License-Identifier: Apache-2.0
import {drivingActions,drivingCommand} from './driver-command.js';

// W3C standard layout. The browser, rather than the product name, selects it.
export const STANDARD_BUTTONS = Object.freeze({
  throttle:7, brake:6, confirm:0, back:1, pause:9, camera:3, recover:2,
  up:12, down:13, left:14, right:15, drift:4, boost:5, assist:4, dodgeLeft:14, dodgeRight:15
});
const actionNames = drivingActions(false);
const idle = Object.freeze({
  command:Object.freeze({throttle:0, brake:0, steer:0}), actions:Object.freeze([])
});
function idleFor(mode) {
  return Object.freeze({command:Object.freeze(drivingCommand(idle.command,mode,()=>false)),actions:idle.actions});
}
const nitroIdle=idleFor('nitro'), rocketIdle=idleFor('rocket');
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
function outsideDeadzone(value, deadzone) {
  if (Math.abs(value) <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - deadzone) / (1 - deadzone));
}

export function standardGamepad(pad, mode=false) {
  if (pad?.mapping !== 'standard' || !Number.isFinite(pad.axes?.[0])) return null;
  const buttons = pad.buttons;
  const throttle = buttons?.[STANDARD_BUTTONS.throttle]?.value;
  const brake = buttons?.[STANDARD_BUTTONS.brake]?.value;
  if (!Number.isFinite(throttle) || !Number.isFinite(brake)) return null;
  const held = [];
  for (const action of drivingActions(mode)) {
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

// Read the same bounded command for the live driver and the diagnostic display.
// This calculation has no ownership, edge or arming state to consume.
export function readMapping(mapper, pad, mode=false) {
  let mapped;
  try { mapped = mapper(pad,mode); } catch { return null; }
  const names = drivingActions(mode);
  if (!mapped || !Array.isArray(mapped.held) || mapped.held.length > names.length
    || !mapped.held.every(action => names.includes(action))) return null;
  const command = mapped.command;
  if (![command?.throttle, command?.brake, command?.steer].every(Number.isFinite)) return null;
  const throttle = clamp(command.throttle, 0, 1);
  const brake = clamp(command.brake, 0, 1);
  const steer = clamp(command.steer, -1, 1);
  return {
    command:drivingCommand({throttle,brake,steer},mode,name=>mapped.held.includes(name)),
    held:mapped.held,
    neutral:mapped.neutral !== false && !mapped.held.length && !throttle && !brake && !steer
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
  owns(pad) {
    const owner=this.#selected;
    return !!owner && !!pad?.connected && pad.index===owner.index && pad.id===owner.id &&
      pad.mapping===owner.mapping && pad.axes?.length===owner.axes && pad.buttons?.length===owner.buttons;
  }
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
  #lose(reason,stopped) {
    this.deselect();
    this.onLost(reason);
    return stopped;
  }
  poll(mode=false) {
    const stopped = mode==='rocket' ? rocketIdle : mode===true || mode==='nitro' ? nitroIdle : idle;
    const owner = this.#selected;
    if (!owner) return stopped;
    const pad = this.#pads()[owner.index];
    if (!pad?.connected || pad.index !== owner.index || pad.id !== owner.id || pad.mapping !== owner.mapping) {
      return this.#lose('Selected controller is unavailable. Select a controller to reconnect.',stopped);
    }
    if (pad.axes?.length !== owner.axes || pad.buttons?.length !== owner.buttons) {
      return this.#lose('Controller layout changed. Check the profile before driving.',stopped);
    }
    const sample = readMapping(this.#mapper, pad, mode);
    if (!sample) return this.#lose('A mapped controller input is unreadable. Check the profile before driving.',stopped);
    const {command, held} = sample;
    if (!this.#ready) {
      this.#ready = sample.neutral;
      return stopped;
    }
    const actions = held.filter(action => actionNames.includes(action) && !this.#held.has(action));
    this.#held.clear();
    for (const action of held) this.#held.add(action);
    return {command, actions};
  }
  dispose() {
    this.deselect();
    this.target.removeEventListener('gamepaddisconnected', this.disconnect);
  }
}
