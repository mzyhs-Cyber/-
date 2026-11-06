/* Source filters only: paper and question identities remain unchanged. */
(function(S){
'use strict';
S.MOCK_PAPER_SCOPE='@mock';
const kinds=['real','mock','other'];
S.normalizeSourceKinds=value=>Array.isArray(value)?kinds.filter(k=>value.includes(k)):['real','other'];
S.trainingSourceKinds=()=>S.normalizeSourceKinds(S.state?.settings?.topicTraining?.sourceKinds);
S.questionSourceKind=function(q){
 const paper=S.PAPER_BY_ID?.get(q.paperId)||(S.state?.papers||[]).find(p=>p.id===q.paperId);
 return S.paperSource(paper||{title:q.paperTitle||q.source,sourceKind:q.sourceKind,examNature:q.examNature});
};
S.questionMatchesSource=(q,selected)=>S.normalizeSourceKinds(selected).includes(S.questionSourceKind(q));
S.paperScope=p=>S.paperSource(p)==='mock'?S.MOCK_PAPER_SCOPE:S.paperRegion(p);
S.paperScopeLabel=value=>value===S.MOCK_PAPER_SCOPE?'模拟卷':value;
S.paperScopes=function(papers){
 const values=[...new Set(papers.filter(p=>S.paperSource(p)!=='mock').map(S.paperRegion))].sort((a,b)=>a.localeCompare(b,'zh'));
 return [...values,S.MOCK_PAPER_SCOPE];
};
S.paperInScope=function(paper,scope='',allValue=''){
 if(scope===S.MOCK_PAPER_SCOPE)return S.paperSource(paper)==='mock';
 return S.paperSource(paper)!=='mock'&&(!scope||scope===allValue||S.paperRegion(paper)===scope);
};
S.paperScopeOptions=(papers,current='',allValue='',allLabel='全部地区')=>`<option value="${S.escape(allValue)}" ${current===allValue?'selected':''}>${S.escape(allLabel)}</option>`+S.paperScopes(papers).map(v=>`<option value="${S.escape(v)}" ${v===current?'selected':''}>${S.escape(S.paperScopeLabel(v))}</option>`).join('');
S.sourceKindsMarkup=function(id,selected=S.trainingSourceKinds()){
 const rows=[['real','真题'],['mock','模拟题']];
 if((S.state?.papers||[]).some(p=>!p.archived&&!p.demo&&S.paperSource(p)==='other'))rows.push(['other','来源未注明']);
 return `<fieldset class="source-kind-field" id="${S.escape(id)}"><legend>题目来源</legend><div class="source-kind-options">${rows.map(([kind,label])=>`<label class="source-kind-choice"><input type="checkbox" data-training-source="${kind}" ${selected.includes(kind)?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset>`;
};
S.readSourceKinds=root=>root?S.$$('[data-training-source]',root).filter(input=>input.checked).map(input=>input.dataset.trainingSource):[];

})(window.Study=window.Study||{});
