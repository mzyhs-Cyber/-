/* R73: immutable question snapshots; independent answer, ink and event rows. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else(root.Study=root.Study||{}).LocalRecords=api;})(globalThis,function(){
 'use strict';
 const states=new WeakMap(),tokens=new Map(),loads=new WeakMap(),referenceSignatures=new WeakMap();
 const metrics={snapshotsWritten:0,answerWrites:0,noteWrites:0,headerWrites:0,hydrated:0};
 const prefix=s=>'detail:'+encodeURIComponent(s.id)+':';
 function questionToken(rows){const out=[],walk=v=>{if(Array.isArray(v)){out.push('[',v.length);for(const x of v)walk(x);}else if(v&&typeof v==='object'){const keys=Object.keys(v);out.push('{',keys.length);for(const k of keys){out.push(k);walk(v[k]);}}else out.push(v);};walk(rows);return out;}
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
 function header(s){const out={...s};for(const k of ['questions','answers','notes','reviewNotes','events','reviewFeedback','_deferredQuestions'])delete out[k];if(s.submissionEvidence){out.submissionEvidence={...s.submissionEvidence};delete out.submissionEvidence.notes;delete out.submissionEvidence.events;}return out;}
 function summary(q,ref,i){const out={...q};for(const k of ['stemHtml','optionsHtml','materialHtml','explanationHtml'])delete out[k];out.previewText=String(q.stemHtml||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,160)||'图片题';out.stemHtml=out.previewText;out._deferredSnapshot=ref;out._snapshotIndex=i;const S=globalThis.Study;if(S?.classificationFor)out._catalogClassification={version:S.classificationVersion,result:S.classificationFor(q)};return out;}
 async function plan(s,{hash,stable,stored=s}){
  const writes=[],p=prefix(s);let known=states.get(s);if(known&&s._deferredQuestions)known.questions=s.questions;
  const token=s._deferredQuestions?null:questionToken(s.questions);
  if(!known||known.questions!==s.questions||!s._deferredQuestions&&!same(known.token,token)){if(s._deferredQuestions)throw Error('题面尚未读回，已停止覆盖保存');const text=stable(s.questions),snapshot=JSON.parse(text),ref=await hash(text);known={questions:s.questions,token,ref,summaries:snapshot.map((q,i)=>summary(q,ref,i)),snapshot,persisted:false};states.set(s,known);}
  if(!known.persisted)writes.push(['snapshot:'+known.ref,known.snapshot],['summary:'+known.ref,known.summaries]);
  const next=new Map(),old=tokens.get(s.id)||new Map();
  const refSignature=(key,row)=>{let cache=referenceSignatures.get(row.value);if(!cache){cache=new Map();referenceSignatures.set(row.value,cache);}let sig=cache.get(key);if(sig===undefined){sig=stable(row);cache.set(key,sig);}return sig;};
  const put=(key,value)=>{const before=old.get(key);if(value.value?.$ink===1){next.set(key,value.value);if(before===value.value)return;if(!before||before?.$ink===1&&before.hash!==value.value.hash){writes.push([key,value]);return;}const sig=refSignature(key,value),prior=before?.$ink===1?refSignature(key,{...value,value:before}):before;if(prior!==sig)writes.push([key,value]);}else{const sig=stable(value);next.set(key,sig);if(before!==sig)writes.push([key,value]);}};
  for(const [key,value]of Object.entries(stored.answers||{}))put(p+'answer:'+encodeURIComponent(key),{field:'answers',key,value});
  for(const [key,value]of Object.entries(stored.reviewFeedback||{}))put(p+'feedback:'+encodeURIComponent(key),{field:'reviewFeedback',key,value});
  for(let i=0;i<(stored.events||[]).length;i+=64)put(p+'events:'+i,{field:'events',key:i,value:stored.events.slice(i,i+64)});
  for(let i=0;i<(stored.submissionEvidence?.events||[]).length;i+=64)put(p+'evidence-events:'+i,{field:'evidenceEvents',key:i,value:stored.submissionEvidence.events.slice(i,i+64)});
  for(const field of ['notes','reviewNotes','evidence'])for(const [key,value]of Object.entries((field==='evidence'?stored.submissionEvidence?.notes:stored[field])||{}))put(p+field+':'+encodeURIComponent(key),{field,key,value});
  writes.push(['session:'+s.id,{...header(stored),_localFormat:2,questionSnapshot:known.ref}]);
  return {writes,deletes:[...old.keys()].filter(k=>!next.has(k)),commit(){known.persisted=true;known.snapshot=null;tokens.set(s.id,next);for(const[k]of writes){if(k.startsWith('snapshot:'))metrics.snapshotsWritten++;else if(k.startsWith(p+'answer:'))metrics.answerWrites++;else if(k.startsWith(p))metrics.noteWrites++;else if(k.startsWith('session:'))metrics.headerWrites++;}}};
 }
 async function restore(h,{read,rows}){if(h?._localFormat!==2)return h;const ref=h.questionSnapshot,summaries=await read('summary:'+ref);if(!Array.isArray(summaries))throw Error('题面目录缺失，已停止启动');const s={...h,questions:summaries,answers:{},notes:{},_deferredQuestions:true};delete s._localFormat;delete s.questionSnapshot;const next=new Map(),events=[],evidenceEvents=[];
  for(const [storageKey,row]of await rows(prefix(s))){if(row.field==='answers')s.answers[row.key]=row.value;else if(row.field==='events')events.push(row);else if(row.field==='evidenceEvents')evidenceEvents.push(row);else if(row.field==='reviewFeedback')(s.reviewFeedback=s.reviewFeedback||{})[row.key]=row.value;else if(row.field==='evidence'){s.submissionEvidence=s.submissionEvidence||{};(s.submissionEvidence.notes=s.submissionEvidence.notes||{})[row.key]=row.value;}else if(['notes','reviewNotes'].includes(row.field))(s[row.field]=s[row.field]||{})[row.key]=row.value;next.set(storageKey,row.value?.$ink===1?row.value:JSON.stringify(row));}
  s.events=events.sort((a,b)=>Number(a.key)-Number(b.key)).flatMap(x=>x.value);if(s.submissionEvidence)s.submissionEvidence.events=evidenceEvents.sort((a,b)=>Number(a.key)-Number(b.key)).flatMap(x=>x.value);states.set(s,{questions:s.questions,ref,summaries,persisted:true});tokens.set(s.id,next);return s;
 }
 async function hydrate(s,read){if(!s?._deferredQuestions)return s;if(loads.has(s))return loads.get(s);const k=states.get(s);if(!k)throw Error('题面引用未登记');const task=(async()=>{const q=await read('snapshot:'+k.ref);if(!Array.isArray(q)||q.length!==s.questions.length||q.some((v,i)=>v.id!==s.questions[i]?.id))throw Error('原题快照不完整，已停止打开；现有记录保留');s.questions=q;delete s._deferredQuestions;k.questions=q;k.token=questionToken(q);metrics.hydrated++;return s;})().finally(()=>loads.delete(s));loads.set(s,task);return task;}
 function reset(){tokens.clear();}
 function prime(s,rows,stable){if(!tokens.has(s.id))tokens.set(s.id,new Map(rows.map(([k,v])=>[k,v.value?.$ink===1?v.value:stable(v)])));}
 function defer(s){const k=states.get(s);if(!k?.persisted||s._deferredQuestions)return false;s.questions=k.summaries;s._deferredQuestions=true;k.questions=s.questions;k.token=null;return true;}
 return {metrics,plan,restore,hydrate,reset,prime,defer,prefix,isStored:s=>!!states.get(s)?.persisted,needsPrime:s=>!tokens.has(s.id)};
});
