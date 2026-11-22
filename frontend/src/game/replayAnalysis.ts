export type PartError = { status: 'measured'; error_degrees: number } | { status: 'not_tracked' | 'not_in_reference' };
export interface ErrorSample { reference_ms: number; attempt_ms: number; severity: number; parts: Record<string, PartError> }
export interface MistakeSection { start: number; end: number; peak: ErrorSample }
export const REPLAY_SEGMENTS: Record<string, [number, number]> = {
 'left upper arm':[11,13], 'left forearm':[13,15], 'right upper arm':[12,14], 'right forearm':[14,16],
 'left thigh':[23,25], 'left shin':[25,27], 'right thigh':[24,26], 'right shin':[26,28],
 shoulders:[11,12], hips:[23,24], spine:[33,34],
};
export function readAnalysis(value: unknown, durationMs: number): ErrorSample[] | null {
 if (!value || typeof value !== 'object') return null;
 const data = value as {version?:unknown;samples?:unknown};
 if (data.version !== 1 || !Array.isArray(data.samples) || !data.samples.length || data.samples.length > 901) return null;
 let previous = -1, attemptPrevious = -1;
 for (const raw of data.samples) {
  const s = raw as ErrorSample;
  if (!s || !Number.isFinite(s.reference_ms) || !Number.isFinite(s.attempt_ms) || s.reference_ms < 0 || s.reference_ms > durationMs + 1 || s.reference_ms <= previous || s.attempt_ms < attemptPrevious || s.attempt_ms < 0 || s.attempt_ms > durationMs + 1 || !Number.isFinite(s.severity) || s.severity < 0 || s.severity > 100 || !s.parts || typeof s.parts !== 'object' || Array.isArray(s.parts) || !Object.keys(s.parts).length) return null;
  for (const [name,p] of Object.entries(s.parts)) {
   if (!Object.hasOwn(REPLAY_SEGMENTS,name) || !p || !['measured','not_tracked','not_in_reference'].includes(p.status)) return null;
   if (p.status === 'measured' && (!Number.isFinite(p.error_degrees) || p.error_degrees < 0 || p.error_degrees > 180)) return null;
  }
  previous=s.reference_ms;attemptPrevious=s.attempt_ms;
 }
 return data.samples as ErrorSample[];
}
export function errorColor(part?: PartError): string | null {
 if (part?.status !== 'measured') return null;
 return part.error_degrees <= 10 ? '#33e88e' : part.error_degrees <= 30 ? '#ffcb65' : '#ff5c74';
}
export function analysisAt(samples: ErrorSample[], ms: number): ErrorSample | null {
 let low=0,high=samples.length;
 while(low<high){const mid=(low+high)>>>1;if(samples[mid].reference_ms<ms)low=mid+1;else high=mid;}
 const a=samples[low-1],b=samples[low];
 const nearest=!a||(b&&b.reference_ms-ms<ms-a.reference_ms)?b:a;
 return nearest && Math.abs(nearest.reference_ms-ms)<=100 ? nearest : null;
}
export function worstPart(sample: ErrorSample): [string, PartError] | undefined {
 return Object.entries(sample.parts).filter(([,p])=>p.status==='not_tracked'||(p.status==='measured'&&p.error_degrees>10)).sort((a,b)=>{
  const rank=(p:PartError)=>p.status==='not_tracked'?181:p.status==='measured'?p.error_degrees:0;
  return rank(b[1])-rank(a[1]);
 })[0];
}
export function describeMistake(sample?: ErrorSample | null) {
 const part=sample&&worstPart(sample);
 if(!part)return 'No significant mismatch at this moment';
 return `${part[0]}: ${part[1].status==='not_tracked'?'not tracked':part[1].status==='measured'&&part[1].error_degrees>30?'large mismatch':'moderate mismatch'}`;
}
export function mistakeSections(samples: ErrorSample[], durationMs: number): MistakeSection[] {
 const windows: MistakeSection[]=[];
 for(let i = 0; i < samples.length; i++){
  const s = samples[i];
  if(!worstPart(s) || (i > 0 && s.reference_ms - samples[i - 1].reference_ms <= 200 && samples[i - 1].severity >= s.severity) || (i + 1 < samples.length && samples[i + 1].reference_ms - s.reference_ms <= 200 && samples[i + 1].severity > s.severity)) continue;
  const start=Math.max(0,s.reference_ms-1000),end=Math.min(durationMs,s.reference_ms+1000);
  const previous=windows.at(-1);
  if(previous&&start<=previous.end){previous.end=Math.max(previous.end,end);if(s.severity>previous.peak.severity)previous.peak=s;}
  else windows.push({start,end,peak:s});
 }
 return windows.sort((a,b)=>b.peak.severity-a.peak.severity||a.peak.reference_ms-b.peak.reference_ms).slice(0,3).sort((a,b)=>a.start-b.start);
}
