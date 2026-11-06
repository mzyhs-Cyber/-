/* Bounded preloading; contains no question persistence or ink operations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{const S=root.Study=root.Study||{};S.PracticeImages=api;api.install(S,{document:root.document,window:root,navigator:root.navigator,Image:root.Image,IntersectionObserver:root.IntersectionObserver,setTimeout:root.setTimeout,clearTimeout:root.clearTimeout,requestAnimationFrame:root.requestAnimationFrame,cancelAnimationFrame:root.cancelAnimationFrame});}})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 class Queue{
  constructor({Image,limit=4,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,timeout=10000}={}){
   Object.assign(this,{Image,limit,now,setTimer,clearTimer,timeout});this.active=new Map();this.ready=new Map();this.failed=new Map();this.pending=[];this.dead=false;
   this.metrics={started:0,completed:0,failed:0,cancelled:0,active:0,pending:0,maxActive:0};
  }
  plan(urls){if(this.dead)return;const unique=[...new Set(urls.filter(u=>typeof u==='string'&&u))].slice(0,32);this.pending=unique.filter(u=>!this.active.has(u)&&!this.ready.has(u)&&(this.failed.get(u)||0)<=this.now());this.pump();}
  pump(){
   if(this.dead||typeof this.Image!=='function')return;
   while(this.active.size<this.limit&&this.pending.length){
    const url=this.pending.shift();if(this.active.has(url)||this.ready.has(url)||(this.failed.get(url)||0)>this.now())continue;
    const image=new this.Image(),job={image,timer:null};this.active.set(url,job);this.metrics.started++;
    this.metrics.active=this.active.size;this.metrics.maxActive=Math.max(this.metrics.maxActive,this.active.size);
    const done=ok=>{
     if(this.active.get(url)!==job)return;this.clearTimer(job.timer);image.onload=image.onerror=null;this.active.delete(url);job.image=null;
     if(ok){this.ready.set(url,this.now());this.failed.delete(url);this.metrics.completed++;while(this.ready.size>80)this.ready.delete(this.ready.keys().next().value);}
     else{this.failed.set(url,this.now()+30000);this.metrics.failed++;while(this.failed.size>80)this.failed.delete(this.failed.keys().next().value);}
     this.metrics.active=this.active.size;this.pump();
    };
    image.referrerPolicy='no-referrer';image.decoding='async';image.setAttribute?.('fetchpriority','low');image.onload=()=>done(true);image.onerror=()=>done(false);
    job.timer=this.setTimer(()=>{image.removeAttribute?.('src');done(false);},this.timeout);job.timer?.unref?.();
    try{image.src=url;}catch{done(false);}
   }
   this.metrics.active=this.active.size;this.metrics.pending=this.pending.length;
  }
  dispose(){if(this.dead)return;this.dead=true;this.pending=[];for(const job of this.active.values()){this.clearTimer(job.timer);job.image.onload=job.image.onerror=null;job.image.removeAttribute?.('src');job.image=null;this.metrics.cancelled++;}this.active.clear();this.ready.clear();this.failed.clear();this.metrics.active=0;this.metrics.pending=0;}
 }
 function install(S,env){
  const {document,window,Image,IntersectionObserver,navigator}=env,states=new Set(),byExam=new WeakMap(),urlsByQuestion=new WeakMap();
  S.clearWarmQuestionImages?.();
  if(!S.imageDimensions){S.imageDimensions=new Map();document.addEventListener('load',event=>{const img=event.target;if(img?.tagName==='IMG'&&img.naturalWidth){S.imageDimensions.set(img.currentSrc||img.src,{width:img.naturalWidth,height:img.naturalHeight});if(S.imageDimensions.size>300)S.imageDimensions.delete(S.imageDimensions.keys().next().value);}},true);}
  function state(exam){let item=byExam.get(exam);if(!item){item={exam,queue:new Queue({Image,setTimer:env.setTimeout||setTimeout,clearTimer:env.clearTimeout||clearTimeout}),observer:null,scope:null,frame:0};byExam.set(exam,item);states.add(item);S.imagePreloadMetrics=item.queue.metrics;
   exam.abort?.signal.addEventListener('abort',()=>release(item),{once:true});
   exam.root?.addEventListener('scroll',()=>{if(item.frame||exam.disposed)return;item.frame=(env.requestAnimationFrame||requestAnimationFrame)(()=>{item.frame=0;if(!exam.disposed)S.preparePracticeImages(exam);});},{capture:true,passive:true,signal:exam.abort?.signal});
  }return item;}
  function release(item){item.observer?.disconnect();if(item.frame)(env.cancelAnimationFrame||cancelAnimationFrame)(item.frame);item.queue.dispose();states.delete(item);byExam.delete(item.exam);item.exam.imageObserver=null;item.exam.imageScope=null;}
  S.clearWarmQuestionImages=()=>{for(const item of [...states])release(item);};
  function sources(q){const fields=[q.stemHtml,...q.optionsHtml||[],q.materialHtml],cached=urlsByQuestion.get(q);if(cached&&fields.length===cached.fields.length&&fields.every((v,i)=>v===cached.fields[i]))return cached.urls;const urls=[...new Set(fields.flatMap(html=>S.imageSources?.(html)||[]))];urlsByQuestion.set(q,{fields,urls});return urls;}
  S.warmQuestionImages=function(exam){
   if(exam.disposed||typeof Image!=='function'||navigator?.connection?.saveData)return;
   const item=state(exam),index=Math.max(0,Number(exam.s.index)||0),qs=exam.s.questions.slice(index,index+2);
   // Equality checks are cheap; HTML parsing occurs only when a question changes.
   item.queue.plan(qs.flatMap(sources));
  };
  S.preparePracticeImages=function(exam){
   if(exam.disposed)return;const scope=exam.split?S.$('.split-shell',exam.root):S.$('#question-scroll',exam.root);if(!scope)return;
   S.warmQuestionImages(exam);const item=state(exam);if(item.scope===scope&&exam.imageScope===scope)return;
   item.observer?.disconnect();item.scope=scope;exam.imageScope=scope;
   const promote=img=>{if(!img.isConnected)return;img.loading='eager';img.setAttribute('fetchpriority','high');S.watchPracticeImage?.(img,exam);};
   item.observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const row of entries)if(row.isIntersecting){promote(row.target);item.observer?.unobserve(row.target);}},{root:null,rootMargin:'200px 0px'}):null;
   exam.imageObserver=item.observer;
   for(const img of S.$$('img',scope)){img.decoding='async';const r=img.getBoundingClientRect(),visible=r.bottom>=0&&r.top<(window.innerHeight||900)+120;if(visible)promote(img);else{img.loading='lazy';img.setAttribute('fetchpriority','low');item.observer?.observe(img);}}
  };
  for(const exam of [S.exam,S.review?.controller])if(exam&&!exam.disposed){exam.imageObserver?.disconnect();exam.imageScope=null;S.preparePracticeImages(exam);}
  return {states};
 }
 return {Queue,install};
});
