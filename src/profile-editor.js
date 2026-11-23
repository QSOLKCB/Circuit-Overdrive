// SPDX-License-Identifier: Apache-2.0
import {ACTION_NAMES,TUNING,captureNeutral,centredSteering,deviceKey,movedControls,profileError,
  profileMapper,saveProfile,savedProfile,standardProfile} from './profiles.js';

const names={left:'Steer left',right:'Steer right',throttle:'Accelerator',brake:'Brake / reverse',
  confirm:'Confirm / grid start',pause:'Pause / resume',back:'Back',camera:'Camera',recover:'Recover',
  up:'Menu up',down:'Menu down',menuLeft:'Menu left',menuRight:'Menu right'};
const STEPS=['neutral','left','right','centre','throttle','brake','confirm','pause','back','camera','recover','up','down','menuLeft','menuRight'];
const optional=new Set(['back','camera','recover','up','down','menuLeft','menuRight']);
const instructions={neutral:'Release all controls and centre the steering. Capture neutral.',
  left:'Hold steering fully left and capture.',right:'Hold steering fully right and capture.',
  centre:'Release steering to centre and capture.',throttle:'Hold full accelerator and capture.',
  brake:'Hold full brake and capture.'};
const actionKey=step=>step==='menuLeft' ? 'left' : step==='menuRight' ? 'right' : step;
const label=b=>b ? (b.type==='button' ? 'Button ' : b.type==='hat' ? 'Hat axis ' : 'Axis ')+b.index+(b.type==='hat' ? ' @ '+b.full.toFixed(2) : b.full<b.rest ? ' ↓' : ' ↑') : 'Unbound';
const empty=family=>({family,steering:{},actions:{},tuning:{...TUNING}});
const el=(tag,text)=>{
  const result=document.createElement(tag);
  if (text!==undefined) result.textContent=text;
  return result;
};
function button(text,id,handler) {
  const b=el('button',text);
  b.type='button'; b.id=id; b.onclick=handler;
  return b;
}
function setText(node,text) { if (node.textContent!==text) node.textContent=text; }

