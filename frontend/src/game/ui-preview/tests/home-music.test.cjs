const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
// Background music uses the CC0 idle loop only. The home screen stays silent.
const source=fs.readFileSync(path.join(__dirname,'../dist/home-music.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup({initialSound=true,play=null}={}){
  let screen='home';
  const game={hidden:true,classList:{contains:name=>name==='camera-check-screen'&&screen==='camera'||name==='tempo-setup-screen'&&screen==='tempo'||name==='results-leaderboard'&&screen==='leaderboard'}},status={textContent:''},calls={plays:0};
  const documentEvents={},windowEvents={},soundEvents={};let observer;
  const lobby={get hidden(){return screen!=='lobby'}};
  const idle={paused:true,volume:1,play(){calls.plays++;const p=play?play():Promise.resolve();return p.then(()=>{this.paused=false})},pause(){this.paused=true}};
  const document={hidden:false,addEventListener:(type,fn)=>documentEvents[type]=fn,
    querySelector:s=>({'#game-screen':game,'.lobby-screen':lobby,'#idle-music':idle,'#home-music-status':status,'#sound':{addEventListener:(type,fn)=>soundEvents[type]=fn}}[s])};
  const context=vm.createContext({document,window:{addEventListener:(type,fn)=>windowEvents[type]=fn},MutationObserver:class{constructor(fn){observer=fn;}observe(){}}});
  vm.runInContext('let soundOn='+initialSound+';\n'+source,context);
  return {idle,status,calls,
    interact:type=>documentEvents[type](),
    toggle:async on=>{vm.runInContext('soundOn='+on,context);await soundEvents.click();},
    navigate:async next=>{screen=next;game.hidden=['home','lobby'].includes(next);await observer();await settle();},
    visibility:async hidden=>{document.hidden=hidden;await documentEvents.visibilitychange();await settle();},
    pagehide:()=>windowEvents.pagehide()};
}
test('the home screen stays silent, even after clicks and sound toggles',async()=>{
  const h=setup();await settle();assert.equal(h.calls.plays,0);
  h.interact('click');await h.toggle(false);await h.toggle(true);await settle();
  assert.equal(h.calls.plays,0);assert.equal(h.idle.paused,true);
});
test('the idle loop plays in the lobby, setup and results, and pauses for gameplay and scores',async()=>{
  const h=setup();await settle();
  await h.navigate('lobby');assert.equal(h.idle.paused,false);assert.equal(h.idle.volume,0.16);
  await h.navigate('camera');assert.equal(h.idle.paused,false);
  await h.navigate('tempo');assert.equal(h.idle.paused,false);
  await h.navigate('creator');assert.equal(h.idle.paused,true);
  await h.navigate('score');assert.equal(h.idle.paused,true);
  await h.navigate('leaderboard');assert.equal(h.idle.paused,false);
  await h.navigate('home');assert.equal(h.idle.paused,true);
});
test('mute, tab visibility and page exit pause the idle loop',async()=>{
  const h=setup();await h.navigate('lobby');
  await h.toggle(false);assert.equal(h.idle.paused,true);
  await h.toggle(true);await settle();assert.equal(h.idle.paused,false);
  await h.visibility(true);assert.equal(h.idle.paused,true);
  await h.visibility(false);assert.equal(h.idle.paused,false);
  h.pagehide();assert.equal(h.idle.paused,true);
});
test('blocked autoplay retries on a gesture and still respects mute',async()=>{
  let blocked=true;
  const h=setup({play:()=>blocked?Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})):Promise.resolve()});
  await h.navigate('lobby');assert.match(h.status.textContent,/Click/);
  blocked=false;h.interact('keydown');await settle();assert.equal(h.idle.paused,false);assert.equal(h.status.textContent,'');
  await h.toggle(false);const plays=h.calls.plays;h.interact('click');assert.equal(h.calls.plays,plays);
});
test('index.html ships no third-party or YouTube music',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
  assert.doesNotMatch(html,/night-shade|song-catalog/);
  assert.ok(!fs.existsSync(path.join(__dirname,'../dist/song-catalog.js')));
  assert.ok(!fs.existsSync(path.join(__dirname,'../dist/audio/night-shade.mp3')));
});
