const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/home-music.js'),'utf8');
function setup(apiReady=true,initialSound=false){
  const home={hidden:false},panel={hidden:true},status={textContent:''};
  const soundEvents={},documentEvents={},calls={plays:0,pauses:0,created:0,scripts:0};
  let observe,options;
  const iframe={};
  const player={getIframe:()=>iframe,setVolume:v=>calls.volume=v,playVideo:()=>calls.plays++,pauseVideo:()=>calls.pauses++};
  const api={Player:function(id,config){calls.created++;options=config;config.events.onReady({target:player});return player;}};
  const window={addEventListener(){}};
  if(apiReady)window.YT=api;
  const document={hidden:false,head:{appendChild(){calls.scripts++;}},createElement:()=>({}),addEventListener:(type,fn)=>documentEvents[type]=fn,
    querySelector:s=>({'.title-screen':home,'#home-music':panel,'#home-music-status':status,'#sound':{addEventListener:(type,fn)=>soundEvents[type]=fn}}[s])};
  const context=vm.createContext({window,document,location:{origin:'https://copycat.example'},Promise,setTimeout,clearTimeout,MutationObserver:class{constructor(fn){observe=fn;}observe(){}}});
  vm.runInContext('let soundOn='+initialSound+';\n'+source,context);
  return {home,panel,status,calls,document,options:()=>options,
    interact:type=>documentEvents[type](),
    toggle:async on=>{vm.runInContext('soundOn='+on,context);await soundEvents.click();},
    navigate:async hidden=>{home.hidden=hidden;await observe();},
    visibility:async hidden=>{document.hidden=hidden;await documentEvents.visibilitychange();},
    ready:async()=>{window.YT=api;window.onYouTubeIframeAPIReady();await new Promise(resolve=>setImmediate(resolve));}};
}
test('music loads only after opt-in and uses the requested track at quiet volume',async()=>{
  const h=setup();assert.equal(h.calls.created,0);assert.equal(h.calls.scripts,0);
  await h.toggle(true);assert.equal(h.calls.created,1);assert.equal(h.options().videoId,'mRN_T6JkH-c');assert.equal(h.calls.volume,25);assert.equal(h.panel.hidden,false);
  await h.toggle(false);assert.equal(h.calls.pauses,1);assert.equal(h.panel.hidden,true);
});
test('music pauses when leaving home or hiding the tab and resumes only on home',async()=>{
  const h=setup();await h.toggle(true);await h.navigate(true);assert.equal(h.calls.pauses,1);assert.equal(h.panel.hidden,true);
  await h.toggle(false);await h.toggle(true);assert.equal(h.calls.plays,1);
  await h.navigate(false);assert.equal(h.calls.plays,2);
  await h.visibility(true);assert.equal(h.calls.pauses,4);
  await h.visibility(false);assert.equal(h.calls.plays,3);
});
test('an API response after navigation never starts hidden playback',async()=>{
  const h=setup(false);const request=h.toggle(true);assert.equal(h.calls.scripts,1);
  await h.navigate(true);await h.ready();await request;assert.equal(h.calls.created,0);
  await h.navigate(false);assert.equal(h.calls.created,1);assert.equal(h.calls.plays,1);
});
test('sound-on startup attempts playback without a toggle click',async()=>{
  const h=setup(true,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.panel.hidden,false);assert.equal(h.calls.created,1);assert.equal(h.calls.plays,1);assert.equal(h.calls.volume,25);
});
test('blocked autoplay retries on interaction but respects mute and navigation',async()=>{
  const h=setup(true,true);await new Promise(resolve=>setImmediate(resolve));
  h.options().events.onAutoplayBlocked();
  h.interact('click');assert.equal(h.calls.plays,2);
  h.interact('keydown');assert.equal(h.calls.plays,3);
  await h.toggle(false);h.interact('click');assert.equal(h.calls.plays,3);
  await h.navigate(true);await h.toggle(true);h.interact('keydown');assert.equal(h.calls.plays,3);
});
