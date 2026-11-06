const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=process.env.ZHIYAOJI_TEST_APP||(fs.existsSync(path.join(__dirname,'r8_8_22'))?path.join(__dirname,'r8_8_22'):path.join(__dirname,'../app'));
const bundle=fs.readFileSync(path.join(base,'bundle.js'),'utf8'),code=fs.readFileSync(path.join(base,'export-scopes.js'),'utf8');
let downloads=[],copied='',modal,packed=[];
const S={state:{bank:[],meta:{}},escape:x=>x,plain:x=>x||'',LETTERS:['A','B','C','D'],clock:String,icon:()=>'',selectTimedModule:()=>({questions:[]}),sessionAnswer:(s,q)=>s.answers[q.id],getAttempt:()=>null,isLearningExcluded:(s,id)=>!!s.excluded?.includes(id),presentQuestion:q=>q,isFavorite:()=>true,ensureEvidence:s=>{s.submissionEvidence={events:[],origin:'fixture'}},evidenceNotes:()=>({}),imageSources:()=>[],materialIdentity:q=>q.materialKey||null,materialNoteKey:q=>'m:'+q.materialKey,resolveMaterialNoteKey:(s,q)=>'m:'+q.materialKey,canonicalKey:q=>q.id,hash:x=>x,renderEvidenceArea:async()=>[],makeZipAsync:async entries=>{packed.push(entries);return {size:100}},download:(name,text)=>downloads.push({name,text}),toast:x=>{throw Error(x)},modal:options=>{modal=options},$:()=>null};
const c=vm.createContext({window:{Study:S},Date,TextEncoder,setTimeout,navigator:{clipboard:{writeText:async text=>{copied=text}}},document:{},console});
const catalog=bundle.split('\n').find(x=>x.startsWith('S.FENBI_CATALOG='));vm.runInContext('(function(S){'+catalog+'})(window.Study)',c);
const start=bundle.indexOf('const subjectName=x=>'),end=bundle.indexOf('let unitRevision=',start);vm.runInContext('(function(S){'+bundle.slice(start,end)+'})(window.Study)',c);
vm.runInContext(code,c);
// Every configured verbal/reasoning taxonomy node has exactly one export category.
const counts={};for(const p of S.FENBI_CATALOG.filter(p=>p.length>1&&['判断推理','言语理解与表达','言语理解'].includes(p[0]))){const q={subject:p[0],path:p.slice(1),type:p.at(-1)},group=S.reviewScopeOf(q);assert.doesNotMatch(group,/待分类/,p.join('/'));counts[group]=(counts[group]||0)+1;}
for(const key of ['图推','类比','逻辑判断','定义判断','言语填空','篇章阅读'])assert.ok(counts[key]>0,key);
const types=[['判断推理','数量规律-面','图推'],['判断推理','空间类-三视图','图推'],['判断推理','类比推理','类比'],['判断推理','翻译推理','逻辑判断'],['判断推理','单定义','定义判断'],['言语理解','实词填空','言语填空'],['言语理解','语句填空','篇章阅读'],['言语理解与表达','主旨意图','篇章阅读'],['言语理解','片段阅读','篇章阅读'],['资料分析','增长率','资料分析'],['判断推理','未知标签','判断推理（待分类）']];
const questions=types.map(([subject,type,expected],i)=>({id:'q'+i,subject,type,path:[type],stemHtml:'fixture-stem-'+i+'-end',optionsHtml:['a','b','c','d'],answer:'A',explanationHtml:'explanation-'+i,expected,...(type==='翻译推理'?{materialKey:'shared',materialHtml:'完整公共材料'}:{})}));
const s={id:'fixture',title:'导出测试',finished:true,finishedAt:1,questions,answers:Object.fromEntries(questions.map(q=>[q.id,{selected:'B',seconds:173,excluded:[]}]))};
for(const q of questions)assert.equal(S.reviewScopeOf(q),q.expected);
const ordered={questions:['资料分析','判断推理','常识判断','言语理解','数量关系','政治理论'].flatMap(subject=>subject==='判断推理'?questions.filter(q=>q.subject===subject):subject==='言语理解'?questions.filter(q=>q.subject===subject):[{subject,path:[]}])};
assert.deepEqual(Array.from(S.reviewScopeOptions(ordered)),['资料分析','图推','类比','逻辑判断','定义判断','判断推理（待分类）','常识判断','言语填空','篇章阅读','数量关系','政治理论']);
S.reviewReasons=()=>['incorrect'];S.aiCandidates=s=>s.questions.map((q,index)=>({q,index,a:S.sessionAnswer(s,q),attempt:null,reasons:['incorrect']})).filter(x=>!S.isLearningExcluded(s,x.q.id));
const exportStart=bundle.indexOf("(function(S){\n'use strict';const E=S.escape,enc=new TextEncoder()"),exportEnd=bundle.indexOf('\n})(window.Study);',exportStart);assert.ok(exportStart>=0);vm.runInContext(bundle.slice(exportStart,exportEnd+'\n})(window.Study);'.length),c);
vm.runInContext(fs.readFileSync(path.join(base,'training-review.js'),'utf8'),c);
S.exportSession(s);assert.doesNotMatch(modal.body,/<optgroup/);for(const key of new Set(questions.map(q=>q.expected)))assert.ok(modal.body.includes('<option value="'+key+'">'+key+'</option>'));assert.ok(!modal.body.includes('<option value="判断推理">'));assert.ok(!modal.body.includes('<option value="言语理解">'));
async function main(){
 const before=JSON.stringify(s);
 for(const scope of S.reviewScopeOptions(s)){
  const wanted=questions.filter(q=>q.expected===scope),indexes=wanted.map(q=>questions.indexOf(q)+1);
  S.exportTextReview(s,scope);assert.ok(downloads.at(-1).name.includes(scope));
  await S.copyReviewText(s,scope,{});
  for(const q of questions){assert.equal(downloads.at(-1).text.includes(q.stemHtml),wanted.includes(q));assert.equal(copied.includes(q.stemHtml),wanted.includes(q));}
  for(const mode of ['images','notes']){
   const result=await S.buildReviewPackages(s,{subject:scope,mode});assert.deepEqual(Array.from(result.summary,x=>x.index),indexes);assert.ok(result.packages[0].name.includes(scope));
   const files=new Map(packed.at(-1)),index=JSON.parse(files.get('index.json'));assert.deepEqual(index.map(x=>x.index),indexes);assert.equal(JSON.parse(files.get('manifest.json')).questionCount,wanted.length);
   for(const q of wanted){const n=questions.indexOf(q)+1,prefix='questions/Q'+String(n).padStart(3,'0');assert.equal(JSON.parse(files.get(prefix+'/question.json')).questionId,q.id);if(q.materialKey)assert.ok([...files.keys()].some(k=>k.endsWith('/material.json')));if(mode==='notes')assert.ok(files.has(prefix+'/ink.json'));}
  }
 }
 assert.equal(JSON.stringify(s),before);
 const scoped={...s,excluded:['q0']};assert.doesNotMatch(S.analysisText(scoped,{subject:'图推'}),/fixture-stem-0\b/);assert.match(S.aiScopeSummary(scoped,'图推'),/不纳入 1题/);assert.match(S.aiScopeSummary(s,'言语填空'),/纳入 1题/);assert.match(S.aiScopeSummary(s,'篇章阅读'),/纳入 3题/);
 assert.equal(S.reviewScopeMatches(questions[0],'判断推理'),true);assert.equal(S.reviewScopeMatches(questions[7],'言语理解'),true);assert.equal(S.reviewScopeMatches(questions[7],'言语理解与表达'),true);assert.equal(S.reviewScopeMatches(questions[0],'类比'),false);
 console.log('PASS: all '+Object.values(counts).reduce((a,b)=>a+b,0)+' configured taxonomy nodes mapped; flat dropdown; copy/text/images/notes actual export paths; counts/original numbering/materials/exclusions; legacy subject filters; source data intact');console.log(JSON.stringify(counts));
}
main().catch(e=>{console.error(e);process.exitCode=1});
