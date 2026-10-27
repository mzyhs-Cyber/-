const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=process.env.ZHIYAOJI_TEST_APP|| (fs.existsSync(path.join(__dirname,'r8_8_18'))?path.join(__dirname,'r8_8_18'):path.join(__dirname,'../app'));
const M=require(path.join(base,'training-memory.js'));
const title=(year,half,issue)=>`${year}${half}省考第${issue}季行测模考大赛（江苏B卷）`;
// Exact names observed in the user's screenshot, including the current upper-half selection.
const screenshot=[title(2026,'下半年','十一'),title(2026,'下半年','四'),title(2026,'下半年','五'),title(2026,'下半年','一'),title(2025,'下半年','三十六'),title(2025,'下半年','三十七'),title(2026,'上半年','九')];
const papers=screenshot.map((title,i)=>({id:'p'+i,title,year:Number(title.slice(0,4)),slots:[{}]}));
const expected=[papers[0],papers[2],papers[1],papers[3],papers[6],papers[5],papers[4]];
assert.deepEqual([...papers].sort(M.comparePapersRecent),expected);
for(const [s,n] of [['十一',11],['三十三',33],['三十二',32],['三十六',36],['三十七',37],['十',10],['一百零二',102],['两百三十一',231],['二〇二六',2026],['３３',33]])assert.equal(M.issueNumber(s),n,s);
for(const s of ['第33期','第三十三期','第３３季','33期','第三十三套','季33'])assert.equal(M.paperIssue({title:s}),33,s);
assert.equal(M.paperIssue({title:'2026年江苏B卷'}),null);
const mixed=[{title:'2026下半年第三十二季'},{title:'2026下半年第33季'},{title:'2026下半年第十一季'},{title:'2026下半年专题卷'}].sort(M.comparePapersRecent);assert.deepEqual(mixed.map(M.paperIssue),[33,32,11,null]);
// Comparator is a total order even when named and numbered mock papers mix.
const checks=[...papers,...mixed];for(const a of checks)for(const b of checks){assert.equal(Math.sign(M.comparePapersRecent(a,b)),-Math.sign(M.comparePapersRecent(b,a))||0);for(const c of checks)if(M.comparePapersRecent(a,b)<=0&&M.comparePapersRecent(b,c)<=0)assert.ok(M.comparePapersRecent(a,c)<=0);}
const bundle=fs.readFileSync(path.join(base,'bundle.js'),'utf8'),nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',innerHTML:'',style:{},setAttribute(){}});return nodes.get(k);};
const fixturePath=path.join(__dirname,'mock-title-fixture-34.json');if(fs.existsSync(fixturePath)){const titles=JSON.parse(fs.readFileSync(fixturePath,'utf8')),groups=new Map();assert.equal(titles.length,34);for(const p of titles.map(title=>({title})).sort(M.comparePapersRecent)){assert.notEqual(M.paperIssue(p),null);const key=p.title.slice(0,4)+'/'+M.paperHalf(p),g=groups.get(key)||[];g.push(M.paperIssue(p));groups.set(key,g);}assert.deepEqual([...groups.keys()],['2026/2','2026/1','2025/2']);for(const g of groups.values())assert.deepEqual(g,[...g].sort((a,b)=>b-a));console.log('PASS: all 34 actual archive mock titles');}
const S={...M,state:{papers,sessions:[],settings:{},attempts:[],meta:{}},escape:x=>x,icon:()=>'',go(){},$:(k)=>node(k),$$:()=>[],trainingViewMemory:()=>({read:()=>null,write(){}}),practiceHistoryIndex:()=>({paper:()=>({}),module:()=>({count:0})}),paperScope:()=> '江苏',paperScopes:()=>['江苏'],paperScopeLabel:x=>x,paperStatus:()=>({complete:true}),paperQuestions:()=>({questions:[]}),paperHistoryMarkup:()=>'',practiceChoiceText:()=>'',paperInScope:()=>true,paperYear:p=>p.year,paperRegion:()=> '江苏',paperSource:()=> 'mock',JIANGSU_MODULES:{资料分析:{count:1,minutes:1}},MODULE_TIME_TIERS:{normal:'标准'},moduleTimeSpec:()=>({count:1,minutes:1}),formatModuleTime:()=>'',selectTimedModule:()=>({questions:[],minutes:0}),canonicalKey:q=>q.id};
const ctx=vm.createContext({S,window:{Study:S},E:x=>x,norm:x=>String(x||'').normalize('NFKC').toLowerCase().replace(/\s/g,''),text:p=>p.title});
function definition(start,end){const text=bundle.slice(bundle.indexOf(start));return text.slice(0,text.indexOf(end)+end.length);}
vm.runInContext("let v28PaperRegion='江苏',v28PaperYear='全部',v28PaperId='';const isCompletePaperV28=()=>true,regionV28=()=> '江苏',yearV28=p=>p.year;"+definition('S.renderPapers=function(){','\n};'),ctx);S.renderPapers();
const fullOrder=[...node('#view').innerHTML.matchAll(/<option value="(p\d+)"[^>]*>/g)].map(m=>m[1]);assert.deepEqual(fullOrder,expected.map(p=>p.id));
vm.runInContext(definition('S.PaperFilters={','\n};'),ctx);assert.deepEqual(Array.from(S.PaperFilters.choose(papers,{}),p=>p.id),expected.map(p=>p.id));
vm.runInContext(definition('S.renderTimed=function(){','\n};'),ctx);S.renderTimed();const timedOrder=[...node('#release-paper').innerHTML.matchAll(/<option value="(p\d+)"[^>]*>/g)].map(m=>m[1]);assert.deepEqual(timedOrder,expected.map(p=>p.id));
const sw=fs.readFileSync(path.join(base,'sw.js'),'utf8'),html=fs.readFileSync(path.join(base,'index.html'),'utf8'),repair=path.join(base,'timing-repair.js'),buildSource=fs.existsSync(repair)?fs.readFileSync(repair,'utf8'):bundle,build=buildSource.match(/S.BUILD='[^']*(r8-8-\d+)'/)[1];assert.ok(sw.includes(build));assert.match(html,/training-memory\.js\?v=r8-8-\d+/);
console.log('PASS: screenshot Chinese seasons; mixed Arabic/fullwidth/Chinese; half-year chronology; comparator transitivity; actual paper/timed/bank ordering; cache version');
