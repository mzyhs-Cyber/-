/* Isolated regression: real daily validator, legacy renderer and pair module. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const app=path.join(__dirname,'../app'),bundle=fs.readFileSync(path.join(app,'bundle.js'),'utf8');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture(home=false){
 const S={state:{meta:{syncOwnerId:'a'},sessions:[]},accountSync:{user:{id:'a'},verified:true},escape:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon:()=>'',SyncCodec:{hash:async x=>digest(x)},$ :()=>null,$$:()=>[],saveHot:async()=>{},safeHTML:x=>x,normalizeState:x=>x,toast:x=>{throw Error(x);},startSession:(qs,opts)=>{S.created={qs,opts};},resumeSession:id=>{S.resumed=id;}};
 if(home){const daily={},side={prepend:n=>S.moved=n},holder={remove:()=>S.holderRemoved=true},primary={classList:{add:c=>S.layoutClass=c}},nodes={'#daily-training':daily,'.home-side-v28':side,'.home-daily-primary':holder,'.home-primary-grid':primary};S.$=x=>nodes[x]||null;S.renderHome=()=>{S.baseRendered=(S.baseRendered||0)+1;return 77;};S.expectedDaily=daily;}
 const context=vm.createContext({window:{Study:S,addEventListener:()=>{}},console,Map,Set,Date,JSON});
 let start=bundle.indexOf("(function(root){'use strict';\nfunction dailyProvenance");
 let end=bundle.indexOf("})(typeof window!=='undefined'?window:globalThis);",start);
 vm.runInContext(bundle.slice(start,end+"})(typeof window!=='undefined'?window:globalThis);".length),context);
 S.DailyModel.today=()=> '2026-10-28';
 start=bundle.indexOf("(function(S){'use strict';const E=S.escape,D=S.DailyModel;let loading=null");
 end=bundle.indexOf('S.dailyUploadSettings=',start);
 vm.runInContext(bundle.slice(start,end)+'})(window.Study);',context);
 vm.runInContext(fs.readFileSync(path.join(app,'daily-pairs.js'),'utf8'),context);
 S.state.meta.dailyTraining={a:{packs:[],content:{},pairs:{}}};
 return S;
}
const question=(id,subject,type='')=>({id,subject,type,path:type?[type]:[],stemHtml:'Synthetic '+id,optionsHtml:['A','B','C','D'],answer:'A',source:'Synthetic test only'});
const history=(id,day,date,track='core',extra={})=>({id,mode:'daily',dailyOwner:'a',dailyDate:date,dailyPackHash:id,title:(track==='core'?'三科进阶':'数量稳分')+(day?'｜Day '+day:''),startedAt:Date.parse(date+'T08:00:00+08:00'),finished:true,questions:[question('h',track==='core'?'资料分析':'数量关系')],...extra});
(async()=>{
 const S=fixture(),cache=S.state.meta.dailyTraining.a,row={date:'2026-10-28',title:'三科进阶｜2026-10-28',hash:'core',count:15};
 S.state.sessions=[history('d1',1,'2026-10-23'),history('d2',2,'2026-10-25'),history('d3',3,'2026-10-27')];
 const before=JSON.stringify(S.state.sessions);
 cache.packs=[row];
 let html=S.dailyCardHTML();
 check(S.DailyPairs.dayFor(row,'core'),4);check(S.DailyPairs.dayFor(row,'quant'),1);
 check(html.includes('Day '),false);check((html.match(/class="daily-pair-label">2026-10-28/g)||[]).length,2);
 check(html.indexOf('<h3>三科进阶')<html.indexOf('<h3>数量稳分'),true);check(html.includes('tabindex="0" role="region"'),true);
 check((html.match(/<article class="daily-pair">/g)||[]).length,2);
 check(html.includes('数量题包尚未发布'),true);check(html.includes('data-daily-start="2026-10-28"'),true);
 check((html.match(/daily-start/g)||[]).length,2); // class and data attribute of one real button
 check(JSON.stringify(S.state.sessions),before);
 S.state.sessions.push(history('d3',3,'2026-10-27'),history('other',90,'2026-10-27','core',{dailyOwner:'b'}),history('unfinished',8,'2026-10-27','core',{finished:false}));
 check(S.DailyPairs.dayFor(row,'core'),4);
 S.state.sessions.push(history('d4',null,'2026-10-28','core',{dailyPackHash:'core'}));
 check(S.DailyPairs.dayFor(row,'core'),4); // finishing today never changes today's label
 check(S.DailyPairs.dayFor({...row,date:'2026-10-30'},'core'),5); // gaps do not advance the counter
 const questions=[...Array.from({length:7},(_,i)=>question('s'+i,'数量关系','数字推理')),...Array.from({length:6},(_,i)=>question('m'+i,'数量关系')),...Array.from({length:15},(_,i)=>question('c'+i,['言语理解','判断推理','资料分析'][i%3]))];
 const old=S.DailyModel.validate({date:row.date,title:'知遥集双轨｜'+row.date,questions});
 const fresh=S.DailyModel.validate({...old,title:old.title+'｜数量Day1｜三科Day4'});
 const frozen=JSON.stringify(fresh),pair=await S.DailyPairs.derive(fresh),oldPair=await S.DailyPairs.derive(old);
 check(pair.quant.hash,oldPair.quant.hash);check(pair.core.hash,oldPair.core.hash);check(JSON.stringify(fresh),frozen);
 let rejected=false;try{await S.DailyPairs.derive({...fresh,title:'知遥集双轨｜2026-10-27｜数量Day1｜三科Day4'});}catch{rejected=true;}check(rejected,true);
 const hash=digest(JSON.stringify(fresh)),pairedRow={date:row.date,title:fresh.title,hash,count:28};
 cache.packs=[pairedRow];cache.content[hash]=fresh;cache.pairs[hash]={quant:{...pair.quant,pack:undefined},core:{...pair.core,pack:undefined}};
 html=S.dailyCardHTML();check(html.includes('Day '),false);check((html.match(/class="daily-pair-label">2026-10-28/g)||[]).length,2);
 check(html.indexOf('data-pair-track="core"')<html.indexOf('data-pair-track="quant"'),true);
 check((html.match(/data-pair-track=/g)||[]).length,2);
 await S.openDailyTrack(row.date,'quant');check(S.created.opts.title,'数量稳分 · 2026-10-28');check(S.created.opts.dailyPackHash,pair.quant.hash);
 S.state.sessions.push(history('live',1,row.date,'quant',{dailyPackHash:pair.quant.hash,finished:false}));
 S.created=null;await S.openDailyTrack(row.date,'quant');check(S.resumed,'live');check(S.created,null);
 const titleRow={...pairedRow,title:old.title+'｜数量Day9｜三科Day8'};
 check(S.DailyPairs.dayFor(titleRow,'quant',pair.quant.hash),1); // active attempt's explicit number wins
 check(S.DailyPairs.dayFor(titleRow,'core'),8);
 const empty=fixture();check(empty.DailyPairs.dayFor(row,'core'),null);
 empty.accountSync.user.id='b';check(empty.dailyCardHTML().includes('数量题包尚未发布'),false);
 cache.packs=[{...row,title:'Day 3｜旧混合训练'}];check(S.dailyCardHTML().includes('数量题包尚未发布'),false);
 check(JSON.stringify(questions),JSON.stringify(fresh.questions.map(q=>{const original=questions.find(x=>x.id===q.id);return original;})));
 const home=fixture(true);check(home.renderHome(),77);check(home.baseRendered,1);check(home.moved===home.expectedDaily,true);check(home.holderRemoved,true);check(home.layoutClass,'daily-sidebar-layout');
 console.log(JSON.stringify({passed:checks,scope:'date-only display, core-first order, sidebar placement, validator, identity, resume and account tests',deviceTest:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
