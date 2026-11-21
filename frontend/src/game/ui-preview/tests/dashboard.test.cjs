const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(){
  const events={},elements=new Map(),classes=new Set();let timer=null;
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{value:'120',disabled:false,hidden:false,textContent:'',innerHTML:'',srcObject:null,parentElement:{hidden:true},classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}},focus(){}});return elements.get(selector)};
  const root={hidden:false,innerHTML:'',classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),remove(){}},addEventListener:(type,fn)=>(events[type]??=[]).push(fn),replaceChildren(){this.innerHTML=''},querySelector:selector=>selector==='.beat-guide'?null:element(selector)};
  const context=vm.createContext({document:{hidden:false,querySelector:selector=>selector==='#game-screen'?root:selector==='.animated-board'?null:selector==='#sound'?{addEventListener(){}}:element(selector),addEventListener(){}},window:{scrollTo(){}},location:{search:''},URLSearchParams,homeScreen:{hidden:false},lobby:{hidden:true},soundOn:false,crewColors:['lime','pink','cyan','purple'],portrait:()=>'<svg></svg>',goHome(){},blip(){},matchMedia:()=>({matches:true}),cancelAnimationFrame(){},setInterval:fn=>{timer=fn;return 1},clearInterval:()=>{timer=null},setTimeout:()=>1,clearTimeout(){}});
  const read=f=>fs.readFileSync(path.join(__dirname,'../dist',f),'utf8');
  vm.runInContext(read('demo-data.js')+'\n'+read('round-ui.js')+'\n'+read('game-ui.js')+'\nglobalThis.ui={preview,enterPreview,renderPreview,leavePreview,getCreator,getChallenger};',context);
  const click=action=>(events.click||[]).forEach(fn=>fn({target:{closest:()=>({disabled:false,dataset:{action}})}}));
  return {ui:context.ui,root,element,classes,click,tick:()=>{assert(timer,'Capture timer must be running');timer()},changeTracking:value=>(events.change||[]).forEach(fn=>fn({target:{id:'tracking-state',value}}))};
}
const crew=[{id:1,name:'Alex',avatar:'cat'},{id:2,name:'Jamie',avatar:'rabbit'},{id:3,name:'Riley',avatar:'frog'},{id:4,name:'Taylor',avatar:'fox'}];
test('dashboard countdown completes a leader turn without awarding the leader a score',()=>{
  const h=setup();h.ui.enterPreview(crew,'full',false,'creator');h.click('record');
  assert.equal(h.ui.preview.phase,'countdown');assert.match(h.element('#capture-overlay').innerHTML,/>3</);
  assert.equal(h.element('[data-action="record"]').disabled,true);
  for(let i=0;i<3;i++)h.tick();assert.equal(h.ui.preview.phase,'recording');
  for(let i=0;i<10;i++)h.tick();assert.equal(h.ui.preview.screen,'challenge');assert.equal(h.ui.getChallenger().id,2);assert.equal(h.ui.preview.results.length,0);
});
test('dashboard preserves every turn and leader rotation through a four-player full game',()=>{
  const h=setup();h.ui.enterPreview(crew,'full',false,'creator');h.ui.preview.bpm=145;
  for(let round=0;round<4;round++){
    assert.equal(h.ui.getCreator().id,crew[round].id);h.click('skip');
    for(let turn=0;turn<3;turn++){
      assert.equal(h.ui.preview.screen,'challenge');assert.notEqual(h.ui.getChallenger().id,h.ui.getCreator().id);
      h.click('skip');assert.equal(h.ui.preview.screen,'score');h.click('score-next');
    }
    assert.equal(h.ui.preview.screen,'leaderboard');assert.equal(h.ui.preview.bpm,145);
    if(round<3)h.click('round-next');else h.click('finale');
  }
  assert.equal(h.ui.preview.screen,'finale');assert.equal(h.ui.preview.results.length,12);
  assert(h.ui.preview.results.every(result=>result.playerId!==result.creatorId));
  for(const player of crew)assert.equal(h.ui.preview.results.filter(result=>result.playerId===player.id).length,3);
});
test('tracking failures disable preview capture, and leaving removes dashboard styles',()=>{
  const h=setup();h.ui.enterPreview(crew,'quick',false,'creator');assert(h.classes.has('dance-dashboard'));
  h.changeTracking('body');h.click('record');assert.equal(h.ui.preview.phase,'idle');
  h.changeTracking('ready');h.click('record');assert.equal(h.ui.preview.phase,'countdown');h.ui.leavePreview();
  assert.equal(h.root.hidden,true);assert.equal(h.root.innerHTML,'');
});
test('standings use completed scores, preserve unscored dashes, and escape player names',()=>{
  const h=setup();h.ui.enterPreview([{...crew[0],name:'<img onerror=bad>'},crew[1]],'quick',false,'creator');
  assert(!h.root.innerHTML.includes('<img onerror=bad>'));assert(h.root.innerHTML.includes('&lt;img onerror=bad&gt;'));assert(!h.root.innerHTML.includes('dashboard-score-value">0'));
  h.ui.preview.results=[{playerId:2,creatorId:1,score:{total:84,timing:80}}];h.ui.renderPreview();assert.match(h.root.innerHTML,/dashboard-score-value">84</);assert.match(h.root.innerHTML,/Demo averages/);
});
