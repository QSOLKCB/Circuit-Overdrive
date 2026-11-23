// SPDX-License-Identifier: Apache-2.0
import {STANDARD_BUTTONS} from './gamepad.js';

export const ACTION_NAMES = Object.freeze(['confirm','pause','back','camera','recover','up','down','left','right']);
export const TUNING = Object.freeze({deadzone:.12, sensitivity:1, curve:1, invertSteer:false,
  throttleRange:1, brakeRange:1});
const FILE = 'circuit-overdrive.controller-profiles', VERSION = 1, LIMIT = 16;
const session = new Map();
const within = (n,min,max) => Number.isFinite(n) && n >= min && n <= max;
const unit = n => Math.max(0, Math.min(n,1));
const same = (a,b) => (a.type==='button') === (b.type==='button') && a.index===b.index;
const HAT_TOLERANCE = .035;
const sign = b => Math.sign(b.full-b.rest);
const place = (type,index,rest,full) => ({type,index,rest,full});
const button = i => place('button',i,0,1);
const axesOK = count => Number.isInteger(count) && within(count,0,64);
const buttonsOK = count => Number.isInteger(count) && within(count,0,128);

export function deviceKey(pad) {
  if (!pad || pad.connected === false || typeof pad.id !== 'string' || pad.id.length > 512 ||
      typeof pad.mapping !== 'string' || pad.mapping.length > 32 ||
      !axesOK(pad.axes?.length) || !buttonsOK(pad.buttons?.length)) return null;
  return JSON.stringify([pad.id || ['slot',pad.index],pad.mapping,pad.axes.length,pad.buttons.length]);
}

export function standardProfile(pad) {
  if (pad?.mapping !== 'standard') return null;
  const axes = {left:place('axis',0,0,-1),right:place('axis',0,0,1)};
  const actions = Object.fromEntries(ACTION_NAMES.map(name => [name,button(STANDARD_BUTTONS[name])]));
  const profile = {family:'standard',steering:axes, throttle:button(STANDARD_BUTTONS.throttle),
    brake:button(STANDARD_BUTTONS.brake), actions, tuning:{...TUNING}};
  return profileError(profile,pad) ? null : profile;
}

// Endpoints are observations. In particular a wheel may release at +1, -1,
// or the centre of a combined axis. The rest value always maps to zero.
function validBinding(b,pad) {
  if (!b || !['button','axis','hat'].includes(b.type) || !Number.isInteger(b.index)) return false;
  const min = b.type==='button' ? 0 : b.type==='hat' ? -4 : -1, max = b.type==='hat' ? 4 : 1;
  const length=b.type==='button' ? pad.buttons.length : pad.axes.length;
  return within(b.index,0,length-1) && within(b.rest,min,max) && within(b.full,min,max) &&
    Math.abs(b.full-b.rest)>=(b.type==='hat' ? .10 : .20);
}

function distinctDirections(a,b) {
  if (!same(a,b)) return true;
  if (a.type!==b.type || Math.abs(a.rest-b.rest)>.01) return false;
  if (a.type==='hat') return Math.abs(a.full-b.full)>=.10;
  return a.type==='axis' && sign(a)!==sign(b);
}

