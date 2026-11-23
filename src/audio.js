// SPDX-License-Identifier: Apache-2.0
import {createVehicleVoice, defaultVehicleSound} from '../vendor/vanillajs/modules/vehicle-audio/index.js';
import {vehicleSoundControls} from '../vendor/vanillajs/demos/horizon-lab/race-audio.js';
import {RaceMusic} from './music.js';

export const DEFAULT_VOLUMES = Object.freeze({master:.8, engine:.85, effects:.75, music:.42});
const RATE = 48000, FRAMES = 3072, BLOCK_SECONDS = FRAMES / RATE;
const TAU = 2 * Math.PI;
const unit = value => Math.max(0, Math.min(1,value));
const profile = {...defaultVehicleSound(), cylinders:8, exhaustTone:.5, smoothingMs:24,
  seed:27, engineGain:.33, exhaustGain:.29, shiftGain:.075, tyreGain:0};

// The upstream voice supplies firing order harmonics, exhaust pulses and the
// gear transient. Everything below reads accepted telemetry without mutating it.
export class TouringVoice {
  constructor() {
    this.motor = createVehicleVoice(profile, {sampleRate:RATE});
    this.echo = new Float32Array(Math.round(.054 * RATE));
    this.reset();
  }

  reset() {
    this.motor.reset();
    this.echo.fill(0);
    this.echoIndex = 0;
    this.target = null;
    this.seed = 270027;
    this.intake = this.lowAir = this.midAir = this.squealPhase = this.hitPhase = 0;
    this.wind = this.squeal = this.hiss = this.tunnel = this.impact = this.attack = 0;
    this.engineLevel = this.effectsLevel = this.railTone = 0;
    this.previousTick = -1;
    this.contact = false;
  }

  accept(player, command, course) {
    const car = player.vehicle;
    const pedal = car.gear < 0 ? command.brake : command.throttle;
    // Actual clutch interruption unloads the exhaust during an automatic shift.
    const throttle = car.tick && !car.brake ? (pedal ?? 0) * (car.shiftRemaining > 0 ? .12 : 1) : 0;
    const target = vehicleSoundControls(car, {throttle, brake:car.brake});
    let scrub = 0, shoulder = 0;
    for (const wheel of car.wheels) {
      if (!wheel.grounded || wheel.load <= 0) continue;
      if (wheel.surfaceId === 'asphalt') {
        const lateral = unit((Math.abs(wheel.lateralSpeed)-1.5)/5);
        const tractionLoss = .65 * unit((wheel.slip-11)/27);
        scrub = Math.max(scrub, Math.max(lateral,tractionLoss)*unit(wheel.load/2400));
      } else {
        shoulder += .25;
      }
    }
    const moving = unit((target.speed-2)/9);
    target.squeal = moving * scrub;
    target.hiss = moving * (target.brake * target.load * .035 + shoulder * .11);
    const span = course.features?.tunnel, s = player.current.s;
    target.tunnel = span ? unit(Math.min(s-span[0],span[1]-s)/9) : 0;
    target.wind = unit((target.speed-8)/48)**1.5 * (1-.65*target.tunnel);

    // Resolve short contacts at the physics tick, even if this audio block is
    // already queued. A sustained scrape generates one attack on initial impact.
    const touching = car.contacts.length > 0;
    if (touching && !this.contact && this.previousTick > 0 && car.tick > this.previousTick) {
      const impulse = Math.hypot(car.velocity[0]-this.vx,car.velocity[2]-this.vz);
      if (impulse > .45) {
        this.impact = Math.max(this.impact, unit((impulse-.45)/5));
        this.railTone = car.contacts.includes('guardrail') ? 1 : .18;
        this.hitPhase = 0;
      }
    }
    this.contact = touching;
    this.previousTick = car.tick;
    [this.vx,,this.vz] = car.velocity;
    // The upstream module validates an exact seven-field input record.
    this.controls = {rpm:target.rpm, throttle, load:target.load, slip:0,
      brake:target.brake, speed:target.speed, gear:target.gear};
    this.target = target;
  }

