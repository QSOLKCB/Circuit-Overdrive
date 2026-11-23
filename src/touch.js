// SPDX-License-Identifier: Apache-2.0
// Pointer IDs own individual controls. Only sample() publishes a driving command.
export function attachTouchInput(container, {enabled, onPause}) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const held = new Map();
  const counts = new Map();
  const pending = new Set();

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
  }
  group('touch-steering', [['left', '◀', 'Steer left'], ['right', '▶', 'Steer right']]);
  group('touch-pedals', [['brake', 'Brake', 'Brake or reverse'], ['throttle', 'Gas', 'Accelerate']]);
  group('touch-actions', [['pause','Pause','Pause race'], ['camera','View','Switch chase camera'],
    ['recover','Recover','Recover car with a three-second penalty']]);

  function changeCount(button, delta) {
    const name = button.dataset.touch;
    const count = counts.get(name) + delta;
    counts.set(name, count);
    button.classList.toggle('held', count > 0);
  }
  function release(id) {
    const button = held.get(id);
    if (!button) return;
    held.delete(id);
    changeCount(button, -1);
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
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
    if (!enabled() || !counts.has(name) || event.button !== 0 || held.has(event.pointerId)) return;
    event.preventDefault();
    if (name === 'pause' || name === 'camera' || name === 'recover') {
      action(name);
      return;
    }
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The contact already ended, or the browser cannot retain it safely.
      return;
    }
    held.set(event.pointerId, button);
    changeCount(button, 1);
  }
  function move(event) {
    const button = held.get(event.pointerId);
    if (!button) return;
    const {left, right, top, bottom} = button.getBoundingClientRect();
    if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) {
      // Leaving the pedal releases it. Crossing another control requires a new press.
      release(event.pointerId);
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
      const command = {throttle:Number(!brake && pressed('throttle')), brake,
        steer:Number(pressed('right'))-Number(pressed('left'))};
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
