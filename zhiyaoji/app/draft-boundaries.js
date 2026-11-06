/* Preserve saved ink when only the card origin moves; never rewrite points. */
(function(S){
 'use strict';
 const anchor=S.anchorInkStroke,pairs=new WeakMap();
 function translation(old,current){
  let cache=pairs.get(old);if(!cache){cache=new WeakMap();pairs.set(old,cache);}if(cache.has(current))return cache.get(current);
  let shift=null;
  const a=old.text||[],b=current.text||[],ai=old.images||[],bi=current.images||[];
  if(a.length===b.length&&ai.length===bi.length&&(a.length||ai.length)){
   const checks=a.map((x,i)=>({a:x,b:b[i],same:x.text===b[i].text&&(x.section||'')===(b[i].section||'')&&(x.font||'')===(b[i].font||'')})).concat(ai.map((x,i)=>({a:x,b:bi[i],same:x.src===bi[i].src})));
   for(const row of checks){
    const {a:x,b:y}=row,dx=y.x-x.x,dy=y.y-x.y;
    if(!row.same||![x.x,x.y,y.x,y.y,x.width,x.height,y.width,y.height].every(Number.isFinite)||Math.abs(x.width-y.width)>.5||Math.abs(x.height-y.height)>.5||Math.abs(dx)>24||Math.abs(dy)>24||shift&&(Math.abs(dx-shift.dx)>.5||Math.abs(dy-shift.dy)>.5)){shift=null;break;}
    if(!shift)shift={dx,dy};
   }
  }
  cache.set(current,shift);return shift;
 }
 S.anchorInkStroke=function(stroke,note,current,width,height){
  const old=note?.layouts?.[stroke.layoutId];
  if(old&&current&&Number.isFinite(old.width)&&Number.isFinite(old.height)&&old.width>0&&old.height>0&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&Math.abs(old.width-width)<1){
   const shift=translation(old,current);
   // The original near-proportional shortcut can miss a small origin shift.
   if(shift&&(Math.abs(shift.dx)>.5||Math.abs(shift.dy)>.5))return {...stroke,points:(stroke.points||[]).map(p=>({...p,x:(p.x*old.width+shift.dx)/width,y:(p.y*old.height+shift.dy)/height}))};
  }
  return anchor.call(this,stroke,note,current,width,height);
 };
 S.BUILD='20261027-r8-8-24';
})(window.Study);
