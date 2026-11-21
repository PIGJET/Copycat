const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(){
  const handlers={};const styles={};
  const elements={'#tempo-bpm':{value:'120'},'#tempo-slider':{value:'120'},'.tempo-setup':{style:{setProperty:(k,v)=>styles[k]=v}}};
  const root={hidden:true,innerHTML:'',classList:{toggle(){},remove(){}},replaceChildren(){},
    addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn),querySelector:selector=>elements[selector]||null};
  const context=vm.createContext({document:{hidden:false,addEventListener(){},querySelector:selector=>selector==='#game-screen'?root:selector==='.arcade'?{classList:{add(){},remove(){},toggle(){}}}:selector==='#sound'?{addEventListener(){}}:null},
    homeScreen:{hidden:false},lobby:{hidden:true},window:{scrollTo(){}},location:{search:''},soundOn:false,
    crewColors:['#b6ff00','#ff2ea6'],portrait:()=>'',URLSearchParams,clearInterval,clearTimeout,setTimeout,setInterval,cancelAnimationFrame(){},matchMedia:()=>({matches:true}),goHome(){}});
  const read=file=>fs.readFileSync(path.join(__dirname,'../dist',file),'utf8');
  vm.runInContext(read('round-ui.js')+'\n'+read('game-ui.js')+'\nglobalThis.ui={preview,enterPreview,normaliseBPM};',context);
  const click=action=>{const button={disabled:false,dataset:{action}};for(const fn of handlers.click||[])fn({target:{closest:()=>button}});};
  const input=value=>{elements['#tempo-bpm'].value=String(value);for(const fn of handlers.input||[])fn({target:{id:'tempo-bpm',value:String(value)}});};
  return {ui:context.ui,root,elements,styles,click,input};
}
const crew=[{id:1,name:'Alex',avatar:'cat'},{id:2,name:'Jamie',avatar:'rabbit'}];
test('team camera check leads to BPM setup and chosen tempo survives turns and rounds',()=>{
  const h=setup();h.ui.enterPreview(crew,'full');assert.equal(h.ui.preview.screen,'camera');
  h.click('camera-demo');assert.equal(h.ui.preview.screen,'tempo');assert.match(h.root.innerHTML,/CHOOSE BPM/);
  h.input(150);assert.equal(h.ui.preview.bpm,150);assert.equal(h.elements['#tempo-slider'].value,'150');assert.equal(h.styles['--beat-duration'],'0.4s');
  h.click('tempo-start');assert.equal(h.ui.preview.screen,'creator');assert.match(h.root.innerHTML,/value="150"/);
  h.click('skip');assert.equal(h.ui.preview.screen,'challenge');assert.equal(h.ui.preview.bpm,150);
  h.click('round-next');assert.equal(h.ui.preview.bpm,150);
});
test('solo camera check uses BPM setup and selected beat guide tempo',()=>{
  const h=setup();h.ui.enterPreview([crew[0]],'quick',true);h.click('camera-demo');assert.equal(h.ui.preview.screen,'tempo');
  h.input(90);h.click('tempo-start');assert.equal(h.ui.preview.screen,'challenge');assert.equal(h.ui.preview.bpm,90);
  assert.match(h.root.innerHTML,/Visual metronome/);assert.match(h.root.innerHTML,/value="90"/);
});
test('invalid BPM cannot enter gameplay outside the supported range',()=>{
  const h=setup();assert.equal(h.ui.normaliseBPM('',140),140);assert.equal(h.ui.normaliseBPM('bad',140),140);
  assert.equal(h.ui.normaliseBPM(20),60);assert.equal(h.ui.normaliseBPM(999),180);assert.equal(h.ui.normaliseBPM(123.6),124);
  h.ui.enterPreview(crew,'quick');h.click('camera-demo');h.elements['#tempo-bpm'].value='999';h.click('tempo-start');assert.equal(h.ui.preview.bpm,180);
});
