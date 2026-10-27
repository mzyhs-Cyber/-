/* Public image bytes have a separate bounded cache. Account APIs never enter caches. */
'use strict';
const CACHE='jiangsu-study-shell-v2-9-18-r8-8-27';
const MEDIA_CACHE='zhiyaoji-public-images-v1';
const READING_FILES=['./reading-continuity.js','./reading-continuity.css','./sync-cooperate.js'];
async function imageResponse(req){
 const cache=await caches.open(MEDIA_CACHE),cached=await cache.match(req);if(cached)return cached;
 const response=await fetch(req);if(response.ok||response.type==='opaque'){
  try{await cache.put(req,response.clone());const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-80)))await cache.delete(key);}catch{}
 }return response;
}
const FILES=['./','./index.html','./styles.css','./home.css','./report.css','./reading.css','./ux-polish.css','./refinement.css','./appearance-a.css','./dialog-choice.css','./ink-controls.css','./source-filters.css','./source-filters.js','./modal-scroll.js','./modal-scroll.css','./training-memory.js','./training-review.js','./training-controls.css','./timing-repair.js','./export-scopes.js','./draft-owner-review.js','./draft-boundaries.js','./review-only-upload.js','./training-order-ink.js','./review-surface.css','./icon-180.png','./icon-192.png','./icon-512.png','./bundle.js','./continuity.js','./performance-diagnostics.js','./storage-check.js','./bank-config.js','./icon.svg','./manifest.webmanifest'];
function cleanShellResponse(response){
 if(!response?.redirected)return response;
 // Shell documents are same-origin; never convert opaque/external redirects.
 if(!response.ok||response.type==='opaqueredirect'||!response.url||new URL(response.url).origin!==self.location.origin)throw Error('Unsupported shell redirect');
 const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll([...FILES,...READING_FILES])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('jiangsu-study-shell-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,u=new URL(req.url);
 if(req.method==='GET'&&req.destination==='image'&&/^https?:$/.test(u.protocol)&&!u.pathname.startsWith('/api/')&&!u.searchParams.has('token')&&!u.searchParams.has('signature')&&!studyImageAllowed(u)){event.respondWith(imageResponse(req));return;}
 if(req.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||!FILES.some(f=>new URL(f,self.registration.scope).pathname===u.pathname))return;
 let backgroundDone;event.waitUntil(new Promise(resolve=>backgroundDone=resolve));
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=(!u.searchParams.get('v')||['2.9.18-r8-6','2.9.18-r8-7-1','2.9.18-r8-8-2','2.9.18-r8-8-3','2.9.18-r8-8-4','2.9.18-r8-8-5','2.9.18-r8-8-6','2.9.18-r8-8-7','2.9.18-r8-8-11','2.9.18-r8-8-12','2.9.18-r8-8-13','2.9.18-r8-8-14','2.9.18-r8-8-15','2.9.18-r8-8-16'].includes(u.searchParams.get('v')))?cleanShellResponse(await cache.match(req,{ignoreSearch:true})):null;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);
  const network=fetch(req,{signal:abort.signal,redirect:'follow'}).then(async original=>{const response=cleanShellResponse(original);if(original.redirected&&self.clients.matchAll)event.waitUntil(self.clients.matchAll().then(cs=>cs.forEach(c=>c.postMessage({type:'shell-redirect-normalized'}))));if(response.ok)await cache.put(req,response.clone());return response;}).finally(()=>clearTimeout(timer));
  network.then(backgroundDone,backgroundDone);
  if(cached&&req.mode!=='navigate')return cached;
  if(cached){let timeout;try{return await Promise.race([network,new Promise(resolve=>timeout=setTimeout(()=>resolve(cached),2500))]);}catch{return cached;}finally{clearTimeout(timeout);}}
  try{return await network;}catch{if(req.mode==='navigate')return cleanShellResponse(await cache.match(new URL('./index.html',self.registration.scope).href,{ignoreSearch:true}))||Response.error();return Response.error();}
 })().catch(()=>{backgroundDone();return Response.error();}));
});


// Separate cache and concurrent request coalescing for known public study images.
const STUDY_IMAGE_CACHE='jiangsu-study-public-images-v1',studyImagePending=new Map();
let studyImageTrim=Promise.resolve();
function studyImageAllowed(u){
 if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
 return (['fb.fbstatic.cn','fb.fenbike.cn'].includes(u.hostname)&&(u.pathname==='/api/planet/accessories/formulas'||/\.(?:png|jpe?g|gif|webp|avif)$/i.test(u.pathname)))||(u.hostname==='jiangsu-study-bank-mzy.pages.dev'&&/^\/bank\/assets\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|avif)$/i.test(u.pathname));
}
function studyImageTrimCache(cache){
 studyImageTrim=studyImageTrim.catch(()=>{}).then(async()=>{const keys=await cache.keys();let bytes=0;for(let i=keys.length-1;i>=0;i--){const r=await cache.match(keys[i]);bytes+=Number(r?.headers.get('X-Study-Image-Bytes')||r?.headers.get('Content-Length')||0);if(keys.length-i>128||bytes>16*1024*1024)await cache.delete(keys[i]);}});
 return studyImageTrim;
}
async function studyPublicImage(request,event){
 const source=new URL(request.url);source.hash='';const key=source.href;let cache;
 try{cache=await caches.open(STUDY_IMAGE_CACHE);const hit=await cache.match(key);if(hit)return hit;}catch{}
 if(studyImagePending.has(key))return (await studyImagePending.get(key)).clone();
 const job=(async()=>{
  const proxy=new URL('/api/media/image',self.location.origin);proxy.searchParams.set('url',key);
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6500);
  try{
   const response=await fetch(proxy.href,{credentials:'omit',cache:'default',signal:abort.signal});
   if(!response.ok||!/^image\/(png|jpeg|webp|gif|avif)(;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('Image proxy unavailable');
   const size=Number(response.headers.get('X-Study-Image-Bytes')||response.headers.get('Content-Length'));
   if(cache&&size>0&&size<=4*1024*1024)event.waitUntil(cache.put(key,response.clone()).then(()=>studyImageTrimCache(cache)).catch(()=>{}));
   return response;
  }catch{return fetch(request);}finally{clearTimeout(timer);}
 })();studyImagePending.set(key,job);
 try{return (await job).clone();}finally{if(studyImagePending.get(key)===job)studyImagePending.delete(key);}
}
self.addEventListener('fetch',event=>{const r=event.request;if(r.method==='GET'&&r.destination==='image'&&studyImageAllowed(new URL(r.url)))event.respondWith(studyPublicImage(r,event));});
