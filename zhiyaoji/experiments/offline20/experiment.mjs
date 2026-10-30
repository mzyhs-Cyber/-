import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {generate} from './engine.mjs';
const data=JSON.parse(await fs.readFile(new URL('./private/metadata.json',import.meta.url),'utf8'));
const audit=JSON.parse(await fs.readFile(new URL('./private/audit.json',import.meta.url),'utf8'));
const runs=[];
for(const mode of ['strict','metadata-preview']){
  let beats=0,last=performance.now(),maxGap=0;
  const clock=setInterval(()=>{const t=performance.now();maxGap=Math.max(maxGap,t-last);last=t;beats++;},10);
  const start=performance.now();
  const result=await generate({...data,owner:'local-experiment',now:Date.parse('2026-10-30T08:00:00Z'),mode});
  const ms=performance.now()-start;clearInterval(clock);
  await fs.writeFile(new URL(`./private/${mode}.json`,import.meta.url),JSON.stringify(result,null,2));
  runs.push({mode,durationMs:Math.round(ms),nodeEventLoopMaxGapMs:Math.round(maxGap),timerCallbacks:beats,status:result.status,canStart:result.canStart,count:result.questions.length,subjects:result.questions.reduce((a,q)=>(a[q.subject]=(a[q.subject]||0)+1,a),{}),eligibleUnits:result.eligibleUnits,shortages:result.shortages,excluded:result.excluded,searchLimited:result.searchLimited,statsCount:result.summary.stats.length,feedbackCoverage:result.summary.diagnostics,windowDays:result.summary.windows});
}
const report={audit,runs,limitations:['No browser or iPad measurement','Metadata preview relaxes answer-verification and offline-media gates; cannot start or publish','Difficulty uses platform accuracy proxy, not verified structural difficulty','Source taxonomy is not a human-confirmed micro-mechanism map','Historical seen coverage is incomplete; no full-account dedup claim','No production storage or app integration']};
await fs.writeFile(new URL('./EXPERIMENT_RESULTS.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
