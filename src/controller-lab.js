// SPDX-License-Identifier: Apache-2.0
import {readMapping} from './gamepad.js';

function endpoint(binding) {
  return `${binding.type} ${binding.index} (${binding.rest.toFixed(2)} → ${binding.full.toFixed(2)})`;
}

export function describeCalibration(profile, saved) {
  if (!profile) return 'No usable profile';
  const t = profile.tuning;
  return [
    `${saved ? 'Saved' : 'Default'} ${profile.family} profile`,
    `Deadzone ${t.deadzone} · Sensitivity ${t.sensitivity} · Curve ${t.curve} · ${t.invertSteer ? 'Inverted' : 'Normal'} steering`,
    `Left ${endpoint(profile.steering.left)} · Right ${endpoint(profile.steering.right)}`,
    `Accelerator ${endpoint(profile.throttle)} · Travel ${Math.round(t.throttleRange * 100)}%`,
    `Brake ${endpoint(profile.brake)} · Travel ${Math.round(t.brakeRange * 100)}%`
  ].join('\n');
}

function channels(values, type, limit) {
  const labels = [];
  for (let i = 0; i < Math.min(values.length, limit); i++) {
    const value = type === 'B' ? values[i]?.value : values[i];
    labels.push(type + i + ' ' + (Number.isFinite(value) ? value.toFixed(2) : 'unreadable'));
  }
  if (values.length > limit) labels.push(`Showing first ${limit} of ${values.length}`);
  return labels.join(' · ') || 'None';
}

// This view reads fresh browser reports and the highlighted slot's mapping. It
// never selects a device, polls for race actions or contributes a simulation tick.
export function controllerLab(input) {
  const details = document.getElementById('controller-lab');
  const readings = document.getElementById('lab-readings');
  function set(key, value) {
    const el = document.getElementById('lab-' + key);
    if (el.textContent !== value) el.textContent = value;
  }
  details.addEventListener('toggle', () => {
    if (details.open) readings.focus();
  });
  return {
    close() { details.open = false; },
    navigate(action, pad) {
      // Opening <details> immediately exposes the readings, but focus stays on
      // its summary until the browser dispatches the queued toggle event.
      if (!details.open || !details.contains(document.activeElement) || !input.pads.owns(pad)) return false;
      // While inspecting the owner, its buttons are test inputs. Both optional
      // Back and the required Pause binding provide an exit using just the pad.
      if (action === 'back' || action === 'pause') {
        details.open = false;
        details.querySelector('summary').focus();
      }
      return true;
    },
    update(pad, mapper, calibration, count, disconnected) {
      if (!details.open) return;
      const slot = input.pads.index;
      const owner = input.source === 'gamepad' ? (slot === null ? 'Gamepad · No active slot' : `Gamepad · Slot ${slot + 1}`)
        : input.source === 'touch' ? 'Touch controls' : 'Keyboard';
      set('owner', owner);
      const connection = pad ? `Connected · Slot ${pad.index + 1} · ${pad.id || 'No reported name'} · ${pad.mapping || 'unmapped'}`
        : disconnected ? 'Disconnected · Select a connected controller'
        : input.pads.available ? `${count} visible · Select a controller to inspect its channels` : 'Gamepad access unavailable';
      set('device', connection);
      const sample = pad && mapper && readMapping(mapper, pad);
      set('neutral', sample ? (sample.neutral ? 'Yes' : 'No') : 'Unavailable');
      for (const key of ['steer','throttle','brake']) set(key, sample ? sample.command[key].toFixed(2) : '—');
      set('calibration', pad ? calibration : '—');
      set('axes', pad ? channels(pad.axes, 'A', 64) : '—');
      set('buttons', pad ? channels(pad.buttons, 'B', 128) : '—');
    }
  };
}
