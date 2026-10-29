'use strict';
// Real app functions and notebook/depot code in isolated DOM/storage adapters.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),baseline=process.argv.includes('--baseline');
const code=fs.readFileSync(path.join(root,baseline?'verification/r51-source/bundle.js':'app/bundle.js'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const results=[];let checks=0;
function check(a,b){assert.deepEqual(plain(a),plain(b));checks++;}
function section(begin,end,src=code){const a=src.indexOf(begin);assert(a>=0,begin);const b=src.indexOf(end,a+begin.length);assert(b>a,end);return src.slice(a,b);}
function iife(marker){const a=code.indexOf(marker),b=code.indexOf('})(window.Study);',a);assert(a>=0&&b>a,marker);return code.slice(a,b+18);}
function storage(){
 const objects=new Map();let created=false,failNext=false;
 const db={createObjectStore(){created=true;},close(){},transaction(){
  const tx={error:null,objectStore(){return {get(key){return request(()=>objects.has(key)?structuredClone(objects.get(key)):undefined);},put(value,key){return request(()=>{if(failNext){failNext=false;throw new DOMException('simulated write failure','QuotaExceededError');}objects.set(key,structuredClone(value));return key;});}}}};
  function request(fn){const r={};queueMicrotask(()=>{try{r.result=fn();r.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());}catch(e){r.error=tx.error=e;r.onerror?.();tx.onerror?.();}});return r;}
  return tx;
 }};
 return {objects,failNextPut(){failNext=true;},open(){const r={};queueMicrotask(()=>{r.result=db;if(!created)r.onupgradeneeded?.();r.onsuccess?.();});return r;}};
}
function fixture(disk=storage()){
 const frames=[],events={},shell={hidden:false,inert:false},body={style:{overflow:''},append(n){n.isConnected=true;}};
 const S={state:{meta:{syncOwnerId:'owner'},sessions:[]},SUBJECTS:['言语理解','资料分析'],escape:String,icon:()=>'<svg/>',iconButton:()=>'',toast:()=>{},closeModal(){},touchSession(s){s.updatedAt=(s.updatedAt||0)+1;},saveSoon(){S.saveRequests=(S.saveRequests||0)+1;},saveHot(){S.flushes=(S.flushes||0)+1;return S.NoteVault.packSession(S.state.sessions[0]).then(s=>{S.persisted=structuredClone(s);});},sessionAnswer:(s,q)=>s.answers[q.id],getAttempt:()=>null,isFavorite:q=>!!q.favorite,timeBadge:(s,q)=>q.slow?'slow':'',answerSubject:q=>q.subject,evidenceNotes:s=>s.submissionEvidence?.notes||s.notes||{},ensureEvidence(){},startSession(){},materialIdentity:q=>q.materialKey||'',materialNoteKey:q=>'m:'+q.materialKey};
 S.$=(selector,scope)=>selector==='#app-shell'?shell:scope?.nodes?.[selector]||null;S.$$=(selector,scope)=>scope?.cards||[];
 class Base{
  constructor(s,r){this.s=s;this.root=r;this.layers=new Map();this.abort=new AbortController();}
  jump(i){this.s.index=i;return i;}openMaterial(i){this.s.index=i;}dispose(){this.disposed=true;this.abort.abort();}
  onClick(e){if(e.target.dataset.exam==='goto')this.jump(Number(e.target.dataset.index));}
  pulse(){}updateClock(){}updateInk(){}updateControls(){}capturePosition(){}
 }
 S.ExamController=Base;
 const window={Study:S,addEventListener(type,fn){(events[type]||=[]).push(fn);}};
 const document={body,hidden:false,createElement(){return {className:'',nodes:{},contains:b=>b?.inside!==false,remove(){this.isConnected=false;}};},addEventListener:window.addEventListener};
 const context=vm.createContext({S,window,document,console,structuredClone,AbortController,setTimeout,clearTimeout,queueMicrotask,performance,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},indexedDB:disk});
 function run(c){return vm.runInContext(c,context);}
 S.SyncCodec={stable:JSON.stringify,hash:async s=>crypto.createHash('sha256').update(s).digest('hex'),splitText:s=>[s]};
 run(iife('/* Content addressed note depot.'));
 run(section('S.noteFor=function','\n\nS.validateState'));
 run('(function(){'+section('class Notebook{','class Router{')+'window.InkCore={Notebook};})();');
 run('(function(){const {Notebook}=window.InkCore;'+section('class BoundNotebook extends','function drawCompatible(')+'window.BoundNotebook=BoundNotebook;})();');
 let review=iife(baseline?'/* Review reuses the practice workspace;':'/* Review edits a lazy per-surface copy;');
 review=review.replace('S.closeReview=function(){','S.ReviewExamForTest=ReviewExam;\nS.closeReview=function(){');run(review);
 run(section('S.reportCard=function','\n})(window.Study);'));
 run(fs.readFileSync(path.join(root,'app/training-order-ink.js'),'utf8'));
 // Use the existing report inclusion predicate, including correct favorites/slow questions.
 run('(function(){const M={status:r=>r.selected===r.answer?"correct":"wrong"};'+section('S.reportNeedsReview=row=>','\nS.reportSections=')+'\n})();');
 S.reportRows=s=>s.questions.map((q,index)=>({index,selected:s.answers[q.id].selected,answer:q.answer,marked:!!q.favorite,timeBadge:q.slow?'slow':''}));
 const scrollMethod=section(' onScroll(target){','\n visibleLayer(').trim().replace(/^onScroll\(target\)/,'function(target)');
 Base.prototype.onScroll=run('('+scrollMethod+')');
 function source(n=135){const s={id:'fixture',finished:true,title:'synthetic',elapsed:100,positions:{},notes:{},reviewNotes:{},answers:{},questions:Array.from({length:n},(_,i)=>({id:'q'+i,subject:i<100?'言语理解':'资料分析',answer:'A',materialKey:null}))};for(const q of s.questions)s.answers[q.id]={selected:'A',excluded:[],seconds:1};S.state.sessions=[s];return s;}
 function controller(s){return new S.ReviewExamForTest({...s,_review:true,_sourceSession:s,notes:{},positions:{}},{contains:()=>true,nodes:{}});}
 function click(c,action){const b={dataset:{exam:action},closest(){return this;}};c.onClick({target:b});}
 return {S,Base,run,source,controller,click,frames,events,disk,context};
}
async function test(name,fn){await fn();results.push(name);}
async function main(){
 if(baseline){const f=fixture(),s=f.source(),c=f.controller(s);c.indices=[0,5,92,96];c.s.index=93;f.click(c,'review-next');check(c.s.index,0);const full=f.S.reportCard(s,'exam-goto',92);check((full.match(/data-exam-goto=/g)||[]).length,135);c.persistInk();check(f.S.saveRequests||0,0);console.log(JSON.stringify({baseline:true,reproduced:['outside-filter next jumps to first','drawer renders all 135','review ink never saved']}));return;}
 await test('same needs-review set, original numbers, correct favorite and slow included; all/wrong entries retained',()=>{
  const f=fixture(),s=f.source();s.answers.q5.selected='B';s.questions[92].favorite=true;s.questions[96].slow=true;s.questions[96].subject='资料分析';
  f.S.openReview(s.id,'needs-review',92);const c=f.S.review.controller;check(c.indices,[5,92,96]);check(c.s.index,92);
  const html=f.S.reportCard(s,'exam-goto',92,c.indices);check([...html.matchAll(/data-exam-goto="(\d+)"/g)].map(x=>+x[1]),[5,92,96]);assert(html.includes('>93<span'));assert(html.includes('资料分析'));checks+=2;
  check((f.S.reportCard(s,'x').match(/data-x=/g)||[]).length,135);
  f.S.openReview(s.id,'wrong');check(f.S.review.controller.indices,[5]);
  f.S.openReview(s.id,'all',92);check(f.S.review.controller.indices.length,135);check(f.S.review.controller.s.index,92);
 });
 await test('real scroll outside filter, next/prev, rapid taps, boundaries and pending scroll do not wrap to first',()=>{
  const f=fixture(),s=f.source(),c=f.controller(s);c.indices=[0,5,92,96];c.s.index=92;
  const target={id:'question-scroll',scrollTop:100,getBoundingClientRect:()=>({top:0,bottom:700}),cards:[{dataset:{question:'93'},getBoundingClientRect:()=>({top:70,bottom:500})}]};
  c.onScroll(target);check(c.s.index,93);f.click(c,'review-next');check(c.s.index,96);f.click(c,'review-next');check(c.s.index,96);f.click(c,'review-prev');check(c.s.index,92);f.click(c,'review-prev');check(c.s.index,5);
  c.s.index=92;c.pendingScrollTarget=target;f.click(c,'review-next');check(c.s.index,96);
  c.s.index=0;f.click(c,'review-prev');check(c.s.index,0);c.s.index=134;f.click(c,'review-next');check(c.s.index,134);
 });
 await test('lazy per-question copies, native erase/undo/redo/clear model, saved empty stays empty, evidence remains exact',async()=>{
  const f=fixture(),s=f.source(),stroke={id:'original',brush:'pen',color:'#f8563d',width:1.7,points:[{x:.1,y:.2},{x:.3,y:.4}],layoutId:'layout'};
  s.notes['q:q0']={version:2,strokes:[structuredClone(stroke)],redo:[],layouts:{layout:{id:'layout',width:500,height:700,text:[]}}};s.submissionEvidence={notes:structuredClone(s.notes),events:[{type:'submission'}]};const original=hash([s.notes,s.submissionEvidence,s.answers]);
  const c=f.controller(s),book=new f.context.window.BoundNotebook(c);check(Object.keys(c.s.notes),[]);check(book.rows('q:q0'),[stroke]);check(Object.keys(c.s.notes),['q:q0']);assert.notEqual(book.rows('q:q0')[0],s.submissionEvidence.notes['q:q0'].strokes[0]);checks++;
  book.append('q:q0',{id:'erase',brush:'erase',points:[{x:.2,y:.2}]});c.persistInk();book.undo('q:q0');check(book.rows('q:q0').length,1);book.redo('q:q0');check(book.rows('q:q0').length,2);book.clear('q:q0');c.persistInk();check(book.rows('q:q0'),[]);check(hash([s.notes,s.submissionEvidence,s.answers]),original);
  const flushed=c.flushReviewInk();await new Promise(r=>setTimeout(r,30));assert(f.S.persisted);checks++;
  const next=fixture(f.disk),reopened=structuredClone(f.S.persisted);next.S.state.sessions=[reopened];await next.S.NoteVault.hydrateSession(reopened);const nc=next.controller(reopened);check(next.S.reviewNoteFor(nc,'q:q0').strokes,[]);check(reopened.reviewNotes['q:q0'].reviewReplacement,1);check(hash([reopened.notes,reopened.submissionEvidence,reopened.answers]),original);
  const n=next.S.reviewNoteFor(nc,'q:q0');n.strokes.push({id:'new',brush:'pen',points:[{x:.9,y:.8}]});nc.persistInk();nc.flushReviewInk();await new Promise(r=>setTimeout(r,30));assert(next.S.persisted);checks++;
  check(c.originalNotes,null);
 });
 await test('old additive review annotations preserved once; aliases and shared depot hashes never share mutable evidence',async()=>{
  const f=fixture(),s=f.source();s.notes={'m:group':{strokes:[{id:'base',points:[{x:.1,y:.2}]}],redo:[]}};s.questions[0].materialKey='group';s.reviewNotes['m:group']={strokes:[{id:'old-review',points:[{x:.3,y:.4}]}],redo:[]};
  const c=f.controller(s);check(f.S.reviewNoteFor(c,'m:group').strokes.map(x=>x.id),['base','old-review']);c.persistInk();check(f.S.reviewNoteFor(f.controller(s),'m:group').strokes.map(x=>x.id),['base','old-review']);
  f.S.materialNoteKey=()=> 'm:modern-group';const fresh=f.controller(s);check(f.S.reviewNoteFor(fresh,'m:modern-group').strokes.map(x=>x.id),['base','old-review']);
  const V=f.S.NoteVault,ref=await V.packNote({strokes:[{id:'shared',points:[{x:.2,y:.3}]}],redo:[]});const same={notes:{a:ref},reviewNotes:{a:ref},submissionEvidence:{notes:{a:ref}}};await V.hydrateSession(same);same.reviewNotes.a.strokes[0].points[0].x=.99;check(same.notes.a.strokes[0].points[0].x,.2);check(same.submissionEvidence.notes.a.strokes[0].points[0].x,.2);
 });
 await test('500-question lazy load and repeated changes keep original vectors and other surfaces intact',async()=>{
  const f=fixture(),s=f.source(500);const pts=Array.from({length:48},(_,i)=>({x:i/48,y:i/96}));s.notes['q:q492']={strokes:Array.from({length:250},(_,i)=>({id:'p'+i,brush:'pen',points:structuredClone(pts)})),redo:[]};const original=hash(s.notes),c=f.controller(s),book=new f.context.window.BoundNotebook(c);book.rows('q:q492');
  for(let i=0;i<240;i++){book.append('q:q492',{id:'added'+i,brush:i%2?'pen':'erase',points:[{x:.4,y:.5}]});c.persistInk();}check(Object.keys(s.reviewNotes),['q:q492']);check(hash(s.notes),original);check(s.reviewNotes['q:q492'].strokes.length,490);
  c.flushReviewInk();await new Promise(r=>setTimeout(r,60));assert(f.S.persisted);checks++;const p=structuredClone(f.S.persisted);await f.S.NoteVault.hydrateSession(p);check(p.reviewNotes['q:q492'].strokes.length,490);check(hash(p.notes),original);
 });
 await test('material initial frame respects a newer navigation target',()=>{
  const f=fixture(),s=f.source(4);for(const q of s.questions)q.materialKey='group';const c=f.controller(s);c.indices=[0,1,2,3];c.s.index=0;
  c.readingControls={restore(){}};c.clearLayers=()=>{};c.decorateOptions=()=>{};c.bindMaterialSwipe=()=>{};c.materialGroups=()=>[{key:'group'}];c.root.nodes={'#question-scroll':{style:{}}};c.root.append=n=>{n.isConnected=true;};f.S.questionMarkup=()=>'';f.S.safeHTML=String;
  const method=section(' openMaterial(i){\n  clearTimeout(this.advanceTimer);','\n closeMaterial(scrollToCurrent=true){').trim().replace(/^openMaterial\(i\)/,'function(i)');
  const open=f.run('(function(){const E=S.escape;return ('+method+');})();');open.call(c,0);f.click(c,'review-next');check(c.s.index,1);while(f.frames.length)f.frames.shift()();check(c.s.index,1);
 });
 await test('slow reference hydration cannot reopen over a newer fast review, exit, or different owner',async()=>{
  const f=fixture(),a=f.source(3),b={...f.source(3),id:'second',notes:{}};a.id='first';f.S.state.sessions=[a,b];const ref=await f.S.NoteVault.packNote({strokes:[],redo:[]});a.notes={ink:ref};
  const calls=[];f.S.openReview=id=>calls.push(id);f.S.openExam=()=>{};f.S.closeReview=()=>{};f.S.go=()=>{};f.S.buildReviewPackages=()=>{};
  let resolve;f.S.NoteVault.ready=()=>new Promise(r=>resolve=r);
  f.run(section('/* Integrate the depot at existing entry/exit boundaries,','// Streaming JSON construction')+'\n})(window.Study);');
  const first=f.S.openReview('first');f.S.openReview('second');resolve();await first;check(calls,['second']);
  a.notes={ink:ref};const second=f.S.openReview('first');f.S.closeReview();resolve();await second;check(calls,['second']);
  a.notes={ink:ref};const third=f.S.openReview('first');f.S.state.meta.syncOwnerId='other';resolve();await third;check(calls,['second']);
 });
 await test('review renderer composes original and eraser in the same editable surface without a fixed ink overlay',()=>{
  const f=fixture(),s=f.source(1),c=f.controller(s),book=new f.context.window.BoundNotebook(c);
  s.notes['q:q0']={strokes:[{id:'base',brush:'pen',coordinateSpace:'pane-question-v1',color:'#f8563d',width:1.7,points:[{x:.1,y:.2},{x:.3,y:.4}]}],redo:[]};
  book.append('q:q0',{id:'erase',brush:'erase',coordinateSpace:'pane-question-v1',points:[{x:.1,y:.2},{x:.3,y:.4}]});
  const ops=[];function canvas(name){const ctx=new Proxy({set globalCompositeOperation(v){ops.push([name,v]);}},{get(t,k){return k in t?t[k]:(...a)=>{if(k==='drawImage')ops.push([name,'draw',a[0]?.name]);};}});return {name,width:500,height:700,getContext:()=>ctx};}
  const geo={pane:{width:500,height:700,top:0,bottom:700},regions:[{key:'q:q0',anchor:{height:700,top:0},top:0,bottom:700}]};
  const view={alive:true,visible:true,pointer:null,dirty:true,exam:c,store:book,geometry:()=>geo,size:{width:500,height:700},router:{current:null},canvas:canvas('display'),base:canvas('base'),original:canvas('original'),live:canvas('live'),clearCanvas:can=>can.getContext('2d')};
  const method=section(' paint(){\n  if(!this.alive)return;this.frame=0;if(!this.visible)', '\n down(e){').trim().replace(/^paint\(\)/,'function()');
  const helpers=section('function drawCompatible(', 'function offscreen(');
  const paint=f.run('(function(){'+helpers+'\nreturn ('+method+');})();');paint.call(view);assert(ops.some(x=>x[0]==='base'&&x[1]==='source-over'));assert(ops.some(x=>x[0]==='base'&&x[1]==='destination-out'));assert(!ops.some(x=>x[0]==='original'&&['source-over','destination-out'].includes(x[1])));checks+=3;
 });
 await test('failed depot save retains last durable version and retry saves the new edit',async()=>{
  const f=fixture(),s=f.source(1),c=f.controller(s),book=new f.context.window.BoundNotebook(c);book.append('q:q0',{id:'first',brush:'pen',points:[{x:.1,y:.1}]});c.persistInk();c.flushReviewInk();await new Promise(r=>setTimeout(r,30));const durable=hash(f.S.persisted);
  book.append('q:q0',{id:'second',brush:'pen',points:[{x:.2,y:.2}]});c.persistInk();f.disk.failNextPut();c.flushReviewInk();await new Promise(r=>setTimeout(r,30));check(c.reviewInkDirty,true);check(hash(f.S.persisted),durable);c.flushReviewInk();await new Promise(r=>setTimeout(r,30));check(c.reviewInkDirty,false);const loaded=structuredClone(f.S.persisted);await f.S.NoteVault.hydrateSession(loaded);check(loaded.reviewNotes['q:q0'].strokes.map(x=>x.id),['first','second']);
 });
 await test('real lossless sync graph preserves edited review replacements and immutable evidence through encode/decode',async()=>{
  const f=fixture(),s=f.source(1);s.notes['q:q0']={strokes:[{id:'old',points:[{x:.1,y:.1}]}],redo:[]};s.submissionEvidence={notes:structuredClone(s.notes),events:[]};const c=f.controller(s),book=new f.context.window.BoundNotebook(c);book.clear('q:q0');c.persistInk();
  const codec=section('/* Lossless transport graph.', "\n(function(S){\n'use strict';const K=S.SyncCodec;");
  f.context.crypto=crypto.webcrypto;f.context.TextEncoder=TextEncoder;f.context.Uint8Array=Uint8Array;f.run(codec);
  const snap={schema:3,sessions:[s],attempts:[],learning:{favorites:{}},aiReviews:[],conflicts:[]};const K=f.S.SyncCodec,graph=await K.encode(snap),decoded=await K.decode(graph.root,async h=>graph.objects.get(h));check(decoded.sessions[0].reviewNotes['q:q0'].reviewReplacement,1);check(decoded.sessions[0].reviewNotes['q:q0'].strokes,[]);check(decoded.sessions[0].submissionEvidence,s.submissionEvidence);
 });
 console.log(JSON.stringify({passed:true,checks,cases:results,limits:'Function/model/depot adapters, no browser layout, real iPad, or live server integration.'},null,2));
 fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/R8_8_52_REVIEW.json'),JSON.stringify({passed:true,checks,cases:results},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
