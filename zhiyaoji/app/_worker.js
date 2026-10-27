/* Same-origin Pages API. No credential or learning-data values are logged. */
const encoder=new TextEncoder(),COOKIE='__Host-study_session',DAYS30=2592000000,MAX_CHUNKS=140,CHUNK_CHARS=60000;
const random=n=>[...crypto.getRandomValues(new Uint8Array(n))].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{a=String(a);b=String(b);let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Vary':'Cookie','X-Content-Type-Options':'nosniff',...extra}});
function fail(status,message){throw Object.assign(Error(message),{status});}
function username(value){const name=String(value||'').normalize('NFKC').trim().toLowerCase();if(!/^[\p{L}\p{N}_-]{3,40}$/u.test(name))fail(400,'用户名需为3～40个文字、字母、数字、下划线或短横线');return name;}
function hex(value,n){if(typeof value!=='string'||!new RegExp('^[a-f0-9]{'+n+'}$').test(value))fail(400,'认证或校验数据无效');return value;}
function inspect(value,depth=0){if(depth>60)fail(400,'数据嵌套过深');if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))fail(400,'数据键无效');inspect(value[key],depth+1);}}
async function body(request){const text=await request.text();if(encoder.encode(text).length>300000)fail(413,'单次请求过大');try{const value=JSON.parse(text);inspect(value);return value;}catch(e){if(e.status)throw e;fail(400,'请求格式无效');}}
async function passwordHash(proof,salt){hex(proof,64);const key=await crypto.subtle.importKey('raw',encoder.encode(proof),'PBKDF2',false,['deriveBits']);return [...new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function limited(db,request,type,limit){
 const now=Date.now(),window=Math.floor(now/60000),ip=request.headers.get('cf-connecting-ip')||'unknown';
 const bucket=await digest(type+'|'+ip+'|'+window);
 const row=await db.prepare('INSERT INTO study_rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits').bind(bucket,now+120000).first();
 if(row.hits===1)await db.prepare('DELETE FROM study_rate_limits WHERE expires_at<?').bind(now).run();
 if(row.hits>limit)fail(429,'请求过于频繁，请一分钟后再试');
}
async function userFor(db,request){
 const token=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||!/^[a-f0-9]{64}$/.test(token))fail(401,'请登录刷题账号');
 const hash=await digest(token),row=await db.prepare('SELECT u.id,u.username FROM study_logins l JOIN study_users u ON u.id=l.user_id WHERE l.token_hash=? AND l.expires_at>?').bind(hash,Date.now()).first();
 if(!row)fail(401,'登录已过期，请重新登录');return {...row,tokenHash:hash};
}
async function signIn(db,user){const token=random(32);await db.prepare('DELETE FROM study_logins WHERE expires_at<?').bind(Date.now()).run();await db.prepare('INSERT INTO study_logins(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),user.id,Date.now()+DAYS30).run();return token;}
const cookie=(token,age=2592000)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function validateSnapshot(data){
 if(data?.schema!==3||!Array.isArray(data.sessions)||!Array.isArray(data.attempts)||!data.learning||!Array.isArray(data.aiReviews)||!Array.isArray(data.conflicts))fail(400,'学习快照格式无效');
 if(Object.keys(data).some(k=>!['schema','sessions','attempts','learning','aiReviews','conflicts','deletedSessions'].includes(k))||Object.keys(data.learning).some(k=>k!=='favorites'))fail(400,'同步只接受学习记录，不接受题库、设置或凭据');
 if(data.sessions.length>20000||data.attempts.length>500000)fail(413,'学习记录超过单账号同步上限');
 if(data.deletedSessions!==undefined){if(!data.deletedSessions||Array.isArray(data.deletedSessions)||typeof data.deletedSessions!=='object'||Object.keys(data.deletedSessions).length>20000||Object.entries(data.deletedSessions).some(([k,v])=>!k||k.length>200||!Number.isFinite(v)||v<=0))fail(400,'删除记录标记无效');}
 const ids=new Set();for(const s of data.sessions){if(typeof s.id!=='string'||ids.has(s.id)||!Array.isArray(s.questions)||!s.answers||!s.notes)fail(400,'练习记录结构无效');ids.add(s.id);}
 const keys=new Set();for(const a of data.attempts){if(!a.attemptId||!a.questionId||!a.sessionId)fail(400,'作答记录结构无效');const k=a.sessionId+'\u0000'+a.questionId;if(keys.has(k))fail(400,'同一练习的作答重复');keys.add(k);}
 inspect(data);
}
const schemas=new WeakMap();
async function ensureV2(db){
 if(schemas.has(db))return schemas.get(db);
 const job=initializeV2(db);schemas.set(db,job);try{await job;}catch(e){schemas.delete(db);throw e;}
}
async function initializeV2(db){
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS study_sync2_r2_sizes (user_id TEXT NOT NULL,hash TEXT NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(user_id,hash))'),
  db.prepare('CREATE TABLE IF NOT EXISTS study_sync2_heads (user_id TEXT PRIMARY KEY,rev INTEGER NOT NULL,hash TEXT NOT NULL,previous_hash TEXT,updated_at INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS study_sync2_objects (user_id TEXT NOT NULL,hash TEXT NOT NULL,total INTEGER NOT NULL,ready INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,hash))'),
  db.prepare('CREATE TABLE IF NOT EXISTS study_sync2_parts (user_id TEXT NOT NULL,hash TEXT NOT NULL,idx INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,hash,idx))'),
  db.prepare('CREATE TABLE IF NOT EXISTS study_sync2_gc (user_id TEXT PRIMARY KEY,last_run INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS study_sync2_leases (user_id TEXT NOT NULL,session_id TEXT NOT NULL,device_id TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(user_id,session_id))')
 ]);
}
async function objectV2(db,uid,hash,bucket){
 const object=await db.prepare('SELECT total,ready FROM study_sync2_objects WHERE user_id=? AND hash=?').bind(uid,hash).first();if(!object?.ready)fail(409,'同步对象尚未完整上传');
 let {results:parts}=await db.prepare('SELECT idx,data FROM study_sync2_parts WHERE user_id=? AND hash=? ORDER BY idx').bind(uid,hash).all();if(parts.length!==object.total&&bucket){parts=[];for(let i=0;i<object.total;i++){const part=await bucket.get(uid+'/'+hash+'/'+i);if(!part)fail(409,'R2笔记分片尚未完整上传');parts.push({idx:i,data:await part.text()});}}if(parts.length!==object.total||parts.some((p,i)=>p.idx!==i))fail(409,'同步对象缺少分片');
 const text=parts.map(p=>p.data).join('');if(await digest(text)!==hash)fail(400,'同步对象校验失败');return JSON.parse(text);
}
async function apiV2(request,db,user,url,ctx,bucket){
 await ensureV2(db);const uid=user.id,path=url.pathname,input=request.method==='POST'?await body(request):null;
 if(path==='/api/sync/v2/storage-check'){
  if(!bucket)return json({ok:false,storage:'d1',error:'尚未绑定STUDY_NOTES'},503);const key=uid+'/_probe/'+random(12),text='zhiyaoji-r6-private-probe';try{await bucket.put(key,text);const got=await bucket.get(key);if(!got||await got.text()!==text)fail(503,'R2读回校验失败');return json({ok:true,storage:'r2',private:true});}finally{await bucket.delete(key);}
 }
 if(path==='/api/sync/v2/head')return json(await db.prepare('SELECT rev,hash,updated_at AS updatedAt FROM study_sync2_heads WHERE user_id=?').bind(uid).first()||{rev:0,hash:null});
 if(path==='/api/sync/v2/usage'){const usage=await db.prepare('SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) AS bytes,COUNT(*) AS parts FROM study_sync2_parts WHERE user_id=?').bind(uid).first();const r2=await db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes,COUNT(*) AS objects FROM study_sync2_r2_sizes WHERE user_id=?').bind(uid).first();return json({...usage,bytes:(usage.bytes||0)+(r2.bytes||0),d1Bytes:usage.bytes||0,r2Bytes:r2.bytes||0,r2Objects:r2.objects||0,storage:bucket?'r2':'d1'});}
 if(path==='/api/sync/v2/known'){
  if(!Array.isArray(input.hashes)||!input.hashes.length||input.hashes.length>80)fail(400,'对象列表无效');input.hashes.forEach(h=>hex(h,64));const {results}=await db.prepare('SELECT hash FROM study_sync2_objects WHERE user_id=? AND ready=1 AND hash IN ('+input.hashes.map(()=>'?').join(',')+')').bind(uid,...input.hashes).all();return json({known:results.map(x=>x.hash)});
 }
 if(path==='/api/sync/v2/read'){
  if(!Array.isArray(input.items)||input.items.length>12)fail(400,'读取列表无效');const items=[];for(const p of input.items){hex(p.hash,64);if(!Number.isSafeInteger(p.index)||p.index<0)fail(400,'分片无效');let row=await db.prepare('SELECT p.data,o.total FROM study_sync2_parts p JOIN study_sync2_objects o ON p.user_id=o.user_id AND p.hash=o.hash WHERE p.user_id=? AND p.hash=? AND p.idx=? AND o.ready=1').bind(uid,p.hash,p.index).first();if(!row&&bucket){const o=await db.prepare('SELECT total,ready FROM study_sync2_objects WHERE user_id=? AND hash=?').bind(uid,p.hash).first();if(o?.ready&&p.index<o.total){const part=await bucket.get(uid+'/'+p.hash+'/'+p.index);if(part)row={total:o.total,data:await part.text()};}}if(!row)fail(404,'同步分片不存在');items.push({...p,...row});}return json({items});
 }
 if(path==='/api/sync/v2/put'&&bucket){
  if(!Array.isArray(input.parts)||!input.parts.length||input.parts.length>16)fail(400,'上传列表无效');const groups=new Map();
  for(const p of input.parts){hex(p.hash,64);if(!Number.isSafeInteger(p.total)||p.total<1||p.total>360||!Number.isSafeInteger(p.index)||p.index<0||p.index>=p.total||typeof p.data!=='string'||p.data.length>24000)fail(400,'对象分片无效');
   let g=groups.get(p.hash);if(!g){g={hash:p.hash,total:p.total,parts:new Map()};groups.set(p.hash,g);}if(g.total!==p.total||g.parts.has(p.index)&&g.parts.get(p.index)!==p.data)fail(409,'笔记分片不一致');g.parts.set(p.index,p.data);
  }
  const rows=[...groups.values()],{results}=await db.prepare('SELECT hash,total,ready FROM study_sync2_objects WHERE user_id=? AND hash IN ('+rows.map(()=>'?').join(',')+')').bind(uid,...groups.keys()).all(),existing=new Map(results.map(x=>[x.hash,x]));
  // Validate complete objects before writing. Their request bytes are already
  // the SHA-256 evidence: no write-then-read of every small ink object.
  for(const g of rows){const old=existing.get(g.hash);if(old&&old.total!==g.total)fail(409,'笔记分片总数不一致');if(g.parts.size===g.total){g.text=Array.from({length:g.total},(_,i)=>g.parts.get(i)).join('');if(await digest(g.text)!==g.hash)fail(400,'R2笔记内容校验失败');}}
  let cursor=0,problem;const updates=[];
  async function upload(){while(!problem&&cursor<rows.length){const g=rows[cursor++],old=existing.get(g.hash);if(old?.ready)continue;try{
   for(const [index,data] of g.parts){const key=uid+'/'+g.hash+'/'+index;
    if(g.text===undefined){const part=await bucket.get(key);if(part){if(await part.text()!==data)fail(409,'已保存笔记不能改写');continue;}}
    await bucket.put(key,data,{httpMetadata:{contentType:'application/json; charset=utf-8'}});
   }
   if(!old)updates.push(db.prepare('INSERT OR IGNORE INTO study_sync2_objects(user_id,hash,total,created_at) VALUES(?,?,?,?)').bind(uid,g.hash,g.total,Date.now()));
   let text=g.text;
   if(text===undefined){const parts=[];for(let i=0;i<g.total;i++){if(g.parts.has(i)){parts.push(g.parts.get(i));continue;}const part=await bucket.get(uid+'/'+g.hash+'/'+i);if(!part)break;parts.push(await part.text());}if(parts.length===g.total)text=parts.join('');}
   if(text!==undefined){if(await digest(text)!==g.hash)fail(400,'R2笔记内容校验失败');updates.push(db.prepare('UPDATE study_sync2_objects SET ready=1 WHERE user_id=? AND hash=?').bind(uid,g.hash),db.prepare('INSERT OR IGNORE INTO study_sync2_r2_sizes(user_id,hash,bytes) VALUES(?,?,?)').bind(uid,g.hash,encoder.encode(text).length));}
  }catch(e){problem=e;}}}
  await Promise.all([upload(),upload()]);if(problem)throw problem;if(updates.length)await db.batch(updates);
  return json({ok:true,storage:'r2'});
 }
 if(path==='/api/sync/v2/put'){
  if(!Array.isArray(input.parts)||!input.parts.length||input.parts.length>16)fail(400,'上传列表无效');const touched=new Set();
  for(const p of input.parts){hex(p.hash,64);if(!Number.isSafeInteger(p.total)||p.total<1||p.total>360||!Number.isSafeInteger(p.index)||p.index<0||p.index>=p.total||typeof p.data!=='string'||p.data.length>24000)fail(400,'对象分片无效');
   const old=await db.prepare('SELECT data FROM study_sync2_parts WHERE user_id=? AND hash=? AND idx=?').bind(uid,p.hash,p.index).first();if(old&&old.data!==p.data)fail(409,'已保存分片不能改写');
   await db.batch([db.prepare('INSERT OR IGNORE INTO study_sync2_objects(user_id,hash,total,created_at) VALUES(?,?,?,?)').bind(uid,p.hash,p.total,Date.now()),db.prepare('INSERT OR IGNORE INTO study_sync2_parts(user_id,hash,idx,data) VALUES(?,?,?,?)').bind(uid,p.hash,p.index,p.data)]);touched.add(p.hash);
  }
  for(const hash of touched){const o=await db.prepare('SELECT total,ready FROM study_sync2_objects WHERE user_id=? AND hash=?').bind(uid,hash).first();if(o.ready)continue;const {results:parts}=await db.prepare('SELECT idx,data FROM study_sync2_parts WHERE user_id=? AND hash=? ORDER BY idx').bind(uid,hash).all();if(parts.length===o.total&&parts.every((p,i)=>p.idx===i)){if(await digest(parts.map(p=>p.data).join(''))!==hash)fail(400,'同步内容哈希校验失败');await db.prepare('UPDATE study_sync2_objects SET ready=1 WHERE user_id=? AND hash=?').bind(uid,hash).run();}}
  return json({ok:true});
 }
 if(path==='/api/sync/v2/lease'){
  const sid=String(input.sessionId||''),device=String(input.deviceId||'');if(!sid||sid.length>200||!device||device.length>200)fail(400,'练习设备标识无效');const now=Date.now(),expires=now+180000;
  if(input.release){await db.prepare('DELETE FROM study_sync2_leases WHERE user_id=? AND session_id=? AND device_id=?').bind(uid,sid,device).run();return json({ok:true});}
  const old=await db.prepare('SELECT device_id,expires_at FROM study_sync2_leases WHERE user_id=? AND session_id=?').bind(uid,sid).first();
  if(old&&old.device_id===device&&old.expires_at>now+90000&&!input.takeover)return json({granted:true,expiresAt:old.expires_at});
  if(old&&old.expires_at>now&&old.device_id!==device&&!input.takeover)return json({granted:false,expiresAt:old.expires_at});
  const changed=await db.prepare('INSERT INTO study_sync2_leases(user_id,session_id,device_id,expires_at) VALUES(?,?,?,?) ON CONFLICT(user_id,session_id) DO UPDATE SET device_id=excluded.device_id,expires_at=excluded.expires_at WHERE study_sync2_leases.device_id=excluded.device_id OR study_sync2_leases.expires_at<=? OR ?=1').bind(uid,sid,device,expires,now,input.takeover?1:0).run();return json({granted:changed.meta.changes===1,expiresAt:expires});
 }
 if(path==='/api/sync/v2/commit'){
  const hash=hex(input.hash,64),rev=input.baseRev;if(!Number.isSafeInteger(rev)||rev<0)fail(400,'版本无效');const o=await objectV2(db,uid,hash,bucket),m=o.value;
  if(o.kind!=='root'||m?.protocol!==2||m.schema!==3||!Array.isArray(m.objects)||m.objects.length>100000||!Array.isArray(m.sessions)||m.sessions.length>20000)fail(400,'同步目录无效');
  for(let i=0;i<m.objects.length;i+=2000){const hs=m.objects.slice(i,i+2000);hs.forEach(h=>hex(h,64));const row=await db.prepare('SELECT COUNT(*) AS n FROM study_sync2_objects WHERE user_id=? AND ready=1 AND hash IN (SELECT value FROM json_each(?))').bind(uid,JSON.stringify(hs)).first();if(row.n!==new Set(hs).size)fail(409,'同步目录引用未完整上传的内容');}
  const current=await db.prepare('SELECT rev,hash FROM study_sync2_heads WHERE user_id=?').bind(uid).first();if((current?.rev||0)!==rev)fail(409,'其他设备已更新，请重试合并');let previous=null;if(current)previous=(await objectV2(db,uid,current.hash,bucket)).value;
  if(previous?.depotVersion===1&&m.depotVersion!==1)fail(409,'请更新旧设备页面后再同步笔记，云端原记录已保留');
  const deleted=(await objectV2(db,uid,m.deletedSessions,bucket)).value;if(previous){const old=(await objectV2(db,uid,previous.deletedSessions,bucket)).value;if(Object.keys(old).some(id=>!deleted[id]))fail(409,'不可移除已同步的删除标记');}
  const oldRefs=new Map((previous?.sessions||[]).map(s=>[s.id,s.ref]));const {results:leases}=await db.prepare('SELECT session_id,device_id,expires_at FROM study_sync2_leases WHERE user_id=? AND expires_at>?').bind(uid,Date.now()).all(),leaseMap=new Map(leases.map(l=>[l.session_id,l]));for(const s of m.sessions){if(deleted[s.id])fail(400,'已删除练习不能重新上传');if(oldRefs.get(s.id)!==s.ref){const lease=leaseMap.get(s.id);if(lease&&lease.device_id!==input.deviceId)fail(409,'这份练习已由另一台设备接续，本机版本已保留');}}
  const now=Date.now(),keep=[...new Set([hash,current?.hash,...m.objects,...previous?.objects||[]].filter(Boolean))];
  // Atomic publication checks references again: a concurrent collector can never
  // leave a published root pointing to missing objects. A stale commit retries.
  const refs=JSON.stringify([...new Set([hash,...m.objects])]),valid="(SELECT COUNT(*) FROM study_sync2_objects WHERE user_id=? AND ready=1 AND hash IN (SELECT value FROM json_each(?)))=?";
  const changed=rev===0?await db.prepare('INSERT OR IGNORE INTO study_sync2_heads(user_id,rev,hash,updated_at) SELECT ?,1,?,? WHERE '+valid).bind(uid,hash,now,uid,refs,JSON.parse(refs).length).run():await db.prepare('UPDATE study_sync2_heads SET previous_hash=hash,hash=?,rev=rev+1,updated_at=? WHERE user_id=? AND rev=? AND '+valid).bind(hash,now,uid,rev,uid,refs,JSON.parse(refs).length).run();if(changed.meta.changes!==1)fail(409,'同步引用或版本已变化，请重试');
  // At most one sweep/day/account. Recheck head in the same batch as deletes;
  // retain both complete roots, and leave young/in-flight objects untouched.
  const cleanup=async()=>{
   const last=await db.prepare('SELECT last_run FROM study_sync2_gc WHERE user_id=?').bind(uid).first();if(last&&now-last.last_run<86400000)return;
   const eligible="user_id=? AND created_at<? AND hash NOT IN (SELECT value FROM json_each(?))",victims="SELECT hash FROM (SELECT hash,SUM(total+1) OVER (ORDER BY created_at,hash ROWS UNBOUNDED PRECEDING) AS cost FROM study_sync2_objects WHERE "+eligible+") WHERE cost<=1000",gate="EXISTS (SELECT 1 FROM study_sync2_heads WHERE user_id=? AND hash=?)";
   await db.batch([
    db.prepare('DELETE FROM study_sync2_parts WHERE user_id=? AND hash IN ('+victims+') AND '+gate).bind(uid,uid,now-86400000,JSON.stringify(keep),uid,hash),
    db.prepare('DELETE FROM study_sync2_objects WHERE hash IN ('+victims+') AND user_id=? AND '+gate).bind(uid,now-86400000,JSON.stringify(keep),uid,uid,hash),
    db.prepare('INSERT INTO study_sync2_gc(user_id,last_run) SELECT ?,? WHERE '+gate+' ON CONFLICT(user_id) DO UPDATE SET last_run=excluded.last_run').bind(uid,now,uid,hash)
   ]);
  };
  if(!bucket)ctx?.waitUntil?.(cleanup().catch(()=>{}));return json({rev:rev+1,hash,updatedAt:now});
 }
 fail(404,'增量同步接口不存在');
}
function dailyProvenance(r){
 const section=r.trainingSection?String(r.trainingSection):null,p=r.provenance;
 if(section!=='jiangsu-specific'&&!p)return {};
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('江苏特色补充题必须提供来源核验信息');
 const url=String(p.sourceUrl||'');if(!/^https?:\/\//.test(url))throw Error('补充题缺少可追溯来源链接');
 if(!['真题','机构原创','轻微措辞调整'].includes(p.questionNature))throw Error('补充题必须标明题源性质');
 if(!String(p.jiangsuRelevance||'').trim()||!String(p.selectionReason||'').trim())throw Error('补充题需说明江苏针对性与本次入选理由');
 if(p.questionNature==='轻微措辞调整'&&(!String(p.wordingChanges||'').trim()||!p.originalStemHtml||!Array.isArray(p.originalOptionsHtml)))throw Error('轻微修改题须保留原题与修改说明');
 const v=p.verification||{};if(v.independentSolved!==true||v.answerChecked!==true||v.complete!==true||v.meaningPreserved!==true||v.disputed!==false)throw Error('补充题未完成独立作答、答案及完整性核验，或仍有争议');
 return {trainingSection:section||'jiangsu-specific',provenance:JSON.parse(JSON.stringify(p))};
}
function validateDailyPack(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('题包必须是JSON对象');const date=raw.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('题包必须有有效date日期，例如2026-10-23');if(!Array.isArray(raw.questions)||!raw.questions.length||raw.questions.length>200)throw Error('题包需包含1～200道题');const ids=new Set(),materials=new Map((raw.materials||[]).map(m=>[String(m.id),String(m.html||m.content||'')]));const questions=raw.questions.map((r,i)=>{const id=String(r.id||r.sourceQuestionId||'');if(!id||ids.has(id))throw Error('第'+(i+1)+'题ID缺失或重复');ids.add(id);const stemHtml=String(r.stemHtml||r.stem||''),optionsHtml=r.optionsHtml||r.options,answer=String(r.answer||'').toUpperCase();if(!stemHtml.trim()||!Array.isArray(optionsHtml)||optionsHtml.length<2||optionsHtml.length>8||optionsHtml.some(x=>typeof x!=='string'||!x.trim())||!new RegExp('^[A-'+String.fromCharCode(64+optionsHtml.length)+']$').test(answer))throw Error('第'+(i+1)+'题题干、选项或答案不完整');if(!['政治理论','常识判断','言语理解','数量关系','判断推理','资料分析'].includes(r.subject))throw Error('第'+(i+1)+'题subject专项无效');const materialKey=r.materialKey?String(r.materialKey):null,materialHtml=String(r.materialHtml||materials.get(materialKey)||'');if(materialKey&&!materialHtml.trim())throw Error('第'+(i+1)+'题公共材料缺失');return {...dailyProvenance(r),id,sourceQuestionId:r.sourceQuestionId||id,subject:r.subject,path:Array.isArray(r.path)?r.path.map(String):[],type:String(r.type||''),stemHtml,optionsHtml,answer,explanationHtml:String(r.explanationHtml||r.explanation||''),materialKey,materialHtml,source:String(r.source||''),year:r.year||null,mostWrong:r.mostWrong||null,rate:r.rate??null};});const groups=new Map();for(const q of questions)if(q.materialKey){if(groups.has(q.materialKey)&&groups.get(q.materialKey)!==q.materialHtml)throw Error('同一材料组内容不一致');groups.set(q.materialKey,q.materialHtml);}return {format:'zhiyaoji-daily-v1',date,title:String(raw.title||raw.name||'每日定向训练').slice(0,120),focus:Array.isArray(raw.focus)?raw.focus.map(String).slice(0,12):[],questions};}
async function dailySchema(db){await db.batch([db.prepare('CREATE TABLE IF NOT EXISTS study_daily_packs (user_id TEXT NOT NULL,date TEXT NOT NULL,hash TEXT NOT NULL,title TEXT NOT NULL,count INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,date))'),db.prepare('CREATE TABLE IF NOT EXISTS study_daily_tokens (user_id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,expires_at INTEGER NOT NULL)')]);}
async function dailyApi(request,db,user,url,bucket){
 if(!bucket)fail(503,'每日训练需要现有STUDY_NOTES存储桶绑定');await dailySchema(db);const path=url.pathname;
 if(path==='/api/daily/token'&&request.method==='POST'){const input=await body(request);if(input.revoke){await db.prepare('DELETE FROM study_daily_tokens WHERE user_id=?').bind(user.id).run();return json({ok:true});}const token=random(32),expires=Date.now()+90*86400000;await db.prepare('INSERT INTO study_daily_tokens(user_id,token_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').bind(user.id,await digest(token),expires).run();return json({token,expiresAt:expires,scope:'daily:publish',endpoint:url.origin+'/api/daily/publish'});}
 if(path==='/api/daily/list'&&request.method==='GET'){const {results}=await db.prepare('SELECT date,hash,title,count,updated_at AS updatedAt FROM study_daily_packs WHERE user_id=? ORDER BY date DESC LIMIT 120').bind(user.id).all();return json({packs:results});}
 if(path==='/api/daily/get'&&request.method==='GET'){const date=url.searchParams.get('date');const row=await db.prepare('SELECT hash FROM study_daily_packs WHERE user_id=? AND date=?').bind(user.id,date).first();if(!row)fail(404,'当天题包尚未发布');const object=await bucket.get(user.id+'/_daily/'+row.hash);if(!object)fail(503,'题包暂时无法读取');return json({pack:JSON.parse(await object.text()),hash:row.hash});}
 if(path==='/api/daily/publish'&&request.method==='POST'){const text=await request.text();if(encoder.encode(text).length>2000000)fail(413,'每日题包超过2MB，请使用外部图片地址');let pack;try{const raw=JSON.parse(text);inspect(raw);pack=validateDailyPack(raw);}catch(e){fail(400,e.message||'题包无效');}const payload=JSON.stringify(pack),hash=await digest(payload);await bucket.put(user.id+'/_daily/'+hash,payload,{httpMetadata:{contentType:'application/json; charset=utf-8'}});await db.prepare('INSERT INTO study_daily_packs(user_id,date,hash,title,count,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET hash=excluded.hash,title=excluded.title,count=excluded.count,updated_at=excluded.updated_at').bind(user.id,pack.date,hash,pack.title,pack.questions.length,Date.now()).run();return json({ok:true,date:pack.date,hash,count:pack.questions.length});}
 fail(404,'每日训练接口不存在');
}

// AI access is separately authorized. It cannot mutate learning records.
async function aiSchema(db){await db.prepare('CREATE TABLE IF NOT EXISTS study_ai_tokens (user_id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,expires_at INTEGER NOT NULL)').run();}
async function aiContext(db,user,bucket){
 await ensureV2(db);const head=await db.prepare('SELECT rev,hash,updated_at AS updatedAt FROM study_sync2_heads WHERE user_id=?').bind(user.id).first();
 if(!head)return {head:{rev:0,hash:null},manifest:null};
 const root=await objectV2(db,user.id,head.hash,bucket);if(root.kind!=='root'||root.value?.protocol!==2)fail(409,'学习同步格式不支持，请先在网站完成同步');return {head,manifest:root.value};
}
async function aiRead(db,user,bucket,ref,kind){hex(ref,64);const object=await objectV2(db,user.id,ref,bucket);if(object.kind!==kind)fail(409,'学习对象类型不匹配');return object.value;}
async function aiApi(request,db,user,url,bucket){
 const context=await aiContext(db,user,bucket),m=context.manifest,path=url.pathname;
 if(path==='/api/ai/status')return json({ok:true,username:user.username||null,scopes:['learning:read','daily:publish'],sync:context.head,sessionCount:m?.sessions?.length||0,notesIncluded:false,bankAvailable:false});
 if(!m)fail(409,'该账号尚无已同步的学习记录，请先在网站同步');
 const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||5);
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>10)fail(400,'分页参数无效，limit须为1～10');
 const deleted=await aiRead(db,user,bucket,m.deletedSessions,'deleted'),rows=(m.sessions||[]).filter(r=>!deleted?.[r.id]);
 if(path==='/api/ai/sessions'){
  const ordered=rows.slice().reverse(),items=[];
  for(const r of ordered.slice(offset,offset+limit)){const s=await aiRead(db,user,bucket,r.ref,'session'),d=s.data;items.push({id:r.id,title:d.title,startedAt:d.startedAt,finishedAt:d.finishedAt,finished:d.finished,questionCount:s.questions.length,mode:d.mode,reviewCompletion:d.reviewCompletion?{status:d.reviewCompletion.status,confirmedAt:d.reviewCompletion.confirmedAt,revision:d.reviewCompletion.revision}:null,reviewRevision:d.reviewRevision||0});}
  return json({items,total:rows.length,nextOffset:offset+items.length<rows.length?offset+items.length:null,snapshotHash:context.head.hash,order:'reverse_sync_manifest'});
 }
 if(path==='/api/ai/session'){
  const id=url.searchParams.get('id'),row=rows.find(r=>r.id===id);if(!row)fail(404,'当前账号没有这次练习');
  const s=await aiRead(db,user,bucket,row.ref,'session'),questions=[];for(const ref of s.questions.slice(offset,offset+limit))questions.push(await aiRead(db,user,bucket,ref,'question'));
  const learning=await aiRead(db,user,bucket,m.learning,'learning'),d=s.data,keys=new Set(questions.map(q=>q.id)),favorites=Object.fromEntries(questions.map(q=>[q.id,!!learning.favorites?.[q.id]])),answers=Object.fromEntries(Object.entries(d.answers||{}).filter(([key])=>keys.has(key))),events=(d.events||[]).filter(e=>keys.has(e.questionId)||keys.has(e.qid)||Number.isInteger(e.index)&&e.index>=offset&&e.index<offset+limit),allEvents=d.events||[];
  const reviewFeedback=Object.fromEntries(questions.map(q=>[q.id,d.reviewFeedback?.[q.id]||null])),reviewCompletion=d.reviewCompletion?{status:d.reviewCompletion.status,confirmedAt:d.reviewCompletion.confirmedAt,revision:d.reviewCompletion.revision}:null,reviewConfirmed=d.reviewCompletion?.status==='confirmed'&&d.reviewCompletion.revision===(d.reviewRevision||0)&&d.reviewCompletion.feedbackSignature===JSON.stringify(d.reviewFeedback||{},(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  return json({session:{reviewFeedback,reviewCompletion,reviewConfirmed,reviewRevision:d.reviewRevision||0,learningEligibility:Object.fromEntries(questions.map(q=>[q.id,{excluded:d.reviewFeedback?.[q.id]?.excludeFromLearning===true,feedbackStatus:reviewConfirmed?'confirmed':d.reviewFeedback?'draft':'legacy-unreviewed'}])),id:row.id,title:d.title,startedAt:d.startedAt,finishedAt:d.finishedAt,finished:d.finished,mode:d.mode,elapsed:d.elapsed,answers,favorites,timingSnapshot:d.timingSnapshot||null,questions,events:allEvents.slice(0,500),eventsTotal:allEvents.length,eventsTruncated:allEvents.length>500},total:s.questions.length,nextOffset:offset+questions.length<s.questions.length?offset+questions.length:null,notesIncluded:false,notesAvailable:!!Object.keys(s.evidence?.notes||s.notes||{}).length,snapshotHash:context.head.hash,diagnosticCaution:'排除或未排除只记录行为，不能单独证明词义或选项已掌握。原始用时和排除数据以answers与events为准；reviewFeedback.userCause是本人自述，不是AI已确认诊断。excludeFromLearning为true的本次作答不得用于安排补练或降低掌握状态，未确认反馈待复盘完成后归档。本接口暂不提供笔迹。'});
 }
 fail(404,'AI只读接口不存在');
}

// A review update publishes metadata in the existing graph, never ink objects.
const reviewStable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function reviewKeys(value,allowed,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail(400,label+'包含不允许的字段');}
function reviewFeedback(input,answers){
 reviewKeys(input,Object.keys(answers||{}),'复盘');const out={};
 for(const [id,row]of Object.entries(input)){
  reviewKeys(row,['userCause','excludeFromLearning','exclusionReason','inclusionOverride','updatedAt','causeOrigin'],'复盘反馈');
  if(typeof row.userCause!=='string'||row.userCause.length>5000||typeof row.exclusionReason!=='string'||row.exclusionReason.length>1000||typeof row.excludeFromLearning!=='boolean'||typeof row.inclusionOverride!=='boolean'||row.updatedAt!==undefined&&(!Number.isFinite(row.updatedAt)||row.updatedAt<0)||row.causeOrigin!==undefined&&row.causeOrigin!=='user')fail(400,'复盘反馈格式无效');
  out[id]={...row};
 }return out;
}
function reviewRecord(seed,id){
 reviewKeys(seed,['data','questions','attempts'],'作答补充');
 const fields=['id','title','startedAt','finishedAt','finished','mode','elapsed','answers','events','timeAssessment','typeHistorySnapshot','dailyDate','dailyPackHash','dailyOwner'];
 reviewKeys(seed.data,fields,'练习');
 if(seed.data.id!==id||seed.data.finished!==true||typeof seed.data.title!=='string'||seed.data.title.length>500||!Number.isFinite(seed.data.startedAt)||!Number.isFinite(seed.data.finishedAt)||!Array.isArray(seed.questions)||!seed.questions.length||seed.questions.length>300||!Array.isArray(seed.attempts)||seed.attempts.length>300)fail(400,'作答补充格式无效');
 const qfields=['id','recordId','canonicalId','globalId','externalId','sourceQuestionId','paperId','paperOrder','order','paperTitle','paperType','region','year','paperYear','subject','path','sourcePath','type','tags','stemHtml','optionsHtml','answer','answerConflict','explanationHtml','materialKey','materialHtml','materialExpectedCount','rate','rateSource','source','trainingSection','provenance','classification'];
 const ids=new Set();for(const q of seed.questions){reviewKeys(q,qfields,'题目');if(typeof q.id!=='string'||!q.id||ids.has(q.id)||typeof q.stemHtml!=='string'||!Array.isArray(q.optionsHtml)||q.optionsHtml.length<2||q.optionsHtml.length>8||q.optionsHtml.some(v=>typeof v!=='string'))fail(400,'题目身份或内容无效');ids.add(q.id);}
 reviewKeys(seed.data.answers,[...ids],'作答');for(const a of Object.values(seed.data.answers)){reviewKeys(a,['selected','excluded','marked','favoriteAtAttempt','seconds'],'作答');if(a.seconds!==undefined&&(!Number.isFinite(a.seconds)||a.seconds<0)||a.excluded!==undefined&&!Array.isArray(a.excluded))fail(400,'作答用时或排除无效');}
 const afields=['attemptId','sessionId','sessionIndex','questionId','recordId','canonicalId','paperId','paperOrder','paperTitle','paperType','region','subject','path','tags','year','type','source','stemHtml','optionsHtml','materialHtml','answer','answerConflict','explanationHtml','rate','rateSource','selected','excluded','correct','result','gradingStatus','seconds','finishedAt','favoriteAtAttempt','slowFlag','baselineSeconds','baselineSource','baselineSample','timeAssessment'];
 const seen=new Set();for(const a of seed.attempts){reviewKeys(a,afields,'历史作答');if(a.sessionId!==id||!ids.has(a.questionId)||seen.has(a.questionId)||typeof a.attemptId!=='string'||!a.attemptId)fail(400,'历史作答身份无效');seen.add(a.questionId);}
 // Reject hidden ink structures even inside otherwise valid optional metadata.
 function inkFree(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(['notes','reviewNotes','strokes','layouts','points','$ink','removedStrokes'].includes(k))fail(400,'复盘接口不接受笔迹');inkFree(x);}}inkFree(seed);
 return seed;
}
async function reviewObject(db,uid,kind,value,pending=null){
 const text=reviewStable({kind,value}),hash=await digest(text),parts=[];
 for(let i=0;i<text.length;){let end=Math.min(text.length,i+24000);if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;parts.push(text.slice(i,end));i=end;}
 if(parts.length>360)fail(413,'本条作答记录过大，请缩小练习范围');
 const statements=[db.prepare('INSERT OR IGNORE INTO study_sync2_objects(user_id,hash,total,ready,created_at,last_used) VALUES(?,?,?,0,?,?)').bind(uid,hash,parts.length,Date.now(),Date.now()),...parts.map((data,i)=>db.prepare('INSERT OR IGNORE INTO study_sync2_parts(user_id,hash,idx,data) VALUES(?,?,?,?)').bind(uid,hash,i,data)),db.prepare('UPDATE study_sync2_objects SET ready=1 WHERE user_id=? AND hash=? AND total=? AND (SELECT COUNT(*) FROM study_sync2_parts WHERE user_id=? AND hash=?)=?').bind(uid,hash,parts.length,uid,hash,parts.length)];
 if(pending)pending.push(...statements);else await db.batch(statements);return hash;
}
async function reviewUpload(request,db,user,url,ctx,bucket){
 if(request.method!=='POST')fail(405,'复盘更新只允许POST');
 const text=await request.text();if(encoder.encode(text).length>6000000)fail(413,'无笔迹作答补充超过6MB，请缩小练习范围');
 let input;try{input=JSON.parse(text);inspect(input);}catch(e){if(e.status)throw e;fail(400,'复盘请求格式无效');}
 reviewKeys(input,['ownerId','sessionId','deviceId','reviewFeedback','reviewRevision','record'],'复盘请求');
 if(input.ownerId!==user.id)fail(403,'当前账号已变化，请重新打开复盘');
 const id=input.sessionId;if(typeof id!=='string'||!id||id.length>200||!Number.isSafeInteger(input.reviewRevision)||input.reviewRevision<0||input.reviewRevision>1000000000||typeof input.deviceId!=='string'||input.deviceId.length>200)fail(400,'复盘身份或版本无效');
 if(input.record)reviewRecord(input.record,id);
 await limited(db,request,'review-update',20);await ensureV2(db);
 for(let retry=0;retry<3;retry++){
  const head=await db.prepare('SELECT rev,hash FROM study_sync2_heads WHERE user_id=?').bind(user.id).first()||{rev:0,hash:null};
  let m,oldRow=null;
  if(head.hash){const root=await objectV2(db,user.id,head.hash,bucket);if(root.kind!=='root'||root.value?.protocol!==2||root.value.depotVersion!==1)fail(409,'请先在设置中接续当前账号的旧版作答记录');m=root.value;}
  else{
   const legacy=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_sync_heads'").first();if(legacy&&(await db.prepare('SELECT rev FROM study_sync_heads WHERE user_id=?').bind(user.id).first())?.rev)fail(409,'请先在设置中接续当前账号的旧版作答记录');
   m={protocol:2,schema:3,sessions:[],attempts:[],depotVersion:1,noteFormat:0,hasDeletedSessions:true,objects:[]};
  }
  if(m.deletedSessions){const deleted=await objectV2(db,user.id,m.deletedSessions,bucket);if(deleted.value?.[id])fail(409,'这份练习已删除，不能通过复盘恢复');}
  const slot=m.sessions.find(s=>s.id===id);if(slot){const object=await objectV2(db,user.id,slot.ref,bucket);if(object.kind!=='session')fail(409,'练习记录类型无效');oldRow=object.value;if(oldRow.data?.finished!==true)fail(409,'只能上传已交卷练习的复盘');}
  if(!oldRow&&!input.record)fail(409,'作答记录尚未同步，请补充无笔迹作答记录');
  const now=Date.now(),created=[],pending=[],put=async(kind,value)=>{const hash=await reviewObject(db,user.id,kind,value,pending);created.push(hash);return hash;};
  const seed=!oldRow?input.record:null,feedback=reviewFeedback(input.reviewFeedback,oldRow?.data?.answers||seed.data.answers),revision=Math.max(Number(oldRow?.data?.reviewRevision)||0,input.reviewRevision)+1,completion={version:1,status:'confirmed',confirmedAt:now,revision,feedbackSignature:reviewStable(feedback)};
  const row=oldRow?{...oldRow,data:{...oldRow.data}}:{data:{...seed.data},questions:[],notes:{},reviewNotes:null,evidence:null};
  if(seed){for(const q of seed.questions)row.questions.push(await put('question',q));if(seed.attempts.length){const ref=await put('attempts',seed.attempts.map((data,i)=>({data,question:null,inherited:[],hasSnapshot:false,order:2000000000+i})));m.attempts=[...m.attempts.filter(a=>a.id!==id),{id,ref}];}}
  Object.assign(row.data,{reviewFeedback:feedback,reviewRevision:revision,reviewCompletion:completion,updatedAt:now});
  const sessionRef=await put('session',row);m.sessions=slot?m.sessions.map(s=>s.id===id?{...s,ref:sessionRef,unfinished:false}:s):[...m.sessions,{id,ref:sessionRef,unfinished:false}];
  if(!m.learning)m.learning=await put('learning',{favorites:{}});if(!m.aiReviews)m.aiReviews=await put('ai',[]);if(!m.conflicts)m.conflicts=await put('conflicts',[]);if(!m.deletedSessions)m.deletedSessions=await put('deleted',{});
  m.objects=[...new Set([...(m.objects||[]).filter(h=>h!==slot?.ref),...created])].sort();const root=await put('root',m);await db.batch(pending);
  const commitUrl=new URL('/api/sync/v2/commit',url.origin),commitRequest=new Request(commitUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:root,baseRev:head.rev,deviceId:input.deviceId})});
  try{const result=await apiV2(commitRequest,db,user,commitUrl,ctx,bucket);if(!result.ok)fail(result.status,'复盘提交未成功');const saved=await result.json();return json({ok:true,ownerId:user.id,sessionId:id,reviewFeedback:feedback,reviewRevision:revision,reviewCompletion:completion,hash:saved.hash,rev:saved.rev,notesUploaded:false});}
  catch(e){if(e.status===409&&/版本|引用/.test(e.message)&&retry<2)continue;throw e;}
 }
 fail(409,'其他设备正在更新，请稍后重新上传复盘');
}

