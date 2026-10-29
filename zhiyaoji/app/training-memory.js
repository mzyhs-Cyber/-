(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root.Study=root.Study||{},api);})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const day=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const fallback=new Map();
 class DailyTrainingMemory{
  constructor(storage,owner='',now=()=>Date.now()){this.storage=storage;this.key='zhiyaoji-training-view-v1:'+owner;this.now=now;}
  read(scope){let v=fallback.get(this.key);try{v=JSON.parse(this.storage?.getItem(this.key)||'null')||v;}catch{}return v?.day===day(this.now())?v.views?.[scope]||null:null;}
  write(scope,value){let v=fallback.get(this.key);try{v=JSON.parse(this.storage?.getItem(this.key)||'null')||v;}catch{}if(v?.day!==day(this.now()))v={day:day(this.now()),views:{}};v.views[scope]=value;fallback.set(this.key,v);try{this.storage?.setItem(this.key,JSON.stringify(v));}catch{}}
 }
 function issueNumber(value){
  const s=String(value||'').normalize('NFKC').replace(/\s/g,'');if(/^\d+$/.test(s))return Number(s);
  const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units={十:10,百:100,千:1000};
  if(!s||![...s].every(c=>Object.hasOwn(digits,c)||Object.hasOwn(units,c)))return null;
  if(!/[十百千]/.test(s))return Number([...s].map(c=>digits[c]).join(''));
  let total=0,n=0;for(const c of s){if(Object.hasOwn(digits,c))n=digits[c];else{total+=(n||1)*units[c];n=0;}}return total+n;
 }
 function paperIssue(p){const s=String(p.title||p.name||'').normalize('NFKC'),token='[0-9零〇一二两三四五六七八九十百千]+';const m=s.match(new RegExp('(?:第\\s*)?('+token+')\\s*(?:期|季|套|次)'))||s.match(new RegExp('(?:期|季)\\s*('+token+')','i'));return m?issueNumber(m[1]):null;}
 function paperHalf(p){const s=String(p.title||p.name||'').normalize('NFKC');return /下半(?:年|年度)/.test(s)?2:/上半(?:年|年度)/.test(s)?1:0;}
 function comparePapersRecent(a,b){
  const year=p=>Number(p.year||p.paperYear)||Number(String(p.title||'').match(/20\d{2}/)?.[0])||0;
  const ya=year(a),yb=year(b);if(ya!==yb)return yb-ya;
  const ha=paperHalf(a),hb=paperHalf(b);if(ha!==hb)return hb-ha;
  const ia=paperIssue(a)??-1,ib=paperIssue(b)??-1;if(ia!==ib)return ib-ia;
  return String(a.title||'').localeCompare(String(b.title||''),'zh',{numeric:true})||String(a.id||'').localeCompare(String(b.id||''));
 }
 function compactControlHit(button,x,y){const svg=button.querySelector?.('svg'),b=(svg||button).getBoundingClientRect();const side=Math.max(b.width,b.height),cx=b.left+b.width/2,cy=b.top+b.height/2;return x>=cx-side/2&&x<cx+side/2&&y>=cy-side/2&&y<cy+side/2;}
 return {DailyTrainingMemory,comparePapersRecent,paperIssue,paperHalf,issueNumber,compactControlHit};
});
