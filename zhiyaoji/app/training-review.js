(function(S){
 'use strict';
 const select=S.selectTimedModule;
 S.selectTimedModule=function(config){
  const memory=S.trainingViewMemory(),cache=memory.read('timedResults')||{};
  const key=JSON.stringify({...config,paper:config.paper?.id||null});
  const old=cache[key];
  if(old){const bank=new Map(S.state.bank.filter(q=>!q.archived).map(q=>[q.id,q]));if(old.ids.every(id=>bank.has(id)))return {...old.result,questions:old.ids.map(id=>bank.get(id))};}
  const result=select(config),{questions,...meta}=result;
  cache[key]={ids:questions.map(q=>q.id),result:meta};
  const keys=Object.keys(cache);for(const k of keys.slice(0,Math.max(0,keys.length-40)))delete cache[k];
  memory.write('timedResults',cache);return result;
 };
 S.aiScopeSummary=function(s,subject=null){
  const excluded=q=>!!S.isLearningExcluded(s,q.id);
  const all=s.questions.filter(q=>((S.reviewScopeMatches?S.reviewScopeMatches(q,subject):!subject||q.subject===subject))&&!excluded(q));
  const rows=all.map(q=>({q,a:S.sessionAnswer(s,q),attempt:S.getAttempt(s,q)}));
  const counts=rows=>{const x={correct:0,incorrect:0,unanswered:0,ungraded:0};for(const row of rows)x[S.reviewState(row)]++;return x;};
  const c=counts(rows),den=c.correct+c.incorrect+c.unanswered;
  const rate=den?(100*c.correct/den).toFixed(1)+'%':'暂无可计分题';
  const candidates=S.aiCandidates(s).filter(x=>(S.reviewScopeMatches?S.reviewScopeMatches(x.q,subject):!subject||x.q.subject===subject)),groups=new Map();
  for(const x of candidates){const path=(x.q.path||[]).filter(Boolean),label=path.length?path.join(' / '):(x.q.type||'未细分');const key=(x.q.subject||'未分类')+' · '+label;const group=groups.get(key)||[];group.push(x);groups.set(key,group);}
  const lines=[`当前范围${subject?'（'+subject+'）':''}：纳入 ${rows.length}题，正确率 ${rate}（答对÷可计分题数，未答计入分母）。`,`答对 ${c.correct}、答错 ${c.incorrect}、未答 ${c.unanswered}、待核答案 ${c.ungraded}；不纳入 ${s.questions.filter(q=>((S.reviewScopeMatches?S.reviewScopeMatches(q,subject):!subject||q.subject===subject))&&excluded(q)).length}题。`,`实际生成解析 ${candidates.length}题；以下题号对应原练习顺序：`];
  for(const [key,items] of groups){const v=counts(items),graded=v.correct+v.incorrect+v.unanswered;lines.push(`${key}：第${items.map(x=>x.index+1).join('、')}题；对${v.correct}/错${v.incorrect}/未答${v.unanswered}${v.ungraded?'/待核'+v.ungraded:''}；${graded?(100*v.correct/graded).toFixed(1)+'%':'暂无正确率'}`);}
  return lines.join('\n');
 };
 const analysis=S.analysisText;
 S.analysisText=function(s,options={}){return '【生成范围与答题概览】\n'+S.aiScopeSummary(s,options.subject)+'\n说明：仅解析实际纳入的题目；已排除题不输出题面、参考解析或个人诊断。\n\n'+analysis(s,options);};
 const exportSession=S.exportSession;
 S.exportSession=function(s){const result=exportSession(s),host=S.$('#dialog-host'),scope=host?.querySelector('#export-subject');if(!scope)return result;
  const summary=document.createElement('div');summary.className='ai-scope-summary';summary.setAttribute('role','status');scope.closest('label').after(summary);
  const paint=()=>{summary.textContent=S.aiScopeSummary(s,scope.value||null);const rows=S.aiCandidates(s).filter(x=>(S.reviewScopeMatches?S.reviewScopeMatches(x.q,scope.value):!scope.value||x.q.subject===scope.value));const c={wrong:rows.filter(x=>S.reviewState(x)==='incorrect').length,unanswered:rows.filter(x=>S.reviewState(x)==='unanswered').length,marked:rows.filter(x=>S.isFavorite(x.q)).length,slow:rows.filter(x=>x.reasons.includes('slow')).length};const strong=host.querySelector('.export-overview strong');if(strong)strong.textContent=rows.length;host.querySelectorAll('.export-counts b').forEach((b,i)=>b.textContent=Object.values(c)[i]);};scope.addEventListener('change',paint);paint();return result;
 };
})(window.Study);
