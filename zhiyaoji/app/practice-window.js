/* R73: continuous paper flow with bounded live cards; unchanged pixel density. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else(root.Study=root.Study||{}).PracticeWindow=api;})(globalThis,function(){
 'use strict';
 class Heights{
  constructor(values){this.values=values.slice();this.rebuild();}
  rebuild(){this.prefix=[0];for(const h of this.values)this.prefix.push(this.prefix.at(-1)+h);}
  set(i,h){if(!Number.isFinite(h)||h<1||Math.abs(h-this.values[i])<.5)return false;this.values[i]=h;this.rebuild();return true;}
  at(y){let a=0,b=this.values.length;while(a<b){const m=(a+b)>>1;if(this.prefix[m+1]<=y)a=m+1;else b=m;}return Math.min(this.values.length-1,Math.max(0,a));}
  range(y,h,buffer=h){return[this.at(Math.max(0,y-buffer)),Math.min(this.values.length,this.at(y+h+buffer)+1)];}
 }
 function create(exam,markup){
  const qs=exam.s.questions,allowed=exam.s._review&&Array.isArray(exam.s._reviewIndices)?new Set(exam.s._reviewIndices):null,indices=qs.map((_,i)=>i).filter(i=>!allowed||allowed.has(i));if(!indices.length)return null;
  const win={exam,indices,markup,nodes:new Map(),parts:new Map(),version:0,frame:0,dead:false};win.heights=new Heights(indices.map(i=>qs[i].materialKey?760:480));win.position=new Map(indices.map((i,n)=>[i,n]));
  const E=()=>globalThis.Study;
  win.html=()=>'<div class="practice-gap" data-window-top></div><div class="practice-live"></div><div class="practice-gap" data-window-bottom></div>';
  win.attach=()=>{win.scroll=exam.root.querySelector('#question-scroll');win.host=win.scroll?.querySelector('.practice-live');if(!win.host)return;win.top=win.scroll.querySelector('[data-window-top]');win.bottom=win.scroll.querySelector('[data-window-bottom]');win.resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>win.schedule(true)):null;win.paint(exam.s.index);win.scroll.scrollTop=win.heights.prefix[win.position.get(exam.s.index)||0];exam.abort.signal.addEventListener('abort',()=>win.destroy(),{once:true});};
  win.schedule=measure=>{win.needsMeasure ||=measure;if(win.frame||win.dead)return;win.frame=requestAnimationFrame(()=>{win.frame=0;if(E()?.activeInkPointer){win.schedule(win.needsMeasure);return;}if(win.needsMeasure){win.needsMeasure=false;win.measure();}win.paint();});};
  win.measure=()=>{if(win.dead||!win.scroll||exam.split||E()?.activeInkPointer)return;const anchor=win.heights.at(win.scroll.scrollTop),offset=win.scroll.scrollTop-win.heights.prefix[anchor];let changed=false;
   for(const [n,node]of win.nodes){const h=node.getBoundingClientRect().height;if(h>0)changed=win.heights.set(n,h)||changed;const q=node.querySelector('[data-question]');if(q){const b=q.getBoundingClientRect(),a=node.getBoundingClientRect();win.parts.set(n,{offset:b.top-a.top,height:b.height,contentHeight:(q.querySelector('.qcontent')?.getBoundingClientRect().bottom||b.bottom)-b.top});}}
   if(changed){win.version++;win.scroll.scrollTop=Math.max(0,win.heights.prefix[anchor]+offset);win.spacers();for(const v of exam.layers?.values()||[]){v.regionCache=null;v.invalidate?.();}}
  };
  win.spacers=()=>{const ns=[...win.nodes.keys()].sort((a,b)=>a-b),a=ns[0]??0,b=ns.at(-1)??-1;win.top.style.height=win.heights.prefix[a]+'px';win.bottom.style.height=(win.heights.prefix.at(-1)-win.heights.prefix[b+1])+'px';};
  win.paint=index=>{if(win.dead||!win.host||exam.split||E()?.activeInkPointer)return false;const h=Math.max(300,win.scroll.clientHeight),at=index==null?win.scroll.scrollTop:win.heights.prefix[win.position.get(index)||0],[first,last]=win.heights.range(at,h,h);let changed=false;
   if([...win.nodes.keys()].some(n=>n<first||n>=last)||Array.from({length:last-first},(_,j)=>first+j).some(n=>!win.nodes.has(n))){exam.readingControls?.restore();for(const[n,node]of win.nodes)if(n<first||n>=last){win.resize?.unobserve(node);node.remove();win.nodes.delete(n);changed=true;}for(let n=first;n<last;n++)if(!win.nodes.has(n)){const node=document.createElement('div');node.className='practice-item';node.dataset.windowItem=String(win.indices[n]);node.innerHTML=markup(win.indices[n]);win.nodes.set(n,node);win.resize?.observe(node);changed=true;}for(let n=first;n<last;n++){const node=win.nodes.get(n),at=win.host.children[n-first];if(at!==node)win.host.insertBefore(node,at||null);}}
   win.spacers();if(changed){win.version++;for(const v of exam.layers?.values()||[]){for(const[key,f]of v.facades||[])if(f.domRoot?.isConnected===false){f.alive=false;clearTimeout(f.layoutTimer);f.cancelLayoutCapture?.();v.facades.delete(key);}v.regionCache=null;v.lastGeometry=null;if(v.pointer==null&&v.router)v.router.geometry=null;v.readingAnchor=null;E()?.captureReadingAnchor?.(v);v.invalidate?.();}E()?.prunePracticeImages?.(exam);exam.imageScope=null;if(exam.readingControls){exam.decorateOptions?.(win.host);exam.updateControls?.();exam.updateInk?.();}win.schedule(true);}return changed;
  };
  win.ensure=i=>{win.paint(i);win.measure();};
  win.captureAnchor=()=>{if(!win.scroll)return null;const pane=win.scroll.getBoundingClientRect(),cards=[...win.nodes.values()].map(n=>n.querySelector('[data-question]')).filter(Boolean).map(node=>({node,box:node.getBoundingClientRect()})).sort((a,b)=>a.box.top-b.box.top),row=cards.find(x=>x.box.bottom>pane.top+12)||cards.at(-1);if(!row)return null;const i=Number(row.node.dataset.question),offset=pane.top-row.box.top;return{questionId:qs[i]?.id,index:i,offset,fraction:row.box.height?Math.max(0,Math.min(1,offset/row.box.height)):0,width:win.scroll.clientWidth};};
  win.restore=(anchor,fallback=exam.s.index)=>{let i=anchor?.questionId?qs.findIndex(q=>q.id===anchor.questionId):fallback;if(!win.position.has(i))i=win.position.has(fallback)?fallback:indices[0];win.ensure(i);const card=win.host.querySelector('[data-question="'+i+'"]');if(!card)return;const pane=win.scroll.getBoundingClientRect(),box=card.getBoundingClientRect();let offset=-15,target=card;if(anchor&&anchor.questionId===qs[i].id){offset=anchor.width===win.scroll.clientWidth?Number(anchor.offset)||0:(Number(anchor.fraction)||0)*box.height;}else if(card.previousElementSibling?.classList.contains('material-preview'))target=card.previousElementSibling;win.scroll.scrollTop+=target.getBoundingClientRect().top-pane.top+offset;exam.s.index=i;exam.updateClock?.();for(const v of exam.layers?.values()||[]){v.regionCache=null;v.invalidate?.();}};
  win.regions=(view,pane)=>{const rows=[],scrollTop=view.scroll.scrollTop;
   for(const[n,node]of win.nodes){const i=win.indices[n],card=node.querySelector('[data-question]');if(!card)continue;const b=card.getBoundingClientRect(),p=win.parts.get(n);rows.push({key:'q:'+qs[i].id,node:card,anchor:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:p?.contentHeight||b.height},left:pane.left,right:pane.right,top:b.top,bottom:b.bottom});}
   rows.sort((a,b)=>a.top-b.top);for(let j=0;j<rows.length;j++){if(j===0)rows[j].top=Math.min(rows[j].top,pane.top);rows[j].bottom=rows[j+1]?.top??Math.max(rows[j].bottom,pane.bottom);}
   const owner=exam.noteOwnerIndex,q=qs[owner];if(q&&!rows.some(r=>r.key==='q:'+q.id)){const n=win.position.get(owner);if(n!=null){const p=win.parts.get(n)||{offset:0,height:win.heights.values[n],contentHeight:win.heights.values[n]},top=pane.top+win.heights.prefix[n]+p.offset-scrollTop;rows.push({key:'q:'+q.id,node:null,anchor:{left:pane.left,right:pane.right,top,bottom:top+p.height,width:pane.width,height:p.contentHeight},left:pane.left,right:pane.right,top,bottom:top+p.height});}}
   return rows.sort((a,b)=>a.top-b.top);
  };
  win.destroy=()=>{win.dead=true;cancelAnimationFrame(win.frame);win.resize?.disconnect();win.nodes.clear();win.parts.clear();};return win;
 }
 return {Heights,create};
});
