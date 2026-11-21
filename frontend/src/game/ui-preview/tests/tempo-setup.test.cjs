const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup({fetchImpl}={}){
  const handlers={};const styles={};const cameraCalls={count:0};
  const elements={'#song-list':{value:'884025'},'#song-status':{isConnected:true},'[data-action="tempo-start"]':{}};
  const root={hidden:true,innerHTML:'',classList:{toggle(){},remove(){}},replaceChildren(){},
    addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn),querySelector:selector=>elements[selector]||null};
  const context=vm.createContext({document:{hidden:false,addEventListener(){},querySelector:selector=>selector==='#game-screen'?root:selector==='.arcade'?{classList:{add(){},remove(){},toggle(){}}}:selector==='#sound'?{addEventListener(){}}:null},
    homeScreen:{hidden:false},lobby:{hidden:true},window:{scrollTo(){}},location:{search:''},soundOn:false,
    fetch:fetchImpl||(async()=>({ok:true,headers:{get:key=>key==='X-Song-BPM'?'100.3':'audio/mp4'}})),cameraCalls,crewColors:['#b6ff00','#ff2ea6'],portrait:()=>'',URLSearchParams,clearInterval,clearTimeout,setTimeout,setInterval,cancelAnimationFrame(){},matchMedia:()=>({matches:true}),goHome(){}});
  const read=file=>fs.readFileSync(path.join(__dirname,'../dist',file),'utf8');
  vm.runInContext(read('gameplay-tracks.js')+'\n'+read('song-catalog.js')+'\n'+read('demo-data.js')+'\n'+read('round-ui.js')+'\nenableCameraCheck=()=>{cameraCalls.count++};\n'+read('game-ui.js')+'\nglobalThis.ui={preview,enterPreview,searchSongs,enterDanceFloor,openDemoScreen};',context);
  const click=action=>{const button={disabled:false,dataset:{action}};for(const fn of handlers.click||[])fn({target:{closest:()=>button}});};
  return {ui:context.ui,root,elements,click,cameraCalls};
}
const crew=[{id:1,name:'Alex',avatar:'cat'},{id:2,name:'Jamie',avatar:'rabbit'}];
for(const solo of [true,false]) test('song tempo reaches '+(solo?'solo':'team')+' gameplay without rounding',async()=>{
  const h=setup();h.ui.enterPreview(crew,'full',solo);h.click('camera-demo');
  assert.match(h.root.innerHTML,/SELECT SONG/);
  assert.equal(h.ui.searchSongs('dancing queen abba')[0].artist,'ABBA');
  await h.ui.enterDanceFloor();
  assert.equal(h.ui.preview.screen,solo?'challenge':'creator');
  assert.equal(h.ui.preview.bpm,100.3);
  assert.equal(h.ui.preview.song.title,'Dancing Queen');
});
test('real songs and the CC0 loops are both in the picker',()=>{
  const h=setup();
  const all=h.ui.searchSongs('');
  assert.ok(all.some(song=>song.provider==='deezer'));
  assert.equal(all.filter(song=>song.artist==='hyperpixel'&&song.src.startsWith('audio/gameplay/')).length,25);
});
for(const [why,fetchImpl] of [['offline',async()=>{throw new TypeError('Failed to fetch')}],['server error',async()=>({ok:false,status:502,headers:{get:()=>null}})]])
  test('a real song that cannot load falls back to the closest-BPM CC0 loop ('+why+')',async()=>{
    const h=setup({fetchImpl});h.ui.enterPreview(crew,'full',false);h.click('camera-demo');
    await h.ui.enterDanceFloor();
    assert.equal(h.ui.preview.screen,'creator');
    assert.equal(h.ui.preview.song.artist,'hyperpixel');
    assert.equal(h.ui.preview.bpm,120); // catalog songs have no BPM until loaded: 120 is the default
    assert.equal(h.ui.preview.songFallback.title,'Dancing Queen');
    assert.doesNotMatch(h.elements['#song-status'].textContent||'',/unavailable/i);
  });

test('camera check automatically requests access on entry and re-entry only',()=>{
  const h=setup();h.ui.enterPreview(crew,'quick');assert.equal(h.cameraCalls.count,1);
  h.click('camera-demo');assert.equal(h.cameraCalls.count,1);
  h.click('tempo-camera');assert.equal(h.cameraCalls.count,2);
});
test('direct tempo and creator reviews do not request camera access',()=>{
  const h=setup();h.ui.openDemoScreen('tempo');assert.equal(h.cameraCalls.count,0);
  h.ui.openDemoScreen('creator');assert.equal(h.cameraCalls.count,0);
});
