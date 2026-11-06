/* One next-day review plan per account/date. Successful plans stay fixed. */
(function(S,E){
 'use strict';if(!S||!E)return;
 const esc=S.escape,cache=new Map();let pending=null,generation=0,starting=false,autoTimer=0,retryingSync=false;
 const owner=()=>String(S.state?.meta?.syncOwnerId||'local'),today=()=>E.day(Date.now()),key=()=>owner()+'|'+today();
 const storageKey=k=>'zhiyaoji-local-review-v1:'+k;
 const busy=()=>S.storageMaintenance?.pauseCloud||S.bankImporting||S.openingPractice||S.preparingInk||S.preparingReview||S.activeInkPointer||S.exam&&!S.exam.disposed||S.review;
 const ownSession=()=>S.state.sessions.filter(s=>s.mode==='local-review'&&s.blueprint?.localReview?.date===today()).sort((a,b)=>a.startedAt-b.startedAt)[0];
 const cutoff=()=>Date.parse(today()+'T00:00:00+08:00')-1;
 const signature=()=>JSON.stringify([S.classificationVersion,S.state.meta?.bankContentRevision||0,S.state.bank.length,S.state.settings.localReviewSources||['real']]);
 function validPlan(p){return (p?.version===E.VERSION||p?.ready&&p?.version>=6&&p?.version<E.VERSION)&&p.date===today()&&(!p.ownerId||p.ownerId===owner())&&Array.isArray(p.ids)&&Array.isArray(p.rows)&&Array.isArray(p.modules);}
 function stored(){
  const k=key(),saved=S.state.learning?.localReviewPlans?.[k];if(validPlan(saved)&&saved.ready)return saved;
  let p=cache.get(k);if(!p)try{p=JSON.parse(localStorage.getItem(storageKey(k))||'null');if(validPlan(p))cache.set(k,p);else p=null;}catch{}
  return validPlan(p)?p:null;
 }
 function readiness(){
  if(S.ready===false||!S.state.bank.length||S.bankImporting)return '正在准备题库';
  const c=S.accountSync;if(c&&!['local','guest'].includes(owner())&&(!c.verified||!c.profileReady||c.lastCloudReadOwner!==owner()||Number(c.lastCloudReadAt)<cutoff()+1))return '等待账号记录同步后生成';
  if((c?.connecting||c?.initializing||c?.phase)&&c.learningReadyOwner!==owner())return '正在准备账号记录';
  return '';
 }
 function markup(){
  const s=ownSession(),p=stored(),working=pending?.key===key(),meta=s?.blueprint?.localReview||p,waiting=!s&&!p&&!working?readiness():'';
  const supplements=s?S.state.sessions.filter(x=>x.blueprint?.numericSupplementOf===s.id):[],supplementActive=supplements.find(x=>!x.finished);
  const numeric=s?[...s.questions,...supplements.flatMap(x=>x.questions)].filter(q=>E.describe(q,S.displayTopicPaths(q)).module==='数字推理').length:0,missing=s?Math.max(0,7-numeric):0;
  const state=s?(s.finished?'已完成':'进行中'):working?'生成中':waiting?'准备中':p?(p.ready?'已生成':'部分匹配'):'待生成';
  const title=s?(s.finished?'今日复盘已完成':'今日训练进行中'):working?'正在生成今日训练…':waiting||(!p?'今日训练待生成':p.ready?'今日定点复盘':`已匹配 ${p.ids.length} / 30 题`);
  const waitingAccount=!!waiting&&waiting.includes('账号');
  const action=s?(missing||supplementActive?'numeric':'open'):waitingAccount?'sync':p?.ids.length?'start':'generate';
  const label=s?(supplementActive?'继续数推补齐':missing?`补齐数推${missing}题`:s.finished?'查看复盘':'继续训练'):working?'生成中…':waitingAccount?(retryingSync?'正在重试同步…':'重试账号同步'):waiting?'准备完成后生成':p?.ids.length?(p.ready?'开始':'先练已选')+p.ids.length+'题':'生成今日训练';
  const shortage=meta?.modules?.filter(m=>m.shortfall).map(m=>esc(m.module)+'差'+m.shortfall+'题').join('；')||'';
  return `<section class="panel daily-card local-review-card" id="local-review-card" aria-label="定点复盘"><header class="daily-card-head"><h2>定点复盘</h2>${meta?'<button class="daily-link" data-local-review="why">选题依据 '+(S.icon?.('arrow')||'')+'</button>':'<span></span>'}</header><div class="daily-card-body"><div class="daily-meta"><span>${esc(today())}</span><span class="daily-state">${state}</span></div><h3>${title}</h3><p class="daily-caption">次日复盘 · 每天一份 · 数推5＋2</p><p class="daily-status" role="status" aria-live="polite">${shortage?shortage+'，可查看筛选原因。':''}</p><button class="button daily-start" data-local-review="${action}" ${working||retryingSync||waiting&&!waitingAccount?'disabled':''}><span>${label}</span>${S.icon?.('arrow')||''}</button></div><footer class="daily-card-foot"><button class="daily-link" data-local-review="sources">题源设置</button>${s?.finished?'<button class="daily-link" data-local-review="extra">再练一组</button>':p&&!p.ready&&!s?'<button class="daily-link" data-local-review="retry">重试缺题匹配</button>':'<span></span>'}</footer></section>`;
 }
 function paint(){
  if(S.route!=='home')return;const old=S.$('#local-review-card'),legacy=S.$('#daily-training');
  if(old){old.outerHTML=markup();legacy?.remove();}else if(legacy)legacy.outerHTML=markup();else S.$('.home-daily-primary')?.insertAdjacentHTML('afterbegin',markup());
  const box=S.$('#local-review-card');if(box)box.onclick=async event=>{
   const b=event.target.closest('[data-local-review]');if(!b||b.disabled)return;event.preventDefault();
   try{
    const action=b.dataset.localReview;
    if(action==='why')return why();
    if(action==='sync'){if(retryingSync)return;retryingSync=true;paint();try{await S.accountSync?.requestSync?.('manual');}finally{retryingSync=false;paint();queueAuto();}return;}
    if(action==='numeric')return await supplementNumeric();
    if(action==='sources')return S.modal({title:'推荐题源',body:'<select id="lr-source"><option value="real">仅真题</option><option value="mock">仅模拟题</option><option value="both">真题＋模拟题</option></select><button id="lr-save" class="button">保存</button>',onOpen:h=>{
     h.querySelector('#lr-source').value=(S.state.settings.localReviewSources||['real']).length>1?'both':(S.state.settings.localReviewSources||['real'])[0];
     h.querySelector('#lr-save').onclick=async()=>{const v=h.querySelector('#lr-source').value;S.state.settings.localReviewSources=v==='both'?['real','mock']:[v];await S.saveHot();S.closeModal();if(stored()?.ready||ownSession())S.toast('已保存，题源设置用于下一份题单，今日题单保留。');else queueAuto();};
    }});
    if(action==='extra'){const selected=await S.selectLocalReviewAsync(S.state,selectionOptions({seed:today()+'extra'+S.state.sessions.length}));if(!selected.ids.length)return S.toast('当前题源没有可用新题');const {questions,...plan}=selected;return S.startSession(questions,{title:today()+'_补弱加练',mode:'local-review-extra',blueprint:{localReview:plan}});}
    if(action==='open'){const s=ownSession();return s&&(s.finished?S.showReport(s.id):S.resumeSession(s.id));}
    if(action==='start')return await start();await generate(action==='retry');
   }catch(e){if(e.name!=='AbortError')S.toast('定点复盘未完成：'+e.message);}
  };
 }
 function selectionOptions(extra={}){
  return {now:Date.now(),learningAsOf:cutoff(),paths:q=>S.displayTopicPaths(q),canonical:q=>S.canonicalKey(q),groupKey:q=>S.materialIdentity(q)||'q:'+q.id,
   expectedCount:q=>{if(!q.materialKey)return 0;const p=S.PAPER_BY_ID?.get(q.paperId);return p?.verified?(p.slots||[]).filter(x=>x.materialKey===q.materialKey).length:0;},
   allow:q=>(!S.classificationAllowed||S.classificationAllowed(q))&&S.questionMatchesSource(q,S.state.settings.localReviewSources||['real']),strategy:'feedback',...extra};
 }
 async function generate(force=false){
  if(busy())return null;if(ownSession()){paint();return null;}const existing=stored();if(existing?.ready||!force&&existing?.signature===signature())return existing;
  if(readiness()){paint();return null;}if(pending?.key===key())return pending.promise;
  const token=++generation,k=key(),state=S.state,sessions=state.sessions,attempts=state.attempts,sig=signature(),job={key:k};pending=job;
  const cancelled=()=>token!==generation||S.state!==state||key()!==k||state.sessions!==sessions||state.attempts!==attempts||sig!==signature()||S.route!=='home'||busy();
  job.promise=(async()=>{
   await new Promise(r=>setTimeout(r,0));paint();const selected=await S.selectLocalReviewAsync(state,selectionOptions({cancelled}));
   if(cancelled())return null;
   for(const row of selected.rows){const q=S.lookup(row.id);row.classificationStatus=q?S.classificationFor?.(q)?.status:'source_fallback';}
   const {questions,priorities,...plan}=selected;Object.assign(plan,{signature:sig,ownerId:owner(),createdAt:Date.now(),classificationVersion:S.classificationVersion||'source-fallback'});
   if(plan.ready){
    const prior=stored();if(prior?.ready)return prior;
    const previous=state.learning.localReviewPlans||{},all={...previous,[k]:plan};
    for(const id of Object.keys(all).filter(id=>id.startsWith(owner()+'|')).sort().slice(0,-14))delete all[id];
    state.learning.localReviewPlans=all;
    try{await S.saveHot();}catch(e){if(state.learning.localReviewPlans===all)state.learning.localReviewPlans=previous;throw e;}
    if(key()!==k||S.state!==state)return null;
   }
   cache.set(k,plan);try{localStorage.setItem(storageKey(k),JSON.stringify(plan));}catch{}
   return plan;
  })().catch(e=>{if(e.name==='AbortError')return null;throw e;}).finally(()=>{if(pending===job)pending=null;paint();});
  paint();return job.promise;
 }
 function references(row){
  if(!row.sourceIds?.length)return row.numericRole==='江苏B卷参考'?'组合补充：没有精确对应的参考位置。':'没有直接对应的薄弱记录，作为一般巩固。';
  const ids=new Set(row.sourceIds),found=[];
  for(const a of S.state.attempts||[]){if(!ids.has(S.canonicalKey({canonicalId:a.canonicalId,id:a.questionId})))continue;const q=S.lookup(a.questionId)||a.questionSnapshot;if(q)found.push(q);if(found.length>=3)break;}
  if(!found.length)for(const q of S.state.bank){if(ids.has(S.canonicalKey(q)))found.push(q);if(found.length>=3)break;}
  return (row.numericRole==='江苏B卷参考'?'组合参考：':'对应错题/待验证记录：')+(found.length?found.map(q=>(q.paperTitle||q.source||'历史练习')+(q.paperOrder||q.order?' · 第'+(q.paperOrder||q.order)+'题':'')).join('；'):'原题记录暂未在本机找到');
 }
 function why(){
  const p=ownSession()?.blueprint?.localReview||stored();if(!p)return;
  const counts=p.candidateCounts||{},classification={source_mapped:'来源标签',rule_mapped:'规则映射',rule_supported_source_evidence:'规则映射·有原文依据',focused_classification_checked:'细分类已核对',focused_text_reviewed:'文本已核对',returned_evidence_checked:'回传依据已核对',needs_fine_classification:'待补细分类',source_fallback:'原始标签'};
  S.modal({title:'本次选题依据',subtitle:p.date+' · 次日复盘 · 数推5＋2',body:`${p.version<E.VERSION?'<p>今天已生成的题单保留，新的权重用于下一份新题单。</p>':''}<p>补弱依据截至前一天，今天的作答只用于避开已做题。题单生成成功后当天固定；题型优先，难度用于排序，放宽匹配会单独标明。</p><p>不确定、蒙对不算掌握。纳入错题优先；不纳入的非蒙错题仍低优先级参考，超时与收藏单独考虑。资料分析每题保留完整材料。</p>${Object.keys(counts).length?'<details><summary>查看候选筛选统计</summary>'+Object.entries(counts).map(([m,c])=>'<p>'+esc(m)+'：识别'+c.recognized+' → 内容有效'+c.complete+' → 符合题源'+c.sourceAllowed+' → 未做且去重'+c.unseen+' → 材料完整可选'+c.eligible+'</p>').join('')+'</details>':''}<ol class="local-review-reasons">${p.rows.map((r,i)=>`<li><strong>${i+1}. ${esc(r.module)} · ${esc(r.micro)}</strong><span>${esc(r.kind)}${r.difficultyRelaxed?' · 已放宽难度范围':''} · ${r.dueRetest?'到期原题复测':r.unseen?'未做过':'已做过'}${r.rateGap!=null?' · 正确率差'+r.rateGap+'个百分点':' · 难度待核'}</span>${r.weightReason?'<span>补弱依据：'+esc(r.weightReason)+(r.baseWeight!=null?' · 基础优先级 '+esc(r.baseWeight):'')+'</span>':''}<span>${esc(references(r))}</span><span>分类依据：${esc(classification[r.classificationStatus]||'原始标签')}</span></li>`).join('')}</ol>`,footer:'<button class="button" data-local-close>关闭</button>',onOpen:h=>h.querySelector('[data-local-close]').onclick=S.closeModal});
 }
 async function supplementNumeric(){
  const source=ownSession();if(!source||busy())return;
  const prior=S.state.sessions.filter(x=>x.blueprint?.numericSupplementOf===source.id),collected=[...source.questions,...prior.flatMap(s=>s.questions)],missing=Math.max(0,7-collected.filter(q=>E.describe(q,S.displayTopicPaths(q)).module==='数字推理').length);
  const unfinished=prior.find(s=>!s.finished);if(unfinished)return S.resumeSession(unfinished.id);if(!missing)return prior.at(-1)&&S.showReport(prior.at(-1).id);
  const excluded=new Set(collected.map(q=>S.canonicalKey(q))),base=selectionOptions(),selected=await S.selectLocalReviewAsync(S.state,{...base,allow:q=>base.allow(q)&&!excluded.has(S.canonicalKey(q)),quotas:{'数字推理':missing},numericOffset:7-missing,seed:today()+'numeric-supplement'});
  if(!selected.ids.length)return S.toast('当前题源暂无未做过的有效数推，可在选题依据中查看筛选统计。');
  const {questions,...plan}=selected;S.startSession(questions,{title:today()+'_数推补齐'+questions.length+'题',mode:'local-review-extra',blueprint:{numericSupplementOf:source.id,localReview:plan}});
 }
 function seenNow(){
  const seen=new Set();for(const a of S.state.attempts||[])seen.add(S.canonicalKey(S.lookup(a.questionId)||{canonicalId:a.canonicalId,id:a.questionId}));
  for(const s of S.state.sessions)for(const [id,a]of Object.entries(s.answers||{}))if(a?.selected!=null){const q=S.lookup(id)||s.questions?.find(q=>q.id===id);if(q)seen.add(S.canonicalKey(q));}
  return seen;
 }
 async function start(){
  if(starting)return;starting=true;try{
   const active=ownSession();if(active)return active.finished?S.showReport(active.id):S.resumeSession(active.id);
   const p=stored()||await generate();if(!p?.ids.length)return;
   const repeatIds=new Set(p.rows.filter(r=>r.dueRetest).map(r=>r.id)),blockedRetests=new Set();
   if(repeatIds.size){for(const a of S.state.attempts)if(Number(a.finishedAt)>Number(p.asOf))blockedRetests.add(S.canonicalKey(S.lookup(a.questionId)||{canonicalId:a.canonicalId,id:a.questionId}));for(const session of S.state.sessions)if(!session.finished)for(const [id,a]of Object.entries(session.answers||{}))if(a?.selected!=null){const q=S.lookup(id)||session.questions?.find(q=>q.id===id);if(q)blockedRetests.add(S.canonicalKey(q));}}
   const seen=seenNow(),isRetest=q=>repeatIds.has(q.id)&&!blockedRetests.has(S.canonicalKey(q)),all=p.ids.map(id=>S.lookup(id)).filter(Boolean),blockedGroups=new Set(all.filter(q=>q.subject!=='资料分析'&&seen.has(S.canonicalKey(q))&&!isRetest(q)).map(q=>S.materialIdentity(q)).filter(Boolean));
   const questions=all.filter(q=>E.valid(q)&&(!seen.has(S.canonicalKey(q))||isRetest(q))&&!blockedGroups.has(S.materialIdentity(q)));
   if(!questions.length)return S.toast('今日题单中的题已做过或暂不可用，保留原题单，明日生成新题。');
   const nonData=questions.filter(q=>q.subject!=='资料分析'),integral=S.ensureGroupIntegrity(nonData);if(integral.length!==nonData.length||integral.some(q=>!nonData.some(x=>x.id===q.id)))return S.toast('逻辑材料完整性待核验，请先检查题库。');
   if(questions.length!==p.ids.length)S.toast('已跳过其他练习中做过或暂不可用的题，今日题单不重新抽题。');
   S.startSession(questions,{title:p.title,mode:'local-review',selectionMode:'local-rules-v2',blueprint:{localReview:JSON.parse(JSON.stringify({...p,skippedIds:p.ids.filter(id=>!questions.some(q=>q.id===id))}))}});
  }finally{starting=false;paint();}
 }
 function queueAuto(){
  clearTimeout(autoTimer);const k=key();autoTimer=setTimeout(async()=>{
   if(document.hidden||S.route!=='home'||key()!==k)return;if(ownSession()||stored()?.ready)return;
   if(busy()||readiness()){
    const c=S.accountSync;if(!busy()&&c?.verified&&c.profileReady&&!c.connecting&&!c.initializing&&!c.phase&&c.dailyPlanSyncDay!==today()&&(c.lastCloudReadOwner!==owner()||Number(c.lastCloudReadAt)<cutoff()+1)){c.dailyPlanSyncDay=today();Promise.resolve(c.requestSync('daily-plan')).catch(()=>{});}
    paint();queueAuto();return;
   }
   try{const result=await generate();if(!result&&S.route==='home'&&!ownSession())queueAuto();}catch(e){S.toast('今日训练未生成：'+e.message);}
  },1500);
 }
 S.dailyCardHTML=markup;S.bindDailyCard=paint;
 const home=S.renderHome;S.renderHome=function(...args){const result=home.apply(this,args);paint();queueAuto();return result;};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.route==='home'){paint();queueAuto();}});
 // Confidence is explicit user evidence. A favorite or option elimination is not a guess marker.
 const feedbackMarkup=S.reviewFeedbackMarkup;
 S.reviewFeedbackMarkup=function(s,qid){const html=feedbackMarkup.call(this,s,qid);if(!s.finished)return html;const selected=s.reviewFeedback?.[qid]?.confidence;const confidence=`<div class="local-review-confidence" role="group" aria-label="本题作答信心"><span>作答信心</span>${[['certain','确定'],['uncertain','不确定'],['guess','蒙']].map(([v,label])=>`<button type="button" data-local-confidence="${v}" data-local-session="${esc(s.id)}" data-local-qid="${esc(qid)}" aria-pressed="${selected===v}">${label}</button>`).join('')}</div>`;return html.replace('<label>',confidence+'<label>');};
 document.addEventListener('click',event=>{
  const b=event.target.closest?.('[data-local-confidence]');if(!b)return;
  const s=S.state.sessions.find(s=>s.id===b.dataset.localSession);
  if(!s?.finished||!s.questions.some(q=>q.id===b.dataset.localQid)||S.reviewUploading?.has(s.id))return;
  const qid=b.dataset.localQid,f=S.reviewFeedbackFor(s,qid),confidence=f.confidence===b.dataset.localConfidence?null:b.dataset.localConfidence;
  s.reviewFeedback={...s.reviewFeedback,[qid]:{...f,confidence,updatedAt:Date.now()}};s.reviewRevision=(s.reviewRevision||0)+1;
  if(s.reviewCompletion)s.reviewCompletion={...s.reviewCompletion,status:'draft'};
  S.touchSession(s);S.saveSoon();for(const button of document.querySelectorAll('[data-local-confidence]'))if(button.dataset.localQid===qid)button.setAttribute('aria-pressed',String(button.dataset.localConfidence===confidence));
 });
 S.localReview={generate,start,supplementNumeric,why,paint,stored,signature,markup,readiness,cutoff,queueAuto,metrics:()=>stored()?.metrics};
 S.BUILD='2.9.18-r8-8-74';
})(window.Study,window.LocalReviewEngine);
