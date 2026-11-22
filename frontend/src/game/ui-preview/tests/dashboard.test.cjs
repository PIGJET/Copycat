const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(tracking){
  const events={},elements=new Map(),classes=new Set();let timer=null,now=0;
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{remove(){},replaceChildren(){},after(){},value:'120',disabled:false,hidden:false,textContent:'',innerHTML:'',srcObject:null,parentElement:{hidden:true},classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}},focus(){}});return elements.get(selector)};
  const root={hidden:false,innerHTML:'',classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),remove(){}},addEventListener:(type,fn)=>(events[type]??=[]).push(fn),replaceChildren(){this.innerHTML=''},querySelector:selector=>selector==='.beat-guide'?null:element(selector)};
  const context=vm.createContext({CopycatTracking:tracking,document:{createElement:()=>({setAttribute(){}}),hidden:false,querySelector:selector=>selector==='#game-screen'?root:selector==='.animated-board'?null:selector==='#sound'?{addEventListener(){}}:element(selector),addEventListener(){}},window:{scrollTo(){}},location:{search:''},performance:{now:()=>now},URLSearchParams,homeScreen:{hidden:false},lobby:{hidden:true},soundOn:false,crewColors:['lime','pink','cyan','purple'],portrait:()=>'<svg></svg>',goHome(){},blip(){},matchMedia:()=>({matches:true}),cancelAnimationFrame(){},setInterval:fn=>{timer=fn;return 1},clearInterval:()=>{timer=null},setTimeout:()=>1,clearTimeout(){}});
  const read=f=>fs.readFileSync(path.join(__dirname,'../dist',f),'utf8');
  vm.runInContext(read('demo-data.js')+'\n'+read('round-ui.js')+'\n'+read('game-ui.js')+'\nglobalThis.ui={preview,enterPreview,renderPreview,leavePreview,getCreator,getChallenger,scoreScreen};',context);
  const click=action=>(events.click||[]).forEach(fn=>fn({target:{closest:()=>({disabled:false,dataset:{action}})}}));
  return {ui:context.ui,root,element,classes,click,tick:(ms=1000)=>{assert(timer,'Capture timer must be running');now+=ms;timer()},changeTracking:value=>(events.change||[]).forEach(fn=>fn({target:{id:'tracking-state',value}}))};
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
  h.ui.preview.results=[{playerId:2,creatorId:1,score:{total:84,timing:80}}];h.ui.renderPreview();assert.match(h.root.innerHTML,/dashboard-score-value[^>]*>84</);assert.match(h.root.innerHTML,/Average \/100/);
});

test('a delayed capture callback follows elapsed game time instead of adding timer drift',()=>{const h=setup();h.ui.enterPreview(crew,'quick',false,'creator');h.click('record');h.tick(7500);assert.equal(h.ui.preview.phase,'recording');assert.equal(h.ui.preview.seconds,6);h.tick(5500);assert.equal(h.ui.preview.screen,'challenge')});

test('a countdown digit stays mounted until the next second',()=>{
  const h=setup();
  h.ui.enterPreview(crew,'full',false,'creator');
  const overlay=h.element('#capture-overlay');
  let markup='',writes=0;
  Object.defineProperty(overlay,'innerHTML',{get:()=>markup,set:value=>{markup=value;writes++}});
  h.click('record');
  h.tick(400); h.tick(500);
  assert.equal(writes,1); assert.match(markup,/>3</);
  h.tick(100); assert.equal(writes,2); assert.match(markup,/>2</);
  h.tick(1000); assert.equal(writes,3); assert.match(markup,/>1</);
  h.tick(1000); assert.equal(writes,4); assert.equal(h.ui.preview.phase,'recording');
});

