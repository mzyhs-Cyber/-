const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{webcrypto}=require('node:crypto');
const base=process.env.ZHIYAOJI_TEST_APP||(fs.existsSync(path.join(__dirname,'r8_8_27'))?path.join(__dirname,'r8_8_27'):path.join(__dirname,'../app'));
const src=fs.readFileSync(path.join(base,'bundle.js'),'utf8'),patch=fs.readFileSync(path.join(base,'training-order-ink.js'),'utf8'),copy=x=>JSON.parse(JSON.stringify(x));
const S={SUBJECTS:['政治理论','常识判断','言语理解','数量关系','判断推理','资料分析'],state:{sessions:[]},getAttempt:()=>null,isFavorite:()=>false,icon:()=>'',hash:x=>x,uid:()=>webcrypto.randomUUID(),saveSoon(){},touchSession(){},recordInkEvent(){},anchorInkStroke:st=>st};
const window={Study:S,__ZhiyaojiPerfDiagnostics:{report:()=>({existing:true})}},c=vm.createContext({S,window,console,Date,TextEncoder,setTimeout,clearTimeout,crypto:webcrypto,structuredClone});
function definition(name){const a=src.indexOf(name);assert.ok(a>=0,name);return src.slice(a,src.indexOf('\n};',a)+4);}
vm.runInContext('(function(S){'+src.split('\n').filter(x=>x.startsWith('S.answerSubject=')||x.startsWith('S.materialIdentity=')||x.startsWith('S.materialNoteKey=')||x.startsWith('S.evidenceNotes=')).join('\n')+definition('S.answerGroups=function')+definition('S.reportCard=function')+definition('S.noteFor=function')+'})(S)',c);
const subjects=['资料分析','资料分析','资料分析','判断推理','判断推理','资料分析','资料分析','言语理解','言语理解','言语理解','判断推理','判断推理','判断推理','言语理解','判断推理','数量关系','数量关系','判断推理'];
const qs=subjects.map((subject,i)=>({id:'q'+i,subject,paperId:'fixture',paperOrder:i+1,...(i===0||i===5?{materialKey:'shared'}:{})})),s={id:'local',questions:qs,answers:Object.fromEntries(qs.map(q=>[q.id,{selected:'A'}])),notes:{}};
assert.equal(S.answerGroups(qs).filter(g=>g.name==='资料分析').length,2);const originalOrder=qs.map(q=>q.id);
let started;S.startSession=(questions,config)=>{started={questions,config};return started;};
// Original review paint fails to find an unqualified legacy material key.
const material=qs[0],legacy='m:'+material.materialKey,key=S.materialNoteKey(material),stroke={id:'original-stroke',brush:'pen',coordinateSpace:'pane-question-v1',points:[{x:.1,y:.2,p:.5}],draftOwnerQuestionId:'q0'};
s.notes[legacy]={strokes:[copy(stroke)],redo:[],clearCount:0};s.submissionEvidence={origin:'submission',notes:{[legacy]:copy(s.notes[legacy])}};
let draws=0;const ctx={setTransform(){},drawImage(){}};
c.draw=()=>{draws++;};
const d=src.indexOf('function drawCompatible('),de=src.indexOf('\nfunction smooth(',d);vm.runInContext(src.slice(d,de),c);
const ws=src.indexOf('class WorkspaceView{'),p=src.indexOf(' paint(){',ws),pe=src.indexOf('\n down(e){',p);vm.runInContext('class PaintView{'+src.slice(p,pe)+'};globalThis.PaintView=PaintView;',c);
const view=new c.PaintView();Object.assign(view,{alive:true,visible:true,pointer:null,dirty:true,router:{current:null},size:{width:500,height:500},canvas:{width:500,height:500},base:{getContext:()=>ctx},original:{getContext:()=>ctx},live:{width:1,height:1},clearCanvas:()=>ctx,geometry:()=>({pane:{left:0,top:0,width:500,height:500,bottom:500},regions:[{key,top:0,bottom:500,anchor:{height:500}}]}),store:{rows:()=>[],note:()=>({})},exam:{s:{_review:true},get originalNotes(){return S.evidenceNotes(s);}}});
view.paint();assert.equal(draws,0);const frozen=JSON.stringify(s);
vm.runInContext(patch,c);view.dirty=true;view.paint();assert.equal(draws,1);assert.equal(JSON.stringify(s),frozen);
const groups=S.answerGroups(qs);assert.deepEqual(Array.from(groups,g=>g.name),['言语理解','数量关系','判断推理','资料分析']);assert.deepEqual(Array.from(groups.at(-1).rows,x=>x.i),[0,1,2,5,6]);assert.deepEqual(qs.map(q=>q.id),originalOrder);
const card=S.reportCard(s,'exam-goto');const ids=[...card.matchAll(/data-exam-goto="(\d+)"/g)].map(x=>Number(x[1]));assert.deepEqual(ids,Array.from(groups.flatMap(g=>g.rows),r=>r.i));assert.equal(new Set(ids).size,18);for(const i of ids)assert.equal(qs[i].id,originalOrder[i]);
// Run the actual ReleaseExam answer-card method, including update scroll preservation.
const refresh=src.slice(src.indexOf(' refreshAnswerCard(){',ws),src.indexOf('\n readingSettings(){',ws));vm.runInContext('(function(S){class Card{'+refresh+'}S.Card=Card;})(S)',c);
const body={scrollTop:63,innerHTML:''};S.$=()=>body;c.E=x=>x;const exam=new S.Card();exam.s={...s,index:6};exam.root={};exam.refreshAnswerCard();assert.equal(body.scrollTop,63);const practiceIndices=[...body.innerHTML.matchAll(/data-index="(\d+)"/g)].map(x=>Number(x[1]));assert.deepEqual(practiceIndices,ids);exam.cardSignature=null;exam.s._review=true;exam.sourceSession=s;exam.refreshAnswerCard();assert.deepEqual([...body.innerHTML.matchAll(/data-index="(\d+)"/g)].map(x=>Number(x[1])),ids);
S.startSession(qs,{mode:'daily'});assert.deepEqual(Array.from(started.questions,q=>q.subject),subjects.slice().sort((a,b)=>S.SUBJECTS.indexOf(a)-S.SUBJECTS.indexOf(b)));assert.equal(started.questions.filter(q=>q.materialKey).length,2);const mi=started.questions.findIndex(q=>q.materialKey);assert.equal(started.questions[mi+1].materialKey,'shared');assert.deepEqual(qs.map(q=>q.id),originalOrder);
S.startSession(qs,{mode:'timed-paper'});assert.equal(started.questions,qs);S.startSession(qs,{mode:'practice'});assert.equal(started.questions,qs);
// Unambiguous legacy aliases work; qualified keys and frozen evidence always win.
assert.equal(S.evidenceNotes(s)[key],s.submissionEvidence.notes[legacy]);s.submissionEvidence.notes[key]={strokes:[]};assert.equal(S.evidenceNotes(s)[key].strokes.length,0);delete s.submissionEvidence.notes[key];
const ambiguous={...s,questions:[material,{...material,id:'other',paperId:'second-paper'}]};assert.equal(S.evidenceNotes(ambiguous)[key],undefined);
// Real NoteVault round trip with a minimal, transactional IndexedDB adapter.
const objects=new Map();c.indexedDB={open(){const request={};setTimeout(()=>{const db={objectStoreNames:{contains:()=>true},transaction(){const tx={objectStore:()=>({get(k){const r={};setTimeout(()=>{r.result=objects.has(k)?structuredClone(objects.get(k)):undefined;r.onsuccess?.();},0);return r;},put(v,k){const r={};setTimeout(()=>{objects.set(k,structuredClone(v));r.result=k;r.onsuccess?.();tx.oncomplete?.();},0);return r;}})};return tx;}};request.result=db;request.onsuccess?.();},0);return request;}};
const codec=src.indexOf('/* Lossless transport graph.'),cs=src.indexOf('(function(root,factory)',codec),ce=src.indexOf('\n});',cs);vm.runInContext(src.slice(cs,ce+4),c);
const vault=src.indexOf('/* Content addressed note depot.'),vs=src.indexOf('(function(S)',vault),ve=src.indexOf('\n})(window.Study);',vs);vm.runInContext(src.slice(vs,ve+'\n})(window.Study);'.length),c);
async function main(){
 const before=JSON.stringify(s),packed=await S.NoteVault.packSession(s);assert.ok(S.NoteVault.isRef(packed.notes[legacy]));assert.equal(JSON.stringify(s),before);assert.equal(packed.notes[legacy].count,1);
 const reopened=copy(packed);await S.NoteVault.hydrateSession(reopened);assert.deepEqual(copy(reopened.notes),s.notes);assert.deepEqual(copy(reopened.submissionEvidence),s.submissionEvidence);assert.notEqual(reopened.notes[legacy],reopened.submissionEvidence.notes[legacy]);assert.equal(S.evidenceNotes(reopened)[key].strokes[0].id,stroke.id);
 reopened.notes[legacy].strokes.push({...copy(stroke),id:'second-stroke'});assert.equal(reopened.submissionEvidence.notes[legacy].strokes.length,1);
 const repacked=await S.NoteVault.packSession(reopened);assert.equal(repacked.notes[legacy].count,2);assert.equal(repacked.submissionEvidence.notes[legacy].count,1);
 S.state.sessions=[s];const report=window.__ZhiyaojiPerfDiagnostics.report();assert.equal(report.existing,true);assert.equal(report.inkAudit.recent[0].local.strokes,1);assert.equal(report.inkAudit.recent[0].legacyMaterialAliases,2);assert.doesNotMatch(JSON.stringify(report),/original-stroke|draftOwnerQuestionId|points|shared|local"\s*:\s*"/);
 assert.equal(JSON.stringify(s),before);assert.equal(S.BUILD,'20261027-r8-8-27');
 console.log('PASS: actual Day3 subject pattern reproduces duplicate headings; practice/review cards unify groups with stable question indices and scroll; new daily sorting keeps material units, other modes/history untouched; actual review paint reproduces legacy material ink invisibility and recovers it read-only; ambiguity/frozen precedence; real NoteVault pack/reopen/repack preserves vectors and submission isolation; local diagnostic counters contain no ink content');
}
main().catch(e=>{console.error(e);process.exitCode=1});
