/*
 * Zhiyaoji performance diagnostics D2: observational only.
 * Base: V2.9.18 r2 (NOT the P1 performance-patched edition).
 * No question content, answers, usernames, authentication details or network payloads are collected.
 * Bounded local-only record; never uploads or changes study data.
 */
(function (S) {
  'use strict';
  if (!S || window.__ZhiyaojiPerfDiagnostics) return;
  const VERSION = 'D2-r8-2';
  const STORAGE_KEY = 'zhiyaoji-perf-diagnostics-d1'; // Shared key: retain D1 logs after upgrading to D2.
  const MAX_EVENTS = 300;
  const MAX_AGE_MS = 2 * 24 * 3600000;
  const FLUSH_INTERVAL_MS = 15000;
  const DIAG = {version:VERSION, sessionStart:Date.now(), currentRoute:'boot', memorySupported:false, longTaskSupported:false};
  window.__ZhiyaojiPerfDiagnostics = DIAG;
  let events = [];
  let accountDetails=[],accountFailures=[];const DETAIL_LIMIT=64;
  let previousRun = null;
  let dirty = false;
  let seq = 0;
  let lastFlush = 0;
  let flushing = false;
  let disposed = false;
  const ownSession = Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  const startAt = performance.now();
  function number(n,limit=1e12){return Number.isFinite(n)?Math.max(-limit,Math.min(limit,Math.round(n*10)/10)):null;}
  function read(){
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return null;
      const value=JSON.parse(raw);
      if(!value||value.schema!==1||!Array.isArray(value.events))return null;
      return value;
    } catch {return null;}
  }
  function truncate(){
    const cutoff=Date.now()-MAX_AGE_MS;
    events=events.filter(x=>x && x.at>=cutoff).slice(-MAX_EVENTS);
  }
  const stored=read();
  if(stored){accountFailures=Array.isArray(stored.accountFailures)?stored.accountFailures.slice(-12):[];accountDetails=Array.isArray(stored.accountDetails)?stored.accountDetails.slice(-DETAIL_LIMIT):[];events=stored.events;previousRun=stored.run||null;truncate();}
  function write(force=false){
    if(flushing||disposed||(!dirty&&!force)||(!force&&S.activeInkPointer))return;
    const now=Date.now();
    if(!force&&now-lastFlush<FLUSH_INTERVAL_MS)return;
    flushing=true;
    try{
      truncate();
      localStorage.setItem(STORAGE_KEY,JSON.stringify({schema:1,version:VERSION,events,accountDetails,accountFailures,
        run:{id:ownSession,startedAt:DIAG.sessionStart,lastAt:now,route:DIAG.currentRoute,visible:document.visibilityState,ended:false}}));
      dirty=false;lastFlush=now;
    }catch{
      // Storage may be unavailable in private browsing, over quota or while WebKit is terminating.
      // Never interfere with the application or retry in a tight loop.
    }finally{flushing=false;}
  }
  function add(type,data={},sync=false){
    if(disposed)return;
    const e={at:Date.now(),t:number(performance.now()-startAt),run:ownSession,n:++seq,type,...data};
    events.push(e);
    if(events.length>MAX_EVENTS+40)events.splice(0,events.length-MAX_EVENTS);
    dirty=true;
    // Coalesce diagnostic persistence; failures must not cause a synchronous storage burst.
    if(sync&&type==='page_start')write(true);
  }
  const navigation=performance.getEntriesByType?.('navigation')?.[0];
  add('page_start',{
    build:S.BUILD||'unknown',diagnosticVersion:VERSION,nav:navigation?.type||'unknown',
    wasDiscarded:!!document.wasDiscarded,
    width:window.innerWidth,height:window.innerHeight,dpr:number(window.devicePixelRatio),
    touch:('ontouchstart' in window)||navigator.maxTouchPoints>0,
    memoryAPI:!!performance.memory,
    previousRun:previousRun?{
      ageSeconds:number((Date.now()-previousRun.lastAt)/1000),
      lastRoute:previousRun.route,
      ended:!!previousRun.ended,
      // A missing pagehide suggests an abrupt termination but does not prove a memory crash.
      unclean:!previousRun.ended && Date.now()-previousRun.lastAt<3600000
    }:null
  },true);
  DIAG.report=()=>({schema:1,diagnosticVersion:VERSION,createdAt:new Date().toISOString(),
    description:'本地诊断信息。手写延迟为JS事件至画布绘制指令完成的估计，非真实屏幕呈现延迟；异常刷新和CPU/内存原因不可直接推定。',
    applicationBase:'V2.9.18 修正版8.6（存储错误与重定向诊断）',
    metrics:{eventCount:events.length,longTaskSupported:DIAG.longTaskSupported,memorySupported:DIAG.memorySupported,
      currentRoute:DIAG.currentRoute,viewWidth:innerWidth,viewHeight:innerHeight,devicePixelRatio:number(devicePixelRatio)},
    accountPhases:S.accountSync?.performance||null,accountDetails:accountDetails.slice(),accountFailures:accountFailures.slice(),storageState:S.accountSync?.storageDiagnosticInfo?.()||null,events:events.slice()});
  S.accountSync.traceDiagnostic=(name,data)=>{accountDetails.push({at:Date.now(),run:ownSession,build:S.BUILD||'unknown',name,...data});if(accountDetails.length>DETAIL_LIMIT)accountDetails.splice(0,accountDetails.length-DETAIL_LIMIT);if(data.ok===false){accountFailures.push(accountDetails.at(-1));if(accountFailures.length>12)accountFailures.shift();}dirty=true;};
  navigator.serviceWorker?.addEventListener?.('message',e=>{if(e.data?.type==='shell-redirect-normalized')add('shell_redirect_normalized');});
  DIAG.export=function(){
    if(typeof window.__flushInkDiagnostic==='function')window.__flushInkDiagnostic();
    add('diagnostic_export');write(true);
    const json=JSON.stringify(DIAG.report(),null,2);
    const blob=new Blob([json],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='知遥集_性能诊断_D2_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  };
  DIAG.clear=function(){events=[];accountDetails=[];accountFailures=[];seq=0;dirty=true;add('diagnostic_cleared');write(true);};
  DIAG.record=add;

  // Navigation: measure synchronous rendering, and the duration until the next two animation frames.
  // Long renders need separate diagnosis from waiting for browser paint.
  const originalGo=S.go;
  if(typeof originalGo==='function')S.go=function(route){
    const label=({home:'训练',history:'记录',bank:'题库',settings:'设置',media:'图片检测',papers:'整卷',timed:'限时',learning:'专项',setup:'设置',practice:'做题'})[route]||'其他';
    const before=performance.now(),previous=DIAG.currentRoute;
    try{
      const value=originalGo.apply(this,arguments);
      DIAG.currentRoute=String(route||'unknown').slice(0,24);
      const synchronous=performance.now()-before;
      add('navigation',{from:previous,to:DIAG.currentRoute,label,renderMs:number(synchronous)});
      /* Slow navigation is recorded; persistence remains coalesced. */
      if(document.visibilityState==='visible'){
        requestAnimationFrame(()=>{
          requestAnimationFrame(()=>add('navigation_painted',{to:DIAG.currentRoute,elapsedMs:number(performance.now()-before)}));
        });
      }
      return value;
    }catch(error){
      add('navigation_error',{to:String(route).slice(0,24),name:String(error?.name||'Error').slice(0,45)},true);
      throw error;
    }
  };

  // Observe only high-confidence long tasks where the browser supports the Long Tasks API.
  try{
    if(window.PerformanceObserver&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
      DIAG.longTaskSupported=true;
      const observer=new PerformanceObserver(list=>{
        for(const item of list.getEntries()){
          // Reduce write amplification: log >=80ms; the observer callback is otherwise cheap.
          if(item.duration>=80)add('long_task',{durationMs:number(item.duration),route:DIAG.currentRoute});
        }
      });
      observer.observe({entryTypes:['longtask']});
      DIAG.longTaskObserver=observer;
    }
  }catch{}

  // Periodic snapshot; no full-bank iteration or app-state serialization.
  function snapshot(kind){
    const point={route:DIAG.currentRoute,visibility:document.visibilityState};
    if(performance.memory?.usedJSHeapSize){
      point.jsHeapMB=number(performance.memory.usedJSHeapSize/1048576);
      point.jsHeapLimitMB=number(performance.memory.jsHeapSizeLimit/1048576);
      DIAG.memorySupported=true;
    }
    // DOM node sampling at low frequency; does not capture any content.
    if(kind==='sample'&&!S.activeInkPointer&&document.visibilityState==='visible')point.domNodes=document.getElementsByTagName('*').length;
    point.storage=S.accountSync?.storageDiagnosticInfo?.()||null;
    add(kind,point);
  }
  let lastHeartbeat=performance.now();
  setInterval(()=>{
    const now=performance.now();
    const delay=Math.max(0,now-lastHeartbeat-30000);
    lastHeartbeat=now;
    if(delay>=250)add('timer_delay',{delayMs:number(delay),route:DIAG.currentRoute});
    if(!S.activeInkPointer)snapshot('sample');write();
  },30000);
  setInterval(()=>write(),15000);

  // Instrument account sync lifecycles without payloads, usernames, URLs or record identifiers.
  function instrument(object,name,category){
    const prior=object?.[name];
    if(typeof prior!=='function'||prior.__perfWrapped)return;
    function wrapped(){
      const begin=performance.now();
      add(category+'_begin',{stage:name});
      let result;
      try{result=prior.apply(this,arguments)}catch(error){
        add(category+'_error',{stage:name,durationMs:number(performance.now()-begin),errorType:String(error?.name||'Error').slice(0,48)},true);
        throw error;
      }
      // Use .then only for promise-returning methods, preserving synchronous return values.
      if(result && typeof result.then==='function'){
        return result.then(value=>{add(category+'_done',{stage:name,durationMs:number(performance.now()-begin)});return value;},error=>{
          add(category+'_error',{stage:name,durationMs:number(performance.now()-begin),errorType:String(error?.name||'Error').slice(0,48)},true);throw error;
        });
      }
      add(category+'_done',{stage:name,durationMs:number(performance.now()-begin)});
      return result;
    }
    wrapped.__perfWrapped=true;object[name]=wrapped;
  }
  for(const name of ['sync','requestSync','scheduleTick','restoreLocal','init'])instrument(S.accountSync,name,'account_sync');
  if(S.media){
    for(const name of ['checkAll','runCheck'])instrument(S.media,name,'image_check');
  }
  instrument(S,'importBundledBank','bank_load');

  // Network samples: only classify same-origin API calls by category.
  // Never capture the path/query, URL, request body, response body or credentials.
  const nativeFetch=window.fetch;
  if(typeof nativeFetch==='function')window.fetch=function(input,init){
    let group='';
    try{
      const raw=typeof input==='string'?input:input?.url;
      const parsed=new URL(raw,location.href);
      if(parsed.origin===location.origin && parsed.pathname.startsWith('/api/')){
        group=parsed.pathname.startsWith('/api/sync/')?'sync':parsed.pathname.startsWith('/api/account/')?'account':'other_api';
      }
    }catch{}
    if(!group)return nativeFetch.apply(this,arguments);
    const begin=performance.now();
    try{
      const result=nativeFetch.apply(this,arguments);
      return Promise.resolve(result).then(response=>{
        const ms=performance.now()-begin;
        // Sample only slow or failing requests; never store request parameters.
        if(ms>=1000||!response.ok)add('network',{group,durationMs:number(ms),status:response.status});
        return response;
      },error=>{
        add('network_error',{group,durationMs:number(performance.now()-begin),errorType:String(error?.name||'Error').slice(0,48)});
        throw error;
      });
    }catch(error){add('network_error',{group,errorType:String(error?.name||'Error').slice(0,48)});throw error;}
  };

  // Track page reload hints. An actual WebKit memory kill can happen without pagehide.
  document.addEventListener('visibilitychange',()=>{add('visibility',{state:document.visibilityState},document.hidden);});
  window.addEventListener('pageshow',event=>{add('pageshow',{bfcache:!!event.persisted});});
  window.addEventListener('pagehide',event=>{
    add('pagehide',{bfcache:!!event.persisted},true);
    try{
      const saved=read();if(saved?.run?.id===ownSession){saved.run.ended=true;saved.run.lastAt=Date.now();localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));}
    }catch{}
  });
  window.addEventListener('error',event=>{
    // No exception messages or filenames: could contain private content / URL.
    add('script_error',{errorType:String(event.error?.name||'Error').slice(0,45),route:DIAG.currentRoute});
  });
  window.addEventListener('unhandledrejection',event=>{
    add('unhandled_rejection',{errorType:String(event.reason?.name||'PromiseRejection').slice(0,45),route:DIAG.currentRoute});
  });

  // ---- D2: bounded, read-only handwriting timing instrumentation. ----
  // Hook existing drawing methods rather than adding more pointer listeners or a 60fps observer.
  // For each stroke, collect only timing aggregates: never pen location, strokes, notes or answers.
  const inkStates=new WeakMap();
  const activeInk=new Set();
  const inkTotals={strokes:0,slowStrokes:0,moves:0,paintCount:0,maxEventHandlerMs:0,maxPaintMs:0,maxInputToPaintMs:0,maxFrameGapMs:0};
  let inkLastSummary=performance.now();
  let lastBadInk=-Infinity;
  let lastVisible=performance.now();
  document.addEventListener('visibilitychange',()=>{lastVisible=performance.now();});
  function maxIfNumber(o,key,x){if(Number.isFinite(x))o[key]=Math.max(o[key]||0,x);}
  function writeInkSummary(force){
    const now=performance.now();
    if(!inkTotals.strokes || (!force && inkTotals.strokes<8 && now-inkLastSummary<30000))return;
    add('ink_summary',{...Object.fromEntries(Object.entries(inkTotals).map(([k,v])=>[k,number(v)]))});
    for(const k of Object.keys(inkTotals))inkTotals[k]=0;
    inkLastSummary=now;
  }
  function inkStart(view,event,kind){
    if(!event || event.pointerType==='touch')return;
    const pointer=kind==='workspace'?view.pointer:view.pointerId;
    if(pointer!==event.pointerId)return;
    const now=performance.now();
    if(inkStates.has(view))inkEnd(view,'interrupted');
    const record={kind,pointer,started:now,moves:0,paintCount:0,maxHandlerMs:0,maxPaintMs:0,maxInputToPaintMs:0,maxFrameGapMs:0,lastPaint:0,lastInputEvent:null};
    inkStates.set(view,record);activeInk.add(view);
  }
  function validStamp(time){
    const t=Number(time),now=performance.now();
    // Some browser Event.timeStamp variants use epoch time, so only accept same-origin monotonic stamps.
    return Number.isFinite(t)&&t>=0&&t<=now+1000&&now-t<30000?t:null;
  }
  function inkMove(view,event,costMs){
    const rec=inkStates.get(view);if(!rec || !event || event.pointerId!==rec.pointer)return;
    rec.moves++;
    maxIfNumber(rec,'maxHandlerMs',costMs);
    const stamp=validStamp(event.timeStamp);
    rec.lastInputEvent=stamp;
  }
  function inkPaint(view,costMs,end){
    const rec=inkStates.get(view);if(!rec)return;
    rec.paintCount++;
    maxIfNumber(rec,'maxPaintMs',costMs);
    if(rec.lastPaint)maxIfNumber(rec,'maxFrameGapMs',end-rec.lastPaint);
    rec.lastPaint=end;
    if(rec.lastInputEvent!==null){
      const lag=end-rec.lastInputEvent;
      if(lag>=0&&lag<30000)maxIfNumber(rec,'maxInputToPaintMs',lag);
      rec.lastInputEvent=null;
    }
  }
  function inkEnd(view,reason){
    const rec=inkStates.get(view);if(!rec)return;
    inkStates.delete(view);activeInk.delete(view);
    if(!rec.moves)return;
    inkTotals.strokes++;inkTotals.moves+=rec.moves;inkTotals.paintCount+=rec.paintCount;
    for(const k of ['maxHandlerMs','maxPaintMs','maxInputToPaintMs','maxFrameGapMs'])maxIfNumber(inkTotals,k,rec[k]);
    const slow=(rec.maxHandlerMs>=30 || rec.maxPaintMs>=40 || rec.maxInputToPaintMs>=100 || rec.maxFrameGapMs>=85);
    if(slow){
      inkTotals.slowStrokes++;
      const now=performance.now();
      if(now-lastBadInk>=2500){
        add('ink_lag',{mode:rec.kind,reason,moves:rec.moves,paintCount:rec.paintCount,
          maxHandlerMs:number(rec.maxHandlerMs),maxPaintMs:number(rec.maxPaintMs),
          maxInputToPaintMs:number(rec.maxInputToPaintMs),maxFrameGapMs:number(rec.maxFrameGapMs)},true);
        lastBadInk=now;
      }
    }
    writeInkSummary(false);
  }
  function wrapInk(classRef,kind,{down,move,up,paint,finish}){
    if(!classRef?.prototype)return false;
    const proto=classRef.prototype;
    const patch=(name,fn)=>{const prior=proto[name];if(typeof prior!=='function')return;proto[name]=function(){return fn.call(this,prior,arguments);};};
    patch(down,function(prior,args){const result=prior.apply(this,args);inkStart(this,args[0],kind);return result;});
    patch(move,function(prior,args){
      const tracked=inkStates.has(this);
      if(!tracked)return prior.apply(this,args);
      const start=performance.now();
      try{return prior.apply(this,args);}finally{inkMove(this,args[0],performance.now()-start);}
    });
    patch(paint,function(prior,args){
      const tracked=inkStates.has(this);
      if(!tracked)return prior.apply(this,args);
      const start=performance.now();
      try{return prior.apply(this,args);}finally{inkPaint(this,performance.now()-start,performance.now());}
    });
    patch(up,function(prior,args){
      const rec=inkStates.get(this),relevant=rec && args[0]?.pointerId===rec.pointer;
      try{return prior.apply(this,args);}finally{if(relevant)inkEnd(this,'pointer_up');}
    });
    if(finish)patch(finish,function(prior,args){
      try{return prior.apply(this,args);}finally{inkEnd(this,'finish');}
    });
    return true;
  }
  const inkHooks={
    workspace:wrapInk(S.WorkspaceInkView,'workspace',{down:'down',move:'move',up:'up',paint:'paint',finish:'finish'}),
    legacy:wrapInk(S.InkLayer,'legacy',{down:'_down',move:'_move',up:'_up',paint:'_paintCurrent',finish:'finish'})
  };
  DIAG.inkHooks=inkHooks;
  window.__flushInkDiagnostic=()=>writeInkSummary(true);
  add('ink_diagnostics_ready',{hooks:inkHooks,measure:'input_event_to_JS_canvas_paint_end_estimate; not photon latency'});
  // Detect gross event-loop stalls even if Safari does not expose the Long Tasks API.
  // 2-second heartbeat has low overhead and is paused logically when the page is hidden.
  let lastShortBeat=performance.now(),lastVisibleState=document.visibilityState;
  setInterval(()=>{
    const now=performance.now(),visible=document.visibilityState==='visible';
    const lag=Math.max(0,now-lastShortBeat-2000);
    lastShortBeat=now;
    if(!visible || lastVisibleState!=='visible' || now-lastVisible<2500){lastVisibleState=document.visibilityState;return;}
    lastVisibleState=document.visibilityState;
    if(lag>=140){
      add('event_loop_stall',{delayMs:number(lag),writing:activeInk.size>0,route:DIAG.currentRoute,storage:S.accountSync?.storageDiagnosticInfo?.()||null},lag>=800);
    }
    writeInkSummary(false);
  },2000);

  // Add an explicit, user-operated export button to the existing Settings page.
  const originalSettings=S.renderSettings;
  if(typeof originalSettings==='function')S.renderSettings=function(){
    const result=originalSettings.apply(this,arguments);
    try{
      const host=document.querySelector('#view');
      if(host&&!host.querySelector('#diag-panel')){
        const panel=document.createElement('section');panel.id='diag-panel';panel.className='panel settings-section';
        panel.innerHTML='<h2>性能诊断（D2-r8-2 · 含手写延迟）</h2>'+
          '<p>记录页面卡顿、手写事件处理和画布绘制耗时；不记录笔迹位置、形状或内容。异常重载后仍可导出。手写延迟是估计值，不等于实际屏幕显示延迟；iPad可能不提供内存和长任务指标。</p>'+
          '<div class="setting-actions">'+
          '<button class="button primary" type="button" id="diag-export">导出性能诊断</button>'+
          '<a class="button" href="storage-check.html">存储专项检测</a><button class="button" type="button" id="diag-clear">清空诊断记录</button></div>'+
          '<p id="diag-summary" style="font-size:.82rem;opacity:.75"></p>';
        host.appendChild(panel);
        const summary=panel.querySelector('#diag-summary');
        const previous=events.filter(e=>e.type==='page_start').slice(-2);
        summary.textContent='现存 '+events.length+' 条诊断记录；本机保留最多 '+MAX_EVENTS+' 条。'+
          (previous.length>1&&previous.at(-1)?.previousRun?.unclean?' 检测到上次页面未正常结束（原因待查）。':'');
        panel.querySelector('#diag-export').addEventListener('click',()=>DIAG.export());
        panel.querySelector('#diag-clear').addEventListener('click',()=>{
          if(!confirm('清空仅用于性能诊断的日志？不会删除题库、学习记录和笔记。'))return;
          DIAG.clear();summary.textContent='性能诊断记录已清空。';
        });
      }
    }catch{}
    return result;
  };
})(window.Study);
