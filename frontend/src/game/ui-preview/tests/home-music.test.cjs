const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/home-music.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
// screen: home | lobby | camera | tempo | creator | challenge | score | leaderboard | solo-loading | solo-setup | solo-dance | solo-results
function setup({initialSound=true,play=()=>Promise.resolve()}={}){
  let screen='home',clock=0;const timers=new Map();let nextTimer=1;
  const soloClass={'solo-setup':'solo-game--setup','solo-dance':'solo-game--dancing','solo-results':''};
  const game={hidden:true,
    get childElementCount(){return screen==='solo-loading'?0:1},
    classList:{contains:name=>name==='camera-check-screen'&&screen==='camera'||name==='tempo-setup-screen'&&screen==='tempo'||name==='results-leaderboard'&&screen==='leaderboard'},
    querySelector:s=>s==='.solo-game'&&screen in soloClass?{classList:{contains:name=>name===soloClass[screen]}}:null};
  const status={textContent:''},calls={plays:0,pauses:0};
  const soundEvents={},documentEvents={},windowEvents={};let observer;
  const music={paused:true,volume:1,play(){calls.plays++;this.paused=false;return play();},pause(){calls.pauses++;this.paused=true;}};
  const lobby={get hidden(){return screen!=='lobby'}};
  const idle={paused:true,volume:1,async play(){this.paused=false},pause(){this.paused=true}};
  const document={hidden:false,addEventListener:(type,fn)=>documentEvents[type]=fn,
    querySelector:s=>({'#game-screen':game,'.lobby-screen':lobby,'#idle-music':idle,'#home-music':music,'#home-music-status':status,'#sound':{addEventListener:(type,fn)=>soundEvents[type]=fn}}[s])};
  const context=vm.createContext({document,window:{addEventListener:(type,fn)=>windowEvents[type]=fn},
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}},queueMicrotask,
    performance:{now:()=>clock},setInterval:fn=>{const id=nextTimer++;timers.set(id,fn);return id},clearInterval:id=>timers.delete(id)});
  vm.runInContext('let soundOn='+initialSound+';\n'+source,context);
  return {game,music,idle,status,calls,
    interact:type=>documentEvents[type](),
    toggle:async on=>{vm.runInContext('soundOn='+on,context);await soundEvents.click();},
    navigate:async next=>{screen=next;game.hidden=['home','lobby'].includes(next);observer();await settle();await settle();},
    /** Advance the fake clock, running the fade's interval every 50 ms. */
    advance:ms=>{for(let t=0;t<ms;t+=50){clock+=50;for(const fn of [...timers.values()])fn();}},
    fading:()=>timers.size>0,
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
test('Night Shade plays on through Team Play, the lobby, camera check and tempo without pausing or switching',async()=>{
  const h=setup();await settle();
  for(const screen of ['lobby','camera','tempo','camera','tempo']){
    await h.navigate(screen);
    assert.equal(h.music.paused,false,screen);assert.equal(h.idle.paused,true,screen);
  }
  assert.equal(h.calls.pauses,0,'never paused, so it never restarts');
  assert.equal(h.music.volume,0.25);
});
test('the first dance turn fades the menu track out over about a second, then pauses it',async()=>{
  const h=setup();await settle();await h.navigate('lobby');await h.navigate('tempo');
  await h.navigate('creator');
  assert.equal(h.music.paused,false,'still fading');assert(h.fading());
  h.advance(500);assert(h.music.volume>0.1&&h.music.volume<0.15,`half way: ${h.music.volume}`);
  h.advance(500);assert.equal(h.music.paused,true);assert.equal(h.fading(),false);
  assert.equal(h.music.volume,0.25,'volume restored for next time');
  const plays=h.calls.plays;h.interact('click');assert.equal(h.calls.plays,plays,'a click during gameplay does not bring it back');
});
test('going back to a setup screen mid-fade carries on at full volume',async()=>{
  const h=setup();await settle();await h.navigate('tempo');await h.navigate('creator');h.advance(300);
  await h.navigate('tempo');assert.equal(h.fading(),false);assert.equal(h.music.volume,0.25);assert.equal(h.music.paused,false);
});
test('mute and a hidden tab still pause at once, even mid-fade, and page exit pauses',async()=>{
  const h=setup();await settle();await h.navigate('creator');h.advance(200);
  await h.toggle(false);assert.equal(h.music.paused,true);assert.equal(h.fading(),false);assert.equal(h.music.volume,0.25);
  await h.toggle(true);await h.navigate('home');assert.equal(h.music.paused,false);
  await h.visibility(true);assert.equal(h.music.paused,true);
  await h.visibility(false);assert.equal(h.music.paused,false);
  h.pagehide();assert.equal(h.music.paused,true);
});
test('blocked autoplay retries on a gesture and still respects mute',async()=>{
  let blocked=true;
  const h=setup({play:()=>blocked?Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})):Promise.resolve()});
  await settle();assert.match(h.status.textContent,/Click/);
  blocked=false;h.interact('keydown');await settle();assert.equal(h.calls.plays,2);assert.equal(h.status.textContent,'');
  await h.toggle(false);h.interact('click');assert.equal(h.calls.plays,2);
});
test('a delayed play result cannot keep music going after gameplay starts',async()=>{
  let finish;const h=setup({play:()=>new Promise(resolve=>finish=resolve)});
  await h.navigate('challenge');finish();await settle();h.advance(1000);
  assert.equal(h.calls.plays,1);assert.equal(h.music.paused,true);
});
test('solo: the menu track plays on through loading and setup, and fades out when the dance starts',async()=>{
  const h=setup();await settle();
  await h.navigate('solo-loading');assert.equal(h.music.paused,false);
  await h.navigate('solo-setup');assert.equal(h.music.paused,false);assert.equal(h.calls.pauses,0);
  await h.navigate('solo-dance');assert(h.fading());h.advance(1000);assert.equal(h.music.paused,true);
  await h.navigate('solo-results');assert.equal(h.music.paused,true);assert.equal(h.idle.paused,true);
});
test('the idle loop still covers the leaderboard between rounds; dance turns and scores stay quiet',async()=>{
  const h=setup();await settle();await h.navigate('creator');h.advance(1000);
  await h.navigate('score');assert.equal(h.idle.paused,true);assert.equal(h.music.paused,true);
  await h.navigate('leaderboard');assert.equal(h.idle.paused,false);assert.equal(h.music.paused,true);
  await h.toggle(false);assert.equal(h.idle.paused,true);
  await h.toggle(true);await h.visibility(true);assert.equal(h.idle.paused,true);
  await h.visibility(false);assert.equal(h.idle.paused,false);
  await h.navigate('creator');h.advance(1000);assert.equal(h.idle.paused,true);
  await h.navigate('home');assert.equal(h.music.paused,false);assert.equal(h.idle.paused,true);
});
