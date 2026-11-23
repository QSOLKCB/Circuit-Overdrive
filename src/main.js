// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {TouringAudio, DEFAULT_VOLUMES} from './audio.js';
import {attachDriverInput} from './driver-input.js';
import {championshipUI} from './championship-ui.js';
import {createRecording} from './replay.js';
import {controllerMenu, menuAction} from './controller-menu.js';
import {track} from './track.js';
import {ridge} from './ridge.js';
import {FIELD, PLAYER_ID} from './field.js';
import {createScene} from './scene.js';
import {createMap, drawCoursePreview} from './map.js';
import {createRace, startRace, pauseRace, resumeRace, stepRace, recoverCar, progress, STEP} from './sim.js';

const $ = id => document.getElementById(id);
const canvas = $('world');
const clock = new FixedClock({step:STEP});
const audio = new TouringAudio();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
let pixelRatio = 1;
const mixer = Object.keys(DEFAULT_VOLUMES);
let reducedEffects;
let quality = 'auto';
let race = createRace();
let recording;
let drawMap = createMap($('map'), race.course);
let scene, error = '', grid = false, camera = 'chase', sound = true;
let lastTime = null, lastPanel = '', soundGeneration = 0;
const phase = () => error ? 'error' : championship.visible ? 'championship' : grid ? 'grid' : race.phase;
const driving = () => ['countdown','racing'].includes(phase());
const modalOpen = () => !!document.querySelector('dialog[open]');
const focused = () => (input.source !== 'keyboard' || document.activeElement === canvas) && document.hasFocus() && !document.hidden && !modalOpen();
const input = attachDriverInput(window, () => driving() && focused(), handleAction, lostController, $('touch-controls'));
const controller = controllerMenu(input, showSource);
const revision = document.querySelector('meta[name=game-revision]').content || null;
const championship = championshipUI({revision, formatTime, grid:() => enterGrid(true),
  changed() { resetClock(); updatePanel(); },
  leave() {
    installRace(createRace(undefined,race.course));
    updatePanel();
    $('enter-woc').focus();
  }
});
let inputNotice = '';
function showSource(kind) {
  inputNotice = '';
  document.body.dataset.input = kind;
  $('foot-keys').hidden = kind !== 'keyboard';
  lastPanel = '';
  updatePanel();
  if (phase() === 'menu') $('start').focus();
  if (championship.visible) championship.focus();
  if (phase() === 'paused') $('continue').focus();
}
function lostController() {
  inputNotice = 'Controller unavailable. Reconnect and select it in Controller, or choose another input.';
  pause();
  lastPanel = '';
  updatePanel();
}
document.body.dataset.input = 'keyboard';
$('controllers').onclick = () => { pause(); input.clear(); controller.open(); };
let announcedPlace, candidatePlace, candidateSince, placeMessage, placeUntil;
const set = (id, value) => {
  const element = $(id), text = String(value);
  if (element.textContent !== text) element.textContent = text;
};
function formatTime(ticks) {
  const ms = Math.round(1000 * ticks * STEP);
  return Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2,'0')
    + '.' + String(ms % 1000).padStart(3,'0');
}
function stopAudio() {
  soundGeneration++;
  audio.stop();
}
async function playAudio() {
  if (!sound || !driving()) return;
  const generation = ++soundGeneration;
  if (!await audio.start() && generation === soundGeneration) {
    sound = false;
    syncSound();
  }
}
function syncSound() {
  set('sound-state', sound ? 'on' : 'off');
  $('sound').setAttribute('aria-pressed', String(sound));
}
function resetClock() {
  lastTime = null;
  clock.reset();
  input.clear();
}
function resetPresentation() {
  scene?.resetEffects();
  announcedPlace = candidatePlace = race.player.position;
  candidateSince = placeUntil = 0;
  placeMessage = '';
}
function installRace(next) {
  const courseChanged = race.course !== next.course;
  race = next;
  recording = null;
  resetPresentation();
  if (courseChanged) {
    camera = 'chase';
    drawMap = createMap($('map'),race.course);
    scene?.dispose();
    initializeScene();
  }
  displayCourse(race.course);
}
function enterGrid(round = false) {
  if (error || (input.source === 'gamepad' && input.pads.index === null)) { if (!error) controller.open(); return; }
  if (!round && !['menu','paused','finished'].includes(phase())) return;
  stopAudio();
  resetClock();
  if (championship.active) championship.abandon(race);
  installRace(round ? championship.takeGrid() : createRace(undefined,race.course));
  grid = true;
  canvas.focus({preventScroll:true});
  updatePanel();
}
function pause() {
  if (grid) {
    grid = false;
    if (championship.active) {
      championship.abandon(race);
      championship.briefing();
    }
  }
  else if (driving()) pauseRace(race);
  else return;
  resetClock();
  stopAudio();
  updatePanel();
}
function resume() {
  if (phase() !== 'paused' || document.hidden || modalOpen() || !input.canStart()) return;
  canvas.focus({preventScroll:true});
  if (!focused()) return;
  resetClock();
  resumeRace(race);
  playAudio();
  updatePanel();
}
function updatePanel() {
  const mode = phase();
  if (mode === lastPanel) return;
  lastPanel = mode;
  document.body.dataset.phase = mode;
  $('menu').hidden = mode !== 'menu';
  $('hud').hidden = ['menu','championship','grid','error'].includes(mode);
  $('woc').hidden = mode !== 'championship';
  $('overlay').hidden = !['grid','paused','finished','error'].includes(mode);
  $('touch-arm').hidden = !(mode === 'grid' && input.hasTouch && (navigator.maxTouchPoints > 0 || input.source === 'touch'));
  $('continue').hidden = mode !== 'paused';
  $('restart').hidden = !['paused','finished'].includes(mode);
  $('restart').className = mode === 'finished' ? 'primary' : '';
  $('courses').hidden = !['paused','finished'].includes(mode);
  $('results').hidden = mode !== 'finished';
  $('save-drive').hidden = mode !== 'finished' || !recording?.complete;
  $('signal').hidden = true;
  $('lights').hidden = true;
  const titles = {grid:'On the grid', paused:'Race paused', finished:race.player.position === 1 ? 'Race winner' : 'Chequered flag', error:'Graphics unavailable'};
  const copy = {grid:input.source === 'touch' ? 'Tap Drive with touch to start the countdown.' : input.source === 'keyboard' ? 'Press W or ↑ to take the wheel and start the countdown.' : 'Release all controls, then press Confirm to start the countdown.', paused:inputNotice || 'Resume when you’re ready to drive.',
    finished:'P' + race.player.position + ' of 6  ·  ' + formatTime(race.player.elapsedTicks), error};
  set('panel-title', titles[mode] || '');
  set('panel-course',championship.active ? championship.roundName : race.course.name);
  set('courses',championship.active ? 'Leave event' : 'Course select');
  set('panel-copy', copy[mode] || '');
  if (mode === 'finished') {
    stopAudio();
    $('classification').replaceChildren(...race.order.map(driver => {
      const item = document.createElement('li'), name = document.createElement('span');
      const time = document.createElement('strong');
      item.dataset.id = driver.id;
      item.classList.toggle('player-row', driver.id === PLAYER_ID);
      name.textContent = driver.position + '.  ' + driver.name + '  #' + driver.number;
      name.style.setProperty('--paint',driver.color);
      const penalty = driver.recoveries ? ' (+' + driver.recoveries*3 + 's)' : '';
      time.textContent = (driver.finishTicks === null ? 'Racing at flag' : formatTime(driver.finishTicks)) + penalty;
      item.append(name,time);
      return item;
    }));
    const splitTimes = race.course.closed ? race.player.lapTicks : race.player.splitTicks;
    $('splits').replaceChildren(...splitTimes.map((ticks, i) => {
      const item = document.createElement('li'), time = document.createElement('strong');
      if (race.course.closed && i === splitTimes.indexOf(Math.min(...splitTimes))) {
        item.className='best-lap';
        item.title='Fastest lap';
      }
      item.append((race.course.closed ? 'Lap ' : 'CP ') + (i+1), time);
      time.textContent = formatTime(ticks);
      return item;
    }));
    $('restart').focus({preventScroll:true});
  }
  if (mode === 'paused' && !document.hidden && !modalOpen()) {
    $('continue').focus({preventScroll:true});
  }
  const statuses = {championship:'World Overdrive Championship', menu:'Race selection', grid:'Awaiting driver input', countdown:'Starting grid',
    racing:'Race live', paused:'Paused', finished:race.player.position === 1 ? 'Race winner' : 'Chequered flag', error:'Renderer offline'};
  set('status', championship.active ? championship.roundName+' · '+statuses[mode] : statuses[mode]);
}
function graphicsError(message) {
  pause();
  error = message;
  updatePanel();
}
function initializeScene() {
  try {
    scene = createScene(canvas, race.course, pixelRatio);
    error = '';
    updatePanel();
  } catch (failure) {
    console.error(failure);
    graphicsError('WebGL could not start. Enable hardware acceleration or try a WebGL-capable browser, then reload.');
  }
}
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  graphicsError('WebGL context lost. The race is suspended while the browser restores graphics.');
});
canvas.addEventListener('webglcontextrestored', () => {
  scene?.dispose();
  initializeScene();
});
function displayCourse(course) {
  const circuit = course.closed;
  document.body.dataset.course = course.id;
  $('choose-speedway').setAttribute('aria-pressed', String(circuit));
  $('choose-ridge').setAttribute('aria-pressed', String(!circuit));
  set('title-first', circuit ? 'Overdrive' : 'Redline');
  set('title-last', circuit ? 'Speedway' : 'Ridge');
  set('distance', (course.length/1000).toFixed(2) + ' km');
  set('format', circuit ? '3 laps' : 'Mountain sprint');
  set('progress-label', circuit ? 'Lap' : 'Checkpoint');
  set('progress-total', ' / ' + (circuit ? 3 : course.gates.length-2));
  set('map-title', course.name);
  set('panel-course', course.name);
  set('split-header', circuit ? 'Your laps' : 'Checkpoint splits');
  $('distance-hud').hidden = circuit;
}
function selectCourse(course) {
  if (phase() !== 'menu' || course === race.course) return;
  resetClock();
  installRace(createRace(undefined,course));
}
$('choose-speedway').onclick = () => selectCourse(track);
$('choose-ridge').onclick = () => selectCourse(ridge);
$('save-drive').onclick = () => {
  if (phase() !== 'finished' || !recording?.complete) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(recording.export())],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'circuit-overdrive-'+race.course.id+'-replay.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('courses').onclick = () => {
  if (!['paused','finished'].includes(phase())) return;
  resetClock();
  stopAudio();
  if (championship.active) {
    championship.abandon(race);
    championship.briefing();
    return;
  }
  installRace(createRace(undefined,race.course));
  updatePanel();
  $(race.course.closed ? 'choose-speedway' : 'choose-ridge').focus();
};
for (const course of [track,ridge]) drawCoursePreview($('preview-'+course.id),course);
displayCourse(race.course);
resetPresentation();
$('enter-woc').onclick = () => { if (phase() === 'menu') championship.open(); };
$('start').onclick = () => enterGrid();
$('restart').onclick = () => { if (['paused','finished'].includes(phase())) enterGrid(championship.active); };
$('continue').onclick = resume;
$('touch-arm').onclick = () => {
  if (!grid || !input.select('touch')) return;
  showSource('touch');
  handleAction('arm');
};
$('sound').onclick = () => {
  sound = !sound;
  syncSound();
  if (sound) playAudio();
  else stopAudio();
};
function applyQuality() {
  const nextRatio = quality === 'mobile' || (quality === 'auto' && coarse.matches) ? .75 : 1;
  const nextReduced = quality === 'reduced' || nextRatio < 1 || (quality === 'auto' && motion.matches);
  if (nextReduced === reducedEffects && nextRatio === pixelRatio) return;
  reducedEffects = nextReduced;
  if (pixelRatio !== nextRatio) {
    pixelRatio = nextRatio;
    if (scene && !error) { scene.dispose(); initializeScene(); }
  }
  document.body.dataset.effects = reducedEffects ? 'reduced' : 'full';
  scene?.resetEffects();
}
function saveSettings() {
  const volumes = Object.fromEntries(mixer.map(name => [name,Number($(name+'-volume').value)/100]));
  try { localStorage.setItem('circuit-overdrive.settings',JSON.stringify({quality,volumes})); } catch {}
}
let saved;
try { saved=JSON.parse(localStorage.getItem('circuit-overdrive.settings')); } catch {}
for (const name of mixer) {
  const slider=$(name+'-volume'), value=saved?.volumes?.[name];
  slider.value=Math.round(100*(Number.isFinite(value) && value>=0 && value<=1 ? value : DEFAULT_VOLUMES[name]));
  const apply=()=>{
    audio.setVolume(name,Number(slider.value)/100);
    set(name+'-level',slider.value+'%');
  };
  apply();
  slider.oninput=()=>{ apply(); saveSettings(); };
}
if (['auto','reduced','full','mobile'].includes(saved?.quality)) quality=saved.quality;
$('effects-quality').value=quality;
$('effects-quality').onchange=()=>{
  quality=$('effects-quality').value;
  applyQuality();
  saveSettings();
};
applyQuality();
$('settings').onclick=()=>{ pause(); $('options').showModal(); };
$('close-settings').onclick=()=>$('options').close();
$('controls').onclick = () => {
  pause();
  $('help').showModal();
};
$('close-help').onclick = () => $('help').close();
window.addEventListener('blur', pause);
canvas.addEventListener('blur', event => {
  if (grid && event.relatedTarget === $('touch-arm')) return;
  if (input.source === 'keyboard') pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', pause);
function handleAction(action) {
  if (document.hidden || !document.hasFocus()) return false;
  if ($('controller-dialog').open) return input.source === 'gamepad' && controller.navigate(action);
  if (modalOpen()) return input.source === 'gamepad' && menuAction(action);
  if (championship.visible && (action === 'back' || action === 'pause')) {
    championship.back();
    return true;
  }
  if (input.source === 'gamepad') {
    if (grid && action === 'confirm') action = 'arm';
    else if (grid && action === 'back') action = 'pause';
    else if (phase() === 'paused' && action === 'back') action = 'pause';
    else if (!grid && !driving() && action !== 'pause') return menuAction(action);
  }
  if (action === 'pause' && (driving() || grid || phase() === 'paused')) {
    phase() === 'paused' ? resume() : pause();
    return true;
  }
  if (action === 'arm' && grid && focused() && input.canStart()) {
    grid = false;
    startRace(race);
    audio.selectMusic(race.course.id); // New race: reset the soundtrack timeline.
    recording = createRecording(race.course.id, race.seed, revision);
    resetClock();
    playAudio();
    updatePanel();
    return true;
  }
  return false;
}
function fixedUpdate() {
  if (!driving()) return;
  if (!focused()) { pause(); return; }
  const {command, camera:switchView, recover} = input.sample();
  if (!driving()) return; // A polled pause or disconnect takes effect on this same tick.
  if (switchView) camera = camera === 'chase' ? 'high' : 'chase';
  const recovered = recover && race.phase === 'racing' && recoverCar(race);
  recording.record(command, recovered);
  if (championship.active) championship.step(race,command);
  else stepRace(race,command);
  scene.observe(race,reducedEffects);
  if (driving() && sound && audio.update(race.player,command,race.course,race) === false) {
    sound = false;
    syncSound();
  }
  if (championship.active && race.phase === 'finished') {
    stopAudio();
    championship.finish(race);
    return;
  }
  const place=race.player.position;
  if (candidatePlace !== place) {
    candidatePlace=place;
    candidateSince=race.elapsedTicks;
  } else if (place !== announcedPlace && race.elapsedTicks-candidateSince >= 12) {
    placeMessage=(place<announcedPlace ? 'Up to P' : 'Back to P')+place;
    announcedPlace=place;
    placeUntil=race.elapsedTicks+90;
  }
}
function drawHud(p) {
  const player = race.player;
  set('position', player.position);
  showNearby(player);
  set('speed', Math.round(p.speed * 3.6));
  set('gear', p.gear < 0 ? 'R' : p.gear === 0 ? 'N' : p.gear);
  if (race.course.closed) set('lap', player.lap);
  else {
    set('lap', player.splitTicks.length);
    const metres = Math.max(0, race.course.length-Math.max(0,progress(player,race.course)));
    set('remaining', metres >= 1000 ? (metres/1000).toFixed(2)+' km' : Math.ceil(metres)+' m');
  }
  const splits=race.course.closed ? player.lapTicks : player.splitTicks;
  $('last-split').hidden = splits.length===0;
  if (splits.length) set('last-split',(race.course.closed ? 'Lap ' : 'Split ')+splits.length+'  '+formatTime(splits.at(-1)));
  set('timer', formatTime(player.elapsedTicks));
  $('revs').style.width = Math.min(100, p.rpm / 75) + '%';
  let message = '';
  if (player.wrongWay) message = 'Wrong way';
  else if (player.recoveryCooldown > 0) message = 'Recovered  +3 s';
  else if (!race.course.closed && player.splitTicks.length && player.elapsedTicks-player.splitTicks.at(-1)<180) {
    message = 'CP ' + player.splitTicks.length + '  ·  ' + formatTime(player.splitTicks.at(-1));
  }
  else if (race.phase === 'racing' && player.lapTicks.length && player.elapsedTicks - player.lapStartTick < 180) {
    const n = player.lapTicks.length;
    message = (player.lap === 3 ? 'Final lap' : 'Lap '+n+' complete')+'  ·  '+formatTime(player.lapTicks.at(-1));
  }
  else if (race.phase === 'racing' && race.elapsedTicks < placeUntil) message = placeMessage;
  $('feedback').hidden = !message;
  set('feedback', message);
  drawMap(race.entrants);
  const light = race.phase === 'countdown' ? Math.ceil(race.countdownTicks / 60) : race.phase === 'racing' && player.elapsedTicks < 42 ? 'GO!' : '';
  $('signal').hidden = $('lights').hidden = !light;
  if (light) $('signal').dataset.light = light;
  set('lights', light);
}
function showNearby(player) {
  let nearest = null, distance = 60;
  for (const other of race.entrants) {
    if (other === player || other.finishTicks !== null) continue;
    const metres = Math.hypot(other.current.x-player.current.x, other.current.z-player.current.z);
    if (metres < distance) { nearest = other; distance = metres; }
  }
  $('nearby').hidden = !nearest;
  if (nearest) set('nearby', '#' + nearest.number + ' ' + nearest.name + ' · ' + Math.round(distance) + ' m');
}

const poses = FIELD.map(driver => ({id:driver.id, compression:new Array(4)}));
const smoothFields = ['x','y','groundY','z','roll','pitch','speed','steering'];
const angles = ['yaw','wheelSpin'];
function render(alpha, elapsed) {
  for (const driver of race.entrants) {
    const a = driver.previous, b = driver.current, p = poses[driver.id];
    p.vx=driver.vehicle.velocity[0];
    p.vz=driver.vehicle.velocity[2];
    p.gear=b.gear;
    p.rpm=b.rpm;
    p.brake=b.brake;
    for (let wheel=0;wheel<4;wheel++) {
      p.compression[wheel]=a.compression[wheel]+(b.compression[wheel]-a.compression[wheel])*alpha;
    }
    p.finished = driver.finishTicks !== null;
    for (const key of smoothFields) p[key] = a[key] + (b[key]-a[key])*alpha;
    for (const key of angles) p[key] = a[key] + Math.atan2(Math.sin(b[key]-a[key]), Math.cos(b[key]-a[key]))*alpha;
  }
  scene.draw(poses,{mode:championship.visible ? 'menu' : phase(),camera,dt:elapsed,reducedEffects,reducedMotion:motion.matches || reducedEffects});
  if (!$('hud').hidden) drawHud(poses[PLAYER_ID]);
}
function frame(time) {
  const elapsed = lastTime === null ? 0 : Math.max(0, (time - lastTime) / 1000);
  lastTime = time;
  if (!error && !document.hidden) {
    // Read the effective preference before drawing, including after a missed
    // MediaQueryList change notification or a suspended browser tab.
    if (quality === 'auto') applyQuality();
    if ($('controller-dialog').open) controller.refresh();
    if (!driving() && document.hasFocus()) input.menu();
    const alpha = driving() ? clock.advance(elapsed, fixedUpdate).alpha : 1;
    updatePanel();
    try { render(alpha, elapsed); }
    catch (failure) {
      console.error(failure);
      graphicsError('Rendering stopped. Reload to initialise the graphics device again.');
    }
  }
  requestAnimationFrame(frame);
}
initializeScene();
$('boot-note').hidden = true;
$('start').disabled = $('enter-woc').disabled = false;
requestAnimationFrame(frame);
