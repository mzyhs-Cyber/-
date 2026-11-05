/* Cloud work stops at study boundaries. Local answer/ink persistence never waits for cloud. */
(function(S){
 'use strict';
 let lastStudyAt=0,lastInputAt=0;
 const input=e=>{if(e?.target?.id==='storage-maintenance-open'||S.storageMaintenance?.opened&&e?.target?.closest?.('#dialog-host'))return;lastInputAt=Date.now();};
 for(const type of ['pointerdown','wheel','touchmove','keydown'])document.addEventListener(type,input,{passive:true,capture:true});
 S.beginManualSync=()=>{lastInputAt=0;};
 S.deferCloudAfterStudy=()=>{lastStudyAt=Date.now();};
 S.syncCanTransfer=function(){
  const exam=S.exam,review=S.review;
  const studying=S.openingPractice||S.preparingInk||S.preparingReview||S.activeInkPointer||exam&&!exam.disposed&&!exam.s.finished||review&&!review.controller?.disposed;
  if(studying)lastStudyAt=Date.now();
  return (!S.accountSync?.verified||!S.accountSync?.profileReady||!lastInputAt||Date.now()-lastInputAt>=900)&&!document.hidden&&!studying&&!S.storageMaintenance?.pauseCloud&&!S.inkRetentionSaving&&!S.bankImporting&&!S.NoteVault?.metrics?.releasingSessions&&(!lastStudyAt||Date.now()-lastStudyAt>=10000);
 };
 S.syncTransferMetrics={waits:0,deferredMs:0,resumes:0,waiting:false,deferrals:0};
 S.requireSyncSlot=function(){if(!S.syncCanTransfer()){S.syncTransferMetrics.deferrals++;throw Object.assign(Error('当前页面操作优先，云同步稍后继续，本机记录正常保存'),{name:'StudyBusyError',code:'STUDY_BUSY'});}};
 S.waitForSyncSlot=async function(){
  if(S.syncCanTransfer())return;
  const metrics=S.syncTransferMetrics,start=performance.now();metrics.waits++;metrics.waiting=true;
  try{while(!S.syncCanTransfer())await new Promise(resolve=>setTimeout(resolve,250));metrics.resumes++;}
  finally{metrics.deferredMs+=Math.max(0,performance.now()-start);metrics.waiting=false;}
 };
})(window.Study=window.Study||{});
