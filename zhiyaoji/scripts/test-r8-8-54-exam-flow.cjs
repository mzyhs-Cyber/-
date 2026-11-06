'use strict';
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {create}=require('./test-support/r54-harness.cjs');
const app=path.join(__dirname,'../app'),results=[];let checks=0;
const plain=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function eq(a,b){assert.deepEqual(plain(a),plain(b));checks++;}
async function until(h,fn,label){for(let n=0;n<100;n++){if(fn())return;await h.flush();}throw Error(label+'; '+JSON.stringify(h.S.messages));}
function questions(n=135){return Array.from({length:n},(_,i)=>({id:'fixture-q'+i,canonicalId:'fixture-c'+i,questionId:'fixture-q'+i,paperId:'fixture-paper',paperOrder:i+1,subject:i<45?'言语理解':i<90?'判断推理':'资料分析',path:i<45?['言语理解','片段阅读','细节判断']:i<90?['判断推理','逻辑判断','条件推理']:['资料分析','比重','两期比重'],stemHtml:'Synthetic flow fixture '+i,optionsHtml:['First fixture choice','Second fixture choice','Third fixture choice','Fourth fixture choice'],answer:'ABCD'[i%4],explanationHtml:'Synthetic explanation; no real exam content.',...(i>=90&&i<100?{materialKey:'fixture-material-'+Math.floor(i/5),materialHtml:'Synthetic shared material; complete group of five.'}:{})}));}
async function fixture(n=135,options={}){const h=create({app,...options}),S=h.S;await S.openStore();S.state=S.makeInitialState();S.state.meta.syncOwnerId='guest';S.state.bank=questions(n);S.state.papers=[{id:'fixture-paper',title:'Synthetic flow fixture',year:2026}];S.state.settings.autoAdvance=false;S.reindex();await S.persistState(S.state);S.route='home';return h;}
async function start(h,{duration=0,mode='paper'}={}){const S=h.S;S.startSession(S.state.bank,{mode,paperId:'fixture-paper',duration,title:'Synthetic flow fixture'});await until(h,()=>S.exam,'exam open');return S.exam.s;}
async function click(h,action,index=0,letter){const q=action==='resume'?'.pause-resume':`[data-exam="${action}"]${['answer','exclude','mark','pen','goto'].includes(action)?`[data-index="${index}"]`:''}${letter?`[data-letter="${letter}"]`:''}`,node=(h.S.exam?.root||h.S.review?.root||h.doc).querySelector(q);assert(node,'missing UI control '+q);node.dispatchEvent({type:'click',pointerType:'mouse'});await h.flush();return node;}
async function test(name,fn){await fn();results.push(name);}
(async()=>{
 await test('135-question paper: choose, cancel, change, exclude/recover, favorite, journal and main saves',async()=>{
  const h=await fixture(),S=h.S,s=await start(h);eq(h.doc.querySelectorAll('[data-exam="answer"]').length,540);eq(s.paused,false);
  await h.advance(100);await click(h,'answer',0,'A');eq(s.answers['fixture-q0'].selected,'A');eq(h.doc.querySelector('[data-question="0"] .option-button[data-letter="A"]')?.getAttribute('aria-pressed')??h.doc.querySelector('[data-question="0"] [data-exam="answer"][data-letter="A"]').getAttribute('aria-pressed'),'true');
  await click(h,'answer',0,'A');eq(s.answers['fixture-q0'].selected,null);await click(h,'answer',0,'B');await click(h,'exclude',0,'B');eq(s.answers['fixture-q0'].selected,null);eq(s.answers['fixture-q0'].excluded,['B']);await click(h,'answer',0,'B');eq(s.answers['fixture-q0'].excluded,[]);await click(h,'exclude',0,'C');await click(h,'exclude',0,'C');eq(s.answers['fixture-q0'].excluded,[]);
  await click(h,'mark',0);eq(S.isFavorite(s.questions[0]),true);await S.answerJournal.pending(s);await S.saveHot();eq(S.persistenceMetrics.hotFailures,0);eq(S.answerJournal.metrics.failures,0);eq(S.answerJournal.metrics.committed>0,true);h.dispose();
 });
 await test('unfinished paper: three runtime restarts restore selections, excluded options and IDs',async()=>{
  let h=await fixture(135),S=h.S,s=await start(h);const id=s.id;
  for(let round=0;round<3;round++){
   await h.advance(200);if(S.exam.s.paused)await click(h,'resume');await click(h,'answer',round,'ABCD'[round]);await click(h,'exclude',round,'D');await S.saveHot();await S.answerJournal.pending(s);const answers=plain(s.answers),ids=s.questions.map(q=>q.id),disk=h.disk,local=h.local;h.dispose();await h.flush();
   h=create({app,disk,local,seedTime:1793586721000+round*1000});S=h.S;S.state=await S.openStore();S.reindex();s=S.state.sessions.find(x=>x.id===id);eq(s.answers,answers);eq(s.questions.map(q=>q.id),ids);await S.openExam(s);await until(h,()=>S.exam,'reopen');eq(S.exam.s.id,id);
  }
  h.dispose();
 });
 await test('crash before the main debounce: independent answer journal recovers the newest choice',async()=>{
  const h=await fixture(8),S=h.S,s=await start(h);await S.saveHot();await h.advance(400);await click(h,'answer',3,'D');await S.answerJournal.pending(s);const disk=h.disk,local=h.local,id=s.id;h.timers.clear();h.frames.clear();
  const fresh=create({app,disk,local,seedTime:1793586730000}),T=fresh.S;T.state=await T.openStore();const restored=T.state.sessions.find(x=>x.id===id);eq(restored.answers['fixture-q3'].selected,'D');eq(T.answerJournal.metrics.restored>0,true);fresh.dispose();
 });
 await test('either journal storage path can fail while the other still restores the latest answer',async()=>{
  for(const fail of ['wal','idb']){
   const h=await fixture(5),S=h.S,s=await start(h);await S.saveHot();await h.advance(400);
   if(fail==='wal')h.local.fail=true;else h.disk.failNext((name,names,mode)=>name===S.answerJournal.database&&names.includes('progress')&&mode==='readwrite');
   await click(h,'answer',2,'C');eq(await S.answerJournal.pending(s),true);if(fail==='idb')eq(S.answerJournal.metrics.failures,1);h.local.fail=false;h.timers.clear();h.frames.clear();
   const fresh=create({app,disk:h.disk,local:h.local,seedTime:1793586750000}),T=fresh.S;T.state=await T.openStore();eq(T.state.sessions.find(x=>x.id===s.id).answers['fixture-q2'].selected,'C');fresh.dispose();
  }
 });
 await test('missing required image blocks answering; retry or skip leaves other questions usable',async()=>{
  const h=await fixture(5),S=h.S,s=await start(h),card=S.exam.root.querySelector('[data-question="0"]');card.dataset.assetFailed='true';await click(h,'answer',0,'A');eq(s.answers['fixture-q0'].selected,null);eq(S.messages.some(x=>x.includes('未加载')),true);await click(h,'answer',1,'B');eq(s.answers['fixture-q1'].selected,'B');card.dataset.assetFailed='false';await click(h,'answer',0,'A');eq(s.answers['fixture-q0'].selected,'A');h.dispose();
 });
 await test('ordinary practice: active time, manual pause/resume and background pause',async()=>{
  const h=await fixture(5),S=h.S,s=await start(h);await h.advance(2000);S.exam.pulse();eq(Math.round(s.elapsed),2);await click(h,'pause');const spent=s.elapsed;await h.advance(9000);S.exam.pulse();eq(s.elapsed,spent);await click(h,'resume');await h.advance(3000);S.exam.pulse();eq(Math.round(s.elapsed-spent),3);h.doc.hidden=true;h.doc.visibilityState='hidden';h.doc.dispatchEvent({type:'visibilitychange',bubbles:false});await h.flush();eq(s.paused,true);eq(s.pauseReason,'background');const pause=s.elapsed;await h.advance(15000);eq(s.elapsed,pause);h.dispose();
 });
 await test('auto advance honors the 156ms wait and stops at a material-group boundary',async()=>{
  const h=await fixture(),S=h.S,s=await start(h);S.state.settings.autoAdvance=true;await click(h,'answer',0,'A');await h.advance(155);eq(s.index,0);await h.advance(1);eq(s.index,1);await click(h,'answer',94,'C');await h.advance(200);eq(s.index,94);h.dispose();
 });
 await test('material expansion/collapse, next material, answer card and original question numbers',async()=>{
  const h=await fixture(),S=h.S,s=await start(h);await click(h,'material',90);await h.advance(16);eq(S.exam.split.indices,[90,91,92,93,94]);eq(S.exam.root.querySelectorAll('#split-q-scroll [data-exam="answer"]').length,20);S.exam.root.querySelector('[data-exam="material-step"][data-step="1"]').dispatchEvent({type:'click'});await h.advance(350);eq(S.exam.split.indices,[95,96,97,98,99]);S.exam.root.querySelector('[data-exam="material-step"][data-step="-1"]').dispatchEvent({type:'click'});await h.advance(350);eq(S.exam.split.indices,[90,91,92,93,94]);await click(h,'answer',90,'C');await click(h,'material-close');eq(S.exam.split,null);eq(s.index,90);await click(h,'material',90);await h.advance(16);for(let i=91;i<95;i++)await click(h,'answer',i,'ABCD'[i%4]);await click(h,'material-close');eq(s.index,95);await click(h,'card');eq(S.exam.cardOpen,true);eq(S.exam.root.querySelectorAll('.answer-body [data-exam="goto"]').length,135);await click(h,'goto',99);eq(s.index,99);await click(h,'card');eq(S.exam.cardOpen,false);h.dispose();
 });
 await test('manual submission creates one frozen result per question, correct grading and report statistics',async()=>{
  const h=await fixture(),S=h.S,s=await start(h);for(let i=0;i<135;i++){if(i%5===0)continue;await h.advance(30);await click(h,'answer',i,i%2===0?'ABCD'[i%4]:'A');}await S.saveHot();const expected={correct:0,incorrect:0,unanswered:0};for(const q of s.questions){const a=s.answers[q.id];expected[a.selected==null?'unanswered':a.selected===q.answer?'correct':'incorrect']++;}
  await Promise.all([S.finalize(s,'manual'),S.finalize(s,'manual')]);eq(s.finished,true);eq(S.state.attempts.length,135);for(const kind of Object.keys(expected))eq(S.state.attempts.filter(a=>a.result===kind).length,expected[kind]);const summary=S.reportStats(s);eq(summary.total,135);eq(summary.correct,expected.correct);eq(!!s.submissionEvidence,true);eq(S.exam,null);eq(S.route,'report');await S.finalize(s);eq(S.state.attempts.length,135);h.dispose();
 });
 await test('countdown expiry submits once; finished sessions reject further answer changes',async()=>{
  const h=await fixture(6),S=h.S,s=await start(h,{duration:2,mode:'timed-paper'});await click(h,'answer',0,'A');await h.advance(2500);await until(h,()=>s.finished,'timeout submit');eq(s.finishReason,'timeout');eq(s.elapsed,2);eq(S.state.attempts.length,6);const frozen=plain(s.answers);await S.finalize(s,'manual');eq(s.answers,frozen);eq(S.state.attempts.length,6);h.dispose();
 });
 await test('report/review: needs-review filter, original numbering, editable cause persists, original answers freeze',async()=>{
  const h=await fixture(8),S=h.S,s=await start(h);await click(h,'answer',0,'A');await click(h,'answer',1,'A');await click(h,'mark',0);await S.finalize(s);const original=plain([s.answers,S.state.attempts]);await S.openReview(s.id,'needs-review');await until(h,()=>S.review,'review open');eq(S.review.controller.indices.includes(0),true);eq(S.review.controller.indices.includes(1),true);const chip=S.review.root.querySelector('[data-review-action="cause"]');eq(!!chip,true);chip.dispatchEvent({type:'click'});const textarea=h.doc.querySelector('#dialog-host [data-feedback-field="userCause"]');eq(!!textarea,true);textarea.dispatchEvent({type:'compositionstart'});textarea.value='候选输入';textarea.dispatchEvent({type:'input',isComposing:true});eq(JSON.stringify(s.reviewFeedback||{}).includes('候选输入'),false);textarea.value='Synthetic review cause 中文';textarea.dispatchEvent({type:'compositionend'});await S.saveHot();const cause=JSON.stringify(s.reviewFeedback);eq(cause.includes('Synthetic review cause'),true);S.closeReview();await h.flush();await S.openReview(s.id,'needs-review');eq(plain([s.answers,S.state.attempts]),original);eq(JSON.stringify(s.reviewFeedback).includes('Synthetic review cause'),true);h.dispose();
 });
 await test('pen input through the production canvas router saves, submits and reopens editable review ink',async()=>{
  const h=await fixture(5),S=h.S,s=await start(h);await click(h,'pen',0);eq(S.exam.inkOn,true);const view=[...S.exam.layers.values()][0];
  const event=(type,x,y)=>({type,pointerType:'pen',pointerId:7,buttons:type==='pointerup'?0:1,pressure:.7,clientX:x,clientY:y,timeStamp:h.now()});
  view.canvas.dispatchEvent(event('pointerdown',100,100));view.canvas.dispatchEvent(event('pointermove',120,120));view.canvas.dispatchEvent(event('pointermove',150,140));view.canvas.dispatchEvent(event('pointerup',170,150));
  eq(S.activeInkPointer,null);eq(s.notes['q:fixture-q0'].strokes.length>0,true);for(let i=0;i<40;i++){await h.advance(80);if([...view.facades?.values()||[]].every(f=>f.layoutReady))break;}
  const vectors=plain(s.notes['q:fixture-q0'].strokes.map(st=>st.points));await click(h,'pen',0);await S.saveHot();eq(await S.finalize(s),undefined);eq(s.finished,true);await S.openReview(s.id,'all');await until(h,()=>S.review,'ink review open');const c=S.review.controller,n=S.reviewNoteFor(c,'q:fixture-q0');eq(n.strokes.map(st=>st.points),vectors);eq(S.evidenceNotes(s)['q:fixture-q0'].strokes.map(st=>st.points),vectors);h.dispose();
 });
 await test('learning backup round trip retains answers, attempts, favorites, review feedback and ink',async()=>{
  const h=await fixture(4),S=h.S,s=await start(h);await click(h,'answer',0,'A');await click(h,'mark',0);s.notes['q:fixture-q0']={strokes:[{id:'fixture-ink',points:[{x:.123,y:.456}],brush:'pen'}],redo:[]};await S.finalize(s);let exported;S.download=(name,blob)=>exported={name,blob};await S.exportLearningBackup();const raw=JSON.parse(await exported.blob.text());eq(raw.backupType,'learning');eq(raw.sessions[0].answers,s.answers);eq(raw.sessions[0].notes['q:fixture-q0'].strokes[0].points,[{x:.123,y:.456}]);const fresh=await fixture(4);await fresh.S.restoreLearningBackupObject(raw);eq(fresh.S.state.sessions[0].answers,s.answers);eq(fresh.S.state.attempts,S.state.attempts);eq(fresh.S.state.learning.favorites,S.state.learning.favorites);h.dispose();fresh.dispose();
 });
 console.log(JSON.stringify({passed:true,checks,cases:results,scope:'All production scripts loaded in index order, actual controller events, main persistence, answer journal, grading, review and backup paths; synthetic DOM/IDB adapters. No real browser layout, iPad or live cloud acceptance.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