test('camera turns replay the creator recording and score the actual challenger recording on the backend',async()=>{
  let turn;
  const reference={frames:[1]}, attempt={frames:[2]};
  const score={total:97,arms:98,legs:95,torso:97,timing:98};
  const scored=[];
  const tracking={mount:props=>{turn=props},unmount(){},release(){},score:async(ref,rec)=>{scored.push([ref,rec]);return score}};
  const h=setup(tracking);
  h.ui.enterPreview(crew,'full',false,'creator');
  h.ui.preview.live=true;h.ui.renderPreview();
  assert.equal(turn.player.id,crew[0].id);
  assert.match(h.root.innerHTML, /id="stage-timer"[^>]+ hidden/);
  turn.phaseChanged('countdown',3,null);
  assert.equal(h.element('#stage-timer').hidden,true);
  turn.phaseChanged('recording',null,10);
  assert.equal(h.element('#stage-timer').hidden,false);
  turn.phaseChanged('recording',null,6);
  assert.equal(h.element('#stage-time').textContent,'6s');
  assert.equal(h.element('#stage-time').textContent,h.element('#capture-time').textContent);
  turn.phaseChanged('idle',null,null);
  assert.equal(h.element('#stage-timer').hidden,true);
  turn.onRecord(reference);
  assert.equal(turn.reference,reference);
  assert.equal(turn.player.id,crew[1].id);
  turn.onRecord(attempt);
  assert.equal(h.ui.preview.screen,'score');
  assert.equal(h.ui.preview.scoring.recording,attempt); // evaluating while the backend answers
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(scored.at(-1),[reference,attempt]);
  assert.equal(h.ui.preview.scoring,null);
  assert.equal(h.ui.preview.results[0].score,score);
  assert.equal(h.ui.preview.results[0].recording,attempt);
  assert.equal(h.ui.preview.results[0].source,'tracking');
});
test('a /score 422 offers the right redo and never records a result',async()=>{
  let turn;const reference={frames:[1]}, attempt={frames:[2]};
  const failure={message:'Step back so your whole body is in frame',recording:'attempt',status:422};
  const h=setup({mount:props=>{turn=props},unmount(){},release(){},score:async()=>{throw failure}});
  h.ui.enterPreview(crew,'full',false,'creator');
  h.ui.preview.live=true;h.ui.renderPreview();
  turn.onRecord(reference);turn.onRecord(attempt);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.ui.preview.scoring.error,failure);
  assert.equal(h.ui.preview.results.length,0);
  assert.match(h.ui.scoreScreen(),/RECORD AGAIN/);
  failure.recording='reference';
  assert.match(h.ui.scoreScreen(),/Alex RE-RECORDS/);
});

test('live handoffs show the current player, next challenger, and next round creator', async () => {
  let turn;
  const score = { total: 90, arms: 90, legs: 90, torso: 90, timing: 90 };
  // Scores come from the backend through the bridge (async), never from the browser.
  const h = setup({ mount: props => { turn = props; }, unmount() {}, release() {}, score: async () => score });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  h.ui.enterPreview(crew.slice(0, 3), 'full', false, 'creator');
  h.ui.preview.live = true;
  h.ui.renderPreview();
  assert.match(h.root.innerHTML, /Alex’s turn/);
  assert.match(h.root.innerHTML, /Create a dance for everyone to copy/);
  turn.onRecord({ frames: [1] });
  assert.match(h.root.innerHTML, /Jamie’s turn/);
  assert.match(h.root.innerHTML, /class="dashboard-current-badge">Up now/);
  assert.match(h.root.innerHTML, /Watch Alex’s dance/);
  turn.onRecord({ frames: [2] });
  await settle();
  assert.match(h.root.innerHTML, /Next turn · Riley/);
  h.click('score-next');
  assert.match(h.root.innerHTML, /Riley’s turn/);
  assert.match(h.root.innerHTML, /class="turn-callout".*<strong>Riley<\/strong>/);
  turn.onRecord({ frames: [3] });
  await settle();
  assert.match(h.root.innerHTML, /See leaderboard/);
  h.click('score-next');
  h.click('round-next');
  assert.match(h.root.innerHTML, /Jamie’s turn/);
  assert.match(h.root.innerHTML, /Create a dance for everyone to copy/);
  assert.equal(turn.player.id, crew[1].id);
  assert.equal(turn.creator.id, crew[1].id);
  assert.equal(turn.reference, undefined);
  const secondReference = { frames: [4] };
  turn.onRecord(secondReference);
  assert.equal(turn.player.id, crew[0].id);
  assert.equal(turn.reference, secondReference);
});
