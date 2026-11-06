/* Countdown has no manual pause; returning home requires explicit confirmation. */
(function(S){
 'use strict';
 if(!S?.ExamController||!S.pauseSession)return;
 const countdown=s=>!!s?.timed&&!s._review&&!s.finished;
 const message='倒计时不能手动暂停；如需离开，请确认返回主页。';
 const p=S.ExamController.prototype,toggle=p.togglePause,suspend=p.suspend,render=p.render,controls=p.updateControls,click=p.onClick,go=S.go,pause=S.pauseSession;
 function label(exam){
  const text=exam.returningHome?'正在保存…':'返回主页',exit=S.$('.exam-head [data-exam="exit"]',exam.root);
  if(exit){exit.title=text;exit.setAttribute('aria-label',text);exit.disabled=!!exam.returningHome;exit.setAttribute('aria-busy',String(!!exam.returningHome));}
  const caption=S.$('#reading-exit-label',exam.root);if(caption)caption.textContent=text;
  let status=S.$('.countdown-return-status',exam.root);
  if(!exam.returningHome)status?.remove();
  else if(!status){status=document.createElement('div');status.className='countdown-return-status';status.setAttribute('role','status');status.textContent='正在返回主页…';exam.root.append(status);}
 }
 function requestHome(exam){
  if(!exam||exam.disposed||exam.submitting||exam.returningHome||S.exam!==exam)return false;
  exam.pulse();if(!countdown(exam.s)||exam.submitting)return false;
  if(S.$('.leave-countdown-dialog'))return false;
  S.confirm('返回主页？','当前作答将保留，返回后计时暂停。之后可从主页继续这场练习。',async()=>{
   if(S.exam!==exam||exam.disposed||exam.submitting||!countdown(exam.s))return false;
   exam.returningHome=true;label(exam);
   try{
    exam.pulse();if(!countdown(exam.s)||exam.submitting)return false;
    clearTimeout(exam.advanceTimer);
    for(const layer of exam.layers?.values?.()||[])layer.finish();
    exam.capturePosition?.();S.pauseSession(exam.s,'exit');
    if(!S.answerJournal?.capture||!await S.answerJournal.capture(exam.s,true)){
     exam.showPauseCover?.();S.toast('答题卡尚未保存，暂未返回主页，请先导出答题卡。');return false;
    }
    if(S.exam!==exam||exam.disposed)return false;
    // Answer protection completes before leaving. The larger ink/main save
    // continues independently so a stalled queue cannot trap the return button.
    S.saveHot().then(()=>S.checkpointSession?.(exam.s)).catch(()=>{});
    exam.dispose();return S.go('home');
   }finally{exam.returningHome=false;if(!exam.disposed)label(exam);}
  },'返回主页');
  const dialog=S.$('#dialog-host .dialog');dialog?.classList.add('leave-countdown-dialog');
  const cancel=S.$('#confirm-cancel');if(cancel)cancel.textContent='继续答题';
  return false;
 }
 p.togglePause=function(...args){
  if(countdown(this.s)&&!this.s.paused){this.pulse();S.toast(message);return false;}
  return toggle.apply(this,args);
 };
 p.suspend=function(reason='background',...args){
  if(countdown(this.s)&&reason==='manual'){this.pulse();S.toast(message);return false;}
  return suspend.call(this,reason,...args);
 };
 S.pauseSession=function(s,reason='exit',...args){
  if(countdown(s)&&reason==='manual')return false;
  return pause.call(this,s,reason,...args);
 };
 p.onClick=function(e){
  const action=e.target.closest?.('[data-exam]')?.dataset.exam;
  if(countdown(this.s)&&action==='exit'){
   e.preventDefault?.();e.stopImmediatePropagation?.();return requestHome(this);
  }
  return click.call(this,e);
 };
 if(typeof go==='function')S.go=function(...args){
  if(S.exam&&!S.exam.disposed&&countdown(S.exam.s)){
   S.exam.pulse();if(countdown(S.exam.s)){if(args[0]==='home')return requestHome(S.exam);S.toast(message);return false;}
  }
  return go.apply(this,args);
 };
 p.render=function(...args){
  const result=render.apply(this,args);
  if(countdown(this.s)){
   S.$('.exam-head [data-exam="pause"]',this.root)?.remove();
   label(this);
  }
  return result;
 };
 if(typeof controls==='function')p.updateControls=function(...args){const result=controls.apply(this,args);if(countdown(this.s))label(this);return result;};
 S.CountdownPolicy={isCountdown:countdown,requestHome};
})(window.Study);