  write(out, volumes) {
    const t = this.target, motor = this.motor.render(this.controls,out.length);
    // The exhaust is round at idle. Open the intake with engine speed and load
    // so upper harmonics come through under acceleration.
    const cutoff = 280 + t.rpm*.34 + t.throttle*850;
    const intakeBlend = 1-Math.exp(-TAU*cutoff/RATE);
    const tyreFrequency = 700 + Math.min(70,t.speed)*5.2 + 145*t.squeal;
    for (let i=0; i<out.length; i++) {
      this.seed ^= this.seed << 13;
      this.seed ^= this.seed >>> 17;
      this.seed ^= this.seed << 5;
      const noise = this.seed / 2147483648;
      this.lowAir += (noise-this.lowAir)*.014;
      this.midAir += (noise-this.midAir)*.12;
      this.intake += (motor[i]-this.intake)*intakeBlend;
      this.tunnel += (t.tunnel-this.tunnel)*.0005;
      const engine = this.intake + this.echo[this.echoIndex]*this.tunnel*.22;
      this.echo[this.echoIndex] = this.intake;
      this.echoIndex = (this.echoIndex+1) % this.echo.length;

      this.wind += (t.wind-this.wind)*.00065;
      this.squeal += (t.squeal-this.squeal)*.0011;
      this.hiss += (t.hiss-this.hiss)*.0011;
      this.squealPhase = (this.squealPhase+(tyreFrequency+26*this.midAir)/RATE) % 1;
      const rubber = Math.sin(TAU*this.squealPhase) + .24*Math.sin(2*TAU*this.squealPhase);
      const road = this.wind*.30*this.lowAir + this.hiss*(noise-this.lowAir)
        + this.squeal*(.125*rubber+.20*this.midAir);

      this.hitPhase = (this.hitPhase+96/RATE) % 1;
      this.impact *= .99945;
      this.attack += (this.impact-this.attack)*.012;
      const strike = this.attack * (.31*Math.sin(TAU*this.hitPhase)
        + .21*this.midAir + .18*this.railTone*Math.sin(9*TAU*this.hitPhase));
      this.engineLevel += (volumes.engine-this.engineLevel)*.002;
      this.effectsLevel += (volumes.effects-this.effectsLevel)*.002;
      const mix = engine*this.engineLevel + (road+strike)*this.effectsLevel;
      // Soft saturation leaves headroom at maximum sliders and during impacts.
      out[i] = mix / (1+.72*Math.abs(mix));
    }
  }
}

