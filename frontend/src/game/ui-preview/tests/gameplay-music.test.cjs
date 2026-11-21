const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.join(__dirname,'../dist');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup({fetcher,samples=new Float32Array(40000)}={}) {
 const events={},soundEvents={},windowEvents={},sources=[],calls=[],status={textContent:''};let engine;
 class Context {
  constructor(){this.currentTime=0;this.state='running';this.destination={};engine=this;}
  resume(){return Promise.resolve();}
  createGain(){return {gain:{value:1},connect(){}};}
  decodeAudioData(){return Promise.resolve({duration:samples.length/1000,sampleRate:1000,getChannelData:()=>samples});}
  createBufferSource(){const node={connect(){},disconnect(){},start(at,offset){this.at=at;this.offset=offset;},stop(){this.stopped=true;}};sources.push(node);return node;}
 }
 const document={hidden:false,querySelector:s=>s==='#sound'?{addEventListener:(t,f)=>soundEvents[t]=f}:status,addEventListener:(t,f)=>events[t]=f};
 const context=vm.createContext({document,window:{AudioContext:Context,addEventListener:(t,f)=>windowEvents[t]=f},fetch:url=>{calls.push(url);return fetcher?fetcher(url):Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});}});
 vm.runInContext('let soundOn=true;'+fs.readFileSync(path.join(base,'gameplay-tracks.js'),'utf8')+fs.readFileSync(path.join(base,'gameplay-music.js'),'utf8'),context);
 let state={screen:'creator',bpm:120,playing:true,turn:'0:creator:0',run:0};
 return {api:context.CopycatGameplayMusic,sources,calls,status,document,get engine(){return engine;},sync:async changes=>{state={...state,...changes};context.CopycatGameplayMusic.sync(state);await settle();},mute:on=>{vm.runInContext('soundOn='+!on,context);soundEvents.click();},visibility:async hidden=>{document.hidden=hidden;events.visibilitychange();await settle();}};
}
test('all 25 presets have distinct local MP4 files and distinct source songs',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'audio/gameplay/manifest.json')));assert.equal(manifest.tracks.length,25);
 assert.equal(new Set(manifest.tracks.map(t=>t.sourceFile)).size,25);
 for(let i=0;i<25;i++){const t=manifest.tracks[i];assert.equal(t.bpm,60+i*5);assert.equal(t.loopSeconds,t.beats*60/t.bpm);assert(fs.statSync(path.join(base,t.src)).size>1000);}
});
test('selected BPM loads its assigned track and uses the audio clock',async()=>{
 const h=setup();await h.sync({bpm:85});assert.deepEqual(h.calls,['audio/gameplay/85.mp4']);assert.equal(h.sources.length,1);h.engine.currentTime=2.75;assert.equal(h.api.position(),2.75);
 await h.sync({bpm:180});assert(h.sources[0].stopped);assert.equal(h.calls.at(-1),'audio/gameplay/180.mp4');assert.equal(h.sources[1].offset,0);
});
test('pause preserves playback offset, mute preserves the beat clock, and turns reset',async()=>{
 const h=setup();await h.sync({});h.engine.currentTime=4;h.mute(true);assert.equal(h.api.position(),4);assert(!h.sources[0].stopped);
 await h.sync({playing:false});assert(h.sources[0].stopped);assert.equal(h.api.position(),null);
 h.engine.currentTime=8;await h.sync({playing:true});assert.equal(h.sources[1].offset,4);
 await h.sync({turn:'0:challenge:0'});assert.equal(h.sources[2].offset,0);
 await h.sync({run:1});assert.equal(h.sources[3].offset,0);
});
test('hidden tabs pause; returning resumes; results and menu stop gameplay music',async()=>{
 const h=setup();await h.sync({});h.engine.currentTime=3;await h.visibility(true);assert(h.sources[0].stopped);await h.visibility(false);assert.equal(h.sources[1].offset,3);
 await h.sync({screen:'score'});assert(h.sources[1].stopped);assert.equal(h.api.position(),null);
 await h.sync({screen:'challenge'});assert.equal(h.sources[2].offset,0);h.api.stop();assert(h.sources[2].stopped);
});
test('a stale download cannot start music after leaving gameplay',async()=>{
 let resolve;const h=setup({fetcher:()=>new Promise(r=>resolve=r)});await h.sync({});await h.sync({screen:'leaderboard'});resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});await settle();assert.equal(h.sources.length,0);
});
test('a failed music file reports failure and can be retried',async()=>{
 let ok=false;const h=setup({fetcher:async()=>({ok,arrayBuffer:async()=>new ArrayBuffer(4)})});await h.sync({});assert.match(h.status.textContent,/unavailable/);ok=true;await h.sync({});assert.equal(h.sources.length,1);assert.match(h.status.textContent,/Playing .*120 BPM/);
});

test('all players begin on the same energetic section after the countdown',async()=>{
 const samples=new Float32Array(30000);
 for(let i=8000;i<22000;i++) samples[i]=i%500<80?.8:.35;
 const h=setup({samples});await h.sync({song:{title:'Test',src:'song.mp4',bpm:120}});
 const cue=h.sources[0].offset;
 assert(cue>=7.9 && cue<=12.1);
 await h.sync({phase:'countdown',run:1});assert(h.sources[0].stopped);
 assert.equal(h.sources.length,1);
 await h.sync({phase:'recording'});assert.equal(h.sources[1].offset,cue);
 h.engine.currentTime=2;assert.equal(h.api.position(),2);
 await h.sync({turn:'0:challenge:0'});assert.equal(h.sources[2].offset,cue);
});
