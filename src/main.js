// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {defaultVehicleSound} from '../vendor/vanillajs/modules/vehicle-audio/index.js';
import {RaceAudio} from '../vendor/vanillajs/demos/horizon-lab/race-audio.js';
import {attachRaceInput} from './input.js';
import {track} from './track.js';
import {FIELD, PLAYER_ID} from './field.js';
import {createScene} from './scene.js';
import {createMap} from './map.js';
import {createRace, startRace, pauseRace, resumeRace, stepRace, recoverCar, STEP} from './sim.js';

const $ = id => document.getElementById(id);
const canvas = $('world');
const clock = new FixedClock({step:STEP});
const audio = new RaceAudio({
  ...defaultVehicleSound(), cylinders:8, exhaustTone:.75, engineGain:.16, exhaustGain:.23, seed:27
});
const drawMap = createMap($('map'), track);
let race = createRace();
let scene, error = '', grid = false, camera = 'chase', sound = true;
let lastTime = null, lastPanel = '', soundGeneration = 0;
const phase = () => error ? 'error' : grid ? 'grid' : race.phase;
const driving = () => ['countdown','racing'].includes(phase());
const focused = () => document.activeElement === canvas && document.hasFocus() && !document.hidden;
const input = attachRaceInput(window, () => driving() && focused());
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
function enterGrid() {
  if (error) return;
  stopAudio();
  resetClock();
  race = createRace();
  grid = true;
  canvas.focus({preventScroll:true});
  updatePanel();
}
function pause() {
  if (grid) grid = false;
  else if (driving()) pauseRace(race);
  else return;
  resetClock();
  stopAudio();
  updatePanel();
}
function resume() {
  if (phase() !== 'paused' || document.hidden || $('help').open) return;
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
  $('hud').hidden = ['menu','grid','error'].includes(mode);
  $('overlay').hidden = !['grid','paused','finished','error'].includes(mode);
  $('continue').hidden = mode !== 'paused';
  $('restart').hidden = !['paused','finished'].includes(mode);
  $('restart').className = mode === 'finished' ? 'primary' : '';
  $('results').hidden = mode !== 'finished';
  $('lights').hidden = !driving();
  const titles = {grid:'On the grid', paused:'Race paused', finished:'Race complete', error:'Graphics unavailable'};
  const copy = {grid:'Press W or ↑ to take the wheel and start the countdown.', paused:'Resume when you’re ready to drive.',
    finished:'P' + race.player.position + ' of 6  ·  ' + formatTime(race.player.elapsedTicks), error};
  set('panel-title', titles[mode] || '');
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
    $('splits').replaceChildren(...race.player.lapTicks.map((ticks, i) => {
      const item = document.createElement('li'), time = document.createElement('strong');
      item.append('Lap ' + (i+1), time);
      time.textContent = formatTime(ticks);
      return item;
    }));
    $('restart').focus({preventScroll:true});
  }
  const statuses = {menu:'Race selection', grid:'Awaiting driver input', countdown:'Starting grid',
    racing:'Race live', paused:'Paused', finished:'Chequered flag', error:'Renderer offline'};
  set('status', statuses[mode]);
}
function graphicsError(message) {
  pause();
  error = message;
  updatePanel();
}
function initializeScene() {
  try {
    scene = createScene(canvas);
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
$('distance').textContent = (track.length / 1000).toFixed(2) + ' km';
$('start').onclick = $('restart').onclick = enterGrid;
$('continue').onclick = resume;
$('sound').onclick = () => {
  sound = !sound;
  syncSound();
  if (sound) playAudio();
  else stopAudio();
};
$('controls').onclick = () => {
  pause();
  $('help').showModal();
};
$('close-help').onclick = () => $('help').close();
window.addEventListener('blur', pause);
canvas.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', pause);
window.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || $('help').open) return;
  if (event.code === 'Escape' && (driving() || grid || phase() === 'paused')) {
    event.preventDefault();
    if (!event.repeat) phase() === 'paused' ? resume() : pause();
  } else if (grid && focused() && ['KeyW','ArrowUp'].includes(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    grid = false;
    startRace(race);
    resetClock();
    playAudio();
    updatePanel();
  }
}, {capture:true});
function fixedUpdate() {
  if (!driving()) return;
  if (!focused()) { pause(); return; }
  if (input.camera()) camera = camera === 'chase' ? 'high' : 'chase';
  if (input.recover() && race.phase === 'racing') recoverCar(race);
  stepRace(race, input.command());
}
function drawHud(p) {
  const player = race.player;
  set('position', player.position);
  showNearby(player);
  set('speed', Math.round(p.speed * 3.6));
  set('gear', p.gear < 0 ? 'R' : p.gear === 0 ? 'N' : p.gear);
  set('lap', player.lap);
  set('timer', formatTime(player.elapsedTicks));
  $('revs').style.width = Math.min(100, p.rpm / 75) + '%';
  let message = '';
  if (player.wrongWay) message = 'Wrong way';
  else if (player.recoveryCooldown > 0) message = 'Recovered  +3 s';
  else if (race.phase === 'racing' && player.lapTicks.length && player.elapsedTicks - player.lapStartTick < 180) {
    message = 'Lap ' + player.lapTicks.length + '  ·  ' + formatTime(player.lapTicks.at(-1));
  }
  $('feedback').hidden = !message;
  set('feedback', message);
  drawMap(race.entrants);
  const light = race.phase === 'countdown' ? Math.ceil(race.countdownTicks / 60) : race.phase === 'racing' && player.elapsedTicks < 42 ? 'GO!' : '';
  $('lights').hidden = !light;
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
  scene.draw(poses, {mode:phase(), camera, dt:elapsed});
  if (!$('hud').hidden) drawHud(poses[PLAYER_ID]);
}
function frame(time) {
  const elapsed = lastTime === null ? 0 : Math.max(0, (time - lastTime) / 1000);
  lastTime = time;
  if (!error && !document.hidden) {
    const alpha = driving() ? clock.advance(elapsed, fixedUpdate).alpha : 1;
    updatePanel();
    try { render(alpha, elapsed); }
    catch (failure) {
      console.error(failure);
      graphicsError('Rendering stopped. Reload to initialise the graphics device again.');
    }
    if (driving() && sound) audio.update(race.player.vehicle, input.command());
  }
  requestAnimationFrame(frame);
}
initializeScene();
requestAnimationFrame(frame);
