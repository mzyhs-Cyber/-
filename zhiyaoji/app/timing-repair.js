/* Read-only compatibility for timing diagnostics; original answers stay intact. */
(function(S){
 'use strict';
 S.BUILD='20261027-r8-8-21';
 const rule=S.timeRule,compute=S.computeTiming,details=S.timeDetails;
 function positiveSeconds(value){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^\s*\d+(?:\.\d+)?\s*$/.test(value))return null;
  const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?seconds:null;
 }
 S.timeRule=function(q){
  const original=rule(q);if(original)return original;
  // Only known figure-reasoning leaves may supply a missing parent label.
  if(q?.subject!=='判断推理')return null;
  const labels=[q.type,...q.path||[],...q.sourcePath||[],...q.tags||[]].filter(x=>typeof x==='string');
  const space=/^(?:空间类[-/])?(?:三视图|空间重构(?:[-/](?:六面体|四面体))?|截面图?|六面体(?:重构)?|四面体(?:重构)?)$/;
  const figure=/^(?:(?:位置规律|样式规律|属性规律|数量规律|特殊规律)(?:[-/].+)?|文字\/字母\/数字类|黑白块类|实际意义)$/;
  if(labels.some(x=>space.test(x)))return rule({...q,type:'空间重构'});
  if(labels.some(x=>figure.test(x)))return rule({...q,path:['图形推理',...q.path||[]]});
  return null;
 };
 S.computeTiming=function(s){
  let changed=false;const answers={...s.answers};
  for(const q of s.questions||[]){
   const raw=answers[q.id],direct=positiveSeconds(raw?.seconds);
   const fallback=direct===null?positiveSeconds(S.sessionAnswer?.(s,q)?.seconds):null;
   const seconds=direct??fallback;
   if(seconds!==null&&raw?.seconds!==seconds){answers[q.id]={...raw,seconds};changed=true;}
  }
  return compute(changed?{...s,answers}:s);
 };
 function usable(t){return !!t?.valid&&(t.scope==='group'?Number.isFinite(t.groupThresholdSeconds):Number.isFinite(t.thresholdSeconds));}
 S.assessQuestionTime=function(s,q){
  const frozen=s.timeAssessment?.questions?.[q.id];
  if(usable(frozen))return frozen;
  const current=S.computeTiming(s).questions[q.id];
  // Reconstruct only a missing/invalid assessment; never mutate the saved one.
  return current?{...current,...(frozen?{reconstructed:true}:{} )}:frozen;
 };
 S.timeDetails=function(s,q){
  const t=S.assessQuestionTime(s,q);let html=details(s,q);
  if(t?.valid&&(t.scope==='group'||Number.isFinite(t.thresholdSeconds)))return html.replace('<br>',(t.reconstructed?' · 按原作答用时补算':'')+'<br>');
  const message=t?.scope==='group'&&!t.valid?'本组计时不完整'+(t.actualSeconds!==null?' · 本题 '+S.clock(t.actualSeconds):'')+'，暂不判定整组快慢':t?.valid?'题型未匹配 · 本题 '+S.clock(t.actualSeconds)+'，暂不判定快慢':'暂无有效单题用时，暂不判定快慢';
  return html.replace('计时不足或题型未匹配',message);
 };
})(window.Study);
