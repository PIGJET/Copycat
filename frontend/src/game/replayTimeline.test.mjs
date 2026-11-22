import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineSections, timelineTicks, formatReplayTime } from './replayTimelineData.ts';

const sample = (t, severity, status='measured') => ({reference_ms:t, attempt_ms:t, severity, parts:{'left forearm': status === 'measured' ? {status, error_degrees: 20} : {status}}});
test('empty or unsupported scoring data stays unavailable', () => {
 assert.deepEqual(timelineSections([], 5000), []);
 assert.deepEqual(timelineSections([sample(0,0,'not_in_reference')], 5000), []);
});
test('sections align with sampled timestamps and never bridge tracking gaps', () => {
 const sections=timelineSections([sample(0,0),sample(67,10),sample(2000,80),sample(2067,70)],5000);
 assert.equal(sections[0].start,0);
 assert.ok(sections[0].end<2000);
 assert.equal(sections.at(-1).start,2000);
 assert.equal(sections.at(-1).label,'High error');
});
test('timeline ticks include the exact end and time labels handle minutes', () => {
 assert.deepEqual(timelineTicks(12500),[0,2500,5000,7500,10000,12500]);
 assert.equal(formatReplayTime(62500),'1:02');
 assert.deepEqual(timelineTicks(0),[]);
});
