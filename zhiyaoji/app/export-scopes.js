/* Flat export ranges, shared by every export format. Does not alter bank labels. */
(function(root){
 'use strict';
 const S=root.Study||(root.Study={});
 const subject=q=>({'言语理解与表达':'言语理解','言语':'言语理解'})[q?.subject]||q?.subject||'未分类';
 const top=new Map([['图形推理','图推'],['图推','图推'],['类比推理','类比'],['类比','类比'],['逻辑判断','逻辑判断'],['综合分析推理','逻辑判断'],['定义判断','定义判断'],['定义','定义判断'],['逻辑填空','言语填空'],['言语填空','言语填空'],['片段阅读','篇章阅读'],['篇章阅读','篇章阅读'],['文章阅读','篇章阅读'],['语句表达','篇章阅读']]);
 const reasoning=new Set(['图推','类比','逻辑判断','定义判断']);
 function category(q){
  const sub=subject(q);if(sub!=='判断推理'&&sub!=='言语理解')return sub;
  const labels=[...q.path||[],...q.sourcePath||[],q.type,...q.tags||[]].filter(x=>typeof x==='string');
  let resolved=[];try{resolved=(S.displayTopicPaths?.(q)||[]).flat();}catch{}
  for(const label of [...labels,...resolved]){const name=top.get(label);if(name&&(sub==='判断推理'?reasoning.has(name):!reasoning.has(name)))return name;}
  const text=labels.join('/');
  if(sub==='判断推理'){
   if(/单定义|多定义|定义判断/.test(text))return '定义判断';
   if(/类比|语义关系|语法关系|经验常识/.test(text))return '类比';
   if(/图形|位置规律|样式规律|属性规律|数量规律|特殊规律|空间类|空间规律|空间重构|六面体|四面体|三视图|截面|平面拼合|黑白块|文字\/字母\/数字类|实际意义/.test(text))return '图推';
   if(/翻译|真假|命题|加强|削弱|假设|解释|归纳|结论|分析推理|综合推理|组合|排序|分组|对应|论证|前提|选言|联言/.test(text))return '逻辑判断';
   return '判断推理（待分类）';
  }
  if(/逻辑填空|选词填空|实词填空|成语填空|混搭填空|词的辨析|前后呼应|语境填空/.test(text))return '言语填空';
  if(/阅读|语句|接语|主旨|意图|细节|标题|中心理解|态度|词句理解|下文|衔接|病句|歧义/.test(text))return '篇章阅读';
  return '言语理解（待分类）';
 }
 S.reviewScopeOf=category;
 S.reviewScopeMatches=(q,scope)=>!scope||q?.subject===scope||subject(q)===scope||category(q)===scope;
 S.reviewScopeOptions=function(s){
  const questions=S.aiCandidates?S.aiCandidates(s).map(x=>x.q):(s.questions||[]),subjects=[...new Set(questions.map(q=>q.subject))],present=new Set(questions.map(category)),out=[];
  for(const original of subjects){
   const sub=subject({subject:original}),names=sub==='判断推理'?['图推','类比','逻辑判断','定义判断','判断推理（待分类）']:sub==='言语理解'?['言语填空','篇章阅读','言语理解（待分类）']:[original];
   for(const name of names)if((sub!=='判断推理'&&sub!=='言语理解'||present.has(name))&&!out.includes(name))out.push(name);
  }
  return out;
 };
 S.BUILD='20261027-r8-8-22';
 if(typeof module!=='undefined')module.exports={category,matches:S.reviewScopeMatches,options:S.reviewScopeOptions};
})(typeof window!=='undefined'?window:globalThis);