export function profileError(p,pad,{partial=false}={}) {
  if (!deviceKey(pad) || !p || !['standard','generic','wheel'].includes(p.family) ||
      (p.family === 'standard' && pad.mapping!=='standard')) return 'Choose a profile for this device.';
  const left=p.steering?.left, right=p.steering?.right;
  if (![left,right,p.throttle,p.brake].every(b=>(partial && !b) || validBinding(b,pad))) return 'Capture both steering limits and both pedals.';
  if (left && right && !distinctDirections(left,right)) return 'Steering needs separate directions from one centre.';
  if (p.throttle?.type==='hat' || p.brake?.type==='hat') return 'Use buttons or linear axes for pedals.';
  if (p.throttle && p.brake && !distinctDirections(p.throttle,p.brake)) return 'Shared pedals need opposite travel from the same neutral point.';
  if ([left,right].some(s=>s && [p.throttle,p.brake].some(b=>b && same(s,b)))) return 'Use separate controls for steering and pedals.';
  const t=p.tuning;
  if (!t || !within(t.deadzone,0,.4) || !within(t.sensitivity,.25,2) || !within(t.curve,.5,3) ||
      !within(t.throttleRange,.35,1) || !within(t.brakeRange,.35,1) || typeof t.invertSteer!=='boolean') {
    return 'Steering or pedal adjustment is outside its supported range.';
  }
  if (!p.actions || (!partial && (!p.actions.confirm || !p.actions.pause))) return 'Map Confirm and Pause before saving.';
  const actions=Object.entries(p.actions);
  if (actions.length>ACTION_NAMES.length) return 'Too many mapped actions.';
  for (let i=0;i<actions.length;i++) {
    const [name,b]=actions[i];
    if (!ACTION_NAMES.includes(name) || !validBinding(b,pad)) return 'An action references a missing control.';
    if ([p.throttle,p.brake].some(pedal=>pedal && same(pedal,b))) return 'Keep pedal controls separate from action buttons.';
    if (!['up','down','left','right'].includes(name) && [left,right].some(s=>s && same(s,b))) {
      return 'Keep steering separate from race actions.';
    }
    for (let j=0;j<i;j++) {
      const [other,c]=actions[j];
      const contextual = (name==='back' && other==='camera') || (name==='camera' && other==='back');
      if (!contextual && !distinctDirections(c,b)) return 'Choose a different control for '+name+' and '+other+'.';
    }
  }
  return '';
}

function observed(pad,type,index) {
  const value = type==='button' ? pad.buttons?.[index]?.value : pad.axes?.[index];
  if (type==='hat') return within(value,-4,4) ? value : NaN;
  return within(value,type==='axis' ? -1 : 0,1) ? value : NaN;
}
function travel(pad,b) {
  const value=observed(pad,b.type,b.index);
  if (!Number.isFinite(value)) return NaN;
  return b.type==='hat' ? Number(Math.abs(value-b.full)<=HAT_TOLERANCE) : unit((value-b.rest)/(b.full-b.rest));
}
function trim(n,deadzone) { return unit((n-deadzone)/(1-deadzone)); }

export function profileMapper(profile,device) {
  if (profileError(profile,device)) return null;
  // Freeze the accepted calibration in the closure. An open settings draft cannot
  // change driving inputs before another explicit selection and neutral gate.
  const p=JSON.parse(JSON.stringify(profile)), t=p.tuning, actions=Object.entries(p.actions);
  const axes=device.axes.length, buttons=device.buttons.length, id=device.id, mapping=device.mapping;
  const hats=[p.steering.left,p.steering.right,...Object.values(p.actions)].filter(b=>b.type==='hat');
  return pad => {
    if (!pad || pad.connected===false || pad.id!==id || pad.mapping!==mapping ||
        pad.axes?.length!==axes || pad.buttons?.length!==buttons) return null;
    const left=travel(pad,p.steering.left), right=travel(pad,p.steering.right);
    const throttle=trim(travel(pad,p.throttle)/t.throttleRange,.02);
    const brake=trim(travel(pad,p.brake)/t.brakeRange,.02);
    const difference=right-left, turn=unit(trim(Math.abs(difference),t.deadzone)**t.curve*t.sensitivity);
    if (![turn,throttle,brake].every(Number.isFinite)) return null;
    const held=[];
    for (const [name,b] of actions) {
      const amount=travel(pad,b);
      if (!Number.isFinite(amount)) return null;
      if (amount>=.5) held.push(name);
    }
    const steer=turn ? turn*Math.sign(difference)*(t.invertSteer ? -1 : 1) : 0;
    const centred=left<=t.deadzone && right<=t.deadzone && hats.every(b=>Math.abs(pad.axes[b.index]-b.rest)<=HAT_TOLERANCE);
    return {command:{throttle,brake,steer},held,neutral:centred};
  };
}

