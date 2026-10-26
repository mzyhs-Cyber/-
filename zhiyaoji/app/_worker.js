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
async function ensureV2(db){
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
  if(!Array.isArray(input.parts)||!input.parts.length||input.parts.length>16)fail(400,'上传列表无效');const touched=new Set();
  for(const p of input.parts){hex(p.hash,64);if(!Number.isSafeInteger(p.total)||p.total<1||p.total>360||!Number.isSafeInteger(p.index)||p.index<0||p.index>=p.total||typeof p.data!=='string'||p.data.length>24000)fail(400,'对象分片无效');
   const old=await db.prepare('SELECT total,ready FROM study_sync2_objects WHERE user_id=? AND hash=?').bind(uid,p.hash).first();if(old&&old.total!==p.total)fail(409,'笔记分片总数不一致');if(old?.ready)continue;
   const key=uid+'/'+p.hash+'/'+p.index,part=await bucket.get(key);if(part&&await part.text()!==p.data)fail(409,'已保存笔记不能改写');
   if(!part)await bucket.put(key,p.data,{httpMetadata:{contentType:'application/json; charset=utf-8'}});
   if(!old)await db.prepare('INSERT OR IGNORE INTO study_sync2_objects(user_id,hash,total,created_at) VALUES(?,?,?,?)').bind(uid,p.hash,p.total,Date.now()).run();touched.add(p.hash);
  }
  for(const h of touched){const o=await db.prepare('SELECT total,ready FROM study_sync2_objects WHERE user_id=? AND hash=?').bind(uid,h).first();if(o.ready)continue;const parts=[];for(let i=0;i<o.total;i++){const r=await bucket.get(uid+'/'+h+'/'+i);if(!r)break;parts.push(await r.text());}if(parts.length===o.total){if(await digest(parts.join(''))!==h)fail(400,'R2笔记内容校验失败');await db.batch([db.prepare('UPDATE study_sync2_objects SET ready=1 WHERE user_id=? AND hash=?').bind(uid,h),db.prepare('INSERT OR IGNORE INTO study_sync2_r2_sizes(user_id,hash,bytes) VALUES(?,?,?)').bind(uid,h,encoder.encode(parts.join('')).length)]);}}
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
async function api(request,env,ctx){
 const url=new URL(request.url),path=url.pathname,db=env.STUDY_SYNC_DB;
 if(path==='/api/account/health'&&request.method==='GET')return json({version:'2.9.18-r6',syncProtocol:2,noteStorage:env.STUDY_NOTES?'r2':'d1',depotVersion:1,configured:!!db,registrationEnabled:!!env.STUDY_INVITE_CODE});
 if(!db)fail(503,'账号同步服务尚未配置；本机练习与备份仍可使用');
 const origin=request.headers.get('Origin');
 if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'不接受其他网站发起的账号请求');
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
  if(!bucket)ctx?.waitUntil?.(cleanup().catch(()=>{}));
  return json({rev:rev+1,hash,chunks:total,updatedAt:now});
 }
 fail(404,'接口不存在');
}
export default {async fetch(request,env,ctx){
 if(!new URL(request.url).pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 try{return await api(request,env,ctx);}catch(e){const quota=/quota|daily|rows written|limit exceeded/i.test(String(e.message));return json({error:e.status?e.message:quota?'云端额度暂时不足；本机数据已保留，额度恢复后重试':'同步服务暂时不可用；本机数据仍保留'},e.status||503);}
}};
