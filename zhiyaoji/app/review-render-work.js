/* Warm sanitized review HTML in short slices; render only the selected review scope. */
(function(S){'use strict';if(!S.openReview||!S.safeHTML)return;
const nativeHTML=S.safeHTML,open=S.openReview;let generation=0,active=null;
const metrics=S.reviewRenderMetrics={runs:0,cancelled:0,fields:0,yields:0,maxSliceMs:0,lastPrepareMs:0,cacheHits:0};
S.safeHTML=function(value){const key=String(value??'');if(active?.values.has(key)){metrics.cacheHits++;return active.values.get(key);}return nativeHTML(value);};
S.openReview=async function(id,filter='wrong',start=null){
 const token=++generation,state=S.state,owner=state.meta.syncOwnerId,route=S.route,prior=S.review,view=S.$('#view')?.firstElementChild;
 const source=state.sessions.find(s=>s.id===id);if(!source)return;
 const valid=()=>token===generation&&S.state===state&&S.state.meta.syncOwnerId===owner&&S.route===route&&S.review===prior&&S.$('#view')?.firstElementChild===view;
 const needs=filter==='needs-review'?new Set(S.reportRows(source).filter(S.reportNeedsReview).map(x=>x.index)):null;
 const selected=source.questions.filter((q,i)=>filter==='all'||(needs?needs.has(i):S.reviewVerdict(q,S.sessionAnswer(source,q),S.getAttempt(source,q)).type!=='correct'));
 const values=new Map();let slice=performance.now(),started=slice;
 S.preparingReview=true;metrics.runs++;
 try{
  await new Promise(resolve=>setTimeout(resolve,0));
  for(const original of selected){
   const q=S.presentQuestion?S.presentQuestion(original):original;
   for(const value of [q.stemHtml,...q.optionsHtml,q.explanationHtml||'暂无参考解析',q.materialHtml||'',original.materialHtml||'']){
    if(!valid()){metrics.cancelled++;return;}
    const key=String(value??'');if(!values.has(key)){values.set(key,nativeHTML(key));metrics.fields++;}
    if(performance.now()-slice>=6){metrics.maxSliceMs=Math.max(metrics.maxSliceMs,performance.now()-slice);metrics.yields++;await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();}
   }
  }
  if(!valid()){metrics.cancelled++;return;}
  metrics.lastPrepareMs=Math.round(performance.now()-started);
  active={token,values};
  return await open.call(this,id,filter,start);
 }finally{if(active?.token===token)active=null;if(token===generation)S.preparingReview=false;}
};
})(window.Study);
