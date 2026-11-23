// SPDX-License-Identifier: Apache-2.0

import {createProfileEditor} from './profile-editor.js';
import {deviceKey, savedMapper} from './profiles.js';

// The device picker is independent of the current owner. Previewing a slot
// cannot switch the driver. Labels are inserted as text and stay in this page.
export function controllerMenu(input, onSelect) {
  const $ = id => document.getElementById(id);
  const dialog = $('controller-dialog'), list = $('driver-device');
  let signature = '', devices = [], message = '';
  let previewKey, mapper;
  // Capture and Save can happen between frames. Some browsers replace the
  // Gamepad object on each poll, so always read the current slot for a click.
  function readDevice(expected) {
    if (!expected) return null;
    const key=deviceKey(expected);
    return input.pads.devices().find(live=>live.index===expected.index && deviceKey(live)===key) || null;
  }
  const editor = createProfileEditor($('profile-host'), {readDevice, onSave:(pad,updated) => {
    previewKey = undefined;
    // Saving edits to the owner's device clears every held value before reuse.
    if (input.source === 'gamepad' && input.pads.owns(pad)) {
      if (updated || pad.mapping === 'standard') input.select('gamepad',pad.index,updated || undefined);
      else input.pads.deselect();
    }
    refresh();
  }});
  function close() {
    // Native close events can arrive after fresh input on the next animation
    // frame. Reset ownership synchronously while leaving the editor.
    input.clear();
    editor.close();
    previewKey = undefined;
    dialog.close();
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  window.addEventListener('gamepaddisconnected', e => {
    if (dialog.open && e.gamepad?.index === currentPad()?.index) { editor.close(); previewKey = undefined; }
  });
  function currentPad() {
    return devices.find(pad => list.value === 'pad-' + pad.index);
  }
  function present() {
    const pad = currentPad();
    const key = deviceKey(pad);
    if (key !== previewKey) { previewKey = key; mapper = pad && savedMapper(pad); }
    editor.update(pad);
    const standard = pad?.mapping === 'standard';
    $('driver-layout').textContent = pad ? (mapper ? 'Saved custom controls. Expand Mapping and calibration to preview or adjust them.' : standard
      ? 'Standard layout · left stick steers, right trigger accelerates and left trigger brakes. Bottom face button confirms, right goes back, top changes camera and left recovers. Menu pauses.'
      : 'Open Mapping and calibration to set up this device.') : list.value === 'touch' ? 'Steer and operate pedals with separate fingers. Lift a finger to release its control.' : 'WASD or arrow keys to drive, Esc to pause, C for camera and R to recover.';
    $('use-device').disabled = !!pad && !standard && !mapper;
    $('driver-status').textContent = message || (pad ? 'Release the pedals, steering and buttons before taking control.'
      : input.pads.available ? 'Press a controller button to make it visible to your browser.' : 'Gamepad access is unavailable in this browser or context.');
    $('raw-input').textContent = pad ? 'Axes  ' + Array.from(pad.axes).slice(0,32).map((v,i)=>i+' '+(Number.isFinite(v)?v.toFixed(2):'—')).join('   ')
      + '\nButtons  ' + Array.from(pad.buttons).slice(0,128).flatMap((b,i)=>Number.isFinite(b?.value)&&b.value>.02?[i+' '+b.value.toFixed(2)]:[]).join('   ') : '';
  }
  function refresh() {
    if (!dialog.open) return;
    // Mapping consumes only preview inputs. Poll the owner for loss here because
    // the normal menu intentionally suppresses action edges while editing.
    if ($('profile-settings').open && input.pads.index!==null) input.pads.poll();
    devices = input.pads.devices();
    const next = JSON.stringify(devices.map(p => [p.index,p.id,p.mapping,p.axes.length,p.buttons.length]));
    if (next !== signature) {
      const previous = list.value;
      list.replaceChildren(new Option('Keyboard','keyboard'));
      if (input.hasTouch) list.add(new Option('Touch controls','touch'));
      for (const p of devices) list.add(new Option('Slot '+(p.index+1)+' · '+(p.id || 'Controller')+' · '+(p.mapping==='standard'?'standard':'custom'),'pad-'+p.index));
      if ([...list.options].some(o => o.value === previous)) list.value = previous;
      signature = next;
    }
    present();
  }
  function open() {
    signature = ''; message = '';
    dialog.showModal(); refresh();
    list.value = input.source === 'gamepad' && input.pads.index !== null ? 'pad-'+input.pads.index : input.source === 'touch' ? 'touch' : 'keyboard';
    present(); list.focus();
  }
  list.onchange = () => { message = ''; present(); };
  $('use-device').onclick = () => {
    const pad = currentPad();
    if (pad && !readDevice(pad)) {
      message = 'Device changed. Select the connected controller again.'; refresh(); return;
    }
    const kind = pad ? 'gamepad' : list.value === 'touch' ? 'touch' : 'keyboard';
    if (!input.select(kind, pad?.index, mapper || undefined)) {
      message = 'This controller is missing a required control. Choose another layout or device.';
      present(); return;
    }
    close();
    onSelect(kind);
  };
  $('close-controller').onclick = close;
  return {open, refresh};
}

// Move real DOM focus so the same course buttons and dialogs serve every source.
export function menuAction(action) {
  const dialog = document.querySelector('dialog[open]');
  const active = document.activeElement;
  if (action === 'back' && dialog) {
    if (dialog.id === 'controller-dialog') document.getElementById('close-controller').click();
    else dialog.close();
    return true;
  }
  if (action === 'confirm') {
    if (active?.matches('button:enabled,summary,input[type=checkbox]:enabled')) active.click();
    else if (!dialog) document.querySelector('#start')?.click();
    return true;
  }
  if (!['up','down','left','right'].includes(action)) return false;
  const forward = action === 'down' || action === 'right';
  if (active?.matches('select,input[type="range"]') && ['left','right'].includes(action)) {
    if (active.matches('select')) active.selectedIndex = Math.max(0,Math.min(active.options.length-1,active.selectedIndex+(forward?1:-1)));
    else if (forward) active.stepUp(); else active.stepDown();
    active.dispatchEvent(new Event('input',{bubbles:true}));
    active.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  const available = [...(dialog || document).querySelectorAll('button:enabled,select:enabled,input:enabled,summary')].filter(el => el.getClientRects().length);
  const index = available.indexOf(active);
  available[(index < 0 ? 0 : (index+(forward?1:-1)+available.length)%available.length)]?.focus();
  return true;
}
