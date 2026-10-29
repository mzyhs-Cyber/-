const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{webcrypto}=require('node:crypto');
const base=process.env.ZHIYAOJI_TEST_APP||path.join(__dirname,'r8_8_28'),bundle=fs.readFileSync(path.join(base,'bundle.js'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x)),sha=async s=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
let today='2026-10-28',getCount=0,started=[],resumed=[],toast=[],nextResponse=null,legacyBind=0,modal;
const root={outerHTML:'',querySelector(){return null}},nodes=[];
const S={state:{sessions:[],meta:{syncOwnerId:'a',dailyTraining:{a:{packs:[],content:{}}}}},escape:x=>String(x).replaceAll('<','&lt;'),icon:()=>'',SyncCodec:{hash:sha},dailyCardHTML:()=>'<legacy/>',bindDailyCard(){legacyBind++},$:s=>s==='#daily-training'?root:null,$$:s=>s==='[data-pair-date]'?nodes:[],saveHot:async()=>{},toast:x=>toast.push(x),safeHTML:x=>x.replaceAll('<script>bad</script>',''),normalizeState:x=>x,startSession(q,c){const s={id:'s'+started.length,questions:q,...c,startedAt:Date.now(),notes:{private:'ink'}};S.state.sessions.push(s);started.push(s);},resumeSession:id=>resumed.push(id),modal:x=>{modal=x},closeModal(){},displayTopicPaths:q=>q.path.map(p=>[p])};
S.accountSync={user:{id:'a'},verified:true,request:async()=>{getCount++;return nextResponse;}};
const c=vm.createContext({window:{Study:S},console,Date,TextEncoder,crypto:webcrypto});
const a=bundle.indexOf('function dailyProvenance('),b=bundle.indexOf('const model={validate,today:',a);vm.runInContext('(function(){'+bundle.slice(a,b)+'window.Study.DailyModel={validate};})();',c);S.DailyModel.today=()=>today;
vm.runInContext(fs.readFileSync(path.join(base,'daily-pairs.js'),'utf8'),c);
const q=(id,subject,seq=false)=>({id,subject,path:seq?['数字推理','多级数列']:[],stemHtml:'fixture '+id,optionsHtml:['a','b','c','d'],answer:'A',explanationHtml:'fixture explanation',source:'synthetic test only'});
function fixture(extra=2){return {date:today,title:'知遥集双轨｜'+today,questions:[...Array.from({length:5+extra},(_,i)=>q('n'+i,'数量关系',true)),...Array.from({length:6},(_,i)=>q('m'+i,'数量关系')),...Array.from({length:4},(_,i)=>q('v'+i,'言语理解')),...Array.from({length:6},(_,i)=>q('l'+i,'判断推理')),...Array.from({length:5},(_,i)=>({...q('d'+i,'资料分析'),materialKey:'whole-data',materialHtml:'complete fixture material'}))]};}
async function install(raw){const pack=S.DailyModel.validate(raw),hash=await sha(JSON.stringify(pack));nextResponse={pack,hash};S.state.meta.dailyTraining.a.packs=[{date:pack.date,title:pack.title,count:pack.questions.length,hash}];return {pack,hash};}
(async()=>{
 const raw=fixture(),before=JSON.stringify(raw),pair=await S.DailyPairs.derive(raw);assert.equal(pair.quant.count,13);assert.equal(pair.quant.extraCount,2);assert.equal(pair.core.count,15);assert.equal(JSON.stringify(raw),before);
 for(const extra of [0,3])assert.equal((await S.DailyPairs.derive(fixture(extra))).quant.count,11+extra);
 for(const mutation of [r=>r.questions.shift(),r=>r.questions.find(q=>q.id==='m0').path=['数字推理'],r=>r.questions.find(q=>q.id==='v0').subject='常识判断',r=>r.questions.splice(-5),r=>r.title+='bad',r=>Object.assign(r.questions[0],{materialKey:'whole-data',materialHtml:'complete fixture material'})]){const r=fixture();mutation(r);await assert.rejects(()=>S.DailyPairs.derive(r));}
 const sibling=fixture();sibling.questions.at(-1).stemHtml+=' changed';assert.equal((await S.DailyPairs.derive(sibling)).quant.hash,pair.quant.hash);assert.notEqual((await S.DailyPairs.derive(sibling)).core.hash,pair.core.hash);
 await install(raw);assert.match(S.dailyCardHTML(),/数量稳分/);assert.match(S.dailyCardHTML(),/三科进阶/);
 await Promise.all([S.openDailyTrack(today,'quant'),S.openDailyTrack(today,'quant')]);assert.equal(started.length,1);assert.equal(getCount,1);assert.equal(started[0].questions.length,13);assert.equal(started[0].paperTitle,'数量稳分');
 await S.openDailyTrack(today,'core');assert.equal(started.length,2);assert.equal(started[1].questions.length,15);assert.ok(started[1].questions.slice(-5).every(q=>q.materialExpectedCount===5));assert.notEqual(started[0].dailyPackHash,started[1].dailyPackHash);
 const ink=JSON.stringify(started);await S.openDailyTrack(today,'quant');assert.equal(resumed.at(-1),'s0');assert.equal(started.length,2);assert.equal(JSON.stringify(started),ink);assert.match(S.dailyCardHTML(),/强化2题/);
 await install(sibling);await S.openDailyTrack(today,'quant');assert.equal(resumed.at(-1),'s0');assert.equal(started.length,2);await S.openDailyTrack(today,'core');assert.equal(started.length,3);
 // Switching accounts while a download is pending must not save or start an A pack in B.
 const r=fixture();r.questions[0].stemHtml+='different';await install(r);let done;S.accountSync.request=()=>new Promise(resolve=>done=resolve);const work=S.openDailyTrack(today,'quant');await new Promise(resolve=>setImmediate(resolve));S.accountSync.user.id='b';S.state.meta.syncOwnerId='b';done(nextResponse);await work;assert.equal(started.length,3);assert.equal(S.state.meta.dailyTraining.b,undefined);
 S.accountSync.user.id='a';S.state.meta.syncOwnerId='a';S.accountSync.request=async()=>nextResponse;
 // A genuine legacy mixed pack and a whole-envelope session remain intact.
 const legacy=fixture();legacy.title='old daily';const l=await install(legacy);assert.equal(S.dailyCardHTML(),'<legacy/>');await S.openDailyTrack(today,'legacy');assert.equal(started.at(-1).questions.length,28);assert.equal(started.at(-1).dailyPackHash,l.hash);
 const v=await install(fixture());S.state.sessions.push({id:'old-whole',dailyOwner:'a',dailyPackHash:v.hash,startedAt:Date.now()+10,finished:true});const count=started.length;assert.match(S.dailyCardHTML(),/旧版/);await S.openDailyTrack(today,'core');assert.equal(resumed.at(-1),'old-whole');assert.equal(started.length,count);
 // A forged envelope hash is rejected; no attempt is opened.
 const t=fixture();t.questions[0].stemHtml+='tampered';await install(t);nextResponse.hash='0'.repeat(64);await S.openDailyTrack(today,'quant');assert.equal(started.length,count);assert.match(toast.at(-1),/题包已更新/);
 S.bindDailyCard(false);assert.equal(legacyBind,1);today='2026-10-29';assert.equal(S.dailyCardHTML(),'<legacy/>');
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),sw=fs.readFileSync(path.join(base,'sw.js'),'utf8');for(const f of ['daily-pairs.js','daily-pairs.css']){assert.ok(html.includes(f));assert.ok(sw.includes(f));}assert.ok(html.indexOf('daily-pairs.js')>html.indexOf('training-order-ink.js'));
 console.log('PASS R28: real daily validator; 5+0/2/3+6 and 14–17; full material isolation; child SHA identity; independent resume/completion; sibling updates; duplicate taps; owner switch; hash mismatch; legacy compatibility; bounded cache and resources. Fixtures never published.');
})().catch(e=>{console.error(e);process.exitCode=1});
