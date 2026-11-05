/* Read-only metadata overlay. A changed/new question falls back to its source tags. */
(function(S,D){
 'use strict';if(!S)return;
 const oldPaths=S.displayTopicPaths,cache=new WeakMap();
 const signature=q=>JSON.stringify([q.subject||'',q.stemHtml||'',q.optionsHtml||[],q.answer||'',q.materialHtml||'']);
 function fingerprint(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return [h>>>0,text.length];}
 function resolve(q){
  if(q?._deferredSnapshot&&q._catalogClassification?.version===S.classificationVersion)return q._catalogClassification.result;
  const values=[q.subject,q.stemHtml,...(q.optionsHtml||[]),q.answer,q.materialHtml],previous=cache.get(q);
  if(previous&&values.length===previous.values.length&&values.every((v,i)=>v===previous.values[i]))return previous.result;
  const text=signature(q);
  const item=D?.records?.[q.id];let result;
  if(item){const [hash,len]=fingerprint(text);
   if(hash===item[2]&&len===item[3]){
    const status=D.statuses[item[1]],paths=item[0].map(i=>D.dictionary[i]).filter(p=>p?.[0]===q.subject).map(p=>p.slice(1));
    result={paths:paths.length?paths:oldPaths(q),status,matchedSnapshot:true,blocked:status.startsWith('blocked_')};
   }
  }
  if(!result)result={paths:oldPaths(q),status:'source_fallback',matchedSnapshot:false,blocked:false};
  cache.set(q,{values,result});return result;
 }
 S.classificationVersion=D?.version||'source-fallback';
 S.classificationFor=resolve;
 S.classificationAllowed=q=>!resolve(q).blocked;
 S.displayTopicPaths=q=>resolve(q).paths;
 S.topicPath=q=>S.displayTopicPaths(q)[0]||['其他','待分类'];
 S.summaryTopicPath=q=>S.topicPath(q).slice(0,2);
 S.topicMatches=(q,prefix)=>S.displayTopicPaths(q).some(p=>prefix.every((v,i)=>p[i]===v));
 try{delete window.ZhiyaojiClassificationData;}catch{}
})(window.Study,window.ZhiyaojiClassificationData);
