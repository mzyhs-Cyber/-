(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root.Study=root.Study||{},api);})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const day=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const fallback=new Map();
 class DailyTrainingMemory{
  constructor(storage,owner='',now=()=>Date.now()){this.storage=storage;this.key='zhiyaoji-training-view-v1:'+owner;this.now=now;}
  read(scope){let v=fallback.get(this.key);try{v=JSON.parse(this.storage?.getItem(this.key)||'null')||v;}catch{}return v?.day===day(this.now())?v.views?.[scope]||null:null;}
  write(scope,value){let v=fallback.get(this.key);try{v=JSON.parse(this.storage?.getItem(this.key)||'null')||v;}catch{}if(v?.day!==day(this.now()))v={day:day(this.now()),views:{}};v.views[scope]=value;fallback.set(this.key,v);try{this.storage?.setItem(this.key,JSON.stringify(v));}catch{}}
 }
 function paperIssue(p){const s=String(p.title||p.name||'').normalize('NFKC');const m=s.match(/第\s*(\d+)\s*(?:期|季|套|次)/)||s.match(/(?:期|季)\s*(\d+)/i);return m?Number(m[1]):null;}
 function comparePapersRecent(a,b){
  const year=p=>Number(p.year||p.paperYear)||Number(String(p.title||'').match(/20\d{2}/)?.[0])||0;
  const ya=year(a),yb=year(b);if(ya!==yb)return yb-ya;
  const ia=paperIssue(a),ib=paperIssue(b);if(ia!==null&&ib!==null&&ia!==ib)return ib-ia;
  return String(a.title||'').localeCompare(String(b.title||''),'zh',{numeric:true})||String(a.id||'').localeCompare(String(b.id||''));
 }
 function compactControlHit(button,x,y){const svg=button.querySelector?.('svg'),b=(svg||button).getBoundingClientRect();const side=Math.max(b.width,b.height),cx=b.left+b.width/2,cy=b.top+b.height/2;return x>=cx-side/2&&x<cx+side/2&&y>=cy-side/2&&y<cy+side/2;}
 return {DailyTrainingMemory,comparePapersRecent,paperIssue,compactControlHit};
});
