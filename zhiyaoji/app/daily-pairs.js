/* Two independent learning sessions in one backwards-compatible daily envelope. */
(function(S){
 'use strict';
 if(!S?.DailyModel||!S.dailyCardHTML||!S.bindDailyCard)return;
 S.BUILD='2.9.18-r8-8-28';
 const D=S.DailyModel,E=S.escape,PREFIX='知遥集双轨｜',names={quant:'数量稳分',core:'三科进阶'};
 const legacyHTML=S.dailyCardHTML,legacyBind=S.bindDailyCard,inflight=new Map(),attempted=new Set(),opening=new Set();
 const owner=()=>{const id=S.accountSync?.user?.id;return id&&id===S.state.meta.syncOwnerId?id:null;};
 const cache=()=>{const id=owner();return id?(S.state.meta.dailyTraining?.[id]||null):null;};
 const rowFor=date=>cache()?.packs?.find(p=>p.date===date);
 const marked=p=>String(p?.title||'').startsWith(PREFIX);
 const prior=hash=>S.state.sessions.filter(s=>s.dailyOwner===owner()&&s.dailyPackHash===hash).sort((a,b)=>b.startedAt-a.startedAt)[0];
 const statusText=s=>s?(s.finished?'已完成':'进行中'):'未开始';
 const buttonText=s=>s?(s.finished?'查看复盘':'继续训练'):'开始训练';
 const say=text=>{const el=S.$('#daily-training .daily-status');if(el)el.textContent=text;};
 const repaint=()=>{const el=S.$('#daily-training');if(el){el.outerHTML=S.dailyCardHTML();S.bindDailyCard(false);}};
 function numeric(q){return (S.displayTopicPaths?.(q)||[]).some(p=>p[0]==='数字推理')||q.path.includes('数字推理')||q.type==='数字推理';}
 async function derive(raw){
  const pack=D.validate(raw);
  if(pack.title!==PREFIX+pack.date)throw Error('双轨题包名称与日期不一致');
  const quant=pack.questions.filter(q=>q.subject==='数量关系'),core=pack.questions.filter(q=>q.subject!=='数量关系');
  if(core.some(q=>!['言语理解','判断推理','资料分析'].includes(q.subject)))throw Error('三科题包只能包含言语、判断、资料');
  if(core.length<14||core.length>17||new Set(core.map(q=>q.subject)).size!==3)throw Error('三科题包需有14—17题并覆盖三科');
  const seq=quant.filter(numeric),math=quant.filter(q=>!numeric(q)),extra=seq.length-5;
  if(![0,2,3].includes(extra)||math.length!==6)throw Error('数量题包需有5道数推、可选2—3道强化数推及6道数学运算');
  if(quant.slice(0,seq.length).some(q=>!numeric(q)))throw Error('数量题包须先排数推，再排数学运算');
  const materials=new Map();
  for(const q of pack.questions)if(q.materialKey){const track=q.subject==='数量关系'?'quant':'core';if(materials.has(q.materialKey)&&materials.get(q.materialKey)!==track)throw Error('公共材料不能跨两包拆分');materials.set(q.materialKey,track);}
  const result={};
  for(const [key,questions] of Object.entries({quant,core})){
   // Parent title/focus and sibling changes must not create another attempt here.
   const child=D.validate({date:pack.date,title:names[key],questions});
   result[key]={pack:child,hash:await S.SyncCodec.hash(JSON.stringify(child)),count:questions.length};
  }
  result.quant.sequenceCount=seq.length;result.quant.extraCount=extra;
  return result;
 }
 async function load(date){
  const id=owner(),c=cache(),row=rowFor(date);
  if(!id||!S.accountSync?.verified)throw Error('请先连接当前账号，再接收每日训练');
  if(!row)throw Error('请先刷新题包');
  const key=id+':'+row.hash;if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
   let pack=c.content?.[row.hash];
   if(!pack){const result=await S.accountSync.request('/api/daily/get?date='+encodeURIComponent(date));
    if(owner()!==id)throw Error('账号已切换，请重新进入');
    if(result.hash!==row.hash)throw Error('题包已更新，请刷新后再进入');pack=D.validate(result.pack);
   }else pack=D.validate(pack);
   if(await S.SyncCodec.hash(JSON.stringify(pack))!==row.hash)throw Error('题包内容校验失败，请刷新重试');
   const pair=marked(pack)?await derive(pack):null;
   if(owner()!==id||rowFor(date)?.hash!==row.hash)throw Error('账号或题包已变化，请重新进入');
   c.content=c.content||{};c.content[row.hash]=pack;
   c.pairs=c.pairs||{};if(pair)c.pairs[row.hash]=Object.fromEntries(Object.entries(pair).map(([k,v])=>[k,{hash:v.hash,count:v.count,sequenceCount:v.sequenceCount,extraCount:v.extraCount}]));
   const keys=Object.keys(c.content);while(keys.length>7){const old=keys.shift();delete c.content[old];delete c.pairs[old];}
   await S.saveHot({learningChange:false});
   if(owner()!==id)throw Error('账号已切换，请重新进入');
   return {row,pack,pair};
  })();inflight.set(key,work);
  try{return await work;}finally{inflight.delete(key);}
 }
 async function open(date,track){
  const id=owner(),key=id+':'+date+':'+track;if(opening.has(key))return;
  opening.add(key);
  try{
   const {row,pack,pair}=await load(date);if(owner()!==id)return;
   // Old versions may have started the envelope as one session. Preserve that record.
   const old=prior(row.hash);if(old){S.resumeSession(old.id);return;}
   const item=pair?.[track];if(pair&&!item)throw Error('请选择一个训练包');
   const current=item?.pack||pack,hash=item?.hash||row.hash,s=prior(hash);
   if(s){S.resumeSession(s.id);return;}
   const qs=S.normalizeState({schema:3,bank:current.questions.map((q,i)=>({...q,stemHtml:S.safeHTML(q.stemHtml),optionsHtml:q.optionsHtml.map(x=>S.safeHTML(x)),materialHtml:S.safeHTML(q.materialHtml),explanationHtml:S.safeHTML(q.explanationHtml),paperId:'daily-'+hash,paperTitle:current.title,paperOrder:i+1,materialExpectedCount:q.materialKey?current.questions.filter(x=>x.materialKey===q.materialKey).length:0})),papers:[],sessions:[],attempts:[]}).bank;
   if(owner()!==id)return;
   S.startSession(qs,{title:current.title+' · '+date,mode:'daily',paperId:'daily-'+hash,paperTitle:current.title,dailyPackHash:hash,dailyDate:date,dailyOwner:id});
  }catch(e){S.toast(e.message);say('接收未完成：'+e.message);}finally{opening.delete(key);}
 }
 function cards(row){
  const meta=cache()?.pairs?.[row.hash],old=prior(row.hash);
  if(old)return `<p class="daily-caption">本日已在旧版开始整包作答，继续保留原进度。</p><button class="button daily-start" data-pair-date="${E(row.date)}" data-pair-track="quant">${buttonText(old)}</button>`;
  return `<div class="daily-pairs">${['quant','core'].map((key,i)=>{
   const item=meta?.[key],s=item&&prior(item.hash),detail=item?(key==='quant'?`数推5题${item.extraCount?'＋强化'+item.extraCount+'题':''} · 运算6题`:`言语 · 判断 · 资料，共${item.count}题`):(key==='quant'?'数推5题＋可选强化2—3题 · 运算6题':'言语 · 判断 · 资料，14—17题');
   return `<article class="daily-pair"><div class="daily-pair-heading"><span class="daily-pair-number">0${i+1}</span><h3>${names[key]}</h3><span class="daily-state">${item?statusText(s):'待接收'}</span></div><p class="daily-caption">${E(detail)}</p><button type="button" class="button daily-start" data-pair-date="${E(row.date)}" data-pair-track="${key}">${item?buttonText(s):'接收题包'} ${S.icon('arrow')}</button></article>`;
  }).join('')}</div>`;
 }
 S.dailyCardHTML=function(){
  const date=D.today(),row=rowFor(date);if(!marked(row))return legacyHTML.apply(this,arguments);
  return `<section class="panel daily-card" id="daily-training"><header class="daily-card-head"><h2>每日AI训练</h2><button type="button" class="daily-link" data-daily="history">历史训练 ${S.icon('arrow')}</button></header><div class="daily-card-body"><div class="daily-meta"><span>${E(date)}</span><span>两包独立作答，分别保存进度</span></div>${cards(row)}</div><footer class="daily-card-foot"><button class="daily-link" data-daily="import">导入题包</button><button class="daily-link" data-daily="refresh">刷新</button></footer><p class="daily-status" role="status"></p></section>`;
 };
 function bindStarts(root){S.$$('[data-pair-date]',root).forEach(b=>b.onclick=()=>{if(b.closest?.('#dialog-host'))S.closeModal();return open(b.dataset.pairDate,b.dataset.pairTrack);});}
 function history(){
  S.modal({title:'历史训练',body:(cache()?.packs||[]).map(p=>marked(p)?`<article class="daily-pair-history"><strong>${E(p.date)}</strong>${cards(p)}</article>`:`<article class="paper-row"><div><strong>${E(p.date)} · ${E(p.title)}</strong><p>${p.count}题 · ${statusText(prior(p.hash))}</p></div><button class="button" data-pair-date="${E(p.date)}" data-pair-track="legacy">${buttonText(prior(p.hash))}</button></article>`).join('')||'<p>暂无历史训练</p>',onOpen:bindStarts});
 }
 S.bindDailyCard=function(auto=true){
  legacyBind.call(this,auto);const root=S.$('#daily-training');if(!root)return;
  const h=S.$('[data-daily="history"]',root);if(h)h.onclick=history;
  const refresh=S.$('[data-daily="refresh"]',root);if(refresh){const fn=refresh.onclick;refresh.onclick=async()=>{await fn?.();const p=rowFor(D.today());if(marked(p)){attempted.delete(owner()+':'+p.hash);receive(p);}};}
  bindStarts(root);const p=rowFor(D.today());if(marked(p)&&!cache()?.pairs?.[p.hash])receive(p);
 };
 function receive(p){const key=owner()+':'+p.hash;if(!owner()||!S.accountSync?.verified||attempted.has(key))return;attempted.add(key);say('正在接收两包训练');load(p.date).then(repaint).catch(e=>say('接收未完成：'+e.message+'；可点刷新重试'));}
 S.DailyPairs={derive,isPaired:marked,names,prefix:PREFIX};S.openDailyTrack=open;
})(window.Study);
