// SPDX-License-Identifier: Apache-2.0
export function countBrowserResources() {
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
}
