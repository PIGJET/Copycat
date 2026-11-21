const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/demo-data.js'),'utf8')+';globalThis.helpers={demoRankings,weakestPart,CopycatDemoData,rankTransition};',context);
const {demoRankings,weakestPart,CopycatDemoData,rankTransition}=context.helpers;
const crew=[{id:1,name:'Creator'},{id:2,name:'Alex'},{id:3,name:'Jamie'}];
const result=(playerId,total,timing)=>({playerId,score:{total,timing}});
test('ranks average scores instead of totals',()=>{
  const rows=demoRankings(crew,[result(2,90,70),result(2,50,60),result(3,75,80)]);
  assert.deepEqual(Array.from(rows,r=>r.player.id),[3,2,1]);
  assert.equal(rows[1].average,70);
});
test('leaves unscored creators unranked',()=>{
  const rows=demoRankings(crew,[result(2,80,70)]);
  assert.equal(rows[0].player.id,2);
  assert.equal(rows[1].average,null);
  assert.equal(rows[2].average,null);
});
test('lower average timing loses an average-score tie',()=>{
  const rows=demoRankings(crew,[result(2,80,90),result(3,80,50)]);
  assert.deepEqual(Array.from(rows,r=>r.player.id),[2,3,1]);
});
test('identifies the lowest component for relevant feedback',()=>{
  assert.equal(weakestPart({arms:85,legs:42,torso:73,timing:65}),'legs');
  assert.equal(weakestPart({arms:85,legs:60,torso:73,timing:25}),'timing');
});
test('empty results never assign zero scores to players',()=>{
  assert.ok(demoRankings(crew,[]).every(r=>r.average===null));
});
test('demo fixtures have complete scores within bounds',()=>{
  for(const score of CopycatDemoData.scores)for(const key of ['total','arms','legs','torso','timing'])assert.ok(Number.isFinite(score[key])&&score[key]>=0&&score[key]<=100);
});
test('rank movement uses stable player IDs and reports upward and downward changes',()=>{
  const roster=[1,2,3,4].map(id=>({id,name:'Player '+id}));
  const before=[result(1,90,90),result(2,80,80),result(3,70,70),result(4,60,60)];
  const after=before.concat([result(1,20,20),result(2,70,70),result(3,100,100),result(4,90,90)]);
  const movement=rankTransition(roster,before,after);
  assert.equal(movement.changes.get(3).delta,2);
  assert.equal(movement.changes.get(1).delta,-3);
  assert.equal(movement.changes.get(2).delta,0);
  assert.deepEqual(Array.from(movement.after,row=>row.player.id),[3,2,4,1]);
});
test('newly scored players have no invented previous rank',()=>{
  const movement=rankTransition(crew,[result(2,70,70)],[result(2,70,70),result(3,90,90)]);
  assert.equal(movement.changes.get(3).isNew,true);
  assert.equal(movement.changes.get(3).previous,null);
  assert.equal(movement.changes.get(3).delta,0);
  assert.equal(movement.changes.get(1).current,null);
});
test('camera errors map to actionable UI states without camera access',()=>{
  const cameraContext=vm.createContext({document:{querySelector:()=>({addEventListener(){}})}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/round-ui.js'),'utf8')+';globalThis.classify=cameraFailureKind;',cameraContext);
  for(const name of ['NotAllowedError','SecurityError'])assert.equal(cameraContext.classify(name),'denied');
  assert.equal(cameraContext.classify('NotFoundError'),'missing');
  assert.equal(cameraContext.classify('NotReadableError'),'busy');
  assert.equal(cameraContext.classify('UnknownError'),'unavailable');
});
function cameraHarness(getMedia){
  const elements=new Map();
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{disabled:selector.includes('camera-continue'),hidden:false,textContent:'',srcObject:null,parentElement:{hidden:true},readyState:2,videoWidth:1280,videoHeight:720,classList:{add(){},remove(){}},addEventListener(){},play:async()=>{}});return elements.get(selector)};
  const sandbox=vm.createContext({document:{querySelector:element},navigator:{mediaDevices:{getUserMedia:getMedia}},preview:{screen:'camera'}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/round-ui.js'),'utf8')+';globalThis.camera={enableCameraCheck,stopCameraCheck};',sandbox);
  return {sandbox,elements,element,camera:sandbox.camera};
}
test('camera preview is opt-in, excludes audio, and releases tracks on exit',async()=>{
  let requests=0,stops=0;const track={stop(){stops++}},stream={active:true,getTracks:()=>[track],getVideoTracks:()=>[track]};
  const harness=cameraHarness(async constraints=>{requests++;assert.equal(constraints.audio,false);return stream});
  assert.equal(requests,0);
  await harness.camera.enableCameraCheck();
  assert.equal(requests,1);assert.equal(harness.element('#camera-status').textContent,'Camera ready');
  assert.equal(harness.element('[data-action="camera-continue"]').disabled,false);
  harness.camera.stopCameraCheck();assert.equal(stops,1);assert.equal(harness.element('#check-video').srcObject,null);
});
test('a late camera permission result is discarded after navigation',async()=>{
  let resolveMedia,stops=0;const track={stop(){stops++}},stream={active:true,getTracks:()=>[track],getVideoTracks:()=>[track]};
  const harness=cameraHarness(()=>new Promise(resolve=>{resolveMedia=resolve}));
  const pending=harness.camera.enableCameraCheck();
  harness.camera.stopCameraCheck();harness.sandbox.preview.screen='creator';resolveMedia(stream);await pending;
  assert.equal(stops,1);assert.equal(harness.element('[data-action="camera-continue"]').disabled,true);
});
test('camera permission denial exposes retry without enabling continuation',async()=>{
  const harness=cameraHarness(async()=>{const error=new Error('denied');error.name='NotAllowedError';throw error});
  await harness.camera.enableCameraCheck();
  assert.equal(harness.element('#camera-status').textContent,'Camera access denied');
  assert.equal(harness.element('[data-action="camera-enable"]').disabled,false);
  assert.equal(harness.element('[data-action="camera-continue"]').disabled,true);
});
