/* A draft's opening question is separate from its physical writing surface. */
(function(S){
 'use strict';
 const p=S.ExamController.prototype,setMode=p.setNoteMode,controls=p.updateControls;
 const validOwner=e=>Number.isInteger(e.noteOwnerIndex)&&!!e.s.questions[e.noteOwnerIndex];
 p.setNoteMode=function(index,enabled){
  if(this.disposed||this.submitting||this.editBlocked||this.s.paused||!this.s.questions[index])return;
  const owned=this.inkOn&&validOwner(this),switching=owned&&index!==this.noteOwnerIndex;
  const next=switching?true:enabled===undefined?!(owned&&index===this.noteOwnerIndex):!!enabled;
  // Commit a pending stroke with its original owner before handing over.
  if(next&&index!==this.noteOwnerIndex)for(const layer of this.layers.values())layer.finish();
  if(next)this.noteOwnerIndex=index;
  const result=setMode.call(this,index,next);
  if(!this.inkOn)this.noteOwnerIndex=null;
  this.updateControls();return result;
 };
 p.updateControls=function(...args){
  const physical=this.toolIndex,owned=this.inkOn&&validOwner(this);
  if(owned)this.toolIndex=this.noteOwnerIndex;
  let result;try{result=controls.apply(this,args);}finally{this.toolIndex=physical;}
  if(this.disposed)return result;
  for(const b of S.$$('[data-exam="pen"]',this.root)){
   if(b.disabled)b.disabled=false;if(b.getAttribute('aria-disabled')!=='false')b.setAttribute('aria-disabled','false');
  }
  const target=S.$('#reading-note-target',this.root);
  const caption='第 '+(this.noteOwnerIndex+1)+' 题草稿';if(owned&&target&&target.textContent!==caption)target.textContent=caption;
  return result;
 };
 const v=S.WorkspaceInkView?.prototype,append=v?.append;
 if(append)v.append=function(key,stroke){
  const e=this.exam,q=e.inkOn&&validOwner(e)?e.s.questions[e.noteOwnerIndex]:null;
  if(q)Object.assign(stroke,{draftOwnerQuestionId:q.id,draftSurfaceKey:key});
  return append.call(this,key,stroke);
 };

 const owner=()=>S.state.meta?.syncOwnerId||'local';
 const scope='reviewPositions',memory=()=>S.trainingViewMemory();
 const current=c=>!!c?.s?._review&&!c.disposed;
 function save(c){
  if(!current(c)||c.reviewMemoryOwner!==owner())return;
  if(c.pendingScrollTarget){c.onScroll(c.pendingScrollTarget);c.pendingScrollTarget=null;}
  c.capturePosition();const source=c.s._sourceSession,q=c.s.questions[c.s.index];if(!source||!q)return;
  const all={...memory().read(scope)},positions={};
  for(const key of ['main',c.split?.groupIdentity].filter(Boolean))if(c.s.positions[key])positions[key]={...c.s.positions[key]};
  all[source.id]={questionId:q.id,expanded:!!c.split,positions,updatedAt:Date.now()};
  const ids=Object.keys(all).sort((a,b)=>(all[b].updatedAt||0)-(all[a].updatedAt||0));for(const id of ids.slice(60))delete all[id];
  memory().write(scope,all);
 }
 const close=S.closeReview;
 S.closeReview=function(...args){const c=S.review?.controller;save(c);return close.apply(this,args);};
 const open=S.openReview;
 S.openReview=function(id,filter='wrong',start=null){
  save(S.review?.controller);
  const account=owner(),saved=start==null?memory().read(scope)?.[id]:null,source=S.state.sessions.find(s=>s.id===id);
  const index=saved&&source?source.questions.findIndex(q=>q.id===saved.questionId):-1;
  const restore=index>=0?{...saved,index}:null;
  const ready=()=>{
   const c=S.review?.controller;if(!current(c)||c.s._sourceSession?.id!==id||owner()!==account)return;
   c.reviewMemoryOwner=account;
   if(!restore||c.s.index!==restore.index)return;
   const apply=()=>{
    if(!current(c)||S.review?.controller!==c||c.s.index!==restore.index||owner()!==account)return;
    if(!restore.expanded&&c.split)c.closeMaterial(false);
    for(const [key,pos] of Object.entries(restore.positions||{}))c.s.positions[key]={...pos};
    const main=S.$('#question-scroll',c.root),left=S.$('#split-material-scroll',c.root),right=S.$('#split-q-scroll',c.root);
    if(!c.split&&main&&restore.positions?.main)main.scrollTop=Number(restore.positions.main.top)||0;
    const group=c.split&&restore.positions?.[c.split.groupIdentity];
    if(group){if(left)left.scrollTop=Number(group.left)||0;if(right)right.scrollTop=Number(group.right)||0;}
    c.updateControls();
   };
   requestAnimationFrame(()=>{apply();requestAnimationFrame(apply);});
  };
  const result=open.call(this,id,filter,start==null&&restore?restore.index:start);
  if(result?.then)return result.then(value=>{ready();return value;});ready();return result;
 };
 for(const type of ['pagehide','visibilitychange'])window.addEventListener(type,()=>save(S.review?.controller));
 S.BUILD='20261027-r8-8-24';
})(window.Study);
