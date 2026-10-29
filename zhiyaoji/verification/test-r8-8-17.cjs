const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');const base=process.env.ZHIYAOJI_TEST_APP?process.env.ZHIYAOJI_TEST_APP+'/':fs.existsSync(path.join(__dirname,'r8_8_17'))?path.join(__dirname,'r8_8_17')+'/':path.join(__dirname,'../app')+'/';
const M=require(base+'training-memory.js');let now=Date.parse('2026-10-27T15:59:00Z');
const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
let m=new M.DailyTrainingMemory(storage,'a',()=>now);m.write('timed',{chosen:'33',subject:'资料分析'});m.write('papers',{id:'32'});
assert.equal(new M.DailyTrainingMemory(storage,'a',()=>now).read('timed').chosen,'33');
assert.equal(new M.DailyTrainingMemory(storage,'b',()=>now).read('timed'),null);
now+=120000;assert.equal(m.read('timed'),null);m.write('timed',{chosen:'34'});assert.equal(m.read('papers'),null);
const blocked={getItem(){throw Error()},setItem(){throw Error()}};new M.DailyTrainingMemory(blocked,'blocked').write('x',{a:1});assert.equal(new M.DailyTrainingMemory(blocked,'blocked').read('x').a,1);
const ordered=[3,32,9,33,2].map(i=>({title:'2026粉笔第'+i+'季模拟卷',year:2026})).sort(M.comparePapersRecent);assert.deepEqual(ordered.map(M.paperIssue),[33,32,9,3,2]);
assert.equal([{title:'2025第99期',year:2025},{title:'2026第2期',year:2026}].sort(M.comparePapersRecent)[0].year,2026);
const button={querySelector:()=>({getBoundingClientRect:()=>({left:10,top:20,width:20,height:20})})};assert.equal(M.compactControlHit(button,9,30),false);assert.equal(M.compactControlHit(button,11,30),true);assert.equal(M.compactControlHit(button,31,30),false);
let generated=0;const answers={a:{selected:'A'},b:{selected:'B'},c:{selected:null},d:{selected:'A'}};
const S={...M,state:{bank:[],meta:{}},selectTimedModule:()=>({questions:[S.state.bank[generated++%2]],minutes:10}),trainingViewMemory:()=>new M.DailyTrainingMemory(storage,'cache',()=>now),isLearningExcluded:(s,id)=>!!s.feedback?.[id]?.excludeFromLearning,presentQuestion:q=>q,sessionAnswer:(s,q)=>answers[q.id],getAttempt:()=>null,reviewReasons:()=>['incorrect'],analysisText:()=>'',exportSession(){},$:()=>null};
const context=vm.createContext({window:{Study:S},document:{},console});
const bundle=fs.readFileSync(base+'bundle.js','utf8');
const candidate=bundle.split('\n').find(x=>x.startsWith('S.aiCandidates=s=>'));const state=bundle.split('\n').find(x=>x.startsWith('S.reviewState=function'));
vm.runInContext('(function(S){'+candidate+'\n'+state+'})(window.Study)',context);vm.runInContext(fs.readFileSync(base+'training-review.js','utf8'),context);
const questions=['a','b','c','d'].map(id=>({id,subject:id==='d'?'判断推理':'资料分析',path:['比重','两期比重'],answer:'A',optionsHtml:['A','B','C','D']}));const session={questions,feedback:{b:{excludeFromLearning:true}}};
assert.deepEqual(Array.from(S.aiCandidates(session),x=>x.q.id),['a','c','d']);assert.deepEqual(Array.from(S.aiCandidates(session),x=>x.index),[0,2,3]);
const summary=S.aiScopeSummary(session,'资料分析');assert.match(summary,/50.0%/);assert.match(summary,/不纳入 1题/);assert.match(summary,/第1、3题/);assert.doesNotMatch(summary,/第2/);
assert.match(S.analysisText(session,{subject:'资料分析'}),/比重 \/ 两期比重/);
S.state.bank=questions.slice(0,2);const cfg={subject:'资料分析',paper:null};const first=S.selectTimedModule(cfg);const second=S.selectTimedModule(cfg);assert.equal(generated,1);assert.equal(first.questions[0].id,second.questions[0].id);now+=86400000;S.selectTimedModule(cfg);assert.equal(generated,2);
const sw=fs.readFileSync(base+'sw.js','utf8');for(const f of ['training-memory.js','training-review.js','training-controls.css'])assert.ok(sw.includes(f));
console.log('PASS: daily state/account isolation/storage fallback; issue sorting; glyph hit boundaries; exclusion/original numbering; scoped accuracy/type map; daily selection cache; SW assets');

// Exercise actual render functions and change handlers without altering real IDB.
const nodes=new Map();function node(key){if(!nodes.has(key))nodes.set(key,{style:{},value:'',innerHTML:'',setAttribute(){},querySelector(){return {textContent:'',hidden:false}},dataset:{}});return nodes.get(key);}
const P={...M,state:{meta:{syncOwnerId:'render-user'},settings:{},papers:[{id:'p33',title:'2026第33期模拟卷',year:2026,slots:[{}]},{id:'p32',title:'2026第32期模拟卷',year:2026,slots:[{}]}],bank:[],attempts:[]},$:(k)=>node(k),$$:()=>[],escape:x=>x,icon:()=>'',go(){},practiceHistoryIndex:()=>({paper:()=>({}),module:()=>({count:0})}),paperScope:()=> '江苏',paperScopes:()=>['江苏'],paperScopeLabel:x=>x,paperStatus:()=>({complete:true,slots:[{}]}),paperQuestions:()=>({questions:[{id:'q',subject:'资料分析'}]}),paperHistoryMarkup:()=>'',practiceChoiceText:()=>'',practiceChoiceHTML:()=>'',paperInScope:()=>true,paperYear:p=>p.year,PaperFilters:{kind:()=>'',source:()=> 'real'},JIANGSU_MODULES:{资料分析:{count:1,minutes:1}},MODULE_TIME_TIERS:{normal:'标准'},moduleTimeSpec:()=>({count:1,minutes:1,timeTierLabel:'标准'}),formatModuleTime:()=>'',selectTimedModule:()=>({questions:[],minutes:0,breakdown:[]}),canonicalKey:q=>q.id};
const ctx=vm.createContext({window:{Study:P,localStorage:storage},S:P,E:x=>x,Object,Number,Set,Map,Date});
const memoryLine=bundle.split('\n').find(l=>l.startsWith('S.trainingViewMemory='));vm.runInContext(memoryLine,ctx);
const renderTimed=bundle.slice(bundle.indexOf('S.renderTimed=function(){',bundle.indexOf('S.MODULE_TIME_TIERS=')));vm.runInContext(renderTimed.slice(0,renderTimed.indexOf('\n};')+4),ctx);
P.renderTimed();node('#release-paper').onchange({target:{value:'p32'}});P.renderTimed();assert.equal(node('#release-paper').value,'p32');
const renderPapers=bundle.slice(bundle.indexOf('S.renderPapers=function(){',bundle.indexOf("let v28PaperRegion=")));vm.runInContext("let v28PaperRegion='江苏',v28PaperYear='全部',v28PaperId='';const regionV28=p=>'江苏',yearV28=p=>p.year,isCompletePaperV28=p=>true;"+renderPapers.slice(0,renderPapers.indexOf('\n};')+4),ctx);
P.renderPapers();node('#paper-id-v28').onchange({target:{value:'p32'}});P.renderPapers();assert.match(node('#view').innerHTML,/value="p32" selected/);
console.log('PASS: actual timed and paper renderer re-entry retains selection via their real change handlers');
