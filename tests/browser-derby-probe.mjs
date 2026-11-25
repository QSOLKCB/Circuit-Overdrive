// SPDX-License-Identifier: Apache-2.0
// These probes are injected only into the development harness's Chrome pages.
// Reads and measurements leave the platform input, clock and game state intact.
export function installDerbyProbe({fast}) {
  const nativeFrame=requestAnimationFrame.bind(window);
  let next,now=0;
  if(fast)window.requestAnimationFrame=callback=>{next=callback;return 1;};
  window.advanceDerbyFrame=ticks=>{
    if(!next)throw Error('No derby frame scheduled');
    const callback=next;next=null;
    now+=ticks*1000/60;
    callback(now);
  };
  window.presentDerbyFrame=()=>new Promise(resolve=>nativeFrame(()=>nativeFrame(resolve)));
  const geometry=new WeakMap(), disposable=[];
  let serial=0, drawing=null, groups=[], events, steps, frames;
  let lastContacts, maxEffectCount=0, solverMs=0;
  const pending=[];
  const probe=window.derbyProbe={
    measure:false,
    reset(){events={};steps=[];frames=[];lastContacts=[];maxEffectCount=0;solverMs=0;},
    get events(){return events;},
    get frames(){return frames;},
    report(){return {events,steps,frames,maxEffectCount,disposable};},
    solve(fn){
      const start=performance.now(),value=fn();
      solverMs=performance.now()-start;
      return value;
    },
    step(round,result,physicsMs){
      const {contacts,eliminations,stats}=result;
      const tick=round.ticks;
      const fresh=contacts.filter(hit=>hit.newImpact);
      const madeDamage=hit=>hit.sites.some(site=>Object.keys(site.damage).length);
      const damaging=fresh.filter(madeDamage);
      const vehicle=fresh.filter(hit=>hit.kind==='vehicle');
      function save(name,hits,extra={}) {
        if(!hits.length || events[name])return;
        events[name]={tick,hits,...extra};
      }
      save('first-contact',vehicle.slice(0,1));
      save('crumpled-front',damaging.filter(hit=>hit.sites.some(site=>site.damage.front &&
        round.world.cars[site.id].damage.front>=250)),{driverId:damaging.flatMap(hit=>hit.sites).find(site=>
          site.damage.front && round.world.cars[site.id].damage.front>=250)?.id});
      save('side-panel',damaging.filter(hit=>hit.sites.some(site=>site.damage.left || site.damage.right)),
        {driverId:damaging.flatMap(hit=>hit.sites).find(site=>site.damage.left || site.damage.right)?.id});
      save('severely-damaged-opponent',damaging.filter(hit=>hit.sites.some(site=>site.id!==5 &&
        ['front','rear','left','right'].some(zone=>round.world.cars[site.id].damage[zone]>=800))),
        {driverId:damaging.flatMap(hit=>hit.sites).find(site=>site.id!==5 &&
          ['front','rear','left','right'].some(zone=>round.world.cars[site.id].damage[zone]>=800))?.id});
      if(!events['three-car-pileup'] && vehicle.length){
        // A connected burst can span adjacent ticks as the shock propagates.
        lastContacts=lastContacts.filter(hit=>hit.tick>=tick-10).concat(vehicle);
        for(const hit of vehicle){
          const connected=new Set(hit.participants);
          for(const prior of lastContacts)if(prior.participants.some(id=>connected.has(id)))
            for(const id of prior.participants)connected.add(id);
          if(connected.size>=3){
            save('three-car-pileup',lastContacts.filter(hit=>hit.participants.every(id=>connected.has(id))),
              {drivers:[...connected].sort()});
            break;
          }
        }
      }
      if(eliminations.length){
        save('eliminated',eliminations,{driverId:eliminations[0].id});
        save('remaining-competitors',eliminations,{remaining:round.standings.filter(row=>row.active).map(row=>row.id)});
        const player=eliminations.find(event=>event.id===5);
        if(player)save('player-eliminated',[player],{driverId:5});
      }
      steps.push({tick,physicsMs,solverMs,contacts:contacts.length,damaging:damaging.length,
        accepted:!result.technicalStop,player:result.commands[5],...stats});
    },
    observeRenderer(Renderer){
      const p=Renderer.prototype,{mesh,update,dispose}=p;
      p.mesh=function(vertices){
        const handle=mesh.call(this,vertices);
        geometry.set(handle,{serial:++serial,vertices});
        return handle;
      };
      p.update=function(handle,vertices){
        const start=performance.now(),result=update.call(this,handle,vertices);
        if(drawing){drawing.updateMs+=performance.now()-start;drawing.updateCalls++;drawing.uploads+=Number(result);}
        if(result)geometry.get(handle).vertices=vertices;
        return result;
      };
      p.dispose=function(){
        const before=this.stats();
        dispose.call(this);
        if(!before.disposed)disposable.push({before,after:this.stats(),canvas:this.canvas.id});
      };
    },
    rig(rig){if(drawing)groups.push(rig);},
    generate(fn){
      const start=performance.now(),value=fn();
      if(drawing)drawing.deformMs+=performance.now()-start;
      return value;
    },
    drain(gl,ext){
      if(!ext)return;
      const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);
      while(pending.length && (disjoint || ext.getQueryObjectEXT(pending[0].query,ext.QUERY_RESULT_AVAILABLE_EXT))){
        const {query,row}=pending.shift();
        if(!disjoint)row.gpuMs=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6;
        ext.deleteQueryEXT(query);
      }
    },
    draw(canvas,time,round,phase,effects,fn){
      const gl=canvas.getContext('webgl');
      if(gl.isContextLost())return fn();
      const ext=probe.measure?gl.getExtension('EXT_disjoint_timer_query'):null;
      probe.drain(gl,ext);
      const active=phase==='running' || phase==='spectating';
      const query=active && ext && frames.length%8===0 && pending.length<4 && ext.createQueryEXT();
      if(query)ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);
      groups=[];
      const row=drawing={time,tick:round?.ticks??0,phase,active,updateMs:0,updateCalls:0,deformMs:0,uploads:0};
      const start=performance.now();
      try {return fn();}
      finally {
        row.cpuMs=performance.now()-start;
        if(query){ext.endQueryEXT(ext.TIME_ELAPSED_EXT);pending.push({query,row});}
        frames.push(row);
        maxEffectCount=Math.max(maxEffectCount,effects.length);
        drawing=null;
      }
    },
    async panels(){
      const digest=async array=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',array)),
        x=>x.toString(16).padStart(2,'0')).join('');
      const rigs=groups.map(rig=>rig.zones.map(zone=>({name:zone.name,damage:zone.damage,parts:zone.parts.map(({mesh})=>geometry.get(mesh))})));
      return Promise.all(rigs.map(rig=>Promise.all(rig.map(async ({name,damage,parts})=>({name,damage,
        parts:await Promise.all(parts.map(async ({serial,vertices})=>({serial,hash:await digest(vertices),vertices:vertices.length/11})))
      })))));
    }
  };
  probe.reset();
}
