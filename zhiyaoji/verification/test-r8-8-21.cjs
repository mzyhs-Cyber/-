const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=process.env.ZHIYAOJI_TEST_APP||(fs.existsSync(path.join(__dirname,'r8_8_21'))?path.join(__dirname,'r8_8_21'):path.join(__dirname,'../app'));
const src=fs.readFileSync(path.join(base,'bundle.js'),'utf8');
function harness(patch=true){
 const S={state:{attempts:[]},plain:x=>x,questionMarkup:()=>'',reportRows:()=>[],reportCell:()=>'',clock:x=>{const n=Math.ceil(Number(x)||0);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');},icon:()=>'<clock>',sessionAnswer:(s,q)=>s.answers?.[q.id]||s.savedAttempts?.[q.id]||{}};
 const c=vm.createContext({window:{Study:S},Date});
 const catalog=src.split('\n').find(x=>x.startsWith('S.FENBI_CATALOG='));
 vm.runInContext('(function(S){'+catalog+'})(window.Study)',c);
 const start=src.indexOf('const subjectName=x=>'),end=src.indexOf('let unitRevision=',start);
 vm.runInContext('(function(S){'+src.slice(start,end)+'})(window.Study)',c);
 const a=src.indexOf("const VERSION='time-20261023-v1'"),b=src.indexOf('\n})(window.Study);',a);
 vm.runInContext('(function(S){'+src.slice(a,b)+'})(window.Study)',c);
 if(patch)vm.runInContext(fs.readFileSync(path.join(base,'timing-repair.js'),'utf8'),c);
 return S;
}
const q={id:'q',subject:'判断推理',type:'数量规律-面',path:['数量规律-面']};
const session=value=>({questions:[q],answers:{q:{seconds:value}},finishedAt:1});
const old=harness(false),S=harness();
assert.match(old.timeDetails(session('173'),q),/计时不足或题型未匹配/);
const frozen=session(173);frozen.timeAssessment={questions:{q:{valid:true,slow:false,scope:'question',thresholdSeconds:null,type:'未匹配'}}};
assert.match(old.timeDetails(frozen,q),/计时不足或题型未匹配/);
for(const s of [session('173'),frozen]){const before=JSON.stringify(s),t=S.assessQuestionTime(s,q);assert.equal(t.slow,true);assert.equal(t.actualSeconds,173);assert.equal(t.excessSeconds,83);assert.match(S.timeBadge(s,q),/time-badge/);assert.match(S.timeDetails(s,q),/用时偏长 · 超出83秒/);assert.equal(JSON.stringify(s),before);}
assert.match(S.timeDetails(frozen,q),/按原作答用时补算/);
const stable=session(173),row={valid:true,scope:'question',slow:false,thresholdSeconds:180,actualSeconds:173};stable.timeAssessment={questions:{q:row}};assert.equal(S.assessQuestionTime(stable,q),row);
const unknown={...q,type:'无法识别的题型',path:['无法识别的题型']},unknownSession={questions:[unknown],answers:{q:{seconds:173}}};
assert.match(S.timeDetails(unknownSession,unknown),/题型未匹配 · 本题 02:53/);assert.doesNotMatch(S.timeDetails(unknownSession,unknown),/用时正常/);
for(const value of [0,null,undefined,'',true,'02:53','173s',Infinity,{},-10]){const s=session(value);assert.equal(S.assessQuestionTime(s,q).valid,false);assert.match(S.timeDetails(s,q),/暂无有效单题用时/);}
const fallback={questions:[q],answers:{},savedAttempts:{q:{seconds:173}}};assert.equal(S.assessQuestionTime(fallback,q).slow,true);
const partial={questions:[{...q,id:'a',materialKey:'m'},{...q,id:'b',materialKey:'m'}],answers:{a:{seconds:173}}};assert.equal(S.assessQuestionTime(partial,partial.questions[0]).valid,false);
assert.match(S.timeDetails(partial,partial.questions[0]),/本组计时不完整 · 本题 02:53/);
const grouped={...partial,answers:{a:{seconds:'173'},b:{seconds:'10'}}};assert.equal(S.assessQuestionTime(grouped,grouped.questions[0]).scope,'group');assert.equal(S.assessQuestionTime(grouped,grouped.questions[0]).slow,false);
assert.equal(S.timeRule({...q,path:[],type:'属性规律-对称性',sourcePath:[],tags:[]}).thresholdSeconds,90);
assert.equal(S.timeRule({...q,path:[],type:'未知图形标签'}),null);
assert.equal(S.timeRule({...q,subject:'资料分析',path:[],type:'数量规律-面'}),null);
assert.equal(S.assessQuestionTime(session(90),q).slow,false);assert.equal(S.assessQuestionTime(session(90.01),q).slow,true);
const baseline=path.join(__dirname,'r8_8_20/bundle.js');if(fs.existsSync(baseline)){const timing=s=>{const a=s.indexOf("const VERSION='time-20261023-v1'");return s.slice(a,s.indexOf('\n})(window.Study);',a));};assert.equal(timing(src),timing(fs.readFileSync(baseline,'utf8')));}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),sw=fs.readFileSync(path.join(base,'sw.js'),'utf8');assert.ok(html.indexOf('timing-repair.js')>html.indexOf('bundle.js'));assert.ok(html.indexOf('timing-repair.js')<html.indexOf('performance-diagnostics.js'));assert.match(sw,/const FILES=\[[^\n]*timing-repair.js/);
console.log('PASS: reproduced both old failures; 173-second string and invalid snapshot repaired read-only; valid snapshots preserved; unknown/missing differentiated; attempt fallback; partial and complete groups; type guard; threshold boundaries; timing core preserved');
