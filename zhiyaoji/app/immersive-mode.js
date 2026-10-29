/* Layout only. Keep the native timer, controller, notes and toolbar positions. */
(function(S){
 'use strict';if(!S?.ExamController)return;
 const p=S.ExamController.prototype,render=p.render,click=p.onClick;
 const icon=exit=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(exit?'<path d="M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5"/>':'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>')+'</svg>';
 function place(exam){
  const root=exam.root,head=root.querySelector('.exam-heading'),clock=root.querySelector('#exam-clock');
  if(!head||!clock)return;
  let button=root.querySelector('[data-exam="immersive"]'),float=root.querySelector('.immersive-controls');
  if(!button){button=document.createElement('button');button.type='button';button.className='icon-button immersive-toggle';button.dataset.exam='immersive';head.append(button);}
  if(!float){float=document.createElement('div');float.className='immersive-controls';float.hidden=true;root.append(float);}
  const slot=document.createComment('original clock position');clock.before(slot);
  exam.immersiveParts={button,float,clock,slot,head};apply(exam);
 }
 function apply(exam){
  const parts=exam.immersiveParts;if(!parts)return;
  const on=!!exam.immersive,{button,float,clock,slot,head}=parts;
  exam.root.classList.toggle('exam-immersive',on);float.hidden=!on;
  if(on)float.append(clock,button);else{slot.after(clock);head.append(button);}
  button.innerHTML=icon(on);button.title=on?'退出沉浸模式':'进入沉浸模式';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(on));
 }
 p.toggleImmersive=function(){
  if(this.disposed||this.submitting)return false;
  clearTimeout(this.advanceTimer);
  const views=[...this.layers?.values?.()||[]];
  for(const layer of views)layer.finish();
  S.stopNoteMotion?.();this.capturePosition?.();
  for(const layer of views)S.captureReadingAnchor?.(layer);
  this.immersive=!this.immersive;apply(this);
  const restore=()=>{
   if(this.disposed)return;
   for(const layer of views){if(layer.alive===false)continue;S.restoreReadingAnchor?.(layer);layer.refreshLayout?.();layer.invalidate?.();}
   this.readingControls?.schedule();
  };
  restore();requestAnimationFrame(restore);return this.immersive;
 };
 p.render=function(...args){const result=render.apply(this,args);place(this);return result;};
 p.onClick=function(event){
  const button=event.target.closest?.('[data-exam="immersive"]');
  if(button&&this.root.contains(button)){
   event.preventDefault();event.stopImmediatePropagation();return this.toggleImmersive();
  }
  return click.call(this,event);
 };
 S.BUILD='2.9.18-r8-8-53';
})(window.Study);
