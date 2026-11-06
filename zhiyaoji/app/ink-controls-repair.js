/* Keep the existing exclusion buttons attached and align them with their rows.
   DOM rectangles share the overlay's coordinate space. A separate visualViewport
   height can lag Safari's actual pane and must not hide otherwise visible rows. */
(function(S){
 'use strict';
 const p=S?.ReadingControls?.prototype;if(!p)return;
 const sync=p.sync,restore=p.restore;
 function restoreHeaderActions(controls){
  for(const node of controls._pinnedHeaders?.keys()||[]){node.removeAttribute('data-immersive-pinned');node.style.removeProperty('--immersive-action-offset');}
  controls._pinnedHeaders=null;controls._headerGroups=null;
 }
 p.restore=function(...args){restoreHeaderActions(this);for(const x of this.items)if(!x.parent.isConnected)x.node.remove();this._observedAnchors=null;this._positionGroups=null;this._positionItems=null;return restore.apply(this,args);};
 function positionHeaderActions(controls,bar){
  const e=controls.exam;
  if(!e.immersive||!e.inkOn||e.disposed||e.materialBusy){restoreHeaderActions(controls);return;}
  let groups=controls._positionGroups;
  if(!groups?.length){
   if(!controls._headerGroups){
    const scope=e.split?S.$('.split-shell',e.root):S.$('#question-scroll',e.root);
    const scrolls=scope?.matches('.exam-scroll,.split-scroll')?[scope]:S.$$('.exam-scroll,.split-scroll',scope||e.root);
    controls._headerGroups=scrolls.map(scroll=>({scroll,cards:S.$$('[data-question]',scroll)}));
   }
   groups=controls._headerGroups;
  }
  const previous=controls._pinnedHeaders||new Map(),plans=new Map();
  const owner=Number.isInteger(e.noteOwnerIndex)?e.noteOwnerIndex:e.toolIndex;
  for(const {scroll,cards}of groups){
   const pane=scroll.getBoundingClientRect(),floor=Math.max(pane.top,bar?.bottom||0)+8;
   // Only the active draft's original controls can be lifted below the toolbar.
   const card=cards.find(card=>Number(card.dataset.question)===owner);
   if(!card||pane.width<=0)continue;
   const bounds=card.getBoundingClientRect(),node=S.$('.qactions',card);if(!node)continue;
   const a=node.getBoundingClientRect(),scale=node.offsetHeight?a.height/node.offsetHeight:1;
   if(!scale||a.height<=0||bounds.bottom<=floor||bounds.top>=pane.bottom)continue;
   const natural=a.top-(previous.get(node)||0)*scale;
   const top=Math.min(floor,Math.min(bounds.bottom,pane.bottom)-a.height-8);
   if(natural<floor&&top>=Math.max(bounds.top,pane.top,bar?.bottom||0))plans.set(node,(top-natural)/scale);
  }
  for(const node of previous.keys())if(!plans.has(node)){node.removeAttribute('data-immersive-pinned');node.style.removeProperty('--immersive-action-offset');}
  for(const [node,offset]of plans){node.setAttribute('data-immersive-pinned','');if(previous.get(node)!==offset)node.style.setProperty('--immersive-action-offset',offset+'px');}
  controls._pinnedHeaders=plans;
 }

 p.sync=function(...args){
  const e=this.exam,scope=e.split?S.$('.split-shell',e.root):S.$('#question-scroll',e.root);
  if(scope&&this.scope===scope&&this.items.length){
   const known=new Set(this.items.map(x=>x.node));
   const stale=this.items.some(x=>!x.node.isConnected||!x.anchor.isConnected||!x.host.isConnected||x.node.parentNode!==x.host||!scope.contains(x.anchor)||(x.scroll.closest('.ink-pane-view')||e.root)!==x.host);
   if(stale||S.$$('[data-exam="exclude"]',scope).some(b=>!known.has(b)))this.scope=null;
  }
  const result=sync.apply(this,args);
  this._observedAnchors=this._observedAnchors||new Set();
  for(const x of this.items)for(const anchor of [x.anchor,x.anchor.closest('[data-question]')].filter(Boolean))if(!this._observedAnchors.has(anchor)){this.resizeObserver?.observe(anchor);this._observedAnchors.add(anchor);}
  return result;
 };
 p.position=function(){
  const e=this.exam,toolbar=S.$('.reading-note-toolbar',e.root),bar=toolbar&&!toolbar.hidden?toolbar.getBoundingClientRect():null;
  if(e.inkOn&&this.items.some(x=>x.node.isConnected===false||x.anchor.isConnected===false||x.host.isConnected===false)){this.scope=null;this.sync();return;}
  const panes=new Map(),hosts=new Map();
  // Reuse the bindings; only visible cards need per-option DOM rectangles.
  // Rebuild on the same lifecycle boundary that replaces this.items.
  if(this._positionItems!==this.items){
   this._positionItems=this.items;const groups=new Map();
   for(const x of this.items){
    let group=groups.get(x.scroll);if(!group){group={scroll:x.scroll,cards:[],byCard:new Map(),loose:[]};groups.set(x.scroll,group);}
    const card=x.anchor.closest?.('[data-question]');
    if(!card){group.loose.push(x);continue;}
    if(!group.byCard.has(card)){group.byCard.set(card,[]);group.cards.push(card);}group.byCard.get(card).push(x);
   }
   this._positionGroups=[...groups.values()];
  }
  const candidates=new Set();
  for(const group of this._positionGroups||[]){
   const pane=group.scroll.getBoundingClientRect();panes.set(group.scroll,pane);
   const floor=Math.max(pane.top,bar?.bottom||0),bottom=pane.bottom,cards=group.cards;
   const first=S.firstReadingCardIndex?S.firstReadingCardIndex(cards,floor):0;
   for(let i=first;i<cards.length;i++){const r=cards[i].getBoundingClientRect();if(r.top>=bottom)break;if(r.bottom>floor)for(const x of group.byCard.get(cards[i]))candidates.add(x);}
   for(const x of group.loose)candidates.add(x);
  }
  const layouts=this.items.map(x=>{
   if(!candidates.has(x))return {x,display:'none'};
   const a=x.anchor.getBoundingClientRect();
   if(!panes.has(x.scroll))panes.set(x.scroll,x.scroll.getBoundingClientRect());
   if(!hosts.has(x.host))hosts.set(x.host,x.host.getBoundingClientRect());
   const pane=panes.get(x.scroll),host=hosts.get(x.host);
   const roughFloor=Math.max(pane.top,host.top,bar?.bottom||0),roughBottom=Math.min(pane.bottom,host.bottom);
   if(!x.anchor.isConnected||!x.host.isConnected||e.materialBusy||pane.width<=0||a.bottom<=roughFloor||a.top>=roughBottom)return {x,display:'none'};
   const button=x.node.getBoundingClientRect();
   const sx=x.host.offsetWidth?host.width/x.host.offsetWidth:1,sy=x.host.offsetHeight?host.height/x.host.offsetHeight:1;
   if(button.width>0&&button.height>0)x._controlSize={width:button.width/(sx||1),height:button.height/(sy||1)};
   const w=button.width||(x._controlSize?.width||44)*(sx||1),h=button.height||(x._controlSize?.height||44)*(sy||1);
   const floor=roughFloor+4,ceiling=roughBottom-h-4,leftEdge=Math.max(pane.left,host.left),rightEdge=Math.min(pane.right,host.right);
   const natural=a.top+(a.height-h)/2,low=Math.max(floor,a.top),high=Math.min(ceiling,a.bottom-h);
   const top=high>=low?Math.max(low,Math.min(natural,high)):Math.max(floor,Math.min(natural,ceiling));
   const visible=x.anchor.isConnected&&x.host.isConnected&&!e.materialBusy&&pane.width>0&&rightEdge-leftEdge>=w&&ceiling>=floor&&a.bottom>floor&&a.top<roughBottom;
   const left=Math.max(leftEdge,Math.min(a.right-w-x.rightInset,rightEdge-w));
   return {x,display:visible?'flex':'none',left:((left-host.left)/(sx||1)-(x.host.clientLeft||0)+(x.host.scrollLeft||0))+'px',top:((top-host.top)/(sy||1)-(x.host.clientTop||0)+(x.host.scrollTop||0))+'px'};
  });
  positionHeaderActions(this,bar);
  for(const {x,display,left,top}of layouts){if(x.node.style.display!==display)x.node.style.display=display;if(left!==undefined&&x.node.style.left!==left)x.node.style.left=left;if(top!==undefined&&x.node.style.top!==top)x.node.style.top=top;}
 };
})(window.Study);
