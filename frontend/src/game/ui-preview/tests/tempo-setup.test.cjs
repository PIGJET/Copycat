const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(){
  const handlers={};const styles={};const cameraCalls={count:0};const soloCalls={count:0};
  const elements={'#song-list':{value:'884025'},'#song-status':{isConnected:true},'[data-action="tempo-start"]':{}};
  const root={hidden:true,innerHTML:'',classList:{toggle(){},remove(){}},replaceChildren(){},
    addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn),querySelector:selector=>elements[selector]||null};
  const context=vm.createContext({CopycatSolo:{mount:(element,onBack)=>{soloCalls.count++;soloCalls.element=element;soloCalls.onBack=onBack},unmount:()=>{soloCalls.unmounted=true}},document:{hidden:false,addEventListener(){},querySelector:selector=>selector==='#game-screen'?root:selector==='.arcade'?{classList:{add(){},remove(){},toggle(){}}}:selector==='#sound'?{addEventListener(){}}:null},
    homeScreen:{hidden:false},lobby:{hidden:true},window:{scrollTo(){}},location:{search:''},soundOn:false,
    fetch:async()=>({ok:true,headers:{get:key=>key==='X-Song-BPM'?'100.3':'audio/mp4'}}),cameraCalls,crewColors:['#b6ff00','#ff2ea6'],portrait:()=>'',URLSearchParams,clearInterval,clearTimeout,setTimeout,setInterval,cancelAnimationFrame(){},matchMedia:()=>({matches:true}),goHome(){}});
  const read=file=>fs.readFileSync(path.join(__dirname,'../dist',file),'utf8');
  vm.runInContext(read('song-catalog.js')+'\n'+read('demo-data.js')+'\n'+read('round-ui.js')+'\nenableCameraCheck=()=>{cameraCalls.count++};\n'+read('game-ui.js')+'\nglobalThis.ui={preview,enterPreview,searchSongs,enterDanceFloor,openDemoScreen,startSoloPreview};',context);
  const click=action=>{const button={disabled:false,dataset:{action}};for(const fn of handlers.click||[])fn({target:{closest:()=>button}});};
  return {ui:context.ui,root,elements,click,cameraCalls,soloCalls,homeScreen:context.homeScreen};
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

test('camera check automatically requests access on entry and re-entry only',()=>{
  const h=setup();h.ui.enterPreview(crew,'quick');assert.equal(h.cameraCalls.count,1);
  h.click('camera-demo');assert.equal(h.cameraCalls.count,1);
  h.click('tempo-camera');assert.equal(h.cameraCalls.count,2);
});
test('direct tempo and creator reviews do not request camera access',()=>{
  const h=setup();h.ui.openDemoScreen('tempo');assert.equal(h.cameraCalls.count,0);
  h.ui.openDemoScreen('creator');assert.equal(h.cameraCalls.count,0);
});

test('solo opens the real clip chooser and returns to the menu',()=>{
  const h=setup();
  h.ui.startSoloPreview();
  assert.equal(h.soloCalls.count,1);
  assert.equal(h.soloCalls.element,h.root);
  assert.equal(h.homeScreen.hidden,true);
  h.soloCalls.onBack();
  assert.equal(h.soloCalls.unmounted,true);
});
