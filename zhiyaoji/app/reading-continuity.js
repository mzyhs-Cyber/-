/* Preserve reading UI positions; stylus recovery is limited to idle pauses. */
(function(S){
 'use strict';
 const contains=(r,x,y)=>x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom;
 S.resumeIdlePen=function(exam,event){
  if(event.type!=='pointerdown'||event.pointerType!=='pen'||!exam.inkOn||exam.disposed||exam.editBlocked||exam.submitting||exam.s.finished||exam.s._review||document.hidden)return false;
  if(event.target?.closest?.('button,input,textarea,select'))return false;
  const view=[...exam.layers.values()].find(v=>v.alive&&v.visible&&v.enabled&&contains(v.canvas.getBoundingClientRect(),event.clientX,event.clientY));
  if(!view)return false;
  // Do not route an intended toolbar/control tap into the writing surface.
  if([...exam.root.querySelectorAll('button,input,textarea,select')].some(b=>!b.closest('.pause-overlay')&&contains(b.getBoundingClientRect(),event.clientX,event.clientY)))return false;
  if(!exam.s.paused&&S.idleExpired(exam,performance.now()))exam.pulse();
  if(!exam.s.paused||exam.s.pauseReason!=='idle')return false;
  S.resumeActiveClock(exam.s);exam.wasHidden=false;S.$('.pause-overlay',exam.root)?.remove();
  S.lastInteractionAt=Date.now();S.saveSoon();
  // The original canvas event can continue normally. An overlay-targeted
  // event must be delivered explicitly, retaining the original pointer ID.
  if(event.target!==view.canvas){event.preventDefault();event.stopImmediatePropagation();view.down(event);}
  return true;
 };
 const compact=S.compactControlHit;
 S.compactControlHit=function(button,x,y){return ['pen','mark'].includes(button.dataset.exam)?contains(button.getBoundingClientRect(),x,y):compact(button,x,y);};
 const p=S.ExamController.prototype,preferences=p.applyPreferences,close=p.closeAnswerCard,open=p.openAnswerCard,render=p.render,pause=p.showPauseCover;
 p.applyPreferences=function(...args){
  const old=this.root.style.getPropertyValue('--reading-font'),views=[...this.layers.values()].filter(v=>v.alive&&v.scroll?.isConnected!==false&&v.scroll.getBoundingClientRect().height>0);
  const anchors=views.map(v=>{S.captureReadingAnchor(v);return [v,v.readingAnchor];});
  const result=preferences.apply(this,args);
  if(old&&old!==this.root.style.getPropertyValue('--reading-font')){
   const restore=()=>{if(this.disposed)return;for(const[v,a]of anchors){if(!v.alive||!a?.node.isConnected)continue;v.readingAnchor=a;S.restoreReadingAnchor(v);v.regionCache=null;v.invalidate();}this.capturePosition();this.readingControls?.schedule();};
   restore();requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
  }
  return result;
 };
 p.closeAnswerCard=function(...args){const body=S.$('.answer-drawer .answer-body',this.root);if(body)this.answerCardPosition={top:body.scrollTop,left:body.scrollLeft};return close.apply(this,args);};
 p.openAnswerCard=function(...args){const result=open.apply(this,args);if(this.cardOpen&&this.answerCardPosition){const saved=this.answerCardPosition,restore=()=>{if(!this.cardOpen||this.disposed)return;const body=S.$('.answer-drawer .answer-body',this.root);if(body){body.scrollTop=saved.top;body.scrollLeft=saved.left;}};restore();requestAnimationFrame(restore);}return result;};
 p.render=function(...args){const result=render.apply(this,args),b=S.$('.exam-head [data-exam="pause"]',this.root);if(b){b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.5"/><path d="M9.5 8.5v7m5-7v7" stroke-linecap="round"/></svg>';b.title='暂停计时';}return result;};
 p.showPauseCover=function(...args){const result=pause.apply(this,args),b=S.$('.pause-resume',this.root);if(b)b.innerHTML=S.icon('play')+'<span>恢复计时</span>';return result;};
})(window.Study);
