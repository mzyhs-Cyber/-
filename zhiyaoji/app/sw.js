/* Shell cache only; bank resources, credentials and APIs are never cached here. */
'use strict';
const CACHE='jiangsu-study-shell-v2-9-18-r7';
const FILES=['./','./index.html','./styles.css','./home.css','./report.css','./reading.css','./icon-180.png','./icon-192.png','./icon-512.png','./bundle.js','./performance-diagnostics.js','./storage-check.js','./bank-config.js','./icon.svg','./manifest.webmanifest'];
function cleanShellResponse(response){
 if(!response?.redirected)return response;
 // Shell documents are same-origin; never convert opaque/external redirects.
 if(!response.ok||response.type==='opaqueredirect'||!response.url||new URL(response.url).origin!==self.location.origin)throw Error('Unsupported shell redirect');
 const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('jiangsu-study-shell-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,u=new URL(req.url);
 if(req.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||!FILES.some(f=>new URL(f,self.registration.scope).pathname===u.pathname))return;
 let backgroundDone;event.waitUntil(new Promise(resolve=>backgroundDone=resolve));
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=(!u.searchParams.get('v')||u.searchParams.get('v')==='2.9.18-r7')?cleanShellResponse(await cache.match(req,{ignoreSearch:true})):null;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);
  const network=fetch(req,{signal:abort.signal,redirect:'follow'}).then(async original=>{const response=cleanShellResponse(original);if(original.redirected&&self.clients.matchAll)event.waitUntil(self.clients.matchAll().then(cs=>cs.forEach(c=>c.postMessage({type:'shell-redirect-normalized'}))));if(response.ok)await cache.put(req,response.clone());return response;}).finally(()=>clearTimeout(timer));
  network.then(backgroundDone,backgroundDone);
  if(cached&&req.mode!=='navigate')return cached;
  if(cached){let timeout;try{return await Promise.race([network,new Promise(resolve=>timeout=setTimeout(()=>resolve(cached),2500))]);}catch{return cached;}finally{clearTimeout(timeout);}}
  try{return await network;}catch{if(req.mode==='navigate')return cleanShellResponse(await cache.match(new URL('./index.html',self.registration.scope).href,{ignoreSearch:true}))||Response.error();return Response.error();}
 })().catch(()=>{backgroundDone();return Response.error();}));
});
