// SPDX-License-Identifier: Apache-2.0
import {createHash} from 'node:crypto';
import {closeSync,openSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRocketBody,stepRocketBody} from '../src/rocket-dynamics.js';
import {clamp,dot,length,rotate,scale} from '../vendor/vanillajs/modules/math/index.js';
import {proofSurface} from './fixtures/rocket-proof-surface.mjs';

// Keeping 18 m/s on the straight walls allows over a second of measurement on
// each. The driver can only set the ordinary tick controls. The full-throttle
// pass exercises the same contact route without speed regulation.
function drive(body,fullThrottle) {
  const error=18-length(body.velocity);
  return {throttle:fullThrottle ? 1 : clamp(error,0,1),
    brake:fullThrottle ? 0 : clamp(-error,0,1),steer:0,boost:false,assist:true,dodge:0};
}

export function runRocketTraversal({fullThrottle=false,onTick,onReceipt}={}) {
  let body=createRocketBody(proofSurface.frame(4));
  const hash=createHash('sha256'),sections=[];
  let minClearance=Infinity,maxClearance=0,minAlignment=1,maxSpeed=0,lastStation=4;
  let minLoadedWheels=4,continuous=0;
  for(let i=0;i<3600;i++) {
    const command=drive(body,fullThrottle);
    body=stepRocketBody(body,command,proofSurface);
    const up=rotate(body.orientation,[0,1,0]);
    // A fresh chassis ray decides which patch the body is actually driving on.
    const hit=proofSurface.probe(body.position,scale(up,-1),2);
    if(!hit || hit.station<lastStation-1e-6) throw Error('Lost forward deck traversal at tick '+body.tick);
    lastStation=hit.station;
    minClearance=Math.min(minClearance,hit.distance);
    maxClearance=Math.max(maxClearance,hit.distance);
    minAlignment=Math.min(minAlignment,dot(up,hit.normal));
    maxSpeed=Math.max(maxSpeed,length(body.velocity));
    const loaded=body.wheels.filter(w=>w.contact && w.load>0);
    minLoadedWheels=Math.min(minLoadedWheels,loaded.length);
    let section=sections.at(-1);
    if(section?.id!==hit.id) {
      section={id:hit.id,firstTick:body.tick,lastTick:body.tick,longestFourWheelAttachment:0};
      sections.push(section);
      continuous=0;
    }
    section.lastTick=body.tick;
    continuous=body.attached && loaded.length===4 && loaded.every(w=>w.frame.id===hit.id) ? continuous+1 : 0;
    section.longestFourWheelAttachment=Math.max(section.longestFourWheelAttachment,continuous);
    const line=JSON.stringify({tick:body.tick,command,body})+'\n';
    hash.update(line);
    onReceipt?.(line);
    onTick?.(body,command);
    if(hit.station>=proofSurface.length-4) return {ticks:body.tick,station:hit.station,
      sections,minLoadedWheels,minClearance,maxClearance,minAlignment,maxSpeed,sha256:hash.digest('hex')};
  }
  throw Error('Rocket traversal did not reach the exit floor within 3600 ticks');
}

// Optional full command/state receipts are JSON Lines. An existing receipt is
// never overwritten. The digest is over these exact UTF-8 bytes, including LF.
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  if(args.length && !(args.length===2 && args[0]==='--ticks' && args[1]))
    throw Error('Usage: node tests/rocket-traversal.mjs [--ticks fresh-file.jsonl]');
  const fd=args.length ? openSync(args[1],'wx') : undefined;
  try {
    console.log(JSON.stringify(runRocketTraversal({
      onReceipt:fd===undefined ? undefined : line=>writeFileSync(fd,line),
    }),null,2));
  } finally {
    if(fd!==undefined) closeSync(fd);
  }
}
