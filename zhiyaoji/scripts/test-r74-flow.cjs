'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {create}=require('./test-support/r54-harness.cjs'),app=path.join(__dirname,'../app');
const results=[];let checks=0;const plain=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x)),eq=(a,b)=>{assert.deepEqual(plain(a),plain(b));checks++;},ok=v=>{assert.ok(v);checks++;};
const questions=n=>Array.from({length:n},(_,i)=>({id:'flow-'+i,canonicalId:'flow-c-'+i,subject:'言语理解',path:['言语理解','逻辑填空','语境分析','t'+i%4],localTopicPaths:[['逻辑填空','语境分析','t'+i%4]],paperId:'synthetic-paper',paperOrder:i+1,stemHtml:'Synthetic text '+i,optionsHtml:['Choice A','Choice B','Choice C','Choice D'],answer:'A',explanationHtml:'Synthetic explanation',rate:60}));
async function fixture(n=30){const h=create({app}),S=h.S;await S.openStore();S.state=S.makeInitialState();S.state.meta.syncOwnerId='guest';S.state.bank=questions(n);S.state.papers=[{id:'synthetic-paper',title:'Synthetic paper'}];S.state.settings.autoAdvance=false;S.reindex();await S.persistState(S.state);S.route='home';return h;}
async function until(h,fn){for(let n=0;n<100;n++){if(fn())return;await h.flush();}throw Error('Timed out '+JSON.stringify(h.S.messages));}
async function click(h,action,i=0,letter){const button=h.S.exam.root.querySelector(`[data-exam="${action}"][data-index="${i}"]${letter?`[data-letter="${letter}"]`:''}`);ok(button);button.dispatchEvent({type:'click',pointerType:'mouse'});await h.flush();}
async function test(name,fn){await fn();results.push(name);}
(async()=>{
 await test('production script order: virtual practice, answers/exclusions/favorite, journal, save and reopen',async()=>{
  const h=await fixture(135),S=h.S;S.startSession(S.state.bank,{mode:'paper',title:'Synthetic paper'});await until(h,()=>S.exam);const s=S.exam.s;
  ok(h.doc.querySelectorAll('[data-exam="answer"]').length<540);ok(S.PracticeImages);eq(S.LocalReviewEngine,undefined);eq(h.context.LocalReviewEngine.VERSION,7);
  await h.advance(100);await click(h,'answer',0,'B');eq(s.answers['flow-0'].selected,'B');await click(h,'exclude',0,'B');eq(s.answers['flow-0'].selected,null);eq(s.answers['flow-0'].excluded,['B']);await click(h,'exclude',0,'B');eq(s.answers['flow-0'].excluded,[]);await click(h,'answer',0,'A');await click(h,'mark',0);eq(S.isFavorite(s.questions[0]),true);
  S.exam.jump(90,false);await h.flush();ok(h.doc.querySelector('[data-question="90"]'));await click(h,'answer',90,'C');await S.saveHot();await S.answerJournal.pending(s);const id=s.id,disk=h.disk,local=h.local;h.dispose();
  const fresh=create({app,disk,local}),T=fresh.S;T.state=await T.openStore();T.reindex();const restored=T.state.sessions.find(x=>x.id===id);eq(restored.answers['flow-0'].selected,'A');eq(restored.answers['flow-90'].selected,'C');eq(T.isFavorite(restored.questions[0]),true);fresh.dispose();
 });
 await test('ordinary paper confidence controls persist guess and invalidated review confirmation across reopen',async()=>{
  const h=await fixture(3),S=h.S;S.startSession(S.state.bank,{mode:'paper',title:'Synthetic confidence'});await until(h,()=>S.exam);const s=S.exam.s;await click(h,'answer',0,'B');s.answers['flow-0'].seconds=3;await S.finalize(s);eq(s.finished,true);
  const html=S.reviewFeedbackMarkup(s,'flow-0');ok(html.includes('data-local-confidence="guess"'));const host=h.doc.createElement('div');host.innerHTML=html;h.doc.body.append(host);const button=host.querySelector('[data-local-confidence="guess"]');ok(button);button.dispatchEvent({type:'click',pointerType:'mouse'});await h.flush();eq(s.reviewFeedback['flow-0'].confidence,'guess');await S.saveHot();const disk=h.disk,local=h.local,id=s.id;h.dispose();
  const fresh=create({app,disk,local}),T=fresh.S;T.state=await T.openStore();eq(T.state.sessions.find(x=>x.id===id).reviewFeedback['flow-0'].confidence,'guess');fresh.dispose();
 });
 await test('background worker receives normalized timing/favorites but no ink/HTML and applies actual new scoring',async()=>{
  const h=await fixture(24),S=h.S,E=h.context.LocalReviewEngine,captured=[];const at=Date.UTC(2026,10,5,4),now=at+86400000;
  const qs=S.state.bank,s={id:'history',mode:'paper',startedAt:at-60000,finishedAt:at,finished:true,questions:qs.slice(0,2),answers:{'flow-0':{selected:'B',seconds:150},'flow-1':{selected:'A',seconds:150}},reviewFeedback:{'flow-0':{excludeFromLearning:true,inclusionOverride:true},'flow-1':{excludeFromLearning:true,inclusionOverride:true}},notes:{private:{strokes:[{points:[{x:.3,y:.8}]}]}}};
  S.state.sessions=[s];S.state.attempts=s.questions.map((q,i)=>({sessionId:s.id,questionId:q.id,canonicalId:q.canonicalId,finishedAt:at,gradingStatus:'graded',answer:'A',selected:i?'A':'B',result:i?'correct':'incorrect',seconds:150,timeAssessment:{valid:true,scope:'question',actualSeconds:150,thresholdSeconds:75,slow:true}}));S.state.learning.favorites[qs[1].canonicalId]=true;
  class Worker{constructor(url){ok(String(url).includes('r74'));const self={postMessage:r=>queueMicrotask(()=>this.onmessage?.({data:r}))};this.env=vm.createContext({self,console,importScripts:file=>vm.runInContext(fs.readFileSync(path.join(app,file.split('?')[0]),'utf8'),this.env)});vm.runInContext(fs.readFileSync(path.join(app,'local-review-worker.js'),'utf8'),this.env);}postMessage(data){captured.push(data);queueMicrotask(()=>this.env.self.onmessage({data:structuredClone(data)}));}terminate(){}}
  h.context.Worker=Worker;
  const plan=await S.selectLocalReviewAsync(S.state,{now,learningAsOf:now-1,paths:q=>q.localTopicPaths||[],canonical:q=>q.canonicalId,quotas:{'言语理解':3},seed:'worker'});eq(plan.ready,true);eq(plan.priorities.find(p=>p.sourceIds.includes(qs[0].canonicalId)).baseWeight,70);eq(plan.priorities.find(p=>p.sourceIds.includes(qs[1].canonicalId)).baseWeight,50);
  eq(captured.length,1);const payload=captured[0];eq(payload.state.attempts[0].timeAssessment.valid,true);eq(payload.state.attempts[0].seconds,150);ok(!JSON.stringify(payload).includes('strokes'));ok(!JSON.stringify(payload).includes('Synthetic text'));ok(!JSON.stringify(payload).includes('explanationHtml'));eq(S.state.sessions[0].notes.private.strokes.length,1);h.dispose();
 });
 await test('legacy successful plan and in-progress session are retained after engine update',async()=>{
  const h=await fixture(4),S=h.S,today=new Date(h.context.Date.now()+8*3600000).toISOString().slice(0,10),p={version:6,date:today,ownerId:'guest',ids:['flow-0'],rows:[{id:'flow-0',module:'言语理解'}],modules:[{module:'言语理解',actual:1}],ready:true,title:'Legacy fixed plan',asOf:1};
  S.state.learning.localReviewPlans={['guest|'+today]:p};eq(S.localReview.stored().version,6);eq((await S.localReview.generate()).ids,['flow-0']);await S.localReview.start();await until(h,()=>S.exam);eq(S.exam.s.questions.map(q=>q.id),['flow-0']);eq(S.exam.s.blueprint.localReview.version,6);h.dispose();
 });
 await test('due-original start allows only planned overdue items and skips records answered after generation',async()=>{
  for(const answeredAgain of [false,true]){
   const h=await fixture(3),S=h.S,stamp=h.context.Date.now(),today=new Date(stamp+8*3600000).toISOString().slice(0,10),a={sessionId:'old-source',questionId:'flow-0',canonicalId:'flow-c-0',finishedAt:stamp-5*86400000,answer:'A',selected:'B',result:'incorrect',gradingStatus:'graded'};S.state.attempts=[a];
   const p={version:7,date:today,ownerId:'guest',ids:['flow-0','flow-1'],rows:[{id:'flow-0',module:'言语理解',dueRetest:true},{id:'flow-1',module:'言语理解',unseen:true}],modules:[{module:'言语理解',actual:2}],ready:true,title:'Due fixed plan',asOf:stamp-1000};S.state.learning.localReviewPlans={['guest|'+today]:p};
   if(answeredAgain)S.state.attempts.push({...a,sessionId:'new-source',finishedAt:stamp});await S.localReview.start();await until(h,()=>S.exam);eq(S.exam.s.questions.map(q=>q.id),answeredAgain?['flow-1']:['flow-0','flow-1']);h.dispose();
  }
 });
 await test('pen routing and evidence vectors remain intact with the image loader installed',async()=>{
  const h=await fixture(5),S=h.S;S.startSession(S.state.bank,{mode:'paper',title:'Synthetic ink'});await until(h,()=>S.exam);const s=S.exam.s;await click(h,'pen',0);eq(S.exam.inkOn,true);const view=[...S.exam.layers.values()][0];ok(view);
  const event=(type,x,y)=>({type,pointerType:'pen',pointerId:7,buttons:type==='pointerup'?0:1,pressure:.7,clientX:x,clientY:y,timeStamp:h.now()});
  view.canvas.dispatchEvent(event('pointerdown',100,100));view.canvas.dispatchEvent(event('pointermove',150,140));view.canvas.dispatchEvent(event('pointerup',170,150));eq(S.activeInkPointer,null);ok(s.notes['q:flow-0'].strokes.length>0);
  for(let i=0;i<40;i++){await h.advance(80);if([...view.facades?.values()||[]].every(f=>f.layoutReady))break;}const vectors=plain(s.notes['q:flow-0'].strokes.map(x=>x.points));await click(h,'pen',0);await S.saveHot();await S.finalize(s);eq(s.finished,true);await S.openReview(s.id,'all');await until(h,()=>S.review);const note=S.reviewNoteFor(S.review.controller,'q:flow-0');eq(note.strokes.map(x=>x.points),vectors);eq(S.evidenceNotes(s)['q:flow-0'].strokes.map(x=>x.points),vectors);h.dispose();
 });
 await test('background selection yields to entering practice and terminates the worker without replacing state',async()=>{
  const h=await fixture(24),S=h.S,before=S.state;let stopped=false;class Worker{postMessage(){S.openingPractice=true;queueMicrotask(()=>this.onmessage({data:{protocol:1,id:1,plan:{ids:[]}}}));}terminate(){stopped=true;}}h.context.Worker=Worker;
  await assert.rejects(S.selectLocalReviewAsync(S.state,{paths:q=>q.localTopicPaths}),e=>e.name==='AbortError');checks++;eq(stopped,true);eq(S.state===before,true);eq(S.localSelectionMetrics.inFlight,0);S.openingPractice=false;h.dispose();
 });
 const report={release:'R74',scope:'all production scripts through DOM/event/IndexedDB and actual Worker adapters; synthetic only',groups:results.length,assertions:checks,passed:true,tests:results,browserQA:false,iPadQA:false};fs.writeFileSync(path.join(__dirname,'../verification/r74/flow-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
