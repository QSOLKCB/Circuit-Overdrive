// SPDX-License-Identifier: Apache-2.0

// The device picker is independent of the current owner. Previewing a slot
// cannot switch the driver. Labels are inserted as text and stay in this page.
export function controllerMenu(input, onSelect) {
  const $ = id => document.getElementById(id);
  const dialog = $('controller-dialog'), list = $('driver-device');
  let signature = '', devices = [], message = '';
  function currentPad() {
    return devices.find(pad => list.value === 'pad-' + pad.index);
  }
  function present() {
    const pad = currentPad();
    const standard = pad?.mapping === 'standard';
    $('driver-layout').textContent = pad ? (standard
      ? 'Standard layout · left stick steers, right trigger accelerates and left trigger brakes. Bottom face button confirms, right goes back, top changes camera and left recovers. Menu pauses.'
      : 'This controller needs a custom mapping.') : 'WASD or arrow keys to drive, Esc to pause, C for camera and R to recover.';
    $('use-device').disabled = !!pad && !standard;
    $('driver-status').textContent = message || (pad ? 'Release the pedals, steering and buttons before taking control.'
      : input.pads.available ? 'Press a controller button to make it visible to your browser.' : 'Gamepad access is unavailable in this browser or context.');
    $('raw-input').textContent = pad ? 'Axes  ' + Array.from(pad.axes).slice(0,32).map((v,i)=>i+' '+(Number.isFinite(v)?v.toFixed(2):'—')).join('   ')
      + '\nButtons  ' + Array.from(pad.buttons).slice(0,128).flatMap((b,i)=>Number.isFinite(b?.value)&&b.value>.02?[i+' '+b.value.toFixed(2)]:[]).join('   ') : '';
  }
  function refresh() {
    if (!dialog.open) return;
    devices = input.pads.devices();
    const next = JSON.stringify(devices.map(p => [p.index,p.id,p.mapping,p.axes.length,p.buttons.length]));
    if (next !== signature) {
      const previous = list.value;
      list.replaceChildren(new Option('Keyboard','keyboard'));
      for (const p of devices) list.add(new Option('Slot '+(p.index+1)+' · '+(p.id || 'Controller')+' · '+(p.mapping==='standard'?'standard':'custom'),'pad-'+p.index));
      if ([...list.options].some(o => o.value === previous)) list.value = previous;
      signature = next;
    }
    present();
  }
  function open() {
    signature = ''; message = '';
    dialog.showModal(); refresh();
    list.value = input.source === 'gamepad' && input.pads.index !== null ? 'pad-'+input.pads.index : 'keyboard';
    present(); list.focus();
  }
  function close() {
    // Clear held input before returning to the menu. A queued native close
    // event can otherwise erase fresh input from the following frame.
    input.clear();
    dialog.close();
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  list.onchange = () => { message = ''; present(); };
  $('use-device').onclick = () => {
    const pad = currentPad();
    if (pad && !input.pads.devices().some(p=>p.index===pad.index && p.id===pad.id && p.mapping===pad.mapping)) {
      message = 'Device changed. Select the connected controller again.'; refresh(); return;
    }
    const kind = pad ? 'gamepad' : 'keyboard';
    if (!input.select(kind, pad?.index)) {
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
    if (active?.matches('button:enabled')) active.click();
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
  const available = [...(dialog || document).querySelectorAll('button:enabled,select:enabled,input:enabled')].filter(el => el.getClientRects().length);
  const index = available.indexOf(active);
  available[(index < 0 ? 0 : (index+(forward?1:-1)+available.length)%available.length)]?.focus();
  return true;
}
