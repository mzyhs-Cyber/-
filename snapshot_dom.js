() => {
 const visible=e=>!!e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
 const materialNodes=scope=>[...scope.querySelectorAll('.materials-container .material-content,app-materials .material-content')]
   .filter(e=>!e.parentElement.closest('.material-content'));
 let roots=[...document.querySelectorAll('app-ti')].filter(visible);
 if(!roots.length) roots=[...document.querySelectorAll('.ti')].filter(visible);
 roots=roots.filter(e=>e.querySelector('app-question-choice,.ti-content,[data-role="stem"]'));
 const cards=[...document.querySelectorAll('.answer-card a[href^="#"],.answer-card [data-question-no],a[href^="#title-"]')]
   .filter(visible).map(e=>({target:(e.getAttribute('href')||'').slice(1),no:e.getAttribute('data-question-no')||e.innerText.trim()}));
 const rows=roots.map(e=>{
   const heading=e.closest('[id^="title-"]')||e.querySelector('[id^="title-"]');
   const card=cards.find(c=>c.target && c.target===heading?.id);
   let material=e.querySelector('.materials-container .material-content,app-materials .material-content');
   if(!material) {
     let parent=e.parentElement;
     for(let i=0;parent && parent!==document.body && i<5;i++,parent=parent.parentElement) {
       if(parent.matches('.resizable-container,.question-group,[data-material-group]')) {
         const ms=materialNodes(parent);
         if(ms.length===1) material=ms[0];
         break;
       }
     }
   }
   if(!material && roots.length===1) {
     const ms=materialNodes(document).filter(visible);
     if(ms.length===1) material=ms[0];
   }
   const subject=e.getAttribute('data-subject')||e.closest('[data-subject]')?.getAttribute('data-subject')||
     e.closest('app-tis')?.querySelector('.title-type-name,.chapter-name')?.innerText||'';
   const raw=e.getAttribute('data-question-no')||card?.no||'';
   return {html:e.outerHTML,order:/^\d+$/.test(raw.trim())?Number(raw):null,subject:subject.trim(),material:material?.outerHTML||''};
 });
 const counts=[];
 for(const e of [...document.querySelectorAll('[data-question-count],.question-count,.total-count,.paper-summary')].filter(visible)) {
   const n=e.getAttribute('data-question-count');
   if(n && /^\d+$/.test(n)) counts.push(Number(n));
   for(const m of e.innerText.matchAll(/(?:共|总计|总题数[：:\s]*)\s*(\d+)\s*题/g)) counts.push(Number(m[1]));
 }
 const titles=[...document.querySelectorAll('.paper-title,.exam-title,.solution-title-container .paper-name,h1')]
   .filter(visible).map(e=>e.innerText.trim()).filter(Boolean);
 const allMaterials=materialNodes(document).filter(visible);
 return {rows,counts:[...new Set(counts)],title:titles[0]||'',
   unresolvedMaterials:allMaterials.some(e=>!rows.some(r=>r.material===e.outerHTML))};
}
