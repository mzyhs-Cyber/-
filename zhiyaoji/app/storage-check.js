/* Local-only storage investigation. No app startup, sync, credentials or bank. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.StorageCheck=api;api.mount();}})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
const VERSION='storage-s2',MAX_WRITE=16*1024*1024,PROFILE_DB='mzy-study-sync-profiles-v1',PREFIX='zhiyaoji-storage-probe-';
const pause=()=>new Promise(r=>setTimeout(r,0)),clock=()=>performance.now();
function errorInfo(e){return {name:String(e?.name||'Error'),message:String(e?.message||'检测失败').replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+/g,'[redacted]').slice(0,180)};}
function stringBytes(s){let n=2;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c===34||c===92)n+=2;else if(c<=31)n+=c===8||c===9||c===10||c===12||c===13?2:6;else if(c<=127)n++;else if(c<=2047)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){n+=4;i++;}else n+=c>=0xd800&&c<=0xdfff?6:3;}return n;}
// Count serialized bytes without constructing a full JSON string or UTF-8 copy.
async function measure(value,stopped=()=>false,collect=''){let bytes=0,nodes=0,started=clock(),began=started;const ancestors=new WeakSet(),largest=[],components={};const remember=(ordinal,jsonBytes)=>{largest.push({ordinal,jsonBytes});largest.sort((a,b)=>b.jsonBytes-a.jsonBytes);if(largest.length>8)largest.pop();};
 async function tick(){if(stopped())throw Object.assign(Error('检测已停止'),{name:'AbortError'});if(clock()-started>=5){await pause();started=clock();}}
 async function walk(v,array=false,depth=0,section=''){nodes++;await tick();if(v===null){bytes+=4;return;}if(typeof v==='string'){bytes+=2;for(let i=0;i<v.length;){let end=Math.min(v.length,i+8192);if(end<v.length&&v.charCodeAt(end-1)>=0xd800&&v.charCodeAt(end-1)<=0xdbff)end--;bytes+=stringBytes(v.slice(i,end))-2;i=end;await tick();}return;}
  if(typeof v!=='object'){const s=JSON.stringify(v);bytes+=(s===undefined?(array?4:0):s.length);return;}
  if(ancestors.has(v))throw Error('副本存在循环引用');ancestors.add(v);bytes+=2;let count=0;
  if(Array.isArray(v)){for(const x of v){if(count++)bytes++;const start=bytes;await walk(x,true,depth+1,section);if(collect==='snapshot'&&depth===1&&section==='sessions')remember(count,bytes-start);}}
  else for(const k of Object.keys(v)){if(v[k]===undefined||typeof v[k]==='function')continue;if(count++)bytes++;bytes+=stringBytes(k)+1;const start=bytes;await walk(v[k],false,depth+1,depth===0?k:section);const size=bytes-start;if(collect==='cache'&&depth===0)remember(count,size);if(collect==='snapshot'&&(depth===0&&['attempts','conflicts'].includes(k)||depth===2&&section==='sessions'&&['questions','notes','reviewNotes','submissionEvidence'].includes(k)))components[k]=(components[k]||0)+size;}
  ancestors.delete(v);
 }
 await walk(value);return {jsonBytes:bytes,nodes,ms:Math.round(clock()-began),...(collect?{components,largestRecords:largest}:{} )};
}
function openDB(idb,name,probe=false){return new Promise((resolve,reject)=>{let expired=false,missing=false;const req=idb.open(name),timer=setTimeout(()=>{expired=true;reject(Object.assign(Error('打开数据库超时'),{name:'TimeoutError',storageStage:'profile-open'}));},12000);
 req.onupgradeneeded=()=>{if(probe)req.result.createObjectStore('probe');else{missing=true;req.transaction.abort();}};
 req.onsuccess=()=>{clearTimeout(timer);if(expired){req.result.close();return;}const db=req.result;db.onversionchange=()=>db.close();resolve(db);};
 req.onerror=()=>{clearTimeout(timer);reject(missing?Object.assign(Error('当前网址和浏览环境下不存在账号副本库；未创建或修改正式库'),{name:'MissingDatabaseError',storageStage:'profile-open',intentionalAbort:true}):Object.assign(req.error||Error('数据库无法打开'),{storageStage:'profile-open'}));};req.onblocked=()=>{};
});}
async function inventory(idb){if(typeof idb.databases!=='function')return {supported:false};let timer;try{const list=await Promise.race([idb.databases(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Object.assign(Error('数据库目录查询超时'),{name:'TimeoutError'})),3000))]);const known=n=>list.find(x=>x.name===n);return {supported:true,profilePresent:!!known(PROFILE_DB),learningPresent:!!known('mzy-study-clean-v2'),profileVersion:known(PROFILE_DB)?.version||null};}finally{clearTimeout(timer);}}
function contextInfo(){return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,userAgent:navigator.userAgent,standalone:!!navigator.standalone,displayMode:typeof matchMedia==='function'&&matchMedia('(display-mode: standalone)').matches?'standalone':'browser',origin:typeof location==='object'?location.origin:null,protocol:typeof location==='object'?location.protocol:null};}
function read(idb,db,key){return new Promise((resolve,reject)=>{let tx,req,settled=false,result;const timer=setTimeout(()=>finish(Object.assign(Error('读取超时'),{name:'TimeoutError'})),15000);function finish(e){if(settled)return;settled=true;clearTimeout(timer);if(e){try{tx?.abort();}catch{}reject(e);}else resolve(result);}
 try{tx=db.transaction('profiles','readonly');req=tx.objectStore('profiles').get(key);req.onsuccess=()=>result=req.result;tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||req.error);tx.onabort=()=>finish(tx.error||req.error||Error('读取中止'));}catch(e){finish(e);}
});}
function keys(db){return new Promise((resolve,reject)=>{let tx,req,settled=false;const out=[],timer=setTimeout(()=>finish(Object.assign(Error('目录读取超时'),{name:'TimeoutError'})),10000);function finish(e){if(settled)return;settled=true;clearTimeout(timer);if(e){try{tx?.abort();}catch{}reject(e);}else resolve(out);}
 try{if(!db.objectStoreNames.contains('profiles'))throw Object.assign(Error('账号库存在，但缺少profiles对象仓库'),{name:'MissingObjectStoreError'});tx=db.transaction('profiles','readonly');req=tx.objectStore('profiles').openKeyCursor();req.onsuccess=()=>{const c=req.result;if(c){if(out.length>=16){finish(Error('账号副本超过16份，请分批检测'));return;}out.push(c.key);c.continue();}};tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||req.error);tx.onabort=()=>finish(tx.error||Error('目录读取中止'));}catch(e){finish(e);}
});}
function probeWrite(db,value,{key='sample',timeout=15000}={}){return new Promise((resolve,reject)=>{if(!db.name.startsWith(PREFIX)){reject(Error('禁止写入正式数据库'));return;}let tx,req,settled=false;const began=clock(),timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(Object.assign(Error('测试写入超时'),{name:'TimeoutError'}));},timeout);
 function finish(e){if(settled)return;settled=true;clearTimeout(timer);e?reject(e):resolve({ms:Math.round(clock()-began)});}
 try{tx=db.transaction('probe','readwrite');req=tx.objectStore('probe').put(value,key);tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||req.error);tx.onabort=()=>finish(tx.error||req.error||Error('测试事务中止'));}catch(e){finish(e);}
});}
function deleteProbe(idb,name){if(!name.startsWith(PREFIX))return Promise.reject(Error('禁止删除正式数据库'));return new Promise(resolve=>{const r=idb.deleteDatabase(name),timer=setTimeout(()=>resolve(false),3000);r.onsuccess=()=>{clearTimeout(timer);resolve(true);};r.onerror=r.onblocked=()=>{clearTimeout(timer);resolve(false);};});}
async function compare(profile,probe,onRow,stopped){const rows=[],sizes={};let failed=false;
 const emit=r=>{rows.push(r);onRow(r);};
 async function writeTest(stage,value,size){if(stopped()||failed)return;if(size>MAX_WRITE){emit({stage,skipped:true,reason:'超过16MiB单次检测上限，不冒险写入大副本',jsonBytes:size});return;}onRow({stage,starting:true,jsonBytes:size});try{const t=await probeWrite(probe,value);emit({stage,ok:true,jsonBytes:size,...t});await pause();}catch(e){failed=true;emit({stage,ok:false,...errorInfo(e)});}}
 await writeTest('tiny-write',{test:VERSION},64);
 if(failed||stopped())return rows;
 for(const key of Object.keys(profile)){if(stopped())break;try{const s=await measure(profile[key],stopped,key==='objectCache'?'cache':['base','local','pending','shadow'].includes(key)?'snapshot':'');sizes[key]=s.jsonBytes;emit({stage:'size-'+(['base','local','pending','shadow','objectCache'].includes(key)?key:'metadata'),...s});}catch(e){emit({stage:'measure',ok:false,...errorInfo(e)});return rows;}}

 const local=profile.local||profile.base,session=local?.sessions?.[0];
 if(session){const s=await measure(session,stopped);await writeTest('one-session',session,s.jsonBytes);}
 const batch=local?.sessions?.slice(0,5);if(batch?.length){const s=await measure(batch,stopped);await writeTest('five-sessions',batch,s.jsonBytes);}
 const withoutCache={...profile};delete withoutCache.objectCache;const noCache=Object.entries(sizes).filter(([k])=>k!=='objectCache').reduce((n,[k,v])=>n+v+stringBytes(k)+2,2);
 // Test the smaller shape first. All writes reuse one key, not cumulative copies.
 await writeTest('without-transport-cache',withoutCache,noCache);
 const total=Object.entries(sizes).reduce((n,[k,v])=>n+v+stringBytes(k)+2,2);await writeTest('whole-profile',profile,total);
 if(failed)emit({stage:'stopped-after-write-failure',ok:false});return rows;
}
function mount(){if(typeof document==='undefined')return;const $=id=>document.getElementById(id),ui={start:$('start'),stop:$('stop'),out:$('output'),export:$('export'),select:$('profile'),load:$('load'),state:$('status')};if(!ui.start)return;
 let owners=[],busy=false,stopped=false,report={schema:1,version:VERSION,startedAt:null,environment:contextInfo(),steps:[]};
 function save(){try{localStorage.setItem('zhiyaoji-storage-check-last',JSON.stringify(report));}catch{}}
 function row(x){if(x.starting){ui.state.textContent='正在检测：'+x.stage;report.inFlight=x.stage;save();return;}delete report.inFlight;report.steps.push(x);save();const p=document.createElement('li');p.textContent=x.stage+'：'+(x.skipped?'已跳过':x.ok===false?'失败 '+(x.name||''):x.jsonBytes!==undefined?(x.jsonBytes/1048576).toFixed(2)+' MiB':'完成')+(x.ms!==undefined?' · '+x.ms+' ms':'');ui.out.append(p);}
 try{const old=JSON.parse(localStorage.getItem('zhiyaoji-storage-check-last')||'null');if(old){report=old;ui.export.disabled=false;ui.state.textContent=old.inFlight?'上次检测停在 '+old.inFlight+'；可先导出结果':'已有上次检测结果，可直接导出';}}catch{}
 async function basicProbe(){const name=PREFIX+'basic-'+Date.now()+'-'+Math.random().toString(36).slice(2);let db;report.temporaryDatabase=name;save();
  try{row({stage:'basic-probe-open',starting:true});db=await openDB(indexedDB,name,true);row({stage:'basic-probe-open',ok:true});row({stage:'tiny-write',starting:true});row({stage:'tiny-write',ok:true,...await probeWrite(db,{test:VERSION})});
   const value=await new Promise((resolve,reject)=>{const tx=db.transaction('probe','readonly'),req=tx.objectStore('probe').get('sample');let v,settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;try{tx.abort();}catch{}reject(Object.assign(Error('基础读回超时'),{name:'TimeoutError'}));}},10000);req.onsuccess=()=>v=req.result;tx.oncomplete=()=>{if(!settled){settled=true;clearTimeout(timer);resolve(v);}};tx.onerror=tx.onabort=()=>{if(!settled){settled=true;clearTimeout(timer);reject(tx.error||req.error||Error('基础读回失败'));}};});
   row({stage:'tiny-read-back',ok:value?.test===VERSION});
  }catch(e){row({stage:report.inFlight||'basic-probe',ok:false,...errorInfo(e)});}finally{db?.close();report.cleanup={temporaryDatabaseRemoved:await deleteProbe(indexedDB,name)};report.completedAt=new Date().toISOString();save();}
 }
 ui.load.onclick=async()=>{if(busy)return;busy=true;ui.load.disabled=true;ui.start.disabled=true;owners=[];ui.select.replaceChildren();report={schema:1,version:VERSION,startedAt:new Date().toISOString(),environment:contextInfo(),steps:[]};ui.out.replaceChildren();let db,stage='database-inventory';
  try{try{row({stage,ok:true,...await inventory(indexedDB)});}catch(e){row({stage,ok:false,...errorInfo(e)});}
   stage='profile-open';row({stage,starting:true});db=await openDB(indexedDB,PROFILE_DB);row({stage,ok:true});stage='profile-keys';row({stage,starting:true});owners=await keys(db);row({stage,ok:true,count:owners.length});
   owners.forEach((key,i)=>{const option=document.createElement('option');option.value=i;option.textContent=key==='guest'?'未登录副本':'账号副本 '+(i+1);ui.select.append(option);});ui.start.disabled=!owners.length;
   if(!owners.length)await basicProbe();ui.state.textContent=owners.length?'请选择要检测的账号副本':'账号库目录为空，基础存储测试已完成，请导出结果';
  }catch(e){row({stage,ok:false,...errorInfo(e),intentionalAbort:!!e.intentionalAbort});await basicProbe();ui.state.textContent=e.name==='MissingDatabaseError'?'这个浏览环境里没有账号副本库；基础存储测试已完成，请导出结果':'账号库读取失败；基础存储测试已完成，请导出结果';}
  finally{db?.close();ui.load.disabled=false;ui.export.disabled=false;busy=false;delete report.inFlight;save();}
 };
 ui.stop.onclick=()=>{stopped=true;ui.state.textContent='正在停止，等待当前事务结束';};
 ui.start.onclick=async()=>{if(busy||!owners.length)return;busy=true;stopped=false;ui.start.disabled=true;ui.load.disabled=true;ui.stop.disabled=false;ui.out.replaceChildren();report={schema:1,version:VERSION,startedAt:new Date().toISOString(),environment:contextInfo(),directoryChecks:report.steps.filter(x=>['database-inventory','profile-open','profile-keys'].includes(x.stage)),steps:[],profileOrdinal:Number(ui.select.value)+1};let source,temp,name=PREFIX+Date.now()+'-'+Math.random().toString(36).slice(2),value,last=clock(),maxLag=0;
 report.temporaryDatabase=name;save();
 const beat=setInterval(()=>{const now=clock();if(document.visibilityState==='visible')maxLag=Math.max(maxLag,now-last-250);last=now;},250);
 try{if(navigator.storage?.estimate){const s=await navigator.storage.estimate();row({stage:'origin-storage',usage:s.usage,quota:s.quota,ok:true});}source=await openDB(indexedDB,PROFILE_DB);row({stage:'profile-read',starting:true});const began=clock();value=await read(indexedDB,source,owners[Number(ui.select.value)]);source.close();source=null;row({stage:'profile-read',ok:!!value,ms:Math.round(clock()-began)});
  temp=await openDB(indexedDB,name,true);if(value)await compare(value,temp,row,()=>stopped);else{try{row({stage:'tiny-write',ok:true,...await probeWrite(temp,{test:VERSION})});}catch(e){row({stage:'tiny-write',ok:false,...errorInfo(e)});}}
 }catch(e){row({stage:report.inFlight||'investigation',ok:false,...errorInfo(e)});if(!temp&&!stopped){try{temp=await openDB(indexedDB,name,true);row({stage:'tiny-write-after-read-error',ok:true,...await probeWrite(temp,{test:VERSION})});}catch(e2){row({stage:'tiny-write-after-read-error',ok:false,...errorInfo(e2)});}}}
 finally{clearInterval(beat);source?.close();temp?.close();value=null;const removed=await deleteProbe(indexedDB,name);report.cleanup={temporaryDatabaseRemoved:removed};report.maxEventLoopDelayMs=Math.round(Math.max(0,maxLag));report.completedAt=new Date().toISOString();report.stopped=stopped;delete report.inFlight;save();ui.export.disabled=false;ui.start.disabled=false;ui.load.disabled=false;ui.stop.disabled=true;busy=false;ui.state.textContent=stopped?'检测已停止，请导出结果':'检测结束，请导出结果';}};
 ui.export.onclick=()=>{const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='知遥集_存储专项检测_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
}
return {VERSION,MAX_WRITE,PROFILE_DB,PREFIX,measure,openDB,inventory,probeWrite,deleteProbe,compare,mount};
});
