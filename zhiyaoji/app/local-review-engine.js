/* Local, deterministic selection. No network, AI, DOM, ink or state writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LocalReviewEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=7,DAY=86400000,QUOTAS={'言语理解':10,'逻辑判断':8,'资料分析':5,'数字推理':7};
 const NUMERIC_REFERENCES=[{"title":"2024年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","year":2024,"slots":[{"id":"paper-1iobmr1::3_1_5kkcs","canonicalId":"canonical-jint3p","paperTitle":"2024年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2024,"rate":61,"localTopicPaths":[["数字推理","因数分解数列","因子规律"]]},{"id":"paper-1iobmr1::3_1_5kkct","canonicalId":"canonical-1x0616v","paperTitle":"2024年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2024,"rate":71,"localTopicPaths":[["数字推理","多级数列","作差成等比"]]},{"id":"paper-1iobmr1::3_1_edem8","canonicalId":"canonical-1u4hx0f","paperTitle":"2024年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2024,"rate":60,"localTopicPaths":[["数字推理","机械划分","整数小数拆分"],["数字推理","机械划分","数位求和"]]},{"id":"paper-1iobmr1::3_1_eden3","canonicalId":"canonical-h5tffe","paperTitle":"2024年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2024,"rate":41,"localTopicPaths":[["数字推理","机械划分","根式分部规律"]]},{"id":"paper-1iobmr1::3_1_5kkba","canonicalId":"canonical-jgchra-1u0i956","paperTitle":"2024年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2024,"rate":59,"localTopicPaths":[["数字推理","分数数列","分子分母联动"]]}]},{"title":"2023年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","year":2023,"slots":[{"id":"paper-41eege::3_1_5drm1","canonicalId":"canonical-u4bcy3","paperTitle":"2023年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2023,"rate":28,"localTopicPaths":[["数字推理","多级数列","差商复合规律"]]},{"id":"paper-41eege::3_1_5drm3","canonicalId":"canonical-rla3mi","paperTitle":"2023年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2023,"rate":83,"localTopicPaths":[["数字推理","作商数列","作商成分数规律"]]},{"id":"paper-41eege::3_1_5drmh","canonicalId":"canonical-1385vxx-7glao2","paperTitle":"2023年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2023,"rate":72,"localTopicPaths":[["数字推理","分数数列","反约分规律"],["数字推理","分数数列","分子分母分开"]]},{"id":"paper-41eege::3_1_5drmq","canonicalId":"canonical-1yoo50k","paperTitle":"2023年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2023,"rate":49,"localTopicPaths":[["数字推理","机械划分","根式分部规律"]]},{"id":"paper-41eege::3_1_5drms","canonicalId":"canonical-1ldff0c","paperTitle":"2023年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2023,"rate":82,"localTopicPaths":[["数字推理","机械划分","整数小数拆分"]]}]},{"title":"2022年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","year":2022,"slots":[{"id":"paper-131gh1v::3_1_4duek","canonicalId":"canonical-eib69v","paperTitle":"2022年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2022,"rate":50,"localTopicPaths":[["数字推理","多级数列","作差成等比"]]},{"id":"paper-131gh1v::3_1_4dukf","canonicalId":"canonical-1ahd6y5","paperTitle":"2022年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2022,"rate":64,"localTopicPaths":[["数字推理","分数数列","反约分规律"],["数字推理","分数数列","分子分母联动"]]},{"id":"paper-131gh1v::3_1_4duem","canonicalId":"canonical-1gvw2i5","paperTitle":"2022年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2022,"rate":69,"localTopicPaths":[["数字推理","机械划分","整数小数拆分"]]},{"id":"paper-131gh1v::3_1_4duf2","canonicalId":"canonical-1021c02","paperTitle":"2022年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2022,"rate":74,"localTopicPaths":[["数字推理","机械划分","根式分部规律"]]},{"id":"paper-131gh1v::3_1_4dufd","canonicalId":"canonical-15pwyg1","paperTitle":"2022年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2022,"rate":46,"localTopicPaths":[["数字推理","分数数列","反约分规律"],["数字推理","分数数列","分子分母分开"]]}]},{"title":"2021年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","year":2021,"slots":[{"id":"paper-169o64c::3_1_2jlu3","canonicalId":"canonical-gsgghp","paperTitle":"2021年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2021,"rate":62,"localTopicPaths":[["数字推理","多级数列","多次差分"]]},{"id":"paper-169o64c::3_1_2jlu5","canonicalId":"canonical-1dlu3re","paperTitle":"2021年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2021,"rate":75,"localTopicPaths":[["数字推理","多级数列","作差成等比"]]},{"id":"paper-169o64c::3_1_2jlue","canonicalId":"canonical-1px97t4-7glao2","paperTitle":"2021年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2021,"rate":77,"localTopicPaths":[["数字推理","作和作积数列","作和后再作差"],["数字推理","多级数列","作差后求和"]]},{"id":"paper-169o64c::3_1_2jlug","canonicalId":"canonical-a8umnh","paperTitle":"2021年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2021,"rate":71,"localTopicPaths":[["数字推理","机械划分","整数小数拆分"]]},{"id":"paper-169o64c::3_1_2jlu0","canonicalId":"canonical-xq5hoq-7glao2","paperTitle":"2021年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2021,"rate":45,"localTopicPaths":[["数字推理","分数数列","反约分规律"],["数字推理","分数数列","分子分母分开"],["数字推理","作商数列","作商成分数规律"]]}]},{"title":"2020年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","year":2020,"slots":[{"id":"paper-4p9n15::3_1_2ar7k","canonicalId":"canonical-2at5d7","paperTitle":"2020年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2020,"rate":76,"localTopicPaths":[["数字推理","机械划分","整数小数拆分"]]},{"id":"paper-4p9n15::3_1_2ar7n","canonicalId":"canonical-8x4dv9","paperTitle":"2020年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2020,"rate":90,"localTopicPaths":[["数字推理","机械划分","根式分部规律"]]},{"id":"paper-4p9n15::3_1_2ar7p","canonicalId":"canonical-tm8gu9","paperTitle":"2020年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2020,"rate":66,"localTopicPaths":[["数字推理","分数数列","反约分规律"],["数字推理","分数数列","分子分母分开"]]},{"id":"paper-4p9n15::3_1_2ar7q","canonicalId":"canonical-72us38","paperTitle":"2020年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2020,"rate":76,"localTopicPaths":[["数字推理","特殊数列","时间数列"]]},{"id":"paper-4p9n15::3_1_2ar7r","canonicalId":"canonical-ww3ey6","paperTitle":"2020年江苏省公务员录用考试《行测》题（B类）（网友回忆版）","subject":"数量关系","year":2020,"rate":59,"localTopicPaths":[["数字推理","幂次数列","底数指数规律"]]}]}];
 const formats=new Set(['文字资料','统计表','统计图','综合资料','图形资料','表格资料']);
 const unknown=new Set(['其他','待分类','未细分','未分类']);
 const median=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);return b.length?(b[Math.floor(b.length/2)]+b[Math.floor((b.length-1)/2)])/2:null;};
 const hash=s=>{let n=2166136261;for(const c of String(s)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;};
 const day=t=>new Date(t+8*3600000).toISOString().slice(0,10);
 function rate(q){if(q?.rate==null||String(q.rate).trim()==='')return null;const n=Number(String(q.rate).replace(/%$/,''));return Number.isFinite(n)&&n>=0&&n<=100?n:null;}
 function describe(q,paths=[]){
  const clean=paths.filter(p=>Array.isArray(p)&&p.length&&!p.some(x=>unknown.has(x))).map(p=>p.map(String));
  const module=q.subject==='数量关系'&&clean.some(p=>p[0]==='数字推理')?'数字推理':q.subject==='言语理解'?'言语理解':q.subject==='资料分析'?'资料分析':q.subject==='判断推理'&&clean.some(p=>p[0]==='逻辑判断')?'逻辑判断':null;
  const relevant=clean.filter(p=>module!=='逻辑判断'||p[0]==='逻辑判断').filter(p=>module!=='数字推理'||p[0]==='数字推理').filter(p=>module!=='资料分析'||!formats.has(p[0]));
  relevant.sort((a,b)=>b.length-a.length||a.join('/').localeCompare(b.join('/'),'zh'));
  // Material form is not a numerical operation. Never infer a mechanism from prose.
  const keys=[...new Set(relevant.map(p=>p.join('/')))];
  const primary=relevant[0]||[],family=['逻辑判断','数字推理'].includes(module)?primary[1]:primary[0];
  const specific=primary.length>=3;
  const multiPoint=module==='资料分析'&&keys.length>1;
  return {module,keys,key:multiPoint?keys.join(' + '):keys[0]||module+'/待细分',family:family||'待细分',label:primary.join(' / ')||'待细分',specific,multiPoint,rate:rate(q)};
 }
 function confidence(a,s,cutoff=Infinity){
  const f=s?.reviewFeedback?.[a.questionId],v=(Number(f?.updatedAt)>cutoff?undefined:f?.confidence)??s?.answers?.[a.questionId]?.confidence??a.confidence??a.certainty;
  if(v===2||v==='A2'||v==='guess'||v==='guessed')return 'guess';
  if(v===1||v==='A1'||v==='uncertain')return 'uncertain';
  return v==='A'||v==='certain'||v==='high'||v===0?'certain':'unknown';
 }
 function timing(value){
  if(!value||value.valid!==true)return {valid:false,slow:false,scope:'question'};
  const group=value.scope==='group',actual=Number(group?(value.groupActualSeconds??value.actualSeconds):value.actualSeconds),threshold=Number(group?(value.groupThresholdSeconds??value.thresholdSeconds):value.thresholdSeconds);
  if(!Number.isFinite(actual)||actual<=0||!Number.isFinite(threshold)||threshold<=0)return {valid:false,slow:false,scope:group?'group':'question'};
  return {valid:true,slow:actual>threshold,scope:group?'group':'question',actualSeconds:actual,thresholdSeconds:threshold,groupId:group?String(value.groupId||''):null};
 }
 function evidenceWeight(e){
  if(e.confidence==='guess')return {baseWeight:e.result==='incorrect'?10:e.result==='correct'?5:0,weightReason:e.result==='incorrect'?'蒙答错误':'蒙对待验证'};
  const choices=[];
  if(e.result==='incorrect')choices.push([e.included?100:25,e.included?'纳入错题':'低优先级错题']);
  if(e.timing?.slow)choices.push([e.result==='incorrect'?70:25,e.result==='incorrect'?'超时错题':'超时答对']);
  if(e.favorite)choices.push([50,'收藏']);
  if(e.result==='correct'&&e.confidence==='uncertain')choices.push([5,'不确定待验证']);
  if(e.result==='unanswered'&&e.included)choices.push([25,'主动纳入待验证']);
  choices.sort((a,b)=>b[0]-a[0]);const best=choices[0];return {baseWeight:best?.[0]||0,weightReason:best?.[1]||'正常作答'};
 }
 function estimate(q,d){
  const known=Number(q._referenceSeconds);if(Number.isFinite(known)&&known>0)return known;
  const text=d.label||'';if(d.module==='言语理解')return /填空/.test(text)?45:65;
  if(d.module==='逻辑判断')return /排列|分组|分析推理|排序|对应/.test(text)?100:75;
  if(d.module==='资料分析')return /综合|混合|年均|间隔/.test(text)?90:65;
  return 65;
 }
 function buildContext(data,options={}){
  const now=options.now??Date.now(),learningAsOf=options.learningAsOf??now,canonical=options.canonical||(q=>q.canonicalId||q.id||q.questionId||''),paths=options.paths||(q=>q.localTopicPaths||[]);
  const sessions=new Map((data.sessions||[]).map(s=>[s.id,s])),byId=new Map(),byCanonical=new Map(),descriptors=new Map();
  for(const q of data.bank||[]){byId.set(q.id,q);const c=canonical(q);if(!byCanonical.has(c)||byCanonical.get(c).archived)byCanonical.set(c,q);descriptors.set(q.id,describe(q,paths(q)));}
  const seen=new Set(),signals=[],dedup=new Set(),latestByCanonical=new Map(),todaySeen=new Set(),diagnostics={outsideWindow:0,excluded:0,lowPriority:0,unanswered:0,ungraded:0,duplicate:0,noType:0,invalidTiming:0,invalidEvidence:0};
  for(const a of (data.attempts||[]).slice().sort((a,b)=>Number(a.finishedAt)-Number(b.finishedAt))){
   const at=Number(a.finishedAt);if(!Number.isFinite(at)||at>now)continue;
   const c=canonical(byId.get(a.questionId)||{canonicalId:a.canonicalId,id:a.questionId}),fresh=!seen.has(c);if(c)seen.add(c);
   const id=a.sessionId+'|'+c;if(dedup.has(id)){diagnostics.duplicate++;continue;}dedup.add(id);
   if(at>learningAsOf){todaySeen.add(c);continue;}
   const s=sessions.get(a.sessionId),rawFeedback=s?.reviewFeedback?.[a.questionId],f=Number(rawFeedback?.updatedAt)>learningAsOf?null:rawFeedback;
   const explicit=f?.inclusionOverride!==false&&typeof f?.excludeFromLearning==='boolean';
   if(explicit&&f.excludeFromLearning===true)diagnostics.lowPriority++;
   if(at<now-14*DAY)diagnostics.outsideWindow++;
   if(a.gradingStatus!=='graded'||!a.answer||a.answerConflict){diagnostics.ungraded++;continue;}
   const q=byId.get(a.questionId)||byCanonical.get(c)||a.questionSnapshot||a,d=descriptors.get(q.id)||describe(q,paths(q));if(!d.module){diagnostics.noType++;continue;}
   if(q.disputed||q.answerConflict||q._catalogEligible===false||q.contentStatus&&q.contentStatus!=='complete'||q.materialComplete===false||q.materialStatus==='missing'){diagnostics.invalidEvidence++;continue;}
   const conf=confidence(a,s,learningAsOf),feedback=s?.mode==='local-review'||s?.mode==='daily'||!!s?.dailyPackHash||!!s?.blueprint?.localReview;
   const result=a.selected==null?'unanswered':a.result;
   // Skipped questions are neither failures nor successes. Explicit inclusion queues verification only.
   const favorite=typeof q._favorite==='boolean'?q._favorite:!!(data.favorites?.[c]??a.favoriteAtAttempt);
   if(result==='unanswered'&&!(explicit&&!f.excludeFromLearning)&&!favorite){diagnostics.unanswered++;continue;}
   if(result==='incorrect'||result==='correct'||result==='unanswered'){
    let assessment=timing(a.timeAssessment);if(!assessment.valid)assessment=timing(s?.timeAssessment?.questions?.[a.questionId]);if(!assessment.valid)diagnostics.invalidTiming++;
    const included=typeof f?.excludeFromLearning==='boolean'?!f.excludeFromLearning:result==='incorrect'||favorite;
    const event={canonical:c,questionId:q.id,at,result,confidence:conf,feedback,fresh,descriptor:d,rate:rate(q),explicit,included,favorite,timing:assessment,seconds:Number(a.seconds??s?.answers?.[a.questionId]?.seconds)||null,sourceSessionId:a.sessionId};
    Object.assign(event,evidenceWeight(event));signals.push(event);latestByCanonical.set(c,event);
   }
  }
  // A pending answer was still seen, even if never submitted or excluded from analysis.
  for(const s of data.sessions||[])if(Number(s.startedAt)<=now)for(const [qid,a] of Object.entries(s.answers||{}))if(a?.selected!=null){const q=byId.get(qid);if(q)seen.add(canonical(q));}
  // A current favorite without an attempt is a deliberate training preference.
  for(const q of data.bank||[]){const c=canonical(q),d=descriptors.get(q.id),favorite=typeof q._favorite==='boolean'?q._favorite:!!data.favorites?.[c];
   if(!favorite||latestByCanonical.has(c)||!d.module||!valid(q))continue;
   signals.push({canonical:c,questionId:q.id,at:learningAsOf,result:'favorite',confidence:'unknown',feedback:false,fresh:false,descriptor:d,rate:rate(q),favorite:true,included:false,timing:{valid:false,slow:false},baseWeight:50,weightReason:'收藏',sourceSessionId:null});
  }
  const due=new Map();for(const [c,v]of Object.entries(data.reviewState||{})){const at=Number(v?.nextReviewAt),last=Number(v?.lastAttemptAt);if(at>0&&at<=learningAsOf&&last>0&&now-last>=3*DAY&&!todaySeen.has(c))due.set(canonical({canonicalId:c}),at);}
  return {now,canonical,descriptors,byId,seen,signals,diagnostics,due};
 }
 function priorities(context,strategy='feedback'){
  const groups=new Map();
  for(const e of context.signals){const key=e.descriptor.module+'|'+e.descriptor.key;if(!groups.has(key))groups.set(key,{key,descriptor:e.descriptor,events:[]});groups.get(key).events.push(e);}
  const rows=[];
  for(const g of groups.values()){
   const wrong=g.events.filter(e=>e.result==='incorrect'),uncertain=g.events.filter(e=>e.result==='correct'&&['guess','uncertain'].includes(e.confidence)),pending=g.events.filter(e=>e.result==='unanswered');
   const failed=g.events.filter(e=>e.baseWeight>0);if(!failed.length)continue;
   const negative=failed.filter(e=>e.result!=='favorite'&&!(e.result==='correct'&&e.favorite&&!e.timing?.slow&&!['guess','uncertain'].includes(e.confidence)));
   const last=Math.max(...(negative.length?negative:failed).map(e=>e.at));
   // Latest evidence per canonical prevents repeat practice on one familiar item proving transfer.
   const latest=new Map();for(const e of g.events)latest.set(e.canonical,e);
   const success=[...latest.values()].filter(e=>e.at>last&&e.result==='correct'&&e.confidence==='certain'&&e.fresh&&e.timing?.valid&&!e.timing.slow);
   const feedbackSuccess=success.filter(e=>e.feedback&&e.fresh&&e.confidence==='certain'),feedbackWrong=wrong.filter(e=>e.feedback);
   const failures=new Set(wrong.filter(e=>e.confidence!=='guess'&&e.at>=context.now-14*DAY).map(e=>e.timing?.scope==='group'&&e.weightReason==='超时错题'?e.sourceSessionId+'|'+e.timing.groupId:e.canonical)).size;
   const days=(context.now-last)/DAY,recency=days<=7?1:days<=14?.85:days<=30?.65:.45;
   const strongest=failed.slice().sort((a,b)=>b.baseWeight-a.baseWeight||b.at-a.at)[0],baseWeight=strongest.baseWeight;
   const repeatFactor=1+.25*Math.min(4,Math.max(0,failures-1)),masteryFactor=Math.pow(.7,Math.min(3,success.length));
   const feedbackFactor=strategy==='feedback'&&negative.some(e=>e.at===last&&e.feedback&&e.confidence!=='guess'&&e.result==='incorrect')?1.2:1;
   const favoriteFloor=failed.some(e=>e.favorite&&e.confidence!=='guess')?50:0;
   const score=Math.max(.25,favoriteFloor,baseWeight*repeatFactor*recency*masteryFactor*feedbackFactor);
   rows.push({...g,score,baseWeight,weightReason:strongest.weightReason,repeatFactor,recency,masteryFactor,feedbackFactor,wrong:wrong.length,uniqueWrong:failures,feedbackWrong:feedbackWrong.length,feedbackSuccess:feedbackSuccess.length,pending:pending.length,last,referenceRate:median(failed.filter(e=>e.baseWeight===baseWeight).map(e=>e.rate)),sourceIds:[...new Set(failed.map(e=>e.canonical))],status:success.length>=2?'阶段降权':success.length?'继续验证':'待验证'});
  }
  return rows.sort((a,b)=>b.score-a.score||b.last-a.last||a.key.localeCompare(b.key));
 }
 function match(d,p){
  if(d.module!==p.descriptor.module)return 0;
  const shared=d.keys.filter(k=>p.descriptor.keys.includes(k));
  if(shared.length)return shared.some(k=>k.split('/').length>=3)?3:2;
  if(d.family!=='待细分'&&d.family===p.descriptor.family)return 1;
  return 0;
 }
 function valid(q){
  if(q._catalogEligible===false)return false;
  const text=h=>String(h||'').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/gi,' ').trim();
  const present=h=>!!text(h)||/<(?:img|svg)\b/i.test(String(h||''));
  const usableImages=html=>[...String(html||'').matchAll(/<img\b[^>]*>/gi)].every(m=>{const src=m[0].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);return !!src&&/^(?:https?:\/\/|\/\/|bank\/assets\/[\w.-]+$|data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,])/i.test((src[1]??src[2]??src[3]??'').trim());});
  return typeof q.id==='string'&&!!q.id&&!q.archived&&!q.demo&&!q.answerConflict&&!q.disputed&&(!q.gradingStatus||q.gradingStatus==='graded')&&(!q.contentStatus||q.contentStatus==='complete')&&(!q.sourceQuestionType||q.sourceQuestionType==='single_choice')&&/^[ABCD]$/.test(q.answer||'')&&Array.isArray(q.optionsHtml)&&q.optionsHtml.length===4&&q.optionsHtml.every(present)&&present(q.stemHtml)&&[q.stemHtml,...q.optionsHtml,q.materialHtml].every(usableImages)&&(!q.materialKey||(present(q.materialHtml)&&q.materialStatus!=='missing'&&q.materialComplete!==false));
 }
 function select(data,options={}){
  const started=Date.now(),context=options.context||buildContext(data,options),strategy=options.strategy||'feedback',ranked=priorities(context,strategy),seed=options.seed||day(context.now),canonical=context.canonical;
  const allGroups=new Map(),units=[],issues={invalid:0,partialGroup:0,unclassified:0};
  const keyFor=options.groupKey||(q=>q.materialKey?'m:'+q.paperId+':'+q.materialKey:'q:'+q.id);
  for(const q of data.bank||[]){const k=q.subject==='资料分析'?'data-question:'+q.id:keyFor(q);if(!allGroups.has(k))allGroups.set(k,[]);allGroups.get(k).push(q);}
  for(const [key,members] of allGroups){
   if(members.some(q=>!valid(q)||options.allow&&!options.allow(q))){issues.invalid+=members.length;continue;}
   const ds=members.map(q=>context.descriptors.get(q.id)),module=ds[0]?.module;
   if(!module||ds.some(d=>d.module!==module)){issues.unclassified+=members.length;continue;}
   const material=!!members[0].materialKey;
   if(material&&module!=='资料分析'){const expected=Math.max(...members.map(q=>Number(q.materialExpectedCount)||0));const expectedSlots=options.expectedCount?.(members[0])||0;
    if(!(expected||expectedSlots)||members.length!==(expected||expectedSlots)||new Set(members.map(q=>String(q.materialHtml).trim())).size!==1){issues.partialGroup++;continue;}}
   if(module==='资料分析'&&!material){issues.partialGroup++;continue;}
   if(members.length>QUOTAS[module]||new Set(members.map(canonical)).size!==members.length)continue;
   members.sort((a,b)=>Number(a.paperOrder||a.order||0)-Number(b.paperOrder||b.order||0));
   units.push({key,members,module,descriptors:members.map(q=>context.descriptors.get(q.id))});
  }
  const quotas=options.quotas?Object.fromEntries(Object.keys(QUOTAS).map(m=>[m,Number.isInteger(options.quotas[m])?Math.max(0,Math.min(30,options.quotas[m])):0])):{...QUOTAS};const main=['言语理解','逻辑判断','资料分析'];

  const rows=[],modules=[],selectedCanonicals=new Set();let usedSeconds=0,repeatedCount=0;const repeatLimit=Math.max(0,Math.min(2,Number(options.repeatLimit??2))),budgetSeconds=Math.max(600,Number(options.timeBudgetSeconds)||2400);
  const candidateCounts={};for(const module of Object.keys(QUOTAS)){
   const bank=(data.bank||[]).filter(q=>context.descriptors.get(q.id)?.module===module);
   const complete=bank.filter(valid),allowed=complete.filter(q=>!options.allow||options.allow(q));
   const available=units.filter(u=>u.module===module&&!u.members.some(q=>context.seen.has(canonical(q))));
   candidateCounts[module]={recognized:bank.length,complete:complete.length,sourceAllowed:allowed.length,unseen:new Set(allowed.filter(q=>!context.seen.has(canonical(q))).map(canonical)).size,eligible:new Set(available.flatMap(u=>u.members.map(canonical))).size};
  }
  const jsTemplates=new Map();for(const q of data.bank||[]){const d=context.descriptors.get(q.id);if(d?.module==='数字推理'&&/江苏/.test(q.paperTitle||'')&&/B类|B卷/.test(q.paperTitle||'')&&!/模拟/.test(q.paperTitle||'')){const k=q.paperId;if(!jsTemplates.has(k))jsTemplates.set(k,[]);jsTemplates.get(k).push(q);}}
  const templates=[...jsTemplates.values()].filter(a=>a.length===5).sort((a,b)=>Number(b[0].year)-Number(a[0].year));
  const numericDescriptor=q=>q.localTopicPaths?describe(q,q.localTopicPaths):context.descriptors.get(q.id);
  const references=[...templates.slice(0,5),...NUMERIC_REFERENCES.map(p=>p.slots)];
  const numericUnits=units.filter(u=>u.module==='数字推理'&&u.members.length===1&&!context.seen.has(canonical(u.members[0])));
  function assignment(slots){
   const occupied=new Map(),chosen=new Map();
   function place(i,visited){const p={descriptor:numericDescriptor(slots[i])};for(const u of numericUnits){const q=u.members[0],c=canonical(q),d=context.descriptors.get(q.id),gap=rate(q)!==null&&rate(slots[i])!==null?Math.abs(rate(q)-rate(slots[i])):null;
    if(visited.has(c)||match(d,p)!==3||gap!==null&&gap>15)continue;visited.add(c);if(!occupied.has(c)||place(occupied.get(c),visited)){occupied.set(c,i);chosen.set(i,c);return true;}}return false;}
   for(let i=0;i<slots.length;i++)if(!place(i,new Set()))return null;
   return chosen;
  }
  let template=[],numericAssignment=null;for(let n=0;n<references.length;n++){const candidate=references[(hash(seed)+n)%references.length],found=assignment(candidate);if(found){template=candidate;numericAssignment=found;break;}}
  if(!template.length)template=references[hash(seed)%Math.max(1,references.length)]||[];

  for(const [module,target] of Object.entries(quotas)){
   const realGoals=ranked.filter(p=>p.descriptor.module===module),goals=realGoals,chosen=[],remaining=units.filter(u=>u.module===module),counts=new Map(),goalCounts=new Map(),families=new Map();let count=0,moduleRepeats=0;
   const dueAllowed=u=>u.members.length===1&&moduleRepeats<1&&repeatedCount<repeatLimit&&context.due?.has(canonical(u.members[0]));
   const evaluate=(u,diverse=true)=>{
    let exact=0,related=0,total=0,distance=0,known=0,unseen=0,near=0;const reasons=[];
    for(const q of u.members){const d=context.descriptors.get(q.id),fresh=!context.seen.has(canonical(q));if(fresh)unseen++;
     let best=null;const position=count+(module==='数字推理'?Math.max(0,Math.min(7,Number(options.numericOffset)||0)):0),slot=module==='数字推理'&&position<5?template[position]:null;const activeGoals=slot?[{key:'江苏B卷组合|'+position,descriptor:numericDescriptor(slot),referenceRate:rate(slot),score:10,sourceIds:[canonical(slot)]}]:goals;for(const p of activeGoals){const tier=match(d,p);if(!tier)continue;const gap=d.rate!==null&&p.referenceRate!==null?Math.abs(d.rate-p.referenceRate):null;
      const repeats=goalCounts.get(p.key)||0,concentration=strategy==='frequency'||!diverse?1:1/(1+repeats*1.8);
      const value=p.score*(tier===3?5:tier===2?3:1)*concentration;
      const rank=tier*1e9+(gap===null?0:gap<=15?2:gap<=25?1:0)*1e6+Math.min(999999,value)/(1+(gap||0)/30);if(!best||rank>best.rank)best={p,tier,gap,value,rank};}
     if(best){if(best.tier===3)exact++;else related++;if(best.gap!==null){known++;distance+=best.gap;if(best.gap<=15)near++;}
      const matchedKey=d.keys.find(k=>best.p.descriptor.keys.includes(k)&&k.split('/').length>=(best.tier===3?3:1))||null;
      const multiPointMatch=best.tier===3&&module==='资料分析'&&(d.multiPoint||best.p.descriptor.multiPoint);
      total+=best.value;reasons.push({questionId:q.id,goal:best.p.key,sourceIds:best.p.sourceIds,tier:best.tier,matchedKey,multiPointMatch,label:matchedKey?matchedKey.split('/').join(' / '):best.p.descriptor.label,rateGap:best.gap,priority:Number(best.p.score.toFixed(2)),baseWeight:best.p.baseWeight??null,weightReason:best.p.weightReason||null,unseen:fresh,numericRole:module==='数字推理'?(slot?'江苏B卷参考':'补弱'):null,difficultyRelaxed:best.gap!==null&&best.gap>15,kind:slot?((best.tier===3?'江苏B卷同型':'江苏B卷相邻型')+(best.gap===null?'·难度待核':best.gap>15?'·难度放宽':'')):best.tier===3?(multiPointMatch?(best.gap===null?'综合题含同考点·难度待核':'综合题含同考点'):(best.gap===null?'同考点·难度待核':'细型匹配')):best.tier===2?'同类待细分':'相邻题型'});
     }else reasons.push({questionId:q.id,goal:null,sourceIds:[],tier:0,label:d.label,rateGap:null,priority:0,unseen:fresh,numericRole:module==='数字推理'?(slot?'江苏B卷参考':'补弱'):null,difficultyRelaxed:false,kind:slot?'江苏B卷组合补充·非同细型':'一般巩固'});
    }
    // Lexicographic ranking: fine type, unseen, nearby rate, then weighted need.
    const same=exact+related,cap=Math.ceil(target/2),cost=u.members.reduce((n,q)=>n+estimate(q,context.descriptors.get(q.id)),0),budgetOver=Math.max(0,usedSeconds+cost+(target-count-u.members.length)*55-budgetSeconds);
    const countKeys=u.descriptors.map((d,i)=>reasons[i].matchedKey||d.key);
    const over=strategy!=='frequency'&&diverse&&(countKeys.some(k=>(counts.get(module+'|'+k)||0)+countKeys.filter(x=>x===k).length>cap)||reasons.some(r=>r.goal&&(goalCounts.get(r.goal)||0)+reasons.filter(x=>x.goal===r.goal).length>cap));
    const familyPenalty=strategy!=='frequency'&&diverse&&module==='言语理解'?u.descriptors.filter(d=>(families.get(d.family)||0)>=5).length:0;
    return {u,reasons,exact,related,unseen,near,cost,budgetOver,distance:known?distance/known:null,total,same,over,familyPenalty,classified:u.descriptors.filter(d=>d.keys.length).length,tie:hash(seed+'|'+u.key)};
   };
   function candidates(diverse,allowDue=false){return remaining.filter(u=>!chosen.includes(u)&&u.members.length+count<=target&&!u.members.some(q=>selectedCanonicals.has(canonical(q))||context.seen.has(canonical(q))&&!(allowDue&&dueAllowed(u)))).map(u=>evaluate(u,diverse)).filter(x=>(!diverse||!x.over)&&(module!=='数字推理'||count+Math.max(0,Math.min(7,Number(options.numericOffset)||0))>=5||(!numericAssignment||canonical(x.u.members[0])===numericAssignment.get(count+Math.max(0,Math.min(7,Number(options.numericOffset)||0)))))).sort((a,b)=>{
    if(strategy==='frequency')return b.total/b.u.members.length-a.total/a.u.members.length||b.unseen/b.u.members.length-a.unseen/a.u.members.length||a.tie-b.tie;
    // Unseen exact matches win over familiar exact matches, even if the latter have closer rates.
    return b.exact/b.u.members.length-a.exact/a.u.members.length||a.familyPenalty-b.familyPenalty||b.same/b.u.members.length-a.same/a.u.members.length||b.classified/b.u.members.length-a.classified/a.u.members.length||b.unseen/b.u.members.length-a.unseen/a.u.members.length||b.exact/b.u.members.length-a.exact/a.u.members.length||b.near/b.u.members.length-a.near/a.u.members.length||a.budgetOver-b.budgetOver||b.total/b.u.members.length-a.total/a.u.members.length||(a.distance??100)-(b.distance??100)||a.tie-b.tie;
   });}
   // A small exact-sum lookahead prevents a 3-item material blocking a remaining 2+2.
   function completable(first){const limit=target-count-first.members.length;if(!limit)return true;const used=new Set([...selectedCanonicals,...first.members.map(canonical)]);const dp=new Set([0]);
    for(const u of remaining){if(u===first||chosen.includes(u)||u.members.some(q=>used.has(canonical(q))||context.seen.has(canonical(q))&&!dueAllowed(u)))continue;for(const n of [...dp].sort((a,b)=>b-a))if(n+u.members.length<=limit)dp.add(n+u.members.length);if(dp.has(limit))return true;}return false;}
   while(count<target){let list=candidates(true),pick=list.find(x=>completable(x.u)),relaxed=false;
    if(!pick||!pick.same){const due=candidates(true,true).find(x=>x.unseen===0&&x.exact===x.u.members.length&&completable(x.u));if(due)pick=due;}
    if(!pick){list=candidates(false);pick=list.find(x=>completable(x.u))||list[0];relaxed=true;}
    if(!pick){list=candidates(false,true);pick=list.find(x=>completable(x.u))||list[0];relaxed=true;}if(!pick)break;
    const u=pick.u;chosen.push(u);count+=u.members.length;usedSeconds+=pick.cost;if(pick.unseen<u.members.length){moduleRepeats++;repeatedCount+=u.members.length-pick.unseen;}
    for(const q of u.members){const d=context.descriptors.get(q.id),c=canonical(q);selectedCanonicals.add(c);const reason=pick.reasons.find(r=>r.questionId===q.id);const k=module+'|'+(reason.matchedKey||d.key);counts.set(k,(counts.get(k)||0)+1);families.set(d.family,(families.get(d.family)||0)+1);if(reason.goal)goalCounts.set(reason.goal,(goalCounts.get(reason.goal)||0)+1);rows.push({id:q.id,canonical:c,module,unit:u.key,micro:reason.matchedKey?reason.label:d.label,family:d.family,rate:d.rate,...reason,dueRetest:!reason.unseen&&context.due?.has(c),estimatedSeconds:estimate(q,d),diversityRelaxed:relaxed});}
   }
   modules.push({module,requested:target,actual:count,goals:goals.length,shortfall:target-count,units:chosen.length});
  }
  const selected=rows.map(r=>context.byId.get(r.id));
  return {version:VERSION,candidateCounts,learningAsOf:options.learningAsOf??context.now,dataPointToPoint:true,numericReference:template[0]?.paperTitle||null,date:day(context.now),title:day(context.now)+'_定点复盘',strategy,asOf:context.now,ids:rows.map(r=>r.id),rows,modules,priorities:ranked.map(({events,...p})=>p),ready:modules.every(m=>m.shortfall===0),diagnostics:{...context.diagnostics,...issues},metrics:{count:rows.length,estimatedSeconds:usedSeconds,timeBudgetSeconds:budgetSeconds,budgetExceeded:usedSeconds>budgetSeconds,dueRetests:repeatedCount,unseen:rows.filter(r=>r.unseen).length,exact:rows.filter(r=>r.tier===3).length,related:rows.filter(r=>r.tier===1||r.tier===2).length,general:rows.filter(r=>r.tier===0).length,rateKnown:rows.filter(r=>r.rateGap!==null).length,medianRateGap:median(rows.map(r=>r.rateGap)),within15:rows.filter(r=>r.rateGap!==null&&r.rateGap<=15).length,elapsedMs:Date.now()-started},questions:selected};
 }
 return {VERSION,DAY,QUOTAS,day,rate,describe,confidence,timing,evidenceWeight,estimate,buildContext,priorities,match,valid,select};
});
