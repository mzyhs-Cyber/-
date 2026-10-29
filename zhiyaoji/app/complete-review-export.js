/* Full-paper objective records; scoped exports obey final learning inclusion. */
(function(S){
 'use strict';
 if(!S?.exportSession)return;
 const legacy=S.exportSession,E=S.escape,own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 const clock=v=>v===null?'未记录':S.clock(v);
 const paper=s=>['paper','timed-paper'].includes(s.mode);
 const matches=(q,scope)=>!scope||(S.reviewScopeMatches?S.reviewScopeMatches(q,scope):q.subject===scope);
 const fresh=x=>JSON.parse(JSON.stringify(x));
 function snapshot(s,scope=null){
  const full=paper(s)&&!scope,raw=Array.isArray(s.submissionEvidence?.events)?s.submissionEvidence.events:Array.isArray(s.events)?s.events:[],byQuestion=new Map();
  for(const event of raw){if(event.questionId==null)continue;const key=String(event.questionId);if(!byQuestion.has(key))byQuestion.set(key,[]);byQuestion.get(key).push(event);}
  const rows=[];let excludedCount=0;
  s.questions.forEach((q,index)=>{
   if(!matches(q,scope))return;
   const included=!S.isLearningExcluded?.(s,q.id);if(!included)excludedCount++;
   if(!full&&!included)return;
   const attempt=S.getAttempt(s,q),a=S.sessionAnswer(s,q),answer=attempt?attempt.answer:q.answer,selected=a.selected??null;
   const events=byQuestion.get(String(q.id))||[],feedback=S.reviewFeedbackFor?.(s,q.id)||null,verdict=S.reviewState({q,a,attempt:attempt?{...attempt,selected}:null});
   rows.push({index:index+1,questionId:q.id,attemptId:attempt?.attemptId||null,sourceQuestionId:q.sourceQuestionId||q.id,paperOrder:q.paperOrder??null,subject:q.subject,path:[...q.path||[]],type:q.type||'',source:q.source||'',year:q.year??null,stemHtml:q.stemHtml||'',optionsHtml:[...q.optionsHtml||[]],materialKey:q.materialKey||null,materialHtml:q.materialHtml||'',userAnswer:selected,correctAnswer:answer??null,gradeable:attempt?attempt.gradingStatus==='graded':!!answer&&!q.answerConflict,result:verdict,seconds:number(attempt?.seconds??s.answers?.[q.id]?.seconds),excluded:[...a.excluded||[]],favorite:!!S.isFavorite(q),favoriteAtSubmission:attempt?.favoriteAtAttempt??a.favoriteAtAttempt??null,included,reviewConfirmed:!!S.reviewReady?.(s),reviewFeedback:feedback?fresh(feedback):null,events:fresh(events),eventHistoryAvailable:events.length>0});
  });
  const names=full?[...S.SUBJECTS||['政治理论','常识判断','言语理解','数量关系','判断推理','资料分析']]:[...new Set(rows.map(r=>r.subject))];
  for(const row of rows)if(!names.includes(row.subject))names.push(row.subject);
  function stats(list){const out={total:list.length,correct:0,incorrect:0,unanswered:0,ungraded:0,seconds:0,missingTime:0};for(const r of list){if(!r.gradeable)out.ungraded++;else if(own(out,r.result))out[r.result]++;else out.ungraded++;if(r.seconds===null)out.missingTime++;else out.seconds+=r.seconds;}out.denominator=out.correct+out.incorrect+out.unanswered;out.accuracy=out.denominator?out.correct/out.denominator:null;out.timeComplete=out.missingTime===0;return out;}
  const modules=names.map(subject=>({subject,...stats(rows.filter(r=>r.subject===subject))})),totals=stats(rows);
  const ids=new Set(rows.map(r=>String(r.questionId)));
  return {format:'zhiyaoji-complete-record-v1',sessionId:s.id,title:s.title,mode:full?'complete-paper':'included-only',scope:scope||null,questionCount:rows.length,originalQuestionCount:s.questions.length,excludedCount,reviewConfirmed:!!S.reviewReady?.(s),reviewRevision:s.reviewRevision||0,startedAt:s.startedAt||null,finishedAt:s.finishedAt||null,totalElapsedSeconds:number(s.elapsed),modules,totals,questions:rows,sessionEvents:fresh(full?raw:raw.filter(e=>ids.has(String(e.questionId)))),notesIncluded:false,mediaEmbedding:'html-and-source-urls-only',timeMeaning:'单题及模块为现有有效计时；无独立材料阅读记录时不额外分摊。整卷用时取本场有效计时，缺失不猜测。',analysisRule:'不纳入的记录仅保留客观成绩，不生成个人诊断、解析或补练；未确认反馈不用于长期诊断。'};
 }
 const percent=x=>x===null?'—':(x*100).toFixed(1)+'%';
 function summary(d){
  return ['【本次成绩概况】',d.title,'范围：'+(d.mode==='complete-paper'?'本场整卷全部记录':'仅最终纳入的题')+'；'+d.questionCount+'/'+d.originalQuestionCount+'题',
   '| 模块 | 题量 | 正确 | 错误 | 未答 | 待核 | 正确率 | 有效用时 |','|---|---:|---:|---:|---:|---:|---:|---|',
   ...d.modules.map(m=>'| '+[m.subject,m.total,m.correct,m.incorrect,m.unanswered,m.ungraded,percent(m.accuracy),m.timeComplete?clock(m.seconds):'已知'+clock(m.seconds)+'，缺'+m.missingTime+'题'].join(' | ')+' |'),
   '本范围：'+d.totals.correct+'对／'+d.totals.incorrect+'错／'+d.totals.unanswered+'未答／'+d.totals.ungraded+'待核；正确率 '+percent(d.totals.accuracy),
   '本范围已记录有效用时：'+clock(d.totals.seconds)+(d.totals.missingTime?'（另有'+d.totals.missingTime+'题缺少用时）':''),'本场'+(d.mode==='complete-paper'?'整卷':'原练习')+'总有效用时：'+clock(d.totalElapsedSeconds),'正确率分母：正确＋错误＋未答，待核答案不计入。',d.timeMeaning,d.analysisRule].join('\n');
 }
 function text(d){
  const materials=new Map(),lines=[summary(d),'\n【本次完整作答记录】','仅包含本场记录；不混入其他季次或其他练习。未记录的改选过程不能还原；当前收藏与交卷时收藏分开。图题图片保留原地址，文字复制不包含图片像素或笔迹。'];
  for(const r of d.questions){
   if(r.materialKey&&r.materialHtml){const k=JSON.stringify([r.materialKey,r.materialHtml]);if(!materials.has(k)){materials.set(k,materials.size+1);lines.push('\n【公共材料 '+materials.get(k)+'】\n'+S.plain(r.materialHtml));}lines.push('第'+r.index+'题关联材料 '+materials.get(k));}
   lines.push('\n【第'+r.index+'题｜'+r.subject+'｜原题号 '+(r.paperOrder??'未记录')+'】',S.plain(r.stemHtml),...r.optionsHtml.map((x,i)=>String.fromCharCode(65+i)+'. '+S.plain(x)),
    '我的答案：'+(r.userAnswer||'未答')+'；正确答案：'+(r.correctAnswer||'未提供')+'；状态：'+({correct:'答对',incorrect:'答错',unanswered:'未答',ungraded:'待核'}[r.result]||'待核'),
    '用时：'+clock(r.seconds)+'；最终排除：'+(r.excluded.join('、')||'无')+'；当前收藏：'+(r.favorite?'是':'否')+'；交卷时收藏：'+(r.favoriteAtSubmission===null?'未记录':r.favoriteAtSubmission?'是':'否'),
    '纳入学习：'+(r.included?'是':'否，仅保留客观记录')+'；复盘确认：'+(r.reviewConfirmed?'已确认':'未确认'),
    '操作历史：'+(r.events.length?'':'未记录，不能还原选择顺序'),...r.events.map(e=>JSON.stringify(e)));
   const urls=new Set([r.stemHtml,...r.optionsHtml,r.materialHtml].filter(h=>/<img\b/i.test(h)).flatMap(h=>S.imageSources?.(h)||[]));if(urls.size)lines.push('原图地址：'+[...urls].map(u=>/^data:/i.test(u)?'内嵌图片内容见记录包中的原始HTML':u).join('\n'));
   if(r.included&&r.reviewFeedback)lines.push('本人复盘反馈（不等于已核实错因）：'+JSON.stringify(r.reviewFeedback));
  }
  return lines.join('\n');
 }
 async function pack(d){
  const records=text(d),info=summary(d),manifest={format:d.format,sessionId:d.sessionId,mode:d.mode,scope:d.scope,questionCount:d.questionCount,originalQuestionCount:d.originalQuestionCount,notesIncluded:false,mediaEmbedding:d.mediaEmbedding,analysisRule:d.analysisRule};
  return S.makeZipAsync([['manifest.json',JSON.stringify(manifest,null,2)],['成绩概况.txt',info],['成绩概况.json',JSON.stringify({modules:d.modules,totals:d.totals,totalElapsedSeconds:d.totalElapsedSeconds},null,2)],['完整记录.json',JSON.stringify(d,null,2)],['完整记录.txt',records],['events.json',JSON.stringify(d.sessionEvents,null,2)]],()=>{});
 }
 async function copy(value,host,valid=()=>true){
  const stage=S.$('#export-stage',host);
  try{await navigator.clipboard.writeText(value);if(stage)stage.textContent='已复制本次成绩概况和作答记录';return true;}catch{}
  if(!valid())return false;const box=S.$('#export-downloads',host),area=document.createElement('textarea');area.className='export-copy-fallback';area.setAttribute('aria-label','成绩概况与作答记录');area.value=value;box.replaceChildren(area);area.focus();area.select();area.setSelectionRange?.(0,value.length);
  try{if(document.execCommand?.('copy')){area.remove();if(stage)stage.textContent='已复制本次成绩概况和作答记录';return true;}}catch{}
  if(stage)stage.textContent='请在下方文本框全选并复制';return false;
 }
 S.CompleteReviewExport={snapshot,summary,text,pack};
 S.copyReviewText=(s,scope,host)=>copy(text(snapshot(s,scope||null)),host);
 S.exportTextReview=function(s,scope=null){const d=snapshot(s,scope);if(!d.questionCount)return S.toast('当前范围没有纳入的题');S.download(S.reviewFilename(s)+'_作答记录.txt',text(d),'text/plain;charset=utf-8');};
 S.exportSession=function(s){
  if(!s?.finished)return;
  const included=s.questions.filter(q=>!S.isLearningExcluded?.(s,q.id)),scopes=[...new Set(included.map(q=>S.reviewScopeOf?.(q)||q.subject))],owner=S.state.meta.syncOwnerId;
  let closed=false,working=false;
  S.modal({title:'导出AI复盘记录',body:`<div class="export-panel"><label class="export-scope-label">导出范围<select id="export-subject"><option value="">${paper(s)?'整卷完整记录（全部题）':'全部纳入题'}</option>${scopes.map(x=>`<option value="${E(x)}">${E(x)}（仅纳入）</option>`).join('')}</select></label><p class="export-status" id="export-stage" role="status"></p><pre class="complete-export-summary" id="complete-export-summary"></pre><div class="export-format-buttons complete-export-formats"><button class="button primary export-copy" id="export-copy">一键复制文字</button><button class="button primary" id="export-records">下载完整记录包</button><button class="button" id="export-legacy">错题图文包</button></div><p class="export-copy-hint">文字记录含成绩与作答，复制后可直接粘贴。完整记录包保留原题面、选项、答案和已保存操作；图片保留原地址，不含笔迹。</p><div id="export-downloads"></div></div>`,onClose:()=>{closed=true;},onOpen:host=>{
   const select=S.$('#export-subject',host),stage=S.$('#export-stage',host);let current;
   const valid=()=>!closed&&owner===S.state.meta.syncOwnerId;
   const paint=()=>{current=snapshot(s,select.value||null);S.$('#complete-export-summary',host).textContent=summary(current);for(const id of ['#export-copy','#export-records'])S.$(id,host).disabled=!current.questionCount;stage.textContent=current.mode==='complete-paper'?'包含本场全部'+current.questionCount+'题，含不纳入的客观记录':'仅导出最终纳入的'+current.questionCount+'题';};
   select.onchange=paint;paint();
   S.$('#export-copy',host).onclick=()=>{if(!valid())return;paint();return copy(text(current),host,valid);};
   S.$('#export-records',host).onclick=async()=>{if(working||!valid())return;paint();working=true;const chosen=current,button=S.$('#export-records',host);button.disabled=true;select.disabled=true;try{stage.textContent='正在整理本次记录';const blob=await pack(chosen);if(!valid())return;S.download(S.reviewFilename(s)+'_'+(chosen.mode==='complete-paper'?'整卷完整记录':'纳入题记录')+'.zip',blob,'application/zip');stage.textContent='完整记录包已生成，共'+chosen.questionCount+'题';}catch(e){if(valid())stage.textContent='导出未完成：'+e.message;}finally{working=false;if(valid()){button.disabled=!current.questionCount;select.disabled=false;}}};
   S.$('#export-legacy',host).onclick=()=>{if(!valid())return;legacy.call(S,s);const old=S.$('#dialog-host');for(const selector of ['#export-copy','#export-text','.export-copy-hint']){const el=old?.querySelector(selector);if(el)el.hidden=true;}};
  }});
 };
 // Review and report use the same exporter and the same source session.
 function mountReviewExport(expectedId,owner){
  const review=S.review;if(!review?.s?.finished||review.s.id!==expectedId||owner!==S.state.meta.syncOwnerId)return;
  function attach(){
   if(S.review!==review)return;const head=S.$('.exam-head-right',review.root);if(!head||head.querySelector('[data-review-export]'))return;
   const button=document.createElement('button');button.type='button';button.className='icon-button review-ai-export';button.dataset.reviewExport='true';button.setAttribute('aria-label','导出AI复盘记录');button.title='AI导出';button.innerHTML=S.icon?.('download')||'AI';
   button.onclick=event=>{event?.preventDefault();event?.stopPropagation();if(S.review!==review||owner!==S.state.meta.syncOwnerId)return;const source=S.state.sessions.find(s=>s.id===expectedId);if(!source?.finished)return S.toast('练习记录已变化，请返回记录核对');return S.exportSession(source);};
   const settings=head.querySelector('[data-exam="reading-settings"]');if(settings)head.insertBefore(button,settings);else head.append(button);
  }
  const controller=review.controller;
  if(controller&&!controller._completeReviewExportRender){const render=controller.render;controller.render=function(...args){const result=render.apply(this,args);attach();return result;};controller._completeReviewExportRender=true;}
  attach();
 }
 const openReview=S.openReview;
 if(openReview)S.openReview=function(id,...args){
  const owner=S.state.meta.syncOwnerId,result=openReview.call(this,id,...args);
  if(result&&typeof result.then==='function')return result.then(value=>{mountReviewExport(id,owner);return value;});
  mountReviewExport(id,owner);return result;
 };
 S.BUILD='2.9.18-r8-8-34';
})(window.Study);
