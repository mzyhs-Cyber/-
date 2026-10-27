/* Keep navigation indices stable; legacy material ink aliases are read-only. */
(function(S){
 'use strict';
 const rank=name=>{const i=S.SUBJECTS.indexOf(name);return i<0?S.SUBJECTS.length:i;};
 S.answerGroups=function(questions){
  const groups=new Map();
  questions.forEach((q,i)=>{const name=S.answerSubject(q);if(!groups.has(name))groups.set(name,{name,rows:[]});groups.get(name).rows.push({q,i});});
  return [...groups.values()].sort((a,b)=>rank(a.name)-rank(b.name));
 };
 S.orderDailyQuestions=function(questions){
  const units=new Map();
  questions.forEach((q,i)=>{const name=S.answerSubject(q),material=S.materialIdentity(q),key=JSON.stringify([name,material||'single:'+i]);if(!units.has(key))units.set(key,{name,first:i,rows:[]});units.get(key).rows.push(q);});
  return [...units.values()].sort((a,b)=>rank(a.name)-rank(b.name)||a.first-b.first).flatMap(u=>u.rows);
 };
 const start=S.startSession;
 S.startSession=function(questions,config={}){return start.call(this,config.mode==='daily'?S.orderDailyQuestions(questions):questions,config);};

 const evidence=S.evidenceNotes;
 S.evidenceNotes=function(s){
  const original=evidence(s),aliases=new Map();let out=original;
  for(const q of s.questions||[]){if(!q.materialKey)continue;const old='m:'+q.materialKey,key=S.materialNoteKey(q);if(!aliases.has(old))aliases.set(old,new Set());aliases.get(old).add(key);}
  // Never guess when an unqualified legacy key belongs to multiple papers.
  for(const [old,keys]of aliases){if(keys.size!==1||!original[old])continue;const key=[...keys][0];if(original[key])continue;if(out===original)out={...original};out[key]=original[old];}
  return out;
 };

 // Explicit export only: no coordinates, text, IDs or network reads.
 S.auditSessionInk=function(s){
  const count=n=>S.NoteVault?.isRef(n)?Number(n.count)||0:(n?.strokes||[]).filter(st=>st.brush!=='erase').length;
  const inspect=ns=>{const values=Object.values(ns||{});return {surfaces:values.length,strokes:values.reduce((sum,n)=>sum+count(n),0),references:values.filter(n=>S.NoteVault?.isRef(n)).length,pendingLayouts:values.reduce((sum,n)=>sum+(n?.strokes||[]).filter(st=>st.coordinateSpace==='pane-question-v1'&&!st.layoutId).length,0),clears:values.reduce((sum,n)=>sum+(Number(n?.clearCount)||0),0)};};
  const original=S.evidenceNotes(s),rows=(s.questions||[]).map((q,i)=>({number:i+1,local:count(s.notes?.['q:'+q.id]),evidence:count(original['q:'+q.id])}));
  let legacyMaterialAliases=0;for(const q of s.questions||[])if(q.materialKey&&!evidence(s)[S.materialNoteKey(q)]&&original[S.materialNoteKey(q)])legacyMaterialAliases++;
  return {questionCount:s.questions?.length||0,finished:!!s.finished,local:inspect(s.notes),submission:s.submissionEvidence?inspect(s.submissionEvidence.notes):null,legacyMaterialAliases,questions:rows};
 };
 const diagnostic=window.__ZhiyaojiPerfDiagnostics,report=diagnostic?.report;
 if(report)diagnostic.report=function(...args){return {...report.apply(this,args),inkAudit:{version:1,notesUploaded:false,reviewOverlayTransient:true,recent:(S.state.sessions||[]).slice().sort((a,b)=>(b.startedAt||0)-(a.startedAt||0)).slice(0,5).map(S.auditSessionInk)}};};
 S.BUILD='20261027-r8-8-27';
})(window.Study);
