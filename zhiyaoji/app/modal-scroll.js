/* Isolate modal scrolling, including iPad WebKit's body-overflow fallback. */
(function(S){
'use strict';
function styles(node,values){
 if(!node?.style)return ()=>{};
 const style=node.style,entries=Object.entries(values),before=entries.map(([name])=>({name,value:style.getPropertyValue?style.getPropertyValue(name):style[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())],priority:style.getPropertyPriority?.(name)||''}));
 const set=(name,value,priority='')=>{if(style.getPropertyValue){if(value===undefined||value===null||value==='')style.removeProperty(name);else style.setProperty(name,value,priority);}else style[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value??'';};
 for(const [name,value] of entries)set(name,value);
 return ()=>{for(const x of before)set(x.name,x.value,x.priority);};
}
S.lockModalScroll=function(host){
 const doc=document,root=doc.documentElement,body=doc.body;
 const x=Number(window.scrollX)||0,y=Number(window.scrollY)||Number(doc.scrollingElement?.scrollTop)||0;
 const gap=Math.max(0,(Number(window.innerWidth)||0)-(Number(root?.clientWidth)||Number(window.innerWidth)||0));
 const bodyValues={position:'fixed',top:-y+'px',left:-x+'px',right:'0',width:'100%',overflow:'hidden'};
 if(gap)bodyValues['padding-right']=((Number.parseFloat(window.getComputedStyle?.(body)?.paddingRight)||0)+gap)+'px';
 const restoreRoot=styles(root,{overflow:'hidden','overscroll-behavior':'none','scroll-behavior':'auto'}),restoreBody=styles(body,bodyValues);
 const backgrounds=Array.from(body.children||[]).filter(el=>el!==host&&el.id!=='toast'&&!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>({el,inert:el.inert}));
 for(const row of backgrounds)row.el.inert=true;
 const controller=new AbortController(),options={capture:true,passive:false,signal:controller.signal};let lastTouch=null,released=false;
 const inside=target=>!!target&&host.contains(target);
 function canScroll(target,dx,dy){
  const vertical=Math.abs(dy)>=Math.abs(dx),delta=vertical?dy:dx;if(!delta)return false;
  for(let el=target?.nodeType===1?target:target?.parentElement;el&&el!==host;el=el.parentElement){
   const style=window.getComputedStyle?.(el)||el.style||{},overflow=vertical?style.overflowY:style.overflowX;
   const viewport=Number(vertical?el.clientHeight:el.clientWidth)||0,total=Number(vertical?el.scrollHeight:el.scrollWidth)||0,position=Number(vertical?el.scrollTop:el.scrollLeft)||0;
   if(/auto|scroll|overlay/.test(overflow||'')&&total>viewport+1&&((delta<0&&position>0)||(delta>0&&position+viewport<total-1)))return true;
  }return false;
 }
 function block(event){if(event.cancelable!==false)event.preventDefault?.();if(!inside(event.target))event.stopPropagation?.();}
 const start=event=>{const touch=event.touches?.[0];lastTouch=touch?{x:touch.clientX,y:touch.clientY}:null;};
 const move=event=>{
  if(!inside(event.target)){block(event);return;}
  if(event.target?.tagName==='INPUT'&&event.target.type==='range')return;
  const touch=event.touches?.[0];if(!touch||event.touches.length!==1){block(event);return;}
  const point={x:touch.clientX,y:touch.clientY},previous=lastTouch;lastTouch=point;
  if(!previous||!canScroll(event.target,previous.x-point.x,previous.y-point.y))block(event);
 };
 const wheel=event=>{if(!inside(event.target)||!canScroll(event.target,Number(event.deltaX)||0,Number(event.deltaY)||0))block(event);};
 doc.addEventListener('touchstart',start,options);doc.addEventListener('touchmove',move,options);doc.addEventListener('wheel',wheel,options);
 return function release(){
  if(released)return;released=true;controller.abort();lastTouch=null;
  for(const row of backgrounds)row.el.inert=row.inert;
  restoreBody();if(typeof window.scrollTo==='function')window.scrollTo(x,y);restoreRoot();
 };
};
})(window.Study=window.Study||{});
