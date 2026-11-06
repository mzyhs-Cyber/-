/* R8.8.11: preserve local imports and navigation across renders and upgrades. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else Object.assign(root.Study=root.Study||{},api);
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const legacyReason='replaced-legacy-library';
 const mockTitle=/模拟|模考|预测|冲刺|押题|全真|万人|专项模|mock|simulation/i;
 function paperSource(p={}){
  const kinds=[p.sourceKind,p.paperSource,p.sourceType,p.metadata?.sourceKind,p.metadata?.paperSource];
  for(const kind of kinds){
   const value=String(kind||'').toLowerCase();
   if(['mock','simulation','模拟','模拟卷','模考'].includes(value))return 'mock';
   if(['real','past-paper','past_paper','真题'].includes(value))return 'real';
  }
  const text=[p.title,p.name,p.paperType,p.examType,p.category,p.metadata?.paperType,p.metadata?.examType,p.metadata?.category].filter(Boolean).join(' ');
  if(mockTitle.test(text))return 'mock';
  return /真题|回忆|公务员.*考试|联考|real[-_ ]?paper|past[-_ ]?paper/i.test(text)?'real':'other';
 }
 function isLocalPaper(p){return !!p&&(p.localImported===true||p.importSource==='local');}
 function recoverLocalImports(state){
  const meta=state.meta||(state.meta={}),papers=state.papers||[],bank=state.bank||[];
  const localPapers=new Set(),localQuestions=new Set(),legacyPapers=new Set();
  for(const batch of meta.importRecords||[]){
   if(batch.source!=='local'||!batch.committedAt)continue;
   for(const row of batch.records||[]){
    if(row.outcome==='failed')continue;
    if(row.paperId)localPapers.add(String(row.paperId));
    if(row.questionId)localQuestions.add(String(row.questionId));
   }
  }
  for(const q of bank){
   if(q.localImported||q.importSource==='local'||localQuestions.has(q.id))localPapers.add(q.paperId);
   if(q.retiredReason===legacyReason)legacyPapers.add(q.paperId);
  }
  const paperMap=new Map(papers.map(p=>[p.id,p]));
  for(const p of papers)if(isLocalPaper(p)||(legacyPapers.has(p.id)&&paperSource(p)==='mock'))localPapers.add(p.id);
  let coldChanged=false;const recoveredQuestions=[],recoveredPapers=[];
  for(const q of bank){
   if(!localPapers.has(q.paperId)&&!localQuestions.has(q.id))continue;
   if(!q.localImported||q.importSource!=='local'){q.localImported=true;q.importSource='local';coldChanged=true;}
   // Only undo the obsolete automatic cleanup. Explicit/other archives stay intact.
   if(q.archived&&q.retiredReason===legacyReason){
    q.archived=false;delete q.retiredReason;recoveredQuestions.push(q.id);coldChanged=true;
   }
  }
  for(const id of localPapers){
   const p=paperMap.get(id);if(!p)continue;
   if(!p.localImported||p.importSource!=='local'){p.localImported=true;p.importSource='local';coldChanged=true;}
   if(p.archived&&legacyPapers.has(id)&&(!p.retiredReason||p.retiredReason===legacyReason)){
    p.archived=false;delete p.retiredReason;recoveredPapers.push(id);coldChanged=true;
   }
   if(paperSource(p)==='mock'&&p.sourceKind!=='mock'){p.sourceKind='mock';coldChanged=true;}
  }
  let metaChanged=false;
  if(Array.isArray(meta.legacyRetirementPending)){delete meta.legacyRetirementPending;metaChanged=true;}
  if(meta.localBankProtection?.version!==1||coldChanged){
   meta.localBankProtection={version:1,checkedAt:new Date().toISOString(),recoveredQuestions,recoveredPapers};metaChanged=true;
  }
  return {coldChanged,metaChanged,recoveredQuestions,recoveredPapers};
 }
 function materialCloseTarget(session,split){
  const current=Number(session.index)||0,indices=split?.indices||[];
  if(!indices.length||session._review||!indices.every(i=>session.answers?.[session.questions[i]?.id]?.selected))return current;
  const next=Math.max(...indices)+1;
  return next<session.questions.length?next:current;
 }
 class TopicTreeState{
  constructor(storage,key='zhiyaoji-topic-tree-v1'){
   this.storage=storage;this.key=key;let values=[];
   try{const parsed=JSON.parse(storage?.getItem(key)||'[]');if(Array.isArray(parsed))values=parsed.filter(x=>typeof x==='string');}catch{}
   this.values=new Set(values);
  }
  isOpen(key){return this.values.has(key);}
  setOpen(key,open){
   open?this.values.add(key):this.values.delete(key);
   try{this.storage?.setItem(this.key,JSON.stringify([...this.values]));}catch{}
  }
 }
 return {paperSource,isLocalPaper,recoverLocalImports,materialCloseTarget,TopicTreeState};
});
