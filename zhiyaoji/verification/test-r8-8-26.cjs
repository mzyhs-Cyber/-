const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=process.env.ZHIYAOJI_TEST_APP||(fs.existsSync(path.join(__dirname,'r8_8_26'))?path.join(__dirname,'r8_8_26'):path.join(__dirname,'../app'));
const bundle=fs.readFileSync(path.join(base,'bundle.js'),'utf8');
const stable=x=>JSON.stringify(x),packets=[],remote=new Map();
const S={state:{sessions:[],attempts:[],meta:{syncOwnerId:'test-owner'}},SyncModel:{stable},reviewUploading:new Set(),reviewUploadReceipts:new Map(),getAttempt:()=>null,sessionAnswer:(s,q)=>s.answers[q.id],isFavorite:q=>q.favorite===true,touchSession(){},saveSoon(){},saveHot:async()=>{},rebuildLearningStats(){},closeReview(){},showReport(){},toast(){},reviewFinishButton(){},escape:x=>x,plain:x=>x||'',reviewReasons:()=>['incorrect']};
const c=vm.createContext({window:{Study:S},navigator:{onLine:true},Date,E:x=>x});
const catalog=bundle.split('\n').find(x=>x.startsWith('S.FENBI_CATALOG='));vm.runInContext('(function(S){'+catalog+'})(window.Study)',c);
const start=bundle.indexOf('const subjectName=x=>'),end=bundle.indexOf('let unitRevision=',start);vm.runInContext('(function(S){'+bundle.slice(start,end)+'})(window.Study)',c);
const a=bundle.indexOf('S.reviewDefaultIncluded='),b=bundle.indexOf('S.reviewFeedbackMarkup=',a);vm.runInContext('(function(S){'+bundle.slice(a,b)+'})(window.Study)',c);
for(const name of ['S.reviewChips=','S.aiCandidates=s=>'])vm.runInContext('(function(S){'+bundle.split('\n').find(x=>x.startsWith(name))+'})(window.Study)',c);
const beforeDefault=S.reviewDefaultIncluded;
vm.runInContext(fs.readFileSync(path.join(base,'review-only-upload.js'),'utf8'),c);
function session(questions,id='review'){return {id,finished:true,questions,answers:Object.fromEntries(questions.map(q=>[q.id,{selected:'B',seconds:60}])),reviewFeedback:{},notes:{privateInk:'untouched'},submissionEvidence:{privateInk:'frozen'}};}
let checked=0;
// Exercise every configured political/general/quantitative category, including leaf-only labels.
for(const p of S.FENBI_CATALOG.filter(p=>['政治理论','常识判断','数量关系'].includes(p[0]))){
 for(const leafOnly of [false,true]){
  const q={id:'q',subject:p[0],path:leafOnly?p.slice(-1):p.slice(1),answer:'A',favorite:true},s=session([q]);
  const numeric=p[0]==='数量关系'&&p[1]==='数字推理';
  assert.equal(beforeDefault(s,q.id),true);assert.equal(S.isLearningExcluded(s,q.id),!numeric,p.join('/')+' leafOnly='+leafOnly);checked++;
 }
}
const qs=[{id:'politics',subject:'政治理论',path:['新思想'],favorite:true},{id:'general',subject:'常识判断'},{id:'arith',subject:'数量关系',path:['工程问题']},{id:'numeric',subject:'数量关系',path:['多级数列']},{id:'numeric-id',subject:'数量关系',classification:{primaryId:'QUANT_SEQUENCE_BASIC_01'}},{id:'numeric-type',subject:'数量关系',type:'数字推理'},{id:'unknown-quant',subject:'数量关系',path:['未知标签']},{id:'logic',subject:'判断推理',path:['图形推理']},{id:'verbal',subject:'言语理解',path:['逻辑填空']},{id:'data',subject:'资料分析',path:['增长率']},{id:'correct-numeric',subject:'数量关系',path:['数字推理']}].map(q=>({answer:'A',...q}));
const s=session(qs);s.answers['correct-numeric'].selected='A';S.state.sessions=[s];
// Old computed defaults must refresh; manually chosen states, even without a legacy flag, survive.
s.reviewFeedback.politics={userCause:'旧的错因',exclusionReason:'',excludeFromLearning:false,inclusionOverride:false};
S.refreshReviewDefaults(s,true);assert.equal(s.reviewFeedback.politics.excludeFromLearning,true);assert.equal(s.reviewFeedback.politics.userCause,'旧的错因');assert.equal(s.reviewFeedback.politics.inclusionOverride,false);
const defaults=['politics','general','arith','unknown-quant','correct-numeric'];
for(const q of qs){assert.equal(S.isLearningExcluded(s,q.id),defaults.includes(q.id),q.id);assert.ok(S.reviewChips(s,q.id).includes('>'+ (defaults.includes(q.id)?'不纳入':'纳入')+'</button>'));}
assert.deepEqual(Array.from(S.aiCandidates(s),x=>x.q.id),['numeric','numeric-id','numeric-type','logic','verbal','data']);
S.setReviewFeedback(s,'politics',{excludeFromLearning:false});S.setReviewFeedback(s,'numeric',{excludeFromLearning:true});S.setReviewFeedback(s,'arith',{userCause:'只写错因，不改选择'});
S.refreshReviewDefaults(s,true);assert.equal(S.isLearningExcluded(s,'politics'),false);assert.equal(S.isLearningExcluded(s,'numeric'),true);assert.equal(S.isLearningExcluded(s,'arith'),true);assert.equal(s.reviewFeedback.arith.inclusionOverride,false);
s.reviewFeedback.general={excludeFromLearning:false,userCause:'历史手动纳入'};S.refreshReviewDefaults(s,true);assert.equal(S.isLearningExcluded(s,'general'),false);
const untouched=JSON.stringify([s.questions,s.answers,s.notes,s.submissionEvidence]);
S.accountSync={user:{id:'test-owner'},deviceId:'test-device',requestSync(){throw Error('bulk ink sync forbidden')},request:async(url,p)=>{assert.equal(url,'/api/review/update');packets.push(JSON.parse(JSON.stringify(p)));remote.set(p.sessionId,p.reviewFeedback);return {ok:true,notesUploaded:false,ownerId:p.ownerId,sessionId:p.sessionId,reviewRevision:p.reviewRevision+1,reviewCompletion:{status:'confirmed',revision:p.reviewRevision+1,feedbackSignature:stable(p.reviewFeedback)}};}};
async function main(){
 assert.equal(await S.completeReview(s.id),true);assert.equal(S.reviewReady(s),true);
 let f=remote.get(s.id);for(const id of ['arith','unknown-quant','numeric'])assert.equal(f[id].excludeFromLearning,true);for(const id of ['politics','general','numeric-id','numeric-type'])assert.equal(f[id].excludeFromLearning,false);assert.equal(f.arith.inclusionOverride,false);assert.equal(f.politics.inclusionOverride,true);
 S.setReviewFeedback(s,'politics',{excludeFromLearning:true});assert.equal(await S.completeReview(s.id),true);assert.equal(remote.size,1);assert.equal(remote.get(s.id).politics.excludeFromLearning,true);
 const reopened=JSON.parse(JSON.stringify(s));S.refreshReviewDefaults(reopened,true);assert.equal(S.isLearningExcluded(reopened,'politics'),true);assert.equal(S.isLearningExcluded(reopened,'general'),false);assert.equal(S.isLearningExcluded(reopened,'arith'),true);
 for(const p of packets)assert.doesNotMatch(JSON.stringify(p),/privateInk|notes|strokes|points|submissionEvidence/);
 assert.equal(JSON.stringify([s.questions,s.answers,s.notes,s.submissionEvidence]),untouched);
 assert.equal(S.BUILD,'20261027-r8-8-26');
 console.log('PASS: '+checked+' actual taxonomy variants; politics/general/non-numeric quantity defaults across chips/AI candidates/upload; numeric and other modules retain original rule; old computed defaults refreshed, manual and legacy overrides retained; cause-only edits, repeat overwrite/reopen, no ink or source mutation');
}
main().catch(e=>{console.error(e);process.exitCode=1});
