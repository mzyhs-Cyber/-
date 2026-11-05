/* Background matching receives only selection metadata, never ink or full HTML. */
(function(S,E){'use strict';if(!S||!E)return;
let sequence=0;
const metrics=S.localSelectionMetrics={runs:0,cancelled:0,failures:0,inFlight:0,projectionMs:0,workerMs:0,maxProjectionSliceMs:0,records:0};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const aborted=()=>Object.assign(Error('匹配已暂停'),{name:'AbortError'});
S.selectLocalReviewAsync=async function(state,options={}){
 if(typeof Worker!=='function')throw Error('后台选题组件不可用，请刷新后重试');
 const snapshot=state,bank=state.bank,owner=state.meta?.syncOwnerId,serial=++sequence,materials=new Map();
 const invalid=()=>S.state!==snapshot||state.bank!==bank||state.meta?.syncOwnerId!==owner||options.cancelled?.()||S.bankImporting||S.openingPractice||S.preparingInk||S.preparingReview||S.activeInkPointer||S.exam&&!S.exam.disposed||S.review||document.hidden;
 const guard=()=>{if(invalid())throw aborted();};
 const started=performance.now();let slice=started;
 async function checkpoint(){guard();if(performance.now()-slice>=6){metrics.maxProjectionSliceMs=Math.max(metrics.maxProjectionSliceMs,performance.now()-slice);await pause();guard();slice=performance.now();}}
 const project=q=>{
  const valid=E.valid(q),material=String(q.materialHtml||'').trim();
  let materialId='';if(material){if(!materials.has(material))materials.set(material,materials.size+1);materialId='m'+materials.get(material);}
  return {id:q.id,globalId:q.globalId,canonicalId:options.canonical?.(q)||q.canonicalId||q.id,subject:q.subject,year:q.year,
   paperId:q.paperId,paperTitle:q.paperTitle,paperOrder:q.paperOrder,order:q.order,answer:q.answer,rate:q.rate,
   archived:q.archived,demo:q.demo,answerConflict:q.answerConflict,disputed:q.disputed,gradingStatus:q.gradingStatus,
   contentStatus:q.contentStatus,sourceQuestionType:q.sourceQuestionType,materialKey:q.materialKey,
   materialStatus:q.materialStatus,materialComplete:q.materialComplete,materialExpectedCount:q.materialExpectedCount,
   localTopicPaths:options.paths?.(q)||q.localTopicPaths||[],_allowed:!options.allow||!!options.allow(q),
   _groupKey:options.groupKey?.(q)||(q.materialKey?'m:'+q.paperId+':'+q.materialKey:'q:'+q.id),_expected:options.expectedCount?.(q)||0,
   stemHtml:valid?'题':'',optionsHtml:['A','B','C','D'],materialHtml:materialId};
 };
 metrics.runs++;metrics.inFlight++;
 let worker,timer;
 try{
  const projected=[];
  for(const q of bank){projected.push(project(q));await checkpoint();}
  const byId=new Set(bank.map(q=>q.id)),attempts=[];
  for(const a of state.attempts||[]){
   const row={};for(const key of ['sessionId','questionId','canonicalId','finishedAt','gradingStatus','answer','answerConflict','selected','result','confidence','certainty','excluded'])if(key in a)row[key]=a[key];
   if(!byId.has(a.questionId)&&a.questionSnapshot)row.questionSnapshot=project(a.questionSnapshot);
   else if(!byId.has(a.questionId)){row.subject=a.subject;row.rate=a.rate;row.localTopicPaths=options.paths?.(a)||a.localTopicPaths||[];}
   attempts.push(row);await checkpoint();
  }
  const sessions=[];
  for(const s of state.sessions||[]){
   const answers={};for(const [key,a]of Object.entries(s.answers||{}))if(a&&typeof a==='object')answers[key]={selected:a.selected,confidence:a.confidence};
   const feedback={};for(const [key,f]of Object.entries(s.reviewFeedback||{}))if(f&&typeof f==='object')feedback[key]={confidence:f.confidence,excludeFromLearning:f.excludeFromLearning,inclusionOverride:f.inclusionOverride,updatedAt:f.updatedAt};
   sessions.push({id:s.id,mode:s.mode,startedAt:s.startedAt,dailyPackHash:s.dailyPackHash,blueprint:s.blueprint?.localReview?{localReview:true}:undefined,reviewFeedback:feedback,answers});
   await checkpoint();
  }
  guard();metrics.projectionMs=Math.round(performance.now()-started);metrics.records=projected.length;
  const parameters={};for(const key of ['now','learningAsOf','numericOffset','seed','strategy','quotas'])if(options[key]!==undefined)parameters[key]=options[key];
  const begin=performance.now();
  const plan=await new Promise((resolve,reject)=>{
   worker=new Worker(new URL('local-review-worker.js?v=r73',document.baseURI));
   timer=setInterval(()=>{if(invalid())reject(aborted());},100);
   worker.onmessage=event=>{const reply=event.data;if(reply?.protocol!==1||reply.id!==serial)return;reply.error?reject(Error(reply.error)):resolve(reply.plan);};
   worker.onerror=()=>reject(Error('后台选题组件未加载，请刷新后重试'));
   worker.postMessage({protocol:1,id:serial,state:{bank:projected,attempts,sessions},aliases:{...state.meta?.canonicalAliases},options:parameters});
  });
  guard();metrics.workerMs=Math.round(performance.now()-begin);
  if(!Array.isArray(plan?.ids)||new Set(plan.ids).size!==plan.ids.length)throw Error('选题结果格式无效');
  const actual=new Map(bank.map(q=>[q.id,q]));const questions=plan.ids.map(id=>actual.get(id));if(questions.some(q=>!q))throw Error('题库已变化，请重新匹配');
  return {...plan,questions};
 }catch(error){if(error.name==='AbortError')metrics.cancelled++;else metrics.failures++;throw error;}
 finally{clearInterval(timer);worker?.terminate();metrics.inFlight--;}
};
})(window.Study,window.LocalReviewEngine);
