const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(){
  const handlers={};const styles={};const cameraCalls={count:0};
  const elements={'#tempo-bpm':{value:'120'},'#tempo-slider':{value:'120'},'.tempo-setup':{style:{setProperty:(k,v)=>styles[k]=v}}};
  const root={hidden:true,innerHTML:'',classList:{toggle(){},remove(){}},replaceChildren(){},
    addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn),querySelector:selector=>elements[selector]||null};
  const context=vm.createContext({document:{hidden:false,addEventListener(){},querySelector:selector=>selector==='#game-screen'?root:selector==='.arcade'?{classList:{add(){},remove(){},toggle(){}}}:selector==='#sound'?{addEventListener(){}}:null},
    homeScreen:{hidden:false},lobby:{hidden:true},window:{scrollTo(){}},location:{search:''},soundOn:false,
    cameraCalls,crewColors:['#b6ff00','#ff2ea6'],portrait:()=>'',URLSearchParams,clearInterval,clearTimeout,setTimeout,setInterval,cancelAnimationFrame(){},matchMedia:()=>({matches:true}),goHome(){}});
  const read=file=>fs.readFileSync(path.join(__dirname,'../dist',file),'utf8');
  vm.runInContext(read('round-ui.js')+'\nenableCameraCheck=()=>{cameraCalls.count++};\n'+read('game-ui.js')+'\nglobalThis.ui={preview,enterPreview,normaliseBPM,openDemoScreen};',context);
  const click=action=>{const button={disabled:false,dataset:{action}};for(const fn of handlers.click||[])fn({target:{closest:()=>button}});};
  const dispatch=(type,target)=>{for(const fn of handlers[type]||[])fn({target})};
  const input=value=>{const target=elements['#tempo-slider'];target.id='tempo-slider';target.value=String(value);dispatch('input',target)};
  const manual=(value,event='focusout')=>{const target=elements['#tempo-bpm'];target.id='tempo-bpm';target.value=String(value);dispatch('input',target);if(event)dispatch(event,target)};
  return {ui:context.ui,root,elements,styles,click,input,manual,cameraCalls};
}
const crew=[{id:1,name:'Alex',avatar:'cat'},{id:2,name:'Jamie',avatar:'rabbit'}];
test('team camera check leads to BPM setup and chosen tempo survives turns and rounds',()=>{
  const h=setup();h.ui.enterPreview(crew,'full');assert.equal(h.ui.preview.screen,'camera');
  h.click('camera-demo');assert.equal(h.ui.preview.screen,'tempo');assert.match(h.root.innerHTML,/SELECT BPM/);
  h.input(160);assert.equal(h.ui.preview.bpm,160);assert.equal(h.elements['#tempo-bpm'].value,'160');assert.equal(h.styles['--beat-duration'],'0.375s');
  h.click('tempo-start');assert.equal(h.ui.preview.screen,'creator');assert.match(h.root.innerHTML,/<strong>160<\/strong>/);
  h.click('skip');assert.equal(h.ui.preview.screen,'challenge');assert.equal(h.ui.preview.bpm,160);
  h.click('round-next');assert.equal(h.ui.preview.bpm,160);
});
test('solo camera check uses BPM setup and selected beat guide tempo',()=>{
  const h=setup();h.ui.enterPreview([crew[0]],'quick',true);h.click('camera-demo');assert.equal(h.ui.preview.screen,'tempo');
  h.input(80);h.click('tempo-start');assert.equal(h.ui.preview.screen,'challenge');assert.equal(h.ui.preview.bpm,80);
  assert.match(h.root.innerHTML,/Visual metronome/);assert.match(h.root.innerHTML,/<strong>80<\/strong>/);
});
test('invalid BPM cannot enter gameplay outside the supported range',()=>{
  const h=setup();assert.equal(h.ui.normaliseBPM('',140),140);assert.equal(h.ui.normaliseBPM('bad',140),140);
  assert.equal(h.ui.normaliseBPM(20),60);assert.equal(h.ui.normaliseBPM(999),180);assert.equal(h.ui.normaliseBPM(123.6),125);
  h.ui.enterPreview(crew,'quick');h.click('camera-demo');h.input(999);h.click('tempo-start');assert.equal(h.ui.preview.bpm,180);
});

test('slider and numeric entry use five-BPM steps and stay synchronized',()=>{
  const h=setup();h.ui.enterPreview(crew,'quick');h.click('camera-demo');
  assert.match(h.root.innerHTML,/id="tempo-slider"[^>]*type="range"[^>]*min="60" max="180" step="5" value="120"/);
  assert.match(h.root.innerHTML,/id="tempo-bpm"[^>]*type="number"[^>]*min="60" max="180" step="5" value="120"/);
  for(let bpm=60;bpm<=180;bpm+=5){h.input(bpm);assert.equal(h.ui.preview.bpm,bpm);assert.equal(h.elements['#tempo-bpm'].value,String(bpm))}
  h.manual(123,null);assert.equal(h.elements['#tempo-bpm'].value,'123');assert.equal(h.elements['#tempo-slider'].value,'125');
  h.manual(123);assert.equal(h.elements['#tempo-bpm'].value,'125');assert.equal(h.ui.preview.bpm,125);
  h.manual(122,'change');assert.equal(h.elements['#tempo-bpm'].value,'120');assert.equal(h.elements['#tempo-slider'].value,'120');
});
test('manual entry rounds on start and handles empty, fractional, and out-of-range values',()=>{
  const h=setup();h.ui.enterPreview(crew,'quick');h.click('camera-demo');
  h.manual(127.5);assert.equal(h.ui.preview.bpm,130);
  h.manual('');assert.equal(h.elements['#tempo-bpm'].value,'130');
  h.manual('bad');assert.equal(h.ui.preview.bpm,130);
  h.manual(20);assert.equal(h.ui.preview.bpm,60);h.manual(999);assert.equal(h.ui.preview.bpm,180);
  h.manual(126,null);h.click('tempo-start');assert.equal(h.ui.preview.screen,'creator');assert.equal(h.ui.preview.bpm,125);
});
test('returning to camera preserves the tempo and a new session resets it',()=>{
  const h=setup();h.ui.enterPreview(crew,'quick');h.click('camera-demo');h.input(140);
  h.click('tempo-camera');assert.equal(h.ui.preview.screen,'camera');
  h.click('camera-demo');assert.match(h.root.innerHTML,/id="tempo-bpm"[^>]*value="140"/);
  h.click('tempo-start');assert.equal(h.ui.preview.bpm,140);
  h.ui.enterPreview(crew,'quick');assert.equal(h.ui.preview.bpm,120);
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
