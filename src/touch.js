// SPDX-License-Identifier: Apache-2.0
import {drivingActions,drivingCommand} from './driver-command.js';

// Pointer IDs own individual controls. Only sample() publishes a driving command.
export function attachTouchInput(container, {enabled, onPause, nitroMode = () => false, discipline = nitroMode}) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const held = new Map();
  const counts = new Map();
  const pending = new Set();
  let steer = 0;

  function group(className, controls) {
    const row = doc.createElement('div');
    row.className = className;
    for (const [name, text, label] of controls) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset.touch = name;
      button.textContent = text;
      button.setAttribute('aria-label', label);
      counts.set(name, 0);
      row.append(button);
    }
    container.append(row);
    return row;
  }
  const steeringPad = group('touch-steering', [['left', '◀', 'Steer left'], ['right', '▶', 'Steer right']]);
  group('touch-pedals', [['brake', 'Brake', 'Brake or reverse'], ['throttle', 'Gas', 'Accelerate']]);
  group('touch-nitro', [['drift','Drift','Hold drift'],['boost','Boost','Hold boost']]);
  group('touch-dodge', [['dodgeLeft','◀ Dodge','Dodge left'],['dodgeRight','Dodge ▶','Dodge right']]);
  group('touch-actions', [['pause','Pause','Pause race'], ['camera','View','Switch chase camera'],
    ['recover','Recover','Recover car with a three-second penalty']]);

  function changeCount(button, delta) {
    const name = button.dataset.touch;
    const count = counts.get(name) + delta;
    counts.set(name, count);
    button.classList.toggle('held', count > 0);
  }
  // Absolute thumb position across both arrows. The 3 px centre band absorbs
  // contact jitter. The centre of either arrow gives full lock on the first tick.
  function steeringValue(x, rect) {
    const width = rect.right - rect.left;
    const offset = x - (rect.left + width / 2);
    const travel = width * .24 - 3;
    if (travel <= 0 || Math.abs(offset) <= 3) return 0;
    return Math.sign(offset) * Math.round(64 * Math.min(1, (Math.abs(offset) - 3) / travel)) / 64;
  }
  function refreshSteering() {
    let left = 0, right = 0, active = false;
    for (const contact of held.values()) {
      if (contact.steer === null) continue;
      left = Math.min(left, contact.steer);
      right = Math.max(right, contact.steer);
      active = true;
    }
    steer = left + right;
    steeringPad.children[0].classList.toggle('held', left < 0);
    steeringPad.children[1].classList.toggle('held', right > 0);
    steeringPad.classList.toggle('engaged', active);
    steeringPad.style.setProperty('--turn-position', (50 + 24 * steer) + '%');
  }
  function inside(event, rect) {
    return event.clientX >= rect.left && event.clientX < rect.right &&
      event.clientY >= rect.top && event.clientY < rect.bottom;
  }
  function release(id) {
    const contact = held.get(id);
    if (!contact) return;
    held.delete(id);
    if (contact.steer === null) changeCount(contact.target, -1);
    else refreshSteering();
    if (contact.target.hasPointerCapture(id)) contact.target.releasePointerCapture(id);
  }
  function clear() {
    for (const id of held.keys()) release(id);
    pending.clear();
  }
  function interrupt() {
    const driving = enabled();
    clear();
    if (driving) onPause();
  }
  function drive(event) {
    const button = event.target;
    const name = button.dataset?.touch;
    const steering = button === steeringPad || name === 'left' || name === 'right';
    if (!enabled() || event.button !== 0 || held.has(event.pointerId)) return;
    if (!steering && (!counts.has(name) ||
        (name!=='throttle' && name!=='brake' && !drivingActions(discipline()).includes(name)))) return;
    event.preventDefault();
    if (name === 'pause' || name === 'camera' || name === 'recover') {
      action(name);
      return;
    }
    const rect = steering ? steeringPad.getBoundingClientRect() : null;
    if (steering && !inside(event, rect)) return;
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The contact already ended, or the browser cannot retain it safely.
      return;
    }
    held.set(event.pointerId, {target:button, steer:steering ? steeringValue(event.clientX, rect) : null});
    if (steering) refreshSteering();
    else changeCount(button, 1);
  }
  function move(event) {
    const contact = held.get(event.pointerId);
    if (!contact) return;
    const steering = contact.steer !== null;
    const rect = (steering ? steeringPad : contact.target).getBoundingClientRect();
    if (!inside(event, rect)) return release(event.pointerId);
    if (steering) {
      const next = steeringValue(event.clientX, rect);
      if (contact.steer !== next) {
        contact.steer = next;
        refreshSteering();
      }
    }
  }
  function up(event) { release(event.pointerId); }
  function cancel(event) {
    if (held.has(event.pointerId) || event.type === 'pointercancel') interrupt();
  }
  function action(name) {
    if (name === 'pause') interrupt();
    if (name === 'camera' || name === 'recover') pending.add(name);
  }
  function click(event) {
    // Assistive and keyboard activation. Pointer presses already fired, including
    // secondary fingers which do not generate a compatibility mouse click.
    if (event.detail === 0 && enabled()) action(event.target.dataset?.touch);
  }
  function noMenu(event) { event.preventDefault(); }
  function hidden() { if (doc.hidden) interrupt(); }
  const listeners = [
    [container,'pointerdown',drive], [container,'pointermove',move], [container,'pointerup',up],
    [container,'pointercancel',cancel], [container,'lostpointercapture',cancel],
    [container,'click',click], [container,'contextmenu',noMenu],
    [win,'blur',interrupt], [win,'pagehide',interrupt], [doc,'visibilitychange',hidden]
  ];
  // The aspect-ratio query also works when the browser does not expose screen.orientation.
  const landscape = win.matchMedia('(orientation: landscape)');
  if (landscape.addEventListener) listeners.push([landscape,'change',interrupt]);
  listeners.push([win,'orientationchange',interrupt]);
  for (const [target,type,listener] of listeners) target.addEventListener(type,listener);
  return {
    clear,
    sample() {
      if (!enabled()) clear();
      const pressed = key => counts.get(key) > 0;
      const brake = Number(pressed('brake'));
      const axes = {throttle:Number(!brake && pressed('throttle')), brake, steer};
      const command=drivingCommand(axes,discipline(),pressed);
      const snapshot = {command, camera:pending.has('camera'), recover:pending.has('recover')};
      pending.clear();
      return snapshot;
    },
    dispose() {
      for (const [target,type,listener] of listeners) target.removeEventListener(type,listener);
      clear();
      container.replaceChildren();
    }
  };
}