// One gesture-owned device, four reusable PCM buffers and one one-shot source
// per 64 ms of output. Contact and tyre events share that same sample stream.
export class TouringAudio {
  #context = null;
  #gain = null;
  #active = false;
  #failed = false;
  #generation = 0;
  #next = 0;
  #free = [];
  #sources = new Set();
  #musicVoice = null;
  #musicGain = null;
  #musicSources = new Set();
  #musicFree = [];
  #musicNext = 0;
  #levels = {...DEFAULT_VOLUMES};
  #voice = new TouringVoice();
  constructor({contextFactory = () => new AudioContext()} = {}) {
    this.contextFactory = contextFactory;
  }
  // Music is prepared from owned score data; no AudioContext until the gesture.
  selectMusic(courseId) {
    try { this.#musicVoice = new RaceMusic(courseId); return true; }
    catch { this.#musicVoice = null; return false; } // Music must never block racing.
  }
  setVolume(channel, value) {
    if (!Object.hasOwn(DEFAULT_VOLUMES,channel) || !Number.isFinite(value)) throw RangeError('Invalid race audio volume');
    this.#levels[channel] = unit(value);
    if (this.#active) {
      try {
        if (channel === 'master') this.#fade(this.#levels.master);
        if (channel === 'music' && this.#musicGain) this.#fadeGain(this.#musicGain.gain,this.#levels.music);
      } catch { this.#fail(); }
    } else if (channel === 'music' && this.#musicGain) this.#musicGain.gain.value=this.#levels.music;
  }
  #fadeGain(gain,to) {
    const now = this.#context.currentTime;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value,now);
    }
    gain.linearRampToValueAtTime(to,now+.012);
  }
  #fade(to) { this.#fadeGain(this.#gain.gain,to); }
  #prepareMusicDevice(ctx) {
    if (!this.#musicVoice) return;
    if (!this.#musicGain) {
      this.#musicGain=ctx.createGain();
      this.#musicGain.gain.value=this.#levels.music;
      this.#musicGain.connect(this.#gain);
      this.#musicFree=Array.from({length:4},()=>ctx.createBuffer(2,FRAMES,RATE));
    }
  }
  async start() {
    if (this.#active) return true;
    const generation = ++this.#generation;
    this.#failed = false;
    try {
      if (!this.#context) {
        const ctx = this.contextFactory();
        this.#context = ctx;
        this.#gain = ctx.createGain();
        this.#gain.gain.value = 0;
        this.#gain.connect(ctx.destination);
        this.#free = Array.from({length:4}, () => ctx.createBuffer(1,FRAMES,RATE));
      }
      const ctx = this.#context;
      await ctx.resume();
      if (generation !== this.#generation) return false;
      if (ctx.state !== 'running') throw Error('Audio unavailable');
      this.#prepareMusicDevice(ctx);
      this.#voice.reset();
      this.#active = true;
      this.#next = ctx.currentTime+.016;
      this.#musicNext = this.#next;
      this.#fade(this.#levels.master);
      return true;
    } catch {
      if (generation === this.#generation) this.#fail();
      return false;
    }
  }
  stop() {
    this.#generation++;
    if (!this.#active) return;
    this.#active = false;
    try {
      this.#fade(0);
      for (const source of this.#sources) source.stop(this.#context.currentTime+.013);
      for (const source of this.#musicSources) source.stop(this.#context.currentTime+.013);
    } catch { this.#fail(); }
  }
  #fail() {
    this.#failed = true;
    this.#active = false;
    this.#generation++;
    for (const source of this.#sources) {
      source.onended = null;
      try { source.disconnect(); } catch {}
    }
    this.#sources.clear();
    for (const source of this.#musicSources) {
      source.onended=null;
      try { source.disconnect(); } catch {}
    }
    this.#musicSources.clear();
    this.#musicFree = [];
    this.#free = [];
    try { this.#musicGain?.disconnect(); } catch {}
    this.#musicGain=null;
    try { this.#gain?.disconnect(); } catch {}
    try { this.#context?.close().catch(()=>{}); } catch {}
    this.#gain = this.#context = null;
  }

  update(player, command, course, race=null) {
    if (!this.#active) return !this.#failed;
    try {
      const ctx = this.#context;
      if (ctx.state !== 'running') throw Error('Audio interrupted');
      this.#voice.accept(player,command,course);
      if (this.#musicVoice && race) this.#musicVoice.accept(race);
      const now = ctx.currentTime;
      const late = this.#next < now;
      if (late) this.#next = now+.006;
      while (this.#free.length && this.#next < now+.09) {
        const buffer = this.#free.pop(), data = buffer.getChannelData(0);
        this.#voice.write(data,this.#levels);
        if (late && this.#next === now+.006) {
          for (let i=0; i<240; i++) data[i] *= i/240;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.#gain);
        this.#sources.add(source);
        source.onended = () => {
          source.onended = null;
          if (ctx !== this.#context) return;
          source.disconnect();
          this.#sources.delete(source);
          this.#free.push(buffer);
        };
        source.start(this.#next);
        this.#next += BLOCK_SECONDS;
      }
      if (this.#musicVoice && this.#musicGain) {
        if (this.#musicNext < now) this.#musicNext=now+.006;
        while (this.#musicFree.length && this.#musicNext < now+.09) {
          const buffer=this.#musicFree.pop();
          this.#musicVoice.write(buffer.getChannelData(0),buffer.getChannelData(1));
          const source=ctx.createBufferSource();
          source.buffer=buffer;
          source.connect(this.#musicGain);
          this.#musicSources.add(source);
          source.onended=()=>{
            source.onended=null;
            if (ctx!==this.#context) return;
            source.disconnect();
            this.#musicSources.delete(source);
            this.#musicFree.push(buffer);
          };
          source.start(this.#musicNext);
          this.#musicNext+=BLOCK_SECONDS;
        }
      }
      return true;
    } catch {
      this.#fail();
      return false;
    }
  }
}
