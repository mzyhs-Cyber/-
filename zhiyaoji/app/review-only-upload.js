/* The review button never invokes account sync or sends a note object. */
(function(S){
 'use strict';
 const select=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
 const feedback=s=>Object.fromEntries(s.questions.map(q=>{const f=S.reviewFeedbackFor(s,q.id);return [q.id,{userCause:String(f.userCause||''),exclusionReason:String(f.exclusionReason||''),excludeFromLearning:f.excludeFromLearning===true,inclusionOverride:f.inclusionOverride!==false,...(Number.isFinite(f.updatedAt)?{updatedAt:f.updatedAt}:{}),...(f.causeOrigin==='user'?{causeOrigin:'user'}:{})}];}));
 S.reviewOnlyRecord=function(s){
  const data=select(s,['id','title','startedAt','finishedAt','finished','mode','elapsed','timeAssessment','typeHistorySnapshot','dailyDate','dailyPackHash','dailyOwner']);
  data.answers=Object.fromEntries(s.questions.map(q=>[q.id,select(S.sessionAnswer(s,q),['selected','excluded','marked','favoriteAtAttempt','seconds'])]));
  data.events=(s.submissionEvidence?.events||s.events||[]).filter(e=>['answer','exclude','mark','question-change','submit'].includes(e.type)).slice(0,500).map(e=>select(e,['id','type','at','activeSeconds','questionId','questionSeconds','selected','excluded','marked','from','to','reason']));
  const qkeys=['id','recordId','canonicalId','globalId','externalId','sourceQuestionId','paperId','paperOrder','order','paperTitle','paperType','region','year','paperYear','subject','path','sourcePath','type','tags','stemHtml','optionsHtml','answer','answerConflict','explanationHtml','materialKey','materialHtml','materialExpectedCount','rate','rateSource','source','trainingSection','provenance','classification'];
  const akeys=['attemptId','sessionId','sessionIndex','questionId','recordId','canonicalId','paperId','paperOrder','paperTitle','paperType','region','subject','path','tags','year','type','source','stemHtml','optionsHtml','materialHtml','answer','answerConflict','explanationHtml','rate','rateSource','selected','excluded','correct','result','gradingStatus','seconds','finishedAt','favoriteAtAttempt','slowFlag','baselineSeconds','baselineSource','baselineSample','timeAssessment'];
  return {data,questions:s.questions.map(q=>select(q,qkeys)),attempts:(S.state.attempts||[]).filter(a=>a.sessionId===s.id).map(a=>select(a,akeys))};
 };
 S.completeReview=async function(id){
  let s=S.state.sessions.find(x=>x.id===id);if(!s?.finished||S.reviewUploading.has(id))return false;
  S.reviewUploading.add(id);let account=null;const expectedOwner=S.state.meta.syncOwnerId;
  try{
   S.refreshReviewDefaults(s,true);const values=feedback(s);
   s.reviewFeedback=values;s.reviewCompletion={version:1,status:'confirmed',confirmedAt:Date.now(),revision:s.reviewRevision||0,feedbackSignature:S.SyncModel.stable(values)};S.touchSession(s);await S.saveHot();
   S.closeReview?.();S.showReport(id);
   const C=S.accountSync;account=C?.user?.id;if(!account||account!==expectedOwner||account!==S.state.meta.syncOwnerId)throw Error('复盘已保存在本机；请登录原账号后再上传');
   if(navigator.onLine===false)throw Error('当前离线，复盘已保存在本机，联网后可重新上传');
   const payload={ownerId:account,sessionId:id,deviceId:C.deviceId||'review-only',reviewFeedback:values,reviewRevision:s.reviewRevision||0};
   let result;try{result=await C.request('/api/review/update',payload);}
   catch(e){if(e.status===409&&/作答记录尚未同步/.test(e.message)){if(C.user?.id!==account||S.state.meta.syncOwnerId!==account)throw Error('账号已切换，已停止补充原账号作答');result=await C.request('/api/review/update',{...payload,record:S.reviewOnlyRecord(s)});}else if(e.status===404)throw Error('网站服务端尚未更新，请部署完整R8.8.25包后再上传；本机复盘已保留');else throw e;}
   if(C.user?.id!==account||S.state.meta.syncOwnerId!==account)throw Error('上传期间账号已切换，请返回原账号查看回执');
   if(result?.ok!==true||result.notesUploaded!==false||result.ownerId!==account||result.sessionId!==id||!Number.isSafeInteger(result.reviewRevision)||result.reviewCompletion?.status!=='confirmed'||result.reviewCompletion.revision!==result.reviewRevision||result.reviewCompletion.feedbackSignature!==S.SyncModel.stable(values))throw Error('复盘回执未通过核对，请重试；本机内容已保留');
   s=S.state.sessions.find(x=>x.id===id);if(!s)throw Error('本机练习已变化，请返回记录核对');
   Object.assign(s,{reviewFeedback:values,reviewRevision:result.reviewRevision,reviewCompletion:result.reviewCompletion});S.touchSession(s);await S.saveHot();if(C.user?.id!==account||S.state.meta.syncOwnerId!==account)throw Error('账号已切换，原账号复盘已提交，请切回后查看');
   S.reviewUploadReceipts.set(id,{revision:result.reviewRevision,at:Date.now(),notesUploaded:false,hash:result.hash});S.toast('复盘已更新，仅上传文字与状态，不含笔迹');return true;
  }catch(e){S.toast(e.message);return false;}
  finally{S.reviewUploading.delete(id);if(S.route==='report'&&(!account||S.state.meta.syncOwnerId===account))S.showReport(id);}
 };
 const finish=S.reviewFinishButton;
 S.reviewFinishButton=function(s,root){const result=finish(s,root);const p=root.querySelector('.review-finish-status'),r=S.reviewUploadReceipts.get(s.id);if(p)p.textContent=S.reviewUploading.has(s.id)?'正在上传复盘文字与状态，不含笔迹。':r&&r.revision===(s.reviewRevision||0)&&r.notesUploaded===false?'复盘已更新；再次上传会更新同一条记录，不含笔迹。':'上传错因、纳入状态及复盘确认，不含笔迹。';return result;};
 S.BUILD='20261027-r8-8-25';
})(window.Study);
