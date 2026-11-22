import test from 'node:test';
import assert from 'node:assert/strict';
import { readAnalysis, mistakeSections, errorColor, analysisAt } from './replayAnalysis.ts';
const part = {status:'measured', error_degrees:45};
const sample = (t, severity=80) => ({reference_ms:t,attempt_ms:t,parts:{'left forearm':part},severity});
test('analysis validates monotonic paired timestamps and finite errors',()=>{
 assert.equal(readAnalysis({version:2,samples:[]},10000),null);
 assert.equal(readAnalysis({version:1,samples:[sample(800),sample(100)]},10000),null);
 assert.equal(readAnalysis({version:1,samples:[{...sample(0),parts:{'left forearm':{status:'measured',error_degrees:NaN}}}]},10000),null);
 assert.equal(readAnalysis({version:1,samples:[sample(0)]},10000)?.length,1);
});
test('colors use approved boundaries and stale samples clear',()=>{
 assert.equal(errorColor({status:'measured',error_degrees:10}),'#33e88e');
 assert.equal(errorColor({status:'measured',error_degrees:30}),'#ffcb65');
 assert.equal(errorColor(part),'#ff5c74');
 assert.equal(errorColor({status:'not_tracked'}),null);
 assert.equal(analysisAt([sample(0)],500),null);
});
test('worst sections merge nearby peaks and preserve distinct mistakes',()=>{
 const sections=mistakeSections([sample(500),sample(600),sample(4000,60),sample(8000,90)],10000);
 assert.equal(sections.length,3);
 assert.deepEqual(sections.map(s=>s.peak.reference_ms),[500,4000,8000]);
 assert.ok(sections.every(s=>s.start>=0&&s.end<=10000));
 assert.equal(mistakeSections([{...sample(0),severity:0,parts:{'left forearm':{status:'measured',error_degrees:0}}}],10000).length,0);
});

test('separate peaks remain separate across a sustained low mismatch',()=>{
 const data = Array.from({length:41}, (_, i) => sample(i * 100, i === 0 ? 80 : i === 40 ? 90 : 20));
 const sections = mistakeSections(data, 5000);
 assert.deepEqual(sections.map(s=>s.peak.reference_ms), [0,4000]);
});

test('malformed samples are rejected instead of producing misleading overlays',()=>{
 const bad = [
  {...sample(0), attempt_ms:-1},
  {...sample(0), severity:Infinity},
  {...sample(0), parts:{'unknown limb':part}},
  {...sample(0), parts:{'left forearm':{status:'measured',error_degrees:181}}},
  {...sample(0), parts:{'left forearm':{status:'missing'}}},
 ];
 for(const entry of bad) assert.equal(readAnalysis({version:1,samples:[entry]},10000),null);
 assert.equal(readAnalysis({version:1,samples:[sample(0),sample(0)]},10000),null);
});

test('untracked limbs create a marker while absent reference limbs do not',()=>{
 const untracked={...sample(250),parts:{'left shin':{status:'not_tracked'}}};
 const absent={...sample(250),parts:{'left shin':{status:'not_in_reference'}}};
 assert.equal(mistakeSections([untracked],5000).length,1);
 assert.equal(mistakeSections([absent],5000).length,0);
});
