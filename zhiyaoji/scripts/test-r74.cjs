'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require('../app/local-review-engine.js'),{Queue,install}=require('../app/practice-images.js');
const results=[];let checks=0;const now=Date.UTC(2026,10,6,4),DAY=86400000;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
function test(name,fn){fn();results.push(name);}
function queue(){let clock=0,next=0;const timers=new Map(),images=[],requests=[];class Image{constructor(){images.push(this);}setAttribute(){}removeAttribute(){this.srcValue=null;}set src(url){this.srcValue=url;requests.push(url);}get src(){return this.srcValue;}}
 return {Image,images,requests,timers,advance(ms){clock+=ms;for(const [i,t]of [...timers])if(t.at<=clock){timers.delete(i);t.fn();}},options:{Image,now:()=>clock,setTimer:(fn,ms)=>{const i=++next;timers.set(i,{at:clock+ms,fn});return i;},clearTimer:i=>timers.delete(i)}};}
const q=(id,type='t0',extra={})=>({id,canonicalId:'c-'+id,subject:'言语理解',localTopicPaths:[['逻辑填空','语境分析',type]],stemHtml:'Synthetic question',optionsHtml:['A','B','C','D'],answer:'A',rate:60,...extra});
function evidence({result='incorrect',confidence,include=true,slow=false,favorite=false,seconds=60,at=now-DAY,id='q0',type='t0',mode='paper',timingValid=true,...extra}={}){
 const question=q(id,type,{_favorite:favorite,...extra}),sid='s-'+id+'-'+at;
 const timeAssessment={valid:timingValid,slow,scope:'question',actualSeconds:slow?200:seconds,thresholdSeconds:100};
 const a={sessionId:sid,questionId:id,canonicalId:question.canonicalId,finishedAt:at,gradingStatus:'graded',answer:'A',selected:result==='unanswered'?null:result==='correct'?'A':'B',result,seconds,confidence,timeAssessment};
 const s={id:sid,mode,startedAt:at-60000,answers:{[id]:{selected:a.selected,seconds,confidence}},reviewFeedback:{[id]:{confidence,excludeFromLearning:!include,inclusionOverride:true}}};
 return {question,a,s};
}
function context(cases,options={}){return E.buildContext({bank:cases.map(x=>x.question),attempts:cases.map(x=>x.a),sessions:cases.map(x=>x.s)},{now,...options});}
const priority=cases=>E.priorities(context(cases))[0];
test('image queue fills all ten URLs while keeping at most four live preload objects',()=>{
 const h=queue(),p=new Queue(h.options);p.plan(Array.from({length:10},(_,i)=>'i'+i));eq(h.requests.length,4);
 for(let n=0;n<10;n++){const active=[...p.active.values()][0];ok(active);active.image.onload();ok(p.active.size<=4);}
 eq(h.requests.length,10);eq(p.metrics.maxActive,4);eq(p.active.size,0);eq(h.timers.size,0);p.dispose();
});
test('new plans discard stale pending URLs, retain only four in-flight tasks, and release on disposal',()=>{
 const h=queue(),p=new Queue(h.options);p.plan(['a','b','c','d','obsolete']);p.plan(['next-a','next-b']);[...p.active.values()][0].image.onload();eq(h.requests.at(-1),'next-a');ok(!h.requests.includes('obsolete'));eq(p.metrics.maxActive,4);p.dispose();eq(p.active.size,0);eq(p.pending.length,0);eq(h.timers.size,0);ok(h.images.every(x=>!x.onload&&!x.onerror));
});
test('preload errors and timeouts release slots, backfill, and do not spin on the same URL',()=>{
 const h=queue(),p=new Queue(h.options);p.plan(['bad','b','c','d','e']);h.images[0].onerror();eq(h.requests.at(-1),'e');p.plan(['bad']);eq(h.requests.filter(x=>x==='bad').length,1);h.advance(31000);p.plan(['bad']);eq(h.requests.filter(x=>x==='bad').length,2);p.dispose();eq(h.timers.size,0);
});
test('preload URL history is bounded and completed image objects are not retained',()=>{
 const h=queue(),p=new Queue(h.options);for(let n=0;n<35;n++){p.plan(Array.from({length:4},(_,i)=>n+'-'+i));for(const job of [...p.active.values()])job.image.onload();}eq(p.ready.size,80);eq(p.active.size,0);eq(p.metrics.completed,140);p.dispose();
});
test('installed loader omits unopened explanations, caches HTML extraction, and invalidates edited questions',()=>{
 const h=queue(),abort=new AbortController(),sourceCalls=[];const S={imageSources:html=>{sourceCalls.push(html);return [...String(html||'').matchAll(/src="([^"]+)"/g)].map(x=>x[1]);}};
 const document={addEventListener(){}},window={innerHeight:800};install(S,{document,window,navigator:{},Image:h.Image,setTimeout:h.options.setTimer,clearTimeout:h.options.clearTimer,cancelAnimationFrame(){}});
 const make=n=>({stemHtml:`<img src="${n}-s">`,optionsHtml:['a','b','c','d'].map(x=>`<img src="${n}-${x}">`),materialHtml:'',explanationHtml:'<img src="hidden-analysis">'});
 const exam={s:{index:0,questions:[make(0),make(1)]},abort};S.warmQuestionImages(exam);eq(h.requests.length,4);const before=sourceCalls.length;for(let n=0;n<100;n++)S.warmQuestionImages(exam);eq(sourceCalls.length,before);
 for(let n=0;n<10;n++){const live=h.images.find(x=>x.onload);ok(live);live.onload();}eq(h.requests.length,10);ok(!h.requests.includes('hidden-analysis'));
 exam.s.questions[0].stemHtml='<img src="edited">';S.warmQuestionImages(exam);ok(h.requests.includes('edited'));abort.abort();eq(S.imagePreloadMetrics.active,0);eq(h.timers.size,0);
});
test('agreed base weights and maximum-tag combination are exact',()=>{
 for(const [options,weight]of [[{},100],[{include:false},25],[{include:false,slow:true},70],[{include:false,result:'correct',slow:true},25],[{include:false,result:'correct',favorite:true},50],[{include:true,slow:true,favorite:true},100],[{include:false,confidence:'guess',favorite:true,slow:true},10],[{confidence:'guess',result:'correct',favorite:true},5]])eq(priority([evidence(options)]).baseWeight,weight);
 eq(priority([evidence({seconds:3})]).baseWeight,100);eq(priority([evidence({include:false,slow:true,timingValid:false})]).baseWeight,25);
});
test('favorites without attempts create a 50-point goal; ordinary correct answers do not',()=>{
 const c=E.buildContext({bank:[q('fav','t0',{_favorite:true})],attempts:[],sessions:[]},{now});eq(E.priorities(c)[0].baseWeight,50);eq(E.priorities(context([evidence({result:'correct',confidence:'certain'})])).length,0);
});
test('independent errors boost recurrence, repeated originals do not, and the multiplier is capped',()=>{
 const repeated=[evidence({id:'same',at:now-2*DAY}),evidence({id:'same',at:now-DAY})];eq(priority(repeated).repeatFactor,1);
 eq(priority([evidence({id:'a'}),evidence({id:'b'})]).repeatFactor,1.25);
 eq(priority(Array.from({length:9},(_,i)=>evidence({id:'r'+i}))).repeatFactor,2);
});
test('mastery declines only after distinct fresh certain correct and valid normal-time attempts',()=>{
 const wrong=evidence({id:'wrong',at:now-3*DAY});eq(priority([wrong,evidence({id:'new',result:'correct',confidence:'certain',at:now-DAY})]).masteryFactor,.7);
 for(const options of [{confidence:'guess'},{confidence:undefined},{confidence:'certain',slow:true},{confidence:'certain',timingValid:false}])eq(priority([wrong,evidence({id:'new',result:'correct',at:now-DAY,...options})]).masteryFactor,1);
 const familiar=evidence({id:'wrong',result:'correct',confidence:'certain',at:now-DAY});eq(priority([wrong,familiar]).masteryFactor,1);
});
test('invalid evidence is rejected and current-day evidence does not alter yesterday-based needs',()=>{
 eq(E.priorities(context([evidence({disputed:true})])).length,0);
 eq(E.valid(q('bad-img','t0',{stemHtml:'<img>'})),false);eq(E.valid(q('script-img','t0',{stemHtml:'<img src="javascript:alert(1)">'})),false);eq(E.valid(q('good-img','t0',{stemHtml:'<img src="https://images.invalid/a.png">'})),true);
 const future=evidence({at:now-1000});eq(context([future],{learningAsOf:now-DAY}).signals.length,0);
});
test('shared material slow timing is normalized without multiplying the priority',()=>{
 const cases=Array.from({length:5},(_,i)=>{const x=evidence({id:'g'+i,result:'correct',include:false,slow:true});x.a.timeAssessment={valid:true,scope:'group',groupId:'material',groupActualSeconds:600,groupThresholdSeconds:500};return x;});eq(priority(cases).score,25);eq(priority(cases).repeatFactor,1);
 const normalized=E.timing(cases[0].a.timeAssessment);eq(E.timing(normalized).valid,true);eq(E.timing({valid:false,scope:'group',groupActualSeconds:600,groupThresholdSeconds:500}).slow,false);
});
function bank(){const out=[];for(let n=0;n<36;n++){out.push(q('v'+n,'t'+n%6,{localTopicPaths:[[n%2?'片段阅读':'逻辑填空','family'+n%3,'t'+n%6]]}));out.push(q('l'+n,'t'+n%6,{subject:'判断推理',localTopicPaths:[['逻辑判断','family'+n%3,'t'+n%6]]}));out.push(q('d'+n,'t'+n%6,{subject:'资料分析',localTopicPaths:[['比重','family'+n%3,'t'+n%6]],materialKey:'material-'+Math.floor(n/5),materialHtml:'Complete synthetic material'}));}
 const numeric=[['数字推理','因数分解数列','因子规律'],['数字推理','多级数列','作差成等比'],['数字推理','机械划分','整数小数拆分'],['数字推理','机械划分','根式分部规律'],['数字推理','分数数列','分子分母联动']];
 for(let i=0;i<5;i++)for(let n=0;n<8;n++)out.push(q('n'+i+'-'+n,'',{subject:'数量关系',localTopicPaths:[numeric[i]],rate:[61,71,60,41,59][i]}));return out;}
test('complete selection preserves 10/8/5/7 slots, exact types, novelty, bounded concentrations and estimated time',()=>{
 const source=evidence({id:'history'}),questions=bank();questions.push(source.question);const p=E.select({bank:questions,attempts:[source.a],sessions:[source.s]},{now,seed:'r74'});
 eq(p.ready,true);eq(p.ids.length,30);eq(new Set(p.ids).size,30);eq(p.modules.map(m=>m.actual),[10,8,5,7]);ok(!p.ids.includes('history'));ok(p.questions.every(E.valid));ok(p.metrics.estimatedSeconds>0);
 for(const m of p.modules){const counts=new Map();for(const row of p.rows.filter(r=>r.module===m.module&&!r.diversityRelaxed)){counts.set(row.micro,(counts.get(row.micro)||0)+1);}ok([...counts.values()].every(n=>n<=Math.ceil(m.requested/2)));}
});
test('only explicitly due originals can supplement missing unseen matches, capped per module and run',()=>{
 const source=evidence({id:'old',at:now-5*DAY}),fresh=q('fresh'),data={bank:[source.question,fresh],attempts:[source.a],sessions:[source.s],reviewState:{[source.question.canonicalId]:{nextReviewAt:now-DAY,lastAttemptAt:source.a.finishedAt}}};
 const p=E.select(data,{now,quotas:{'言语理解':2},seed:'due'});eq(p.ready,true);eq(p.metrics.dueRetests,1);ok(p.rows.find(r=>r.id==='old').dueRetest);
 const without=E.select({...data,reviewState:{}},{now,quotas:{'言语理解':2},seed:'due'});eq(without.ids.length,1);
 const recent=evidence({id:'old',at:now-1000});const c=E.buildContext({...data,attempts:[...data.attempts,recent.a],sessions:[...data.sessions,recent.s]},{now,learningAsOf:now-3600000});eq(c.due.size,0);
});
const report={release:'R74',scope:'actual production queue and selection functions with synthetic input',groups:results.length,assertions:checks,passed:true,tests:results,browserQA:false,iPadQA:false};
const out=path.join(__dirname,'../verification/r74');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'unit-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