export function captureNeutral(pad) {
  if (!deviceKey(pad)) return null;
  const axes=Array.from(pad.axes,(_,i)=>observed(pad,'hat',i));
  const buttons=Array.from(pad.buttons,(_,i)=>observed(pad,'button',i));
  if (![...axes,...buttons].every(Number.isFinite)) return null;
  return {axes,buttons};
}

// List all substantial movements so the driver can select the intended channel
// when an adapter exposes both a button and an axis for one physical pedal.
export function movedControls(neutral,pad,{hat=false}={}) {
  if (!neutral || !pad || pad.axes?.length!==neutral.axes.length || pad.buttons?.length!==neutral.buttons.length) return [];
  const changes=[];
  for (const [type,values] of [[hat ? 'hat' : 'axis',neutral.axes],['button',neutral.buttons]]) {
    for (let i=0;i<values.length;i++) {
      const full=observed(pad,type,i);
      if (Math.abs(full-values[i])>=(type==='hat' ? .1 : .24)) changes.push(place(type,i,values[i],full));
    }
  }
  return changes;
}

export function centredSteering(left,right,pad) {
  const steering={};
  for (const [name,b] of [['left',left],['right',right]]) {
    if (!validBinding(b,pad)) throw Error('Record both steering limits first.');
    const rest=observed(pad,b.type,b.index);
    if (!Number.isFinite(rest) || Math.abs(rest-b.rest)>.12) throw Error('Release steering back to its resting position.');
    steering[name]={...b,rest};
    if (!validBinding(steering[name],pad)) throw Error('Steering travel is too short.');
  }
  if (!distinctDirections(steering.left,steering.right)) throw Error('Capture opposite steering directions.');
  return steering;
}

function browserStore() { try { return globalThis.localStorage; } catch { return null; } }
function entries(store) {
  try {
    const raw=store?.getItem(FILE);
    if (!raw || raw.length>131072) return [];
    const data=JSON.parse(raw);
    if (data.version!==VERSION || !Array.isArray(data.devices) || data.devices.length>LIMIT) return [];
    return data.devices.filter(row=>row && typeof row.key==='string' && row.key.length<=1024);
  } catch { return []; }
}
export function savedProfile(pad,store=browserStore()) {
  const key=deviceKey(pad);
  const record=session.has(key) ? session.get(key) : entries(store).find(row=>row.key===key)?.profile;
  return record && !profileError(record,pad) ? JSON.parse(JSON.stringify(record)) : null;
}
export function savedMapper(pad) {
  const profile=savedProfile(pad);
  return profile ? profileMapper(profile,pad) : null;
}
export function saveProfile(pad,profile,store=browserStore()) {
  const key=deviceKey(pad);
  if (!key) throw Error('The selected controller is unavailable.');
  if (profile!==null) {
    const error=profileError(profile,pad);
    if (error) throw Error(error);
    const output=profileMapper(profile,pad)(pad);
    if (!output || !output.neutral || output.command.throttle || output.command.brake || output.held.length) {
      throw Error('Release the pedals, centre steering and release all mapped buttons before saving.');
    }
  }
  const value=profile ? JSON.parse(JSON.stringify(profile)) : null;
  session.delete(key);
  session.set(key,value);
  if (session.size>LIMIT) session.delete(session.keys().next().value);
  const devices=entries(store).filter(row=>row.key!==key);
  if (value) devices.push({key,profile:value});
  try {
    if (!store) return false;
    store.setItem(FILE,JSON.stringify({version:VERSION,devices:devices.slice(-LIMIT)}));
    return true;
  } catch { return false; }
}
