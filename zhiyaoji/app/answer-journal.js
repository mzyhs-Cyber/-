/* Answers have their own commit path. Never serialize ink or await the main
   save queue here. The small synchronous journal covers a pending IDB commit. */
(function(S){
 'use strict';if(!S||!globalThis.indexedDB)return;
 const DB='zhiyaoji-answer-journal-v1',PREFIX='zhiyaoji-answer-v1:',bindings=new WeakMap();
 const client=globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random();
 let db,opening,ticket=0;
 const owner=()=>S.state?.meta?.syncOwnerId||'guest',key=(o,id)=>PREFIX+encodeURIComponent(o)+':'+id;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const ids=s=>(s.questions||[]).map(q=>q.id),sameIds=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 const valid=(p,o,id)=>p?.version===1&&p.owner===o&&typeof p.id==='string'&&p.id===id&&Number.isSafeInteger(p.seq)&&p.seq>0&&Number.isFinite(p.at)&&p.at>0&&Array.isArray(p.ids)&&p.ids.length>0&&p.ids.every(x=>typeof x==='string'&&x.length>0)&&new Set(p.ids).size===p.ids.length&&p.answers&&typeof p.answers==='object'&&!Array.isArray(p.answers)&&p.ids.every(q=>{const a=p.answers[q];return a&&Object.hasOwn(p.answers,q)&&(a.selected===null||typeof a.selected==='string'&&a.selected.length>0&&a.selected.length<=32)&&(a.excluded===undefined||Array.isArray(a.excluded)&&a.excluded.every(x=>typeof x==='string'));});
 function wal(k){try{const p=JSON.parse(localStorage.getItem(k)||'null');return p;}catch{return null;}}
 function reset(d){if(db===d)db=null;try{d?.close();}catch{}}
 async function open(){
  if(db)return db;if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   let done=false;const req=indexedDB.open(DB,1),timer=setTimeout(()=>finish(Object.assign(Error('答题卡保护连接超时'),{name:'TimeoutError'})),3000);
   function finish(e,d){if(done){d?.close();return;}done=true;clearTimeout(timer);e?reject(e):resolve(d);}
   req.onupgradeneeded=()=>{for(const n of ['seeds','progress'])if(!req.result.objectStoreNames.contains(n))req.result.createObjectStore(n);};
   req.onerror=()=>finish(req.error||Error('答题卡保护连接失败'));req.onblocked=()=>finish(Error('答题卡保护被其他旧页面占用'));
   req.onsuccess=()=>{const d=req.result;if(done){d.close();return;}db=d;d.onclose=()=>{if(db===d)db=null;};d.onversionchange=()=>reset(d);finish(null,d);};
  }).finally(()=>opening=null);return opening;
 }
 async function transaction(names,mode,work){
  const d=await open();return new Promise((resolve,reject)=>{
   let tx,done=false,result;const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(Object.assign(Error('答题卡独立保存超时'),{name:'TimeoutError'}));},3000);
   function finish(e){if(done)return;done=true;clearTimeout(timer);if(e){reset(d);reject(e);}else resolve(result);}
   try{tx=d.transaction(names,mode);tx.oncomplete=()=>finish();tx.onerror=tx.onabort=()=>finish(tx.error||Error('答题卡独立保存失败'));work(tx,v=>result=v);}catch(e){finish(e);}
  });
 }
 const get=(name,k)=>transaction([name],'readonly',(tx,set)=>{const req=tx.objectStore(name).get(k);req.onsuccess=()=>set(req.result);});
 const all=name=>transaction([name],'readonly',(tx,set)=>{const req=tx.objectStore(name).getAll();req.onsuccess=()=>set(req.result);});
 function notice(s,text,canExport=false){
  const e=S.exam;if(!e||e.disposed||e.s!==s)return;
  let n=e.root.querySelector('.answer-save-status');if(!text){n?.remove();return;}
  if(!n){n=document.createElement('div');n.className='answer-save-status';n.setAttribute('role','status');e.root.append(n);}
  const key=JSON.stringify([text,canExport]);if(n.dataset.noticeKey===key)return;n.dataset.noticeKey=key;
  n.replaceChildren(document.createTextNode(text));
  if(canExport){const b=document.createElement('button');b.type='button';b.textContent='导出答题卡';b.onclick=()=>S.exportAnswerCard(s);n.append(b);}
 }
 function report(s,b,kind,text='',canExport=false){b.noticeKind=kind;notice(s,text,canExport);}
 function selected(s){return Object.fromEntries(ids(s).map(id=>{const a=s.answers?.[id]||{};return [id,{selected:a.selected??null,excluded:[...(a.excluded||[])],marked:!!a.marked,seconds:Number(a.seconds)||0}];}));}
 const signature=s=>JSON.stringify(ids(s).map(id=>{const a=s.answers?.[id];return [a?.selected??null,a?.excluded||[],!!a?.marked];}));
 function apply(s,p,o){
  if(s.finished||!valid(p,o,s.id)||!sameIds(ids(s),p.ids)||p.seq<=Number(s.answerJournalRevision||0))return false;
  if(Number(s.updatedAt)>Number(p.at))return false;
  for(const id of p.ids){const a=p.answers[id];if(!a||!(a.selected===null||typeof a.selected==='string'&&a.selected.length<=32))return false;}
  for(const id of p.ids)s.answers[id]={...(s.answers[id]||{}),...clone(p.answers[id])};
  for(const field of ['index','elapsed','remaining','deadline','paused','pauseReason','clockVersion','positions','workspace'])if(p[field]!==undefined)s[field]=clone(p[field]);
  s.index=Math.max(0,Math.min(s.questions.length-1,Number(s.index)||0));s.answerJournalRevision=p.seq;S.answerJournal.metrics.restored++;
  S.touchSession?.(s);return true;
 }
 async function latest(o,id,expectedIds){
  const k=key(o,id),a=wal(k);let b;try{b=await get('progress',k);}catch{}
  return [a,b].filter(p=>valid(p,o,id)&&(!expectedIds||sameIds(p.ids,expectedIds))).sort((x,y)=>y.seq-x.seq)[0];
 }
 async function seed(s,o){
  const k=key(o,s.id),existing=await get('seeds',k);
  if(existing?.owner===o&&existing.id===s.id&&sameIds(ids(existing.session),ids(s)))return;
  const fields=['id','title','mode','startedAt','updatedAt','questions','answers','index','elapsed','remaining','duration','deadline','timed','paused','pauseReason','clockVersion','paperId','paperTitle','moduleSubject','filter','dailyPackHash','dailyDate','dailyOwner','selectionMode','difficultyRange','blueprint','sourceQuestionId','positions','workspace','answerJournalRevision'];
  const session={notes:{},finished:false,finishedAt:null};for(const f of fields)if(s[f]!==undefined)session[f]=clone(s[f]);
  await transaction(['seeds'],'readwrite',tx=>tx.objectStore('seeds').put({version:1,owner:o,id:s.id,session},k));
 }
 async function drain(s,b){
  if(b.writing)return;b.writing=true;
  try{while(b.queued){
   const {p,synchronous}=b.queued;b.queued=null;S.answerJournal.metrics.queued--;S.answerJournal.metrics.inFlight++;let saved=false,conflict=false;
   try{await transaction(['progress'],'readwrite',tx=>{const store=tx.objectStore('progress'),req=store.get(key(b.owner,s.id));req.onsuccess=()=>{const previous=req.result,usable=valid(previous,b.owner,s.id);if(usable&&previous.seq>=p.seq&&previous.client!==p.client){conflict=true;return;}if(!usable||Number(previous.seq)<p.seq)store.put(p,key(b.owner,s.id));};});if(conflict)S.answerJournal.metrics.failures++;else{saved=true;S.answerJournal.metrics.committed++;}}
   catch{S.answerJournal.metrics.failures++;}
   finally{S.answerJournal.metrics.inFlight--;}
   if(conflict){if(bindings.get(s)===b)report(s,b,'conflict','另一页面更新了答题卡，请重新打开本场练习',true);if(b.queued){b.queued=null;S.answerJournal.metrics.queued--;}for(const w of b.waiters)w.resolve(false);b.waiters=[];return;}
   if(bindings.get(s)===b&&b.seq===p.seq&&b.noticeKind!=='conflict'&&b.owner===owner()){
    clearTimeout(b.noticeTimer);b.idbFailed=!saved;
    if(saved)report(s,b,null);
    else if(!synchronous){b.signature=null;report(s,b,'unsaved','答题卡尚未保存，请立即导出',true);}
    else report(s,b,'degraded','答题卡已本机备份，独立落库未完成',true);
   }
   const settled=b.waiters.filter(w=>w.seq<=p.seq);b.waiters=b.waiters.filter(w=>w.seq>p.seq);
   for(const w of settled)w.resolve(saved||w.synchronous);
  }}finally{b.writing=false;}
 }
 function capture(s,force=false){
  const b=bindings.get(s);if(!b||s.finished||s._review||b.owner!==owner()||!S.state.sessions.includes(s))return Promise.resolve(false);
  const sig=signature(s);if(!force&&sig===b.signature&&Date.now()-(b.at||0)<5000)return b.pending||Promise.resolve(false);
  const k=key(b.owner,s.id),previous=wal(k),previousValid=valid(previous,b.owner,s.id);
  if(b.noticeKind==='conflict'||previousValid&&previous.client!==client&&previous.seq>b.seq){report(s,b,'conflict','另一页面更新了答题卡，请重新打开本场练习',true);return Promise.resolve(false);}
  const previousSeq=previousValid?previous.seq:0;
  const seq=Math.max(Date.now(),b.seq,Number(s.answerJournalRevision)||0,previousSeq)+1;
  const p={version:1,owner:b.owner,id:s.id,client,seq,at:Date.now(),ids:ids(s),answers:selected(s)};
  for(const f of ['index','elapsed','remaining','deadline','paused','pauseReason','clockVersion','positions','workspace'])if(s[f]!==undefined)p[f]=clone(s[f]);
  let synchronous=false;try{localStorage.setItem(k,JSON.stringify(p));synchronous=true;}catch{}
  b.seq=seq;b.at=p.at;b.signature=sig;b.last=p;s.answerJournalRevision=seq;S.touchSession?.(s);S.answerJournal.metrics.requests++;
  clearTimeout(b.noticeTimer);
  if(!synchronous){
   if(!b.noticeKind)b.noticeTimer=setTimeout(()=>{if(bindings.get(s)===b&&b.owner===owner()&&b.seq===seq&&!b.noticeKind)report(s,b,'saving','答题卡正在保存，请先别退出',true);},300);
  }else if(b.noticeKind==='unsaved'||b.noticeKind==='saving'){
   if(b.idbFailed)report(s,b,'degraded','答题卡已本机备份，独立落库未完成',true);else report(s,b,null);
  }
  if(b.queued)S.answerJournal.metrics.coalesced++;else S.answerJournal.metrics.queued++;
  b.queued={p,synchronous};b.waiters=b.waiters||[];
  const task=new Promise(resolve=>b.waiters.push({seq,synchronous,resolve}));b.pending=task;drain(s,b);return task;
 }
 S.answerJournal={version:1,metrics:{requests:0,committed:0,failures:0,restored:0,inFlight:0,queued:0,coalesced:0},capture,pending:s=>bindings.get(s)?.pending||Promise.resolve(),database:DB};
 S.exportAnswerCard=function(s=S.exam?.s){if(!s)return;const b=bindings.get(s),p=b?.last||{version:1,owner:owner(),id:s.id,ids:ids(s),answers:selected(s)};S.download('知遥集_答题卡备份_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({backupType:'answer-card-v1',...p},null,2));};
 const openStore=S.openStore;
 S.openStore=async function(...args){
  const value=await openStore.apply(this,args);if(!value)return value;const o=value.meta?.syncOwnerId||'guest';
  let progress=[];try{progress=await all('progress');}catch{}
  const candidates=new Map();function add(p){if(!valid(p,o,p?.id))return;if(!candidates.has(p.id))candidates.set(p.id,[]);candidates.get(p.id).push(p);}
  for(const p of progress)add(p);
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(PREFIX))add(wal(k));}}catch{}
  const deleted=value.meta?.deletedSessions||{},sessions=value.sessions||(value.sessions=[]),preferred=value.lastSessionId;let recoveredLast=null;
  for(const [id,rows]of candidates){
   if(deleted[id])continue;const existing=sessions.find(s=>s.id===id);if(existing?.finished)continue;let item;
   if(!existing)try{item=await get('seeds',key(o,id));}catch{}
   for(const p of rows.sort((a,b)=>b.seq-a.seq)){
    let s=existing;
    if(!s){if(item?.owner!==o||item.id!==id||!item.session||!sameIds(ids(item.session),p.ids))continue;s=clone(item.session);s.answerOnlyRecovery=true;}
    if(apply(s,p,o)){if(!existing)sessions.push(s);if(!recoveredLast||Number(p.at)>recoveredLast.at)recoveredLast={id:s.id,at:Number(p.at)||0};S.storageRecoveryNotice=s.answerOnlyRecovery?'已从独立备份恢复答题卡，笔迹需单独核对':'已恢复本机答题卡';break;}
   }
  }
  if(recoveredLast&&!sessions.some(s=>s.id===preferred&&!s.finished))value.lastSessionId=recoveredLast.id;
  return value;
 };
 const openExam=S.openExamBeforeAnswerJournal||S.openExam;
 S.openExam=async function(s,...args){
  if(!s||s._review||s.finished)return openExam.call(this,s,...args);
  const id=++ticket,o=owner();
  try{
   const p=await latest(o,s.id,ids(s));if(p)apply(s,p,o);await seed(s,o);
   if(id!==ticket||o!==owner()||!S.state.sessions.includes(s))return;
   bindings.set(s,{owner:o,seq:Math.max(Number(s.answerJournalRevision)||0,Number(p?.seq)||0),signature:null});
   const ready=await capture(s,true);
   if(id!==ticket||o!==owner()||!S.state.sessions.includes(s))return;
   if(!ready)throw Error('答题卡暂时无法保存');return openExam.call(this,s,...args);
  }catch(e){S.toast('答题卡保护未建立，练习暂未打开：'+e.message);}
 };
 const resume=S.resumeSession;
 S.resumeSession=async function(id,...args){
  const s=S.state.sessions.find(s=>s.id===id);if(!s||s.finished)return resume.call(this,id,...args);
  const n=++ticket,o=owner(),p=await latest(o,id,ids(s));
  if(n!==ticket||o!==owner())return;if(p)apply(s,p,o);
  return resume.call(this,id,...args);
 };
 const go=S.go;S.go=function(...args){ticket++;return go.apply(this,args);};
 for(const name of ['saveSoon','saveHot']){const original=S[name];S[name]=function(...args){const e=S.exam;if(e&&!e.disposed)capture(e.s);return original.apply(this,args);};}
 for(const name of ['pagehide','visibilitychange'])window.addEventListener(name,()=>{if(name==='pagehide'||document.hidden){const e=S.exam;if(e&&!e.disposed)capture(e.s,true);}});
})(window.Study);
