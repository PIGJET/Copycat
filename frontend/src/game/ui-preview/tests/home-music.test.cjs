const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/home-music.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup({initialSound=true,play=()=>Promise.resolve()}={}){
  const home={hidden:false},status={textContent:''},calls={plays:0,pauses:0};
  const soundEvents={},documentEvents={},windowEvents={};let observer;
  const music={volume:1,play(){calls.plays++;return play();},pause(){calls.pauses++;}};
  const document={hidden:false,addEventListener:(type,fn)=>documentEvents[type]=fn,
    querySelector:s=>({'.title-screen':home,'#home-music':music,'#home-music-status':status,'#sound':{addEventListener:(type,fn)=>soundEvents[type]=fn}}[s])};
  const context=vm.createContext({document,window:{addEventListener:(type,fn)=>windowEvents[type]=fn},MutationObserver:class{constructor(fn){observer=fn;}observe(){}}});
  vm.runInContext('let soundOn='+initialSound+';\n'+source,context);
  return {home,music,status,calls,
    interact:type=>documentEvents[type](),
    toggle:async on=>{vm.runInContext('soundOn='+on,context);await soundEvents.click();},
    navigate:async hidden=>{home.hidden=hidden;await observer();},
    visibility:async hidden=>{document.hidden=hidden;await documentEvents.visibilitychange();},
    pagehide:()=>windowEvents.pagehide()};
}
test('sound-on startup plays the MP3 at quiet volume',async()=>{
  const h=setup();await settle();assert.equal(h.calls.plays,1);assert.equal(h.music.volume,0.25);
});
test('muted startup waits until sound is enabled and mute pauses it',async()=>{
  const h=setup({initialSound:false});assert.equal(h.calls.plays,0);
  await h.toggle(true);assert.equal(h.calls.plays,1);
  const before=h.calls.pauses;await h.toggle(false);assert.equal(h.calls.pauses,before+1);
});
test('home navigation, tab visibility, and page exit pause music',async()=>{
  const h=setup();await settle();await h.navigate(true);assert.equal(h.calls.pauses,1);
  h.interact('click');assert.equal(h.calls.plays,1);
  await h.navigate(false);assert.equal(h.calls.plays,2);
  await h.visibility(true);assert.equal(h.calls.pauses,2);
  await h.visibility(false);assert.equal(h.calls.plays,3);
  h.pagehide();assert.equal(h.calls.pauses,3);
});
test('blocked autoplay retries on a gesture and still respects mute',async()=>{
  let blocked=true;
  const h=setup({play:()=>blocked?Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})):Promise.resolve()});
  await settle();assert.match(h.status.textContent,/Click/);
  blocked=false;h.interact('keydown');await settle();assert.equal(h.calls.plays,2);assert.equal(h.status.textContent,'');
  await h.toggle(false);h.interact('click');assert.equal(h.calls.plays,2);
});
test('a delayed play result cannot continue audio after leaving home',async()=>{
  let finish;const h=setup({play:()=>new Promise(resolve=>finish=resolve)});
  await h.navigate(true);finish();await settle();assert.equal(h.calls.plays,1);assert.equal(h.calls.pauses,2);
});