// The host calls update only for the explicitly highlighted device while its
// dialog is open. Calibration never sends commands to the racing simulation.
export function createProfileEditor(container,{onSave=()=>{}}={}) {
  let pad=null, identity='', draft=null, wizard=null, signature='', cachedMapper=null;
  const details=el('details'), summary=el('summary','Mapping and calibration'), body=el('div');
  details.id='profile-settings'; body.className='profile-editor';
  details.append(summary,body);
  container.replaceChildren(details);
  const family=el('select'), familyLabel=el('label','Controller layout '), observation=el('p');
  family.id='profile-family'; familyLabel.append(family);
  const raw=el('output'), preview=el('output'), message=el('p');
  raw.id='profile-raw'; preview.id='profile-preview'; message.id='profile-message';
  message.setAttribute('role','status');
  raw.setAttribute('aria-label','Observed axes and buttons');
  preview.setAttribute('aria-label','Test drive input');
  // Per-frame raw values and driving preview should not overwhelm a screen reader.
  raw.setAttribute('aria-live','off'); preview.setAttribute('aria-live','off');
  const instructionsNode=el('p'), candidates=el('select'), candidateLabel=el('label','Observed movement ');
  candidateLabel.append(candidates); candidates.id='profile-candidates';
  const capture=button('Capture','profile-capture',take);
  const skip=button('Skip','profile-skip',()=>advance(true));
  const cancel=button('Cancel calibration','profile-cancel',()=>{ wizard=null; refresh(); notice('Calibration cancelled.'); });
  const stage=el('fieldset'), stageTitle=el('legend','Capture controls');
  instructionsNode.id='profile-step'; instructionsNode.setAttribute('role','status');
  const wizardButtons=el('div'); wizardButtons.className='buttons'; wizardButtons.append(capture,skip,cancel);
  stage.append(stageTitle,instructionsNode,candidateLabel,wizardButtons);

  const tuning=el('fieldset'), tuneTitle=el('legend','Steering and pedal response');
  tuning.append(tuneTitle);
  const settings=[
    ['deadzone','Steering deadzone',0,.4,.01],['sensitivity','Steering sensitivity',.25,2,.05],
    ['curve','Steering response curve',.5,3,.05],['throttleRange','Accelerator travel used',.35,1,.05],
    ['brakeRange','Brake travel used',.35,1,.05]
  ];
  const fields=new Map();
  for (const [key,text,min,max,step] of settings) {
    const line=el('label',text+' '), input=el('input'), number=el('span');
    input.type='range'; input.min=min; input.max=max; input.step=step; input.id='profile-'+key;
    input.oninput=()=>{
      draft.tuning[key]=Number(input.value); number.textContent=input.value;
      updateMapper(); notice('Unsaved adjustments.');
    };
    fields.set(key,{input,number}); line.append(number,input); tuning.append(line);
  }
  const invert=el('input'); invert.type='checkbox'; invert.id='profile-invert-steer';
  const invertLabel=el('label','Invert steering '); invertLabel.append(invert); tuning.append(invertLabel);
  invert.onchange=()=>{ draft.tuning.invertSteer=invert.checked; updateMapper(); notice('Unsaved adjustments.'); };
  const polarity=new Map();
  for (const k of ['throttle','brake']) {
    const box=el('input'), line=el('label',names[k]+' decreases when pressed ');
    box.type='checkbox'; box.id='profile-decreasing-'+k;
    box.onchange=()=>{
      // Changing polarity requires a fresh observed rest and pressed endpoint;
      // simply reversing a unipolar mapping could apply full throttle at rest.
      const decreasing=box.checked;
      start([ 'neutral',k ],{pedal:k,decreasing});
    };
    line.append(box); tuning.append(line); polarity.set(k,box);
  }

  const remapGroup=el('fieldset'), remapLabel=el('label','Action to remap '), actionSelect=el('select');
  for (const step of [...ACTION_NAMES.filter(a=>a!=='left' && a!=='right'),'menuLeft','menuRight']) {
    const option=el('option',names[step]); option.value=step; actionSelect.append(option);
  }
  actionSelect.id='profile-remap-action'; remapLabel.append(actionSelect);
  const remap=button('Remap action','profile-remap',()=>start(['neutral',actionSelect.value]));
  remapGroup.append(el('legend','Button assignments'),remapLabel,remap);
  const bindings=el('p'); bindings.id='profile-bindings'; remapGroup.append(bindings);
  const hats=el('input'), hatLabel=el('label','Learn discrete D-pad hat positions ');
  hats.type='checkbox'; hats.id='profile-hat'; hatLabel.append(hats);
  const calibrate=button('Calibrate controls','profile-calibrate',()=>start(STEPS));
  const defaults=button('Restore defaults','profile-defaults',()=>{
    wizard=null; draft=family.value==='standard' ? standardProfile(pad) : empty(family.value);
    refresh(); notice(draft?.throttle ? 'Default calibration ready. Save to apply it.' : 'Unassigned layout. Calibrate or save to forget the stored mapping.');
  });
  const save=button('Save profile','profile-save',()=>{
    try {
      const current=draft.throttle ? draft : null;
      const persistent=saveProfile(pad,current);
      const mapper=current ? profileMapper(current,pad) : null;
      onSave(pad,mapper);
      notice(!persistent ? 'Applied for this session. Browser storage is unavailable.' :
        current ? 'Profile saved on this device.' : 'Saved mapping cleared.');
    } catch (e) { notice(e.message); }
  });
  const controls=el('div'); controls.className='buttons'; controls.append(calibrate,defaults,save);
  body.append(familyLabel,observation,raw,hatLabel,stage,tuning,remapGroup,preview,controls,message);
  function notice(s) { setText(message,s); }
  function updateMapper() { cachedMapper=profileMapper(draft,pad); }
  function refresh() {
    const active=Boolean(wizard);
    stage.hidden=!active; controls.hidden=active; family.disabled=active;
    hatLabel.hidden=family.value!=='generic'; hats.disabled=active;
    const mapped=Boolean(draft?.throttle);
    tuning.hidden=remapGroup.hidden=active || !mapped;
    if (!draft) { cachedMapper=null; return; }
    if (active) {
      const step=wizard.steps[wizard.pos];
      const prompt=instructions[step] || ('Hold the control for '+names[step]+' and capture.');
      instructionsNode.textContent=(wizard.pos+1)+' / '+wizard.steps.length+' · '+prompt;
      skip.hidden=!optional.has(step);
      signature=''; candidates.replaceChildren(); candidateLabel.hidden=true;
      capture.disabled=false;
    } else {
      for (const [key,{input,number}] of fields) {
        input.value=draft.tuning[key]; number.textContent=input.value;
      }
      invert.checked=draft.tuning.invertSteer;
      for (const [k,box] of polarity) box.checked=Boolean(draft[k] && draft[k].full<draft[k].rest);
      bindings.textContent=Object.entries(draft.actions).map(([a,b])=>
        (a==='left' ? names.menuLeft : a==='right' ? names.menuRight : names[a])+' '+label(b)).join(' · ');
      updateMapper();
    }
  }
  function start(steps,polarityCheck=null) {
    const work=steps===STEPS ? empty(family.value) : JSON.parse(JSON.stringify(draft));
    wizard={steps,pos:0,neutral:null,work,polarityCheck};
    refresh(); notice('Use the mouse, touch or Enter to capture each held control. Only Save applies your profile.');
    capture.focus();
  }
  function advance(skipped=false) {
    const step=wizard.steps[wizard.pos];
    if (skipped) delete wizard.work.actions[actionKey(step)];
    if (++wizard.pos<wizard.steps.length) { refresh(); return; }
    const error=profileError(wizard.work,pad);
    if (error) { wizard.pos--; notice(error+' Recalibrate to change earlier bindings.'); refresh(); return; }
    draft=wizard.work; wizard=null; refresh();
    notice('Test the response below. Release all controls, then save.');
    save.focus();
  }
  function take() {
    if (!wizard || !pad) return;
    const step=wizard.steps[wizard.pos], work=wizard.work;
    try {
      if (step==='neutral') {
        wizard.neutral=captureNeutral(pad);
        if (!wizard.neutral) throw Error('A reported input is missing or non-finite.');
      } else if (step==='centre') {
        work.steering=centredSteering(work.steering.left,work.steering.right,pad);
      } else {
        // Re-read at the click. A prior movement released before capture grants no binding.
        const now=movements(step);
        const b=now.length===1 ? now[0] : now.find(c=>key(c)===candidates.value);
        if (!b || (now.length>1 && candidateLabel.hidden)) throw Error('Hold one control, or choose an observed movement before capturing.');
        let target, slot;
        if (step==='left' || step==='right') { target=work.steering; slot=step; }
        else if (step==='throttle' || step==='brake') {
          const check=wizard.polarityCheck;
          if (check && (b.full<b.rest)!==check.decreasing) throw Error('Observed travel has the opposite polarity. Retry or cancel.');
          target=work; slot=step;
        } else { target=work.actions; slot=actionKey(step); }
        const previous=target[slot];
        target[slot]=b;
        const error=profileError(work,pad,{partial:true});
        if (error) {
          if (previous) target[slot]=previous;
          else delete target[slot];
          throw Error(error);
        }
      }
      notice(''); advance();
    } catch (e) { notice(e.message); }
  }
  function movements(step) {
    const directional=['left','right','menuLeft','menuRight','up','down'].includes(step);
    return movedControls(wizard.neutral,pad,{hat:family.value==='generic' && hats.checked && directional});
  }
  function key(b) { return b.type+'-'+b.index; }
  function populate() {
    const saved=savedProfile(pad), standard=standardProfile(pad);
    family.replaceChildren();
    const options=standard ? ['standard','generic','wheel'] : ['generic','wheel'];
    const titles={standard:'Standard gamepad',generic:'Generic / digital gamepad',wheel:'Steering wheel'};
    for (const value of options) {
      const option=el('option',titles[value]); option.value=value; family.append(option);
    }
    draft=saved ?? standard ?? empty('generic');
    family.value=draft.family;
    hats.checked=draft.steering.left?.type==='hat';
    observation.textContent=standard ? 'Browser standard layout detected.' : 'Unmapped device. Capture the controls exposed by your browser.';
    refresh(); notice('');
  }
  family.onchange=()=>{
    hats.checked=false;
    draft=family.value==='standard' ? standardProfile(pad) : empty(family.value);
    refresh(); notice('Layout selected for editing. Calibrate and save to apply.');
  };
  function close() {
    identity=''; pad=draft=wizard=cachedMapper=null;
    details.open=false; details.hidden=true;
    raw.textContent=preview.textContent=''; notice('');
  }
  close();
  return {close, update(device) {
    const id=deviceKey(device);
    if (!id) { if (pad) close(); return; }
    pad=device;
    const selected=pad.index+' '+id;
    if (selected!==identity) {
      wizard=null; identity=selected; details.hidden=false; populate();
    }
    if (!details.open) return;
    const snapshot=captureNeutral(pad);
    if (!snapshot) { setText(raw,'Invalid control reading.'); setText(preview,'Test drive unavailable.'); return; }
    setText(raw,snapshot.axes.map((v,i)=>'A'+i+' '+v.toFixed(2)).concat(snapshot.buttons.flatMap((v,i)=>v>.02 ? ['B'+i+' '+v.toFixed(2)] : [])).join(' · ') || 'Buttons released');
    if (wizard) {
      preview.textContent='';
      const step=wizard.steps[wizard.pos];
      const changes=movements(step);
      const next=changes.map(key).join(',');
      if (next!==signature) {
        signature=next;
        candidates.replaceChildren();
        if (changes.length>1) {
          const prompt=el('option','Choose a channel'); prompt.value=''; candidates.append(prompt);
        }
        for (const b of changes) { const item=el('option',label(b)); item.value=key(b); candidates.append(item); }
      }
      candidateLabel.hidden=step==='neutral' || step==='centre' || changes.length<=1;
      return;
    }
    const output=cachedMapper?.(pad);
    setText(preview,output ? 'Steer '+output.command.steer.toFixed(2)+' · Throttle '+Math.round(output.command.throttle*100)+
      '% · Brake '+Math.round(output.command.brake*100)+'%'+(output.held.length ? ' · '+output.held.join(', ') : '') : 'Test drive available after calibration.');
  }};
}
