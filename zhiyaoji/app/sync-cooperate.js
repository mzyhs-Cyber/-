/* Bulk cloud work yields to active study. Local durability is unchanged. */
(function(S){
 'use strict';
 S.syncCanTransfer=function(){const exam=S.exam,review=S.review;return !document.hidden&&!S.openingPractice&&!S.preparingInk&&!S.inkRetentionSaving&&!S.activeInkPointer&&!S.bankImporting&&!(exam&&!exam.disposed&&!exam.s.finished)&&!(review&&!review.disposed);};
 S.syncTransferMetrics={waits:0,deferredMs:0,resumes:0,waiting:false,deferrals:0};
 S.requireSyncSlot=function(){if(!S.syncCanTransfer()){S.syncTransferMetrics.deferrals++;throw Object.assign(Error('做题期间暂缓大批同步，本机记录正常保存'),{name:'StudyBusyError',code:'STUDY_BUSY'});}};
 S.waitForSyncSlot=async function(){
  if(S.syncCanTransfer())return;
  const metrics=S.syncTransferMetrics,start=performance.now();metrics.waits++;metrics.waiting=true;
  try{while(!S.syncCanTransfer())await new Promise(resolve=>setTimeout(resolve,250));metrics.resumes++;}
  finally{metrics.deferredMs+=Math.max(0,performance.now()-start);metrics.waiting=false;}
 };
})(window.Study=window.Study||{});
