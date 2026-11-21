const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup({bpm=120,suspended=false,deferred=false}={}){
  let now=0,nextId=0,resume;
  const timers=new Map(),ticks=[],classes=new Set();
  const guide={isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},querySelectorAll:()=>[1,2,3,4].map(n=>({dataset:{beat:String(n)},classList:{toggle(){}},setAttribute(){}}))};
  class AudioEngine {
    constructor(){this.state=suspended?'suspended':'running';this.currentTime=0;this.destination={}}
    resume(){if(deferred)return new Promise(resolve=>{resume=()=>{this.state='running';resolve()}});this.state='running';return Promise.resolve()}
    createOscillator(){const tick={};ticks.push(tick);return {frequency:{setValueAtTime:f=>tick.frequency=f,exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start:at=>tick.at=now,stop:at=>tick.duration=at-this.currentTime}}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  }
  const c=vm.createContext({preview:{bpm,beatPlaying:true,screen:'creator'},soundOn:true,audio:undefined,document:{hidden:false,addEventListener(){}},window:{AudioContext:AudioEngine},gameRoot:{querySelector:()=>guide},performance:{now:()=>now},clearTimeout:id=>timers.delete(id),setTimeout:(fn,delay)=>{const id=++nextId;timers.set(id,{fn,at:now+delay});return id}});
  const source=fs.readFileSync(path.join(__dirname,'../dist/game-ui.js'),'utf8');
  vm.runInContext(source.slice(source.indexOf('let beatTimer='),source.indexOf('// Optional, explicit presentation harness.'))+';globalThis.beat={startBeatGuide,stopBeatGuide,beatClick}',c);
  return {c,ticks,classes,start:()=>c.beat.startBeatGuide(),stop:()=>c.beat.stopBeatGuide(),resolve:()=>resume(),advance(late=0){const [id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=timer.at+late;timer.fn()},timers};
}
for(const bpm of [60,120,180])test(`one tick per beat at ${bpm} BPM, with a higher first beat`,()=>{
  const h=setup({bpm});h.start();for(let n=0;n<4;n++)h.advance();
  assert.equal(h.ticks.length,5);
  h.ticks.forEach((tick,n)=>{assert(Math.abs(tick.at-n*60000/bpm)<1);assert.equal(tick.frequency,n%4===0?1800:1400);assert(Math.abs(tick.duration-.035)<.0001)});
  h.stop();assert.equal(h.timers.size,0);assert(!h.classes.has('beat-playing'));
});
test('Sound Off silences ticks while the visual beat keeps moving',()=>{const h=setup();h.start();h.c.soundOn=false;h.advance();h.advance();assert.equal(h.ticks.length,1);assert(h.classes.has('beat-playing'));h.c.soundOn=true;h.advance();assert.equal(h.ticks.length,2)});
test('a suspended audio context resumes before its first tick',async()=>{const h=setup({suspended:true});h.start();assert.equal(h.ticks.length,0);await Promise.resolve();assert.equal(h.ticks.length,1)});
test('a delayed resume cannot tick after pause, mute, or hiding the tab',async()=>{
  for(const action of [h=>h.stop(),h=>h.c.soundOn=false,h=>h.c.document.hidden=true]){const h=setup({suspended:true,deferred:true});h.start();action(h);h.resolve();await Promise.resolve();assert.equal(h.ticks.length,0)}
});
test('re-rendering the guide preserves beat phase and does not duplicate its sound',()=>{const h=setup();h.start();h.start();assert.equal(h.timers.size,1);h.advance();assert.equal(h.ticks.length,2)});

test('a late beat callback skips missed beats and schedules the next absolute boundary',()=>{const h=setup();h.start();h.advance(260);assert.equal(h.ticks[1].at,760);h.advance();assert.equal(h.ticks[2].at,1000)});