async function api(request,env,ctx){
 const url=new URL(request.url),path=url.pathname,db=env.STUDY_SYNC_DB;
 if(path==='/api/account/health'&&request.method==='GET')return json({version:'2.9.18-r8-8-25',reviewUpload:'text-only-v1',syncProtocol:2,noteStorage:env.STUDY_NOTES?'r2':'d1',depotVersion:1,configured:!!db,registrationEnabled:!!env.STUDY_INVITE_CODE});
 if(!db)fail(503,'账号同步服务尚未配置；本机练习与备份仍可使用');
 const origin=request.headers.get('Origin');
 if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'不接受其他网站发起的账号请求');
 if((path.startsWith('/api/ai/')||path==='/api/daily/publish')&&request.headers.get('Authorization')?.startsWith('StudyAI ')){
  const allowed=(request.method==='GET'&&['/api/ai/status','/api/ai/sessions','/api/ai/session'].includes(path))||(request.method==='POST'&&path==='/api/daily/publish');if(!allowed)fail(403,'此授权只允许读取学习记录和发布题包');
  if(request.method==='POST'&&!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'请求必须使用JSON');
  await aiSchema(db);const token=request.headers.get('Authorization').slice(8);hex(token,64);
  const owner=await db.prepare('SELECT t.user_id AS id,u.username FROM study_ai_tokens t JOIN study_users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>?').bind(await digest(token),Date.now()).first();if(!owner)fail(401,'AI连接授权已过期或撤销');await limited(db,request,'ai-connect',100);
  return path==='/api/daily/publish'?dailyApi(request,db,owner,url,env.STUDY_NOTES):aiApi(request,db,owner,url,env.STUDY_NOTES);
 }
 if(path==='/api/daily/publish'&&request.headers.has('Authorization')){if(request.method!=='POST')fail(405,'只允许POST');if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'请求必须使用JSON');await dailySchema(db);const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))fail(401,'上传授权无效');const user=await db.prepare('SELECT user_id AS id FROM study_daily_tokens WHERE token_hash=? AND expires_at>?').bind(await digest(token),Date.now()).first();if(!user)fail(401,'上传授权已失效');await limited(db,request,'daily-publish',20);return dailyApi(request,db,user,url,env.STUDY_NOTES);}
 if(request.method==='POST'&&origin!==url.origin)fail(403,'缺少同源请求标识');
 if(request.method==='POST'&&!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'请求必须使用JSON');
 if(path==='/api/account/start'&&request.method==='POST'){
  await limited(db,request,'start',30);const input=await body(request),name=username(input.username);
  const user=await db.prepare('SELECT client_salt FROM study_users WHERE username=?').bind(name).first();
  return json({salt:user?.client_salt||random(16),iterations:600000});
 }
 if(path==='/api/account/register'&&request.method==='POST'){
  await limited(db,request,'register',5);const input=await body(request),name=username(input.username);
  if(!env.STUDY_INVITE_CODE||!equal(await digest(String(input.invite||'')),await digest(env.STUDY_INVITE_CODE)))fail(403,'注册口令不正确，请使用部署时保存的私人注册口令');
  const salt=hex(input.salt,32),proof=hex(input.proof,64),id=random(16),passwordSalt=random(16),recovery=random(24);
  const existing=await db.prepare('SELECT id FROM study_users WHERE username=?').bind(name).first();if(existing)fail(409,'这个用户名已经注册，请登录');
  try{await db.prepare('INSERT INTO study_users(id,username,client_salt,password_salt,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,name,salt,passwordSalt,await passwordHash(proof,passwordSalt),await digest(recovery),Date.now()).run();}catch{fail(409,'注册未完成，请确认用户名后重试');}
  const token=await signIn(db,{id});return json({user:{id,username:name},recoveryCode:recovery},201,{'Set-Cookie':cookie(token)});
 }
 if(path==='/api/account/login'&&request.method==='POST'){
  await limited(db,request,'login',8);const input=await body(request),name=username(input.username),proof=hex(input.proof,64);
  const user=await db.prepare('SELECT * FROM study_users WHERE username=?').bind(name).first();
  const hash=await passwordHash(proof,user?.password_salt||'00000000000000000000000000000000');
  if(!user||!equal(hash,user.password_hash))fail(401,'用户名或密码不正确');
  const token=await signIn(db,user);return json({user:{id:user.id,username:user.username}},200,{'Set-Cookie':cookie(token)});
 }
 if(path==='/api/account/recover'&&request.method==='POST'){
  await limited(db,request,'recover',5);const input=await body(request),name=username(input.username),proof=hex(input.proof,64),code=hex(input.recoveryCode,48);
  const user=await db.prepare('SELECT * FROM study_users WHERE username=?').bind(name).first();
  if(!user||!equal(await digest(code),user.recovery_hash))fail(401,'用户名或恢复码不正确');
  const salt=random(16),recovery=random(24),hash=await passwordHash(proof,salt);
  const changed=await db.batch([db.prepare('UPDATE study_users SET password_salt=?,password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').bind(salt,hash,await digest(recovery),user.id,user.recovery_hash),db.prepare('DELETE FROM study_logins WHERE user_id=?').bind(user.id)]);
  if(changed[0].meta.changes!==1)fail(409,'恢复码已使用，请重试');
  return json({recoveryCode:recovery,message:'密码已更新，旧设备登录已退出，请重新登录'});
 }
 const user=await userFor(db,request);
 if(path==='/api/ai/token'&&request.method==='POST'){
  await aiSchema(db);const input=await body(request);if(input.revoke){await db.prepare('DELETE FROM study_ai_tokens WHERE user_id=?').bind(user.id).run();return json({ok:true});}
  const token=random(32),expiresAt=Date.now()+90*86400000;await db.prepare('INSERT INTO study_ai_tokens(user_id,token_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').bind(user.id,await digest(token),expiresAt).run();return json({token,expiresAt,scopes:['learning:read','daily:publish']});
 }

 if(path==='/api/review/update')return reviewUpload(request,db,user,url,ctx,env.STUDY_NOTES);
 if(path.startsWith('/api/daily/'))return dailyApi(request,db,user,url,env.STUDY_NOTES);
 if(path==='/api/account/me'&&request.method==='GET')return json({user:{id:user.id,username:user.username}});
 if(path==='/api/account/logout'&&request.method==='POST'){await db.prepare('DELETE FROM study_logins WHERE token_hash=?').bind(user.tokenHash).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
 if(path.startsWith('/api/sync/v2/'))return apiV2(request,db,user,url,ctx,env.STUDY_NOTES);
 if(path.startsWith('/api/sync/')&&request.method==='POST'){
  const table=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_sync2_heads'").first();if(table&&await db.prepare('SELECT hash FROM study_sync2_heads WHERE user_id=?').bind(user.id).first())fail(409,'账号已启用增量同步，请刷新旧设备页面更新后继续；旧记录仍保留');
 }
 if(path==='/api/sync/head'&&request.method==='GET'){const head=await db.prepare('SELECT rev,hash,chunks,updated_at AS updatedAt FROM study_sync_heads WHERE user_id=?').bind(user.id).first();return json(head||{rev:0,hash:null,chunks:0});}
 if(path==='/api/sync/chunk'&&request.method==='GET'){
  const hash=hex(url.searchParams.get('hash'),64),idx=Number(url.searchParams.get('index'));if(!Number.isSafeInteger(idx)||idx<0||idx>=MAX_CHUNKS)fail(400,'分片编号无效');
  const row=await db.prepare('SELECT data,total FROM study_sync_chunks WHERE user_id=? AND hash=? AND idx=?').bind(user.id,hash,idx).first();if(!row)fail(404,'该账号没有此分片');return json(row);
 }
 if(path==='/api/sync/chunk'&&request.method==='POST'){
  const input=await body(request),hash=hex(input.hash,64),idx=input.index,total=input.total;
  if(!Number.isSafeInteger(idx)||!Number.isSafeInteger(total)||idx<0||idx>=total||total<1||total>MAX_CHUNKS||typeof input.data!=='string'||input.data.length>CHUNK_CHARS)fail(400,'同步分片格式无效');
  const head=await db.prepare('SELECT hash FROM study_sync_heads WHERE user_id=?').bind(user.id).first();
  if(head?.hash===hash){const existing=await db.prepare('SELECT data,total FROM study_sync_chunks WHERE user_id=? AND hash=? AND idx=?').bind(user.id,hash,idx).first();if(existing?.data!==input.data||existing?.total!==total)fail(409,'已提交的快照不可改写');return json({ok:true});}
  const sealed=await db.prepare("SELECT state FROM study_sync_uploads WHERE user_id=? AND hash=? AND state='committed'").bind(user.id,hash).first();
  if(sealed){const row=await db.prepare('SELECT data,total FROM study_sync_chunks WHERE user_id=? AND hash=? AND idx=?').bind(user.id,hash,idx).first();if(row?.data!==input.data||row?.total!==total)fail(409,'已封存的同步分片不可改写');return json({ok:true});}
  await db.prepare("INSERT INTO study_sync_uploads(user_id,hash,state,updated_at) VALUES(?,?,'uploading',?) ON CONFLICT(user_id,hash) DO UPDATE SET updated_at=excluded.updated_at").bind(user.id,hash,Date.now()).run();
  await db.prepare('INSERT INTO study_sync_chunks(user_id,hash,idx,total,data,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,hash,idx) DO UPDATE SET data=excluded.data,total=excluded.total,created_at=excluded.created_at').bind(user.id,hash,idx,total,input.data,Date.now()).run();return json({ok:true});
 }
 if(path==='/api/sync/commit'&&request.method==='POST'){
  const input=await body(request),hash=hex(input.hash,64),rev=input.baseRev,total=input.total;
  if(!Number.isSafeInteger(rev)||rev<0||!Number.isSafeInteger(total)||total<1||total>MAX_CHUNKS)fail(400,'提交版本无效');
  const {results:parts}=await db.prepare('SELECT idx,total,data FROM study_sync_chunks WHERE user_id=? AND hash=? ORDER BY idx').bind(user.id,hash).all();
  if(parts.length!==total||parts.some((p,i)=>p.idx!==i||p.total!==total))fail(409,'学习记录分片尚未完整上传');
  const text=parts.map(p=>p.data).join('');if(await digest(text)!==hash)fail(400,'学习记录校验失败');
  let snapshot;try{snapshot=JSON.parse(text);}catch{fail(400,'学习记录格式无效');}validateSnapshot(snapshot);
  // An older tab must not erase deletion markers it does not understand.
  const current=await db.prepare('SELECT rev,hash FROM study_sync_heads WHERE user_id=?').bind(user.id).first();
  if(current&&current.rev!==rev)fail(409,'其他设备已更新，请合并后重试');
  if(current){const {results:previousParts}=await db.prepare('SELECT idx,total,data FROM study_sync_chunks WHERE user_id=? AND hash=? ORDER BY idx').bind(user.id,current.hash).all();let previous;try{previous=JSON.parse(previousParts.map(p=>p.data).join(''));}catch{fail(503,'云端旧记录校验未完成，未覆盖记录');}
   if(Object.keys(previous.deletedSessions||{}).some(id=>!snapshot.deletedSessions?.[id]))fail(400,'当前页面版本不支持已同步的删除标记，请刷新更新后同步');
  }
  if(snapshot.sessions.some(s=>snapshot.deletedSessions?.[s.id])||snapshot.attempts.some(a=>snapshot.deletedSessions?.[a.sessionId]))fail(400,'删除记录与学习内容不一致，请刷新后同步');
  const now=Date.now();let changed;
  if(rev===0)changed=await db.prepare('INSERT INTO study_sync_heads(user_id,rev,hash,chunks,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(user.id,hash,total,now).run();
  else changed=await db.prepare('UPDATE study_sync_heads SET rev=rev+1,previous_hash=hash,hash=?,chunks=?,updated_at=? WHERE user_id=? AND rev=?').bind(hash,total,now,user.id,rev).run();
  if(changed.meta.changes!==1)fail(409,'其他设备已更新，请合并后重试');
  await db.prepare("UPDATE study_sync_uploads SET state='committed',updated_at=? WHERE user_id=? AND hash=?").bind(now,user.id,hash).run();
  // The active snapshot contains ALL history. Retain one previous snapshot without
  // storing a full duplicate of the entire notebook on every background sync.
  const cleanup=async()=>{await db.prepare("DELETE FROM study_sync_chunks WHERE user_id=? AND hash IN (SELECT hash FROM study_sync_uploads WHERE user_id=? AND (state='committed' OR updated_at<?)) AND hash NOT IN (SELECT hash FROM study_sync_heads WHERE user_id=? UNION SELECT previous_hash FROM study_sync_heads WHERE user_id=? AND previous_hash IS NOT NULL)").bind(user.id,user.id,now-86400000,user.id,user.id).run();await db.prepare('DELETE FROM study_sync_uploads WHERE user_id=? AND hash NOT IN (SELECT hash FROM study_sync_chunks WHERE user_id=?)').bind(user.id,user.id).run();};
  if(!env.STUDY_NOTES)ctx?.waitUntil?.(cleanup().catch(()=>{}));
  return json({rev:rev+1,hash,chunks:total,updatedAt:now});
 }
 fail(404,'接口不存在');
}
// Public raster images only; isolated from account, D1, R2 and learning routes.
function allowedStudyImage(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const raster=/\.(?:png|jpe?g|gif|webp|avif)$/i;
  const ok=(['fb.fbstatic.cn','fb.fenbike.cn'].includes(u.hostname)&&(u.pathname==='/api/planet/accessories/formulas'||raster.test(u.pathname)))||(u.hostname==='jiangsu-study-bank-mzy.pages.dev'&&/^\/bank\/assets\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|avif)$/i.test(u.pathname));
  if(!ok)return null;u.hash='';return u;
 }catch{return null;}
}
function studyRasterBytes(b,mime){
 if(mime==='image/png')return b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
 if(mime==='image/jpeg')return b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;
 const text=(a,z)=>String.fromCharCode(...b.subarray(a,z));
 if(mime==='image/gif')return b.length>=6&&['GIF87a','GIF89a'].includes(text(0,6));
 if(mime==='image/webp')return b.length>=12&&text(0,4)==='RIFF'&&text(8,12)==='WEBP';
 if(mime==='image/avif')return b.length>=12&&text(4,8)==='ftyp'&&/avif|avis/.test(text(8,Math.min(b.length,40)));
 return false;
}
async function studyImageRoute(request,ctx){
 const fail=(message,status)=>new Response(message,{status,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='GET')return fail('Method not allowed',405);
 const raw=new URL(request.url).searchParams.get('url');if(!raw||raw.length>4096)return fail('Unsupported image source',400);
 const source=allowedStudyImage(raw);if(!source)return fail('Unsupported image source',400);
 const key=new URL(request.url);key.search='';key.searchParams.set('url',source.href);const cacheKey=new Request(key.href);let cache;
 try{cache=globalThis.caches?.default;const hit=await cache?.match(cacheKey);if(hit)return hit;}catch{}
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6000);
 try{
  const r=await fetch(source.href,{signal:abort.signal,redirect:'manual',credentials:'omit',headers:{Accept:'image/png,image/jpeg,image/webp,image/gif,image/avif'}});
  const mime=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!r.ok||!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mime))throw Error('Invalid raster response');
  const max=12*1024*1024;if(Number(r.headers.get('content-length'))>max)throw Error('Image too large');
  const reader=r.body?.getReader();if(!reader)throw Error('Missing image');const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('Image too large');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}
  if(!studyRasterBytes(bytes,mime))throw Error('Invalid raster bytes');
  const response=new Response(bytes,{headers:{'Content-Type':mime,'Content-Length':String(size),'Cache-Control':'public, max-age=2592000','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Study-Image-Bytes':String(size)}});
  if(cache){const job=cache.put(cacheKey,response.clone()).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(job);else await job;}
  return response;
 }catch{return fail('Image temporarily unavailable',502);}finally{clearTimeout(timer);}
}


export default {async fetch(request,env,ctx){
 if(new URL(request.url).pathname==='/api/media/image')return studyImageRoute(request,ctx);
 if(!new URL(request.url).pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 try{return await api(request,env,ctx);}catch(e){const quota=/quota|daily|rows written|limit exceeded/i.test(String(e.message));return json({error:e.status?e.message:quota?'云端额度暂时不足；本机数据已保留，额度恢复后重试':'同步服务暂时不可用；本机数据仍保留'},e.status||503);}
}};
