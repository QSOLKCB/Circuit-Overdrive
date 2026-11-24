// SPDX-License-Identifier: Apache-2.0
// Count resources on a single real page across race restarts and course changes.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:process.env.NATIVE_GL === '1' ? ['--enable-gpu','--use-angle=gl'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:960,height:540}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await page.addInitScript(() => {
    const counts = window.resources = {uploads:0, deletes:0, allocatedBytes:0, retainedBytes:0,
      programs:0, deletedPrograms:0, pcm:0, started:0, ended:0, peakVoices:0};
    const gl = WebGLRenderingContext.prototype;
    const create = gl.createBuffer, dispose = gl.deleteBuffer;
    gl.createBuffer = function() { const buffer = create.call(this); if (buffer) counts.uploads++; return buffer; };
    // Game meshes and sky/lighting geometry use WebGL1 ARRAY_BUFFER.
    const storage = gl.bufferData, sizes = new WeakMap();
    gl.bufferData = function(target,data,usage) {
      const result=storage.call(this,target,data,usage);
      if(target===this.ARRAY_BUFFER){
        const buffer=this.getParameter(this.ARRAY_BUFFER_BINDING);
        const bytes=typeof data==='number'?data:data.byteLength;
        counts.allocatedBytes+=bytes;
        counts.retainedBytes+=bytes-(sizes.get(buffer)??0);
        sizes.set(buffer,bytes);
      }
      return result;
    };
    gl.deleteBuffer = function(buffer) {
      if (buffer && this.isBuffer(buffer)){
        counts.deletes++;
        counts.retainedBytes-=sizes.get(buffer)??0;
        sizes.delete(buffer);
      }
      return dispose.call(this,buffer);
    };
    const createProgram=gl.createProgram, deleteProgram=gl.deleteProgram;
    gl.createProgram=function(){
      const program=createProgram.call(this);
      if(program) counts.programs++;
      return program;
    };
    gl.deleteProgram=function(program){
      if(program && this.isProgram(program)) counts.deletedPrograms++;
      return deleteProgram.call(this,program);
    };
    const allocate = BaseAudioContext.prototype.createBuffer;
    BaseAudioContext.prototype.createBuffer = function(...args) { counts.pcm++; return allocate.apply(this,args); };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      const result = start.apply(this,args);
      counts.started++;
      counts.peakVoices = Math.max(counts.peakVoices, counts.started-counts.ended);
      this.addEventListener('ended', () => counts.ended++, {once:true});
      return result;
    };
  });
  await page.goto(process.argv[2]);
  const skyway=process.argv.includes('--skyway'), orbital=process.argv.includes('--orbital');
  assert(!(orbital && (skyway || process.argv.includes('--night'))),'Orbital cycles include other disciplines');
  assert(!(skyway && process.argv.includes('--night')),'Skyway alternates with day Speedway and night Ridge');
  const waitPhase = phase => page.waitForFunction(value => document.body.dataset.phase === value,phase);
  const live = new Map(), samples = [];
  for (let cycle = 0; cycle < 8; cycle++) {
    const course = orbital ? ['orbital','ridge','orbital','skyway'][cycle%4] : skyway ? ['skyway','ridge','skyway','speedway'][cycle%4] : cycle % 2 === 0 ? 'speedway' : 'ridge';
    const night=process.argv.includes('--night') || ((skyway || orbital) && course==='ridge');
    await page.locator('#choose-'+course).click();
    if (night) await page.locator('#choose-night').click();
    else if (skyway && course!=='skyway') await page.locator('#choose-day').click();
    await page.locator('#start').click();
    await page.keyboard.down('w');
    // The grid hides the previous race's HUD. Require live motion and fresh
    // playback in this cycle before pausing it.
    const previousStarts = samples.at(-1)?.started ?? 0;
    await page.waitForFunction(previous => document.body.dataset.phase === 'racing' &&
      Number(document.querySelector('#speed').textContent) >= 15 && resources.started > previous, previousStarts);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
    await waitPhase('paused');
    await page.locator('#restart').click();
    await waitPhase('grid');
    await page.keyboard.press('Escape');
    await waitPhase('menu');
    await page.waitForFunction(() => resources.started > 0 && resources.started === resources.ended);
    await cdp.send('HeapProfiler.collectGarbage');
    const {usedSize} = await cdp.send('Runtime.getHeapUsage');
    const counts = await page.evaluate(() => ({...window.resources}));
    const retained = counts.uploads-counts.deletes;
    const retainedPrograms=counts.programs-counts.deletedPrograms;
    const footprint={retained,retainedPrograms,retainedBytes:counts.retainedBytes};
    if (live.has(course)) assert.deepEqual(footprint,live.get(course),'WebGL resources accumulated on '+course);
    live.set(course,footprint);
    assert.equal(retainedPrograms,night?3:2,'live sky, material and night programs');
    assert(counts.retainedBytes>0 && counts.retainedBytes<=counts.allocatedBytes);
    assert(retained>0 && counts.pcm===8 && counts.peakVoices<=8);
    samples.push({cycle:cycle+1,course,environment:night?'night':'day',heapBytes:usedSize,retainedWebGLBuffers:retained,retainedPrograms,...counts});
  }
  assert.deepEqual(errors,[]);
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('#world').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  });
  if(process.env.NATIVE_GL==='1') assert.ok(renderer && !/swiftshader|llvmpipe|software/i.test(renderer));
  const source=await page.locator('meta[name=game-revision]').getAttribute('content');
  if(process.env.REPLAY_REVISION) assert.equal(source,process.env.REPLAY_REVISION);
  const environment=await page.locator('body').getAttribute('data-environment') || 'day';
  if(process.argv.includes('--night')) assert.equal(environment,'night');
  console.log(JSON.stringify({browser:browser.version(),renderer,source,environment,samples},null,2));
} finally { await browser.close(); }
