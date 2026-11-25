// SPDX-License-Identifier: Apache-2.0
import {CrashVoice} from './crash-audio.js';
import {labCondition} from './crash-damage.js';

// One bounded accent voice in the existing effects PCM stream.
const cues=Object.freeze({
  failure:[142,37,.32,.18],
  disabled:[103,51,.42,.24],
  knockout:[318,689,.23,.20],
  survivor:[245,440,.67,.20],
  victory:[365,730,.79,.24]
});
const rate=48000,tau=2*Math.PI;

export class DerbyVoice extends CrashVoice {
  reset() {
    super.reset();
    this.cue=null;
    this.settled=false;
    this.cueAge=this.cuePhase=0;
  }
  accept(round,command,{phase,focus,contacts,eliminations}) {
    const car=round.world.cars[focus],prior=this.tick;
    super.accept({
      world:{tick:round.world.tick,cars:[car]},
      phase:phase==='countdown'||phase==='running'||phase==='spectating'?'running':phase,
      lastContacts:contacts
    },command);
    const disabled=labCondition(car.damage).disabled;
    if(disabled)this.running=false;
    let type;
    if(this.tick!==prior){
      // A lateral strike adds a brighter, higher scrape to the common impulse envelope.
      for(const hit of contacts){
        if(hit.newImpact && hit.sites.some(site=>site.zone==='left'||site.zone==='right')){
          this.pitch=165;
          this.scrape=Math.max(this.scrape,Math.min(1,hit.normalImpulse/14000));
        }
      }
      if(eliminations.some(entry=>entry.id===focus))type='disabled';
      else if(eliminations.some(entry=>entry.attackerId===focus))type='knockout';
      else if(eliminations.length)type='failure';
    }
    if(round.result && !this.settled){
      if(round.result.winnerId===focus)type='victory';
      else if(round.result.winnerId!==null)type='survivor';
      this.settled=true;
    }
    if(type){
      this.cue=cues[type];
      this.cueAge=this.cuePhase=0;
    }
  }
  write(out,levels) {
    super.write(out,levels);
    if(!this.cue)return;
    const [from,to,duration,gain]=this.cue;
    for(let i=0;i<out.length;i++){
      const age=this.cueAge++/(duration*rate);
      if(age>=1){this.cue=null;break;}
      this.cuePhase=(this.cuePhase+(from+(to-from)*age)/rate)%1;
      const tone=Math.sin(tau*this.cuePhase)+.26*Math.sin(2*tau*this.cuePhase);
      const envelope=Math.min(1,this.cueAge/260)*(1-age)**2;
      out[i]=Math.max(-1,Math.min(1,out[i]+tone*envelope*levels.effects*gain));
    }
  }
}
