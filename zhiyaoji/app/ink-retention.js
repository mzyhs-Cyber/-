/* Five-day ink retention. Answers, timings, feedback and question identities are untouched. */
(function(S){
 'use strict';
 const AGE=5*86400000;
 const T=S.inkRetention={days:5,metrics:{runs:0,checks:0,prunedSessions:0,failures:0,lastCheckedAt:null,lastPrunedAt:null,deferredReason:null}};
 function timestamp(v){const n=typeof v==='number'?v:typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(n)&&n>0?n:0;}
 function lastInk(s){let at=timestamp(s.finishedAt);for(const ns of [s.notes,s.reviewNotes,s.submissionEvidence?.notes])for(const n of Object.values(ns||{})){at=Math.max(at,timestamp(n?.at),timestamp(n?.events?.at(-1)?.at));}return at;}
 T.expired=function(s,now=Date.now()){
  if(!s?.finished||s._review||s===S.exam?.s||s===S.review?.s||s===S.review?.controller?.sourceSession||(s.id&&[S.exam?.s?.id,S.review?.s?.id].includes(s.id)))return false;
  const at=lastInk(s);return at>0&&at<now-AGE;
 };
 const hasInk=s=>[s.notes,s.reviewNotes,s.submissionEvidence?.notes].some(n=>n&&Object.keys(n).length);
 T.view=function(s,now=Date.now()){
  if(!T.expired(s,now)||!hasInk(s))return s;
  const out={...s,notes:{},inkRetention:{days:5,expiredAt:now}};
  if(s.reviewNotes)out.reviewNotes={};
  if(s.submissionEvidence)out.submissionEvidence={...s.submissionEvidence,notes:{}};
  return out;
 };
 T.strip=function(s,now=Date.now()){const next=T.view(s,now);if(next===s)return false;for(const k of ['notes','reviewNotes','submissionEvidence','inkRetention'])if(k in next)s[k]=next[k];return true;};
 T.snapshot=function(snapshot){
  if(!snapshot?.sessions)return snapshot;
  const now=Date.now(),expired=new Set(snapshot.sessions.filter(s=>T.expired(s,now)).map(s=>s.id));
  return {...snapshot,sessions:snapshot.sessions.map(s=>T.view(s,now)),...(snapshot.conflicts?{conflicts:snapshot.conflicts.map(c=>{
   if(!expired.has(c.path?.[1])||!['notes','reviewNotes','submissionEvidence'].includes(c.path?.[2]))return c;
   const out={...c,resolved:true,resolution:'笔迹超过五天保留期'};for(const k of ['base','local','remote'])delete out[k];return out;
  })}:{})};
 };
 let running=null,last=0;T.ready=()=>running||Promise.resolve();
 const idle=()=>S.ready&&!document.hidden&&!S.openingPractice&&!S.preparingInk&&!S.activeInkPointer&&(!S.exam||S.exam.disposed)&&(!S.review||S.review.controller?.disposed)&&!S.bankImporting&&!S.accountSync?.restoring&&!S.accountSync?.adopting&&!S.accountSync?.connecting&&!S.accountSync?.phase&&!S.storageMaintenance?.pauseCloud&&!S.inkRetentionSaving&&!S.NoteVault?.metrics?.releasingSessions;
 T.prune=function(){
  if(running)return running;if(!idle()){T.metrics.deferredReason=S.activeInkPointer?'writing':S.exam&&!S.exam.disposed||S.review?'study':'background-work';return Promise.resolve(false);}T.metrics.checks++;T.metrics.lastCheckedAt=Date.now();T.metrics.deferredReason=null;
  const state=S.state,owner=state.meta?.syncOwnerId,changed=[];
  for(const s of state.sessions||[]){const next=T.view(s);if(next!==s)changed.push({s,next,old:{notes:s.notes,reviewNotes:s.reviewNotes,submissionEvidence:s.submissionEvidence,inkRetention:s.inkRetention}});}
  if(!changed.length){last=Date.now();return Promise.resolve(false);}
  // Replace references only at an idle boundary; never edit any vector array in place.
  for(const {s,next} of changed){for(const k of ['notes','reviewNotes','submissionEvidence','inkRetention'])if(k in next)s[k]=next[k];S.touchSession?.(s);}
  S.inkRetentionSaving=true;
  running=(async()=>{try{
   await S.saveHot();T.metrics.runs++;T.metrics.prunedSessions+=changed.length;T.metrics.lastPrunedAt=Date.now();last=Date.now();return true;
  }catch(e){T.metrics.failures++;
   if(S.state===state&&state.meta?.syncOwnerId===owner)for(const {s,next,old} of changed)if(s.inkRetention===next.inkRetention){for(const[k,v]of Object.entries(old)){if(v===undefined)delete s[k];else s[k]=v;}S.touchSession?.(s);}
   return false;
  }finally{S.inkRetentionSaving=false;running=null;}})();return running;
 };
 const poll=setInterval(()=>{if(Date.now()-last>3600000)T.prune();},30000);poll?.unref?.();
})(window.Study=window.Study||{});
