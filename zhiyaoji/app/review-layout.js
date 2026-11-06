/* Presentation only: reuse existing review buttons, confirmation dialog and
   text-only upload. Never read ink, rewrite sessions or change export scope. */
(function(S){
 'use strict';if(!S)return;
 const finish=S.reviewFinishButton;
 S.reviewFinishButton=function(s,root){
  const result=finish.call(this,s,root),button=root.querySelector('.review-finish');
  if(!button)return result;
  const owner=S.state.meta.syncOwnerId;
  button.onclick=event=>{
   event?.preventDefault();event?.stopPropagation();
   if(owner!==S.state.meta.syncOwnerId)return;
   const source=S.state.sessions.find(x=>x.id===s.id);
   if(!source?.finished||S.reviewUploading.has(s.id))return;
   const review=button.closest('.review-shell');
   if(button.classList.contains('review-upload-button')&&S.review?.root!==review)return;
   S.confirm('确认结束复盘并上传？','上传本次错因、纳入状态和复盘确认，不含笔迹。再次上传会更新同一场练习。',()=>{
    if(owner!==S.state.meta.syncOwnerId)return;
    if(review&&S.review?.root!==review)return;
    const current=S.state.sessions.find(x=>x.id===s.id);
    if(!current?.finished||S.reviewUploading.has(s.id))return;
    return S.completeReview(s.id);
   },'确认上传');
  };
  return result;
 };
 function mount(id,owner){
  const review=S.review;
  if(!review?.s?.finished||review.s.id!==id||owner!==S.state.meta.syncOwnerId)return;
  function attach(){
   if(S.review!==review||owner!==S.state.meta.syncOwnerId)return;
   const dock=review.root.querySelector('.reading-answer-dock');if(!dock)return;
   review.root.classList.add('review-floating-actions');
   const footers=Array.from(review.root.querySelectorAll('.review-finish-bar'));
   if(!dock.querySelector('.review-upload-button')){
    let footer=footers.find(x=>x.querySelector('.review-finish'));
    if(!footer){footer=document.createElement('div');S.reviewFinishButton(review.s,footer);}
    const button=footer.querySelector('.review-finish'),status=footer.querySelector('.review-finish-status');
    if(button){
     const label=button.textContent;button.className='icon-button review-finish review-upload-button';button.innerHTML=S.icon('upload');button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-haspopup','dialog');dock.append(button);
    }
    if(status){status.classList.add('review-upload-status');dock.append(status);}
   }
   for(const footer of footers)footer.remove();
   const button=dock.querySelector('.review-upload-button');if(button)S.refreshReviewFinishButton?.(review.s,button);
  }
  const controller=review.controller;
  if(controller&&!controller._reviewLayoutRender){const render=controller.render;controller.render=function(...args){const result=render.apply(this,args);attach();return result;};controller._reviewLayoutRender=true;}
  attach();
 }
 const open=S.openReview;
 if(open)S.openReview=function(id,...args){
  const owner=S.state.meta.syncOwnerId,result=open.call(this,id,...args);
  if(result&&typeof result.then==='function')return result.then(value=>{mount(id,owner);return value;});
  mount(id,owner);return result;
 };
 S.BUILD='2.9.18-r8-8-40';
})(window.Study);
