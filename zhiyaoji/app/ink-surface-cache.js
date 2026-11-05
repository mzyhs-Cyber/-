/* Per-question editable ink; shared material ink is scoped by paper + material ID.
 * Persist before eviction. Never use an empty note as a substitute for an unloaded note. */
(function(S){
 'use strict';if(!S?.NoteVault)return;
 const V=S.NoteVault,states=new WeakMap(),prepared=new WeakMap(),LIMIT=6;
 const metrics={loads:0,evictions:0,failures:0,inFlight:0,loadedSurfaces:0,peakLoadedSurfaces:0};
 const C=S.InkSurfaceCache={metrics,limit:LIMIT};
 let activeLoads=0;const loadQueue=[];function pump(){while(activeLoads<2&&loadQueue.length){const job=loadQueue.shift();activeLoads++;Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{activeLoads--;pump();});}}function bounded(work){return new Promise((resolve,reject)=>{loadQueue.push({work,resolve,reject});pump();});}
 const owner=e=>e.s._sourceSession||e.s;
 const live=(e,c)=>!e.disposed&&S.state===c.state&&S.state?.meta?.syncOwnerId===c.account;
 function state(e){let c=states.get(e);if(!c){c={state:S.state,account:S.state?.meta?.syncOwnerId,entries:new Map(),clock:0,timer:0,trimming:null};for(const k of prepared.get(owner(e))||[])c.entries.set(k,{at:0,pending:null,retryAt:0});states.set(e,c);}return c;}
 C.questionKey=e=>'q:'+e.s.questions[e.inkOn&&Number.isInteger(e.noteOwnerIndex)?e.noteOwnerIndex:e.s.index]?.id;
 C.visible=(e,key)=>key.startsWith('m:')||key===C.questionKey(e);
 function protectedKeys(e){const q=e.s.questions[e.inkOn&&Number.isInteger(e.noteOwnerIndex)?e.noteOwnerIndex:e.s.index],out=new Set([q&&'q:'+q.id]);if(q?.materialKey)out.add(S.materialNoteKey(q));if(e.split?.groupIdentity)out.add('m:'+e.split.groupIdentity);for(const v of e.layers?.values?.()||[])if(v.pointer!=null&&v.activeKey)out.add(v.activeKey);return out;}
 function aliases(s,map,key){if(!map||!key.startsWith('m:')||map[key])return;const qs=(s.questions||[]).filter(q=>q.materialKey&&S.materialNoteKey(q)===key),q=qs[0];if(!q)return;const keys=new Set((s.questions||[]).filter(x=>x.materialKey===q.materialKey).map(S.materialNoteKey));const old='m:'+q.materialKey;if(keys.size===1&&map[old])map[key]=JSON.parse(JSON.stringify(map[old]));}
 function maps(e,key){const s=owner(e),values=e.s._review?[s.reviewNotes,s.submissionEvidence?.notes||s.notes,e.s.notes]:[s.notes];const out=[...new Set(values.filter(Boolean))];for(const map of out)aliases(s,map,key);return out;}
 function touch(e,key){const c=state(e);let r=c.entries.get(key);if(!r){r={at:0,pending:null,retryAt:0};c.entries.set(key,r);}r.at=++c.clock;return {c,r};}
 function sample(e,c){const n=[...c.entries.keys()].filter(k=>maps(e,k).some(ns=>ns[k]&&!V.isRef(ns[k]))).length;metrics.loadedSurfaces=n;metrics.peakLoadedSurfaces=Math.max(metrics.peakLoadedSurfaces,n);return n;}
 function repaint(e){if(e.disposed)return;for(const v of e.layers?.values?.()||[]){v.lastGeometry=null;v.invalidate?.();v.refreshLayout?.();}}
 function schedule(e,c){clearTimeout(c.timer);if(!live(e,c))return;c.timer=setTimeout(()=>{c.timer=0;C.trim(e).catch(()=>{});},Math.max(1600,(c.trimRetryAt||0)-Date.now()));c.timer.unref?.();}
 C.ready=function(e,key){if(!V.enabled())return true;const {c,r}=touch(e,key);if(maps(e,key).some(ns=>V.isRef(ns[key]))){if(!r.pending&&Date.now()>=r.retryAt)C.ensure(e,key).catch(()=>{});return false;}sample(e,c);if(c.entries.size>LIMIT)schedule(e,c);return true;};
 C.ensure=function(e,key){if(!V.enabled())return Promise.resolve(true);const {c,r}=touch(e,key);if(r.pending)return r.pending;metrics.inFlight++;
  let changed=false;r.pending=bounded(async()=>{
   if(!live(e,c)||!protectedKeys(e).has(key))return false;
   for(const ns of maps(e,key)){const ref=ns[key];if(!V.isRef(ref))continue;const note=await V.loadNote(ref);if(!live(e,c)||!protectedKeys(e).has(key))return false;if(ns[key]===ref){ns[key]=note;metrics.loads++;changed=true;}}
   r.error=null;r.retryAt=0;return true;
  }).catch(error=>{metrics.failures++;r.retryAt=Date.now()+5000;r.error=error;throw error;}).finally(()=>{r.pending=null;metrics.inFlight--;if(live(e,c)){sample(e,c);schedule(e,c);if(changed)repaint(e);}});return r.pending;
 };
 C.notify=function(e,key){const {r}=touch(e,key);if(Date.now()-(r.notifiedAt||0)<2000)return;r.notifiedAt=Date.now();S.toast(r.error?'笔迹暂未读回：'+r.error.message:'正在读取这一题的笔迹，请稍候再落笔');};
 const token=n=>[n.strokes,n.strokes?.length,n.redo,n.redo?.length,n.events?.length,n.layoutId,n.layoutKey,n.inkHistory];
 const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 function capturePending(e,key){for(const v of e.layers?.values?.()||[]){const fs=[...v.facades?.values()||[]].filter(f=>f.parent?.dataset.noteKey===key);if(fs.some(f=>f.captureJob||f.layoutTimer))return true;}return false;}
 function forget(e,key){e.inkBook?.notes?.delete(key);e.inkBook?.history?.delete(key);for(const v of e.layers?.values?.()||[]){for(const[fk,f]of v.facades||[])if(fk===key||f.parent?.dataset.noteKey===key){f.alive=false;clearTimeout(f.layoutTimer);f.cancelLayoutCapture?.();v.facades.delete(fk);}v.lastGeometry=null;if(v.pointer==null)v.router.geometry=null;v.invalidate?.();} }
 C.trim=function(e){const c=state(e);if(c.trimming)return c.trimming;if(!live(e,c)||S.activeInkPointer||e.submitting||Date.now()<(c.trimRetryAt||0))return Promise.resolve(false);
  c.trimming=(async()=>{let changed=false;for(const [key,r]of [...c.entries].sort((a,b)=>a[1].at-b[1].at)){
   if(sample(e,c)<=LIMIT)break;if(r.pending||protectedKeys(e).has(key)||capturePending(e,key))continue;
   const updates=[];for(const ns of maps(e,key)){const note=ns[key];if(!note||V.isRef(note))continue;const before=token(note),ref=await V.packNote(note);updates.push({ns,note,before,ref});}
   if(!live(e,c)||S.activeInkPointer||e.submitting)break;
   if(protectedKeys(e).has(key)||capturePending(e,key)||updates.some(x=>x.ns[key]!==x.note||!same(x.before,token(x.note))))continue;
   for(const {ns,ref}of updates)ns[key]=ref;forget(e,key);c.entries.delete(key);if(updates.length){metrics.evictions++;changed=true;}
  }if(changed)S.saveSoon?.();return changed;})().catch(error=>{metrics.failures++;c.trimRetryAt=Date.now()+10000;if(!c.trimFailureShown){c.trimFailureShown=true;S.toast('笔迹缓存暂未整理，原笔迹已保留：'+error.message);}throw error;}).finally(()=>{c.trimming=null;if(live(e,c)&&sample(e,c)>LIMIT)schedule(e,c);});return c.trimming;
 };
 C.detach=function(e){const c=states.get(e);if(c)clearTimeout(c.timer);metrics.loadedSurfaces=0;};
 C.initialKeys=function(s,index=s.index||0){const q=s.questions?.[index]||s.questions?.[0],keys=new Set();if(q){keys.add('q:'+q.id);if(q.materialKey)keys.add(S.materialNoteKey(q));}return keys;};
 C.prepareSession=async function(s,fields,index,current=()=>true){
  await V.ready(s);if(!current())return;const busy=s===S.exam?.s&&!S.exam?.disposed||s===S.review?.s&&!S.review?.controller?.disposed;
  if(!busy){const p=await V.packSession(s);if(!current()||s===S.exam?.s&&!S.exam?.disposed||s===S.review?.s&&!S.review?.controller?.disposed)return;s.notes=p.notes;if(p.reviewNotes)s.reviewNotes=p.reviewNotes;if(p.submissionEvidence)s.submissionEvidence=p.submissionEvidence;}
  const keys=C.initialKeys(s,index);for(const field of fields){const ns=field==='submissionEvidence'?s.submissionEvidence?.notes:s[field];for(const k of keys)aliases(s,ns,k);}
  await V.hydrateSession(s,{fields,keys,current});if(current())prepared.set(s,keys);
 };
})(window.Study);
