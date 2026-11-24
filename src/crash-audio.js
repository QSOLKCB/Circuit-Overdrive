// SPDX-License-Identifier: Apache-2.0
// Lab voice for the gesture-owned TouringAudio PCM pool. All envelopes observe
// accepted contacts; the synthesizer has no write path to the experiment.
export class CrashVoice {
  reset() {
    this.tick=-1;this.attack=this.scrape=this.spring=this.phase=this.hitPhase=0;
    this.noise=1729;this.low=0;this.speed=this.throttle=this.wear=0;this.running=false;
    this.pitch=95;this.metal=.3;
  }
  constructor(){this.reset();}
  accept(trial,command) {
    const car=trial.world.cars[0];
    this.speed=Math.hypot(car.vx,car.vz);this.throttle=command.throttle;
    this.wear=car.damage.engine/1000;this.running=trial.phase==='running';
    if(trial.world.tick===this.tick)return;
    this.tick=trial.world.tick;
    for(const hit of trial.lastContacts){
      if(!hit.newImpact)continue;
      const strength=Math.min(1,Math.sqrt(hit.normalImpulse/65000));
      this.attack=Math.max(this.attack,strength);
      this.pitch=hit.normalImpulse<2500?190:hit.normalImpulse<23000?112:54;
      this.metal=hit.material==='steel'?.95:hit.material==='bodywork'?.68:.3;
      this.scrape=Math.max(this.scrape,Math.min(1,Math.abs(hit.tangentialImpulse)/3500));
      this.spring=Math.max(this.spring,Math.min(1,(hit.sites[0].damage.suspension||0)/130));
      this.hitPhase=0;
    }
  }
  write(out,levels) {
    const rate=48000,tau=2*Math.PI,hz=40+this.speed*2.5+this.throttle*14;
    for(let i=0;i<out.length;i++){
      this.noise^=this.noise<<13;this.noise^=this.noise>>>17;this.noise^=this.noise<<5;
      const noise=this.noise/2147483648;
      this.low+=.09*(noise-this.low);this.phase=(this.phase+hz/rate)%1;
      this.hitPhase=(this.hitPhase+this.pitch/rate)%1;
      const engine=this.running ? (.10+.055*this.throttle)*(Math.sin(tau*this.phase)+.22*Math.sin(3*tau*this.phase))
        *(1-this.wear*.4)+this.wear*.10*this.low : 0;
      const strike=this.attack*(.46*Math.sin(tau*this.hitPhase)+.35*this.low+this.metal*.19*Math.sin(7*tau*this.hitPhase));
      const effects=strike+this.scrape*.17*(noise-this.low)+this.spring*.11*Math.sin(4*tau*this.hitPhase);
      this.attack*=.99970;this.scrape*=.99978;this.spring*=.99982;
      const sample=engine*levels.engine+effects*levels.effects;out[i]=sample/(1+.7*Math.abs(sample));
    }
  }
}
