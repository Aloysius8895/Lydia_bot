// Drag a material (project or news) into a drop target such as the analysis tray.
//
// Touch: a long press lifts the item (a book card appears under the finger and follows it).
//   Moving before the press completes is left to the page (pan / scroll), so browsing still works.
//   We never let the browser start its own drag on touch; iOS renders that as a white
//   rounded square that drifts away from the finger and cannot reach React drop zones.
// Mouse: native HTML5 drag stays, but the drag image is the same book card instead of a
//   snapshot of the transparent hit area.

export const LONG_PRESS=320;
const SLOP=8;
const targets=new Set();
let active=null;

/** Register an element as a drop zone. handlers: {accepts?(item), over?(bool), drop(item)}. Returns an unregister function. */
export function dropTarget(el,handlers){const t={el,handlers};targets.add(t);return()=>targets.delete(t);}
export const touchDragging=()=>!!active;

const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function makeGhost(item,color){
 const g=document.createElement('div');g.className='lydia-drag-ghost';g.setAttribute('aria-hidden','true');
 g.style.setProperty('--book',color||'#9aa1aa');
 g.innerHTML=`<i></i><span><strong>${esc(item.title)}</strong><small>${item.kind==='news'?'新闻':'项目'} · ${esc(item.source_id||'')}</small></span><b>＋</b>`;
 (document.querySelector('.knowledge-workspace')||document.body).appendChild(g);
 return g;
}
const place=(g,x,y)=>{g.style.transform=`translate3d(${(x-28).toFixed(1)}px,${(y-74).toFixed(1)}px,0)`;};

/** Mouse/pen: replace the browser's drag snapshot with the book card. */
export function setDragGhost(event,item,color){
 if(!event.dataTransfer?.setDragImage)return;
 const g=makeGhost(item,color);g.classList.add('is-native');
 event.dataTransfer.setDragImage(g,28,24);
 setTimeout(()=>g.remove(),0);
}

function findTarget(x,y,item){
 const el=document.elementFromPoint(x,y);if(!el)return null;
 for(const t of targets)if(t.el.isConnected&&t.el.contains(el)&&(!t.handlers.accepts||t.handlers.accepts(item)))return t;
 return null;
}

/**
 * Call from a touch pointerdown on a draggable material.
 * opts: {color, source (element to dim while lifted), onLift(), onEnd(dropped)}.
 * Returns a cancel function (call it when the page starts panning instead).
 */
export function pressToDrag(e,item,opts={}){
 if(e.pointerType!=='touch'||active)return ()=>{};
 const id=e.pointerId,start={x:e.clientX,y:e.clientY},src=opts.source||e.currentTarget;
 let state='pending',ghost=null,over=null,last=start,edge=0,raf=0;const scroller=src?.closest?.('.knowledge-workspace');
 const nativeDraggable=src?.draggable;if(src)src.draggable=false;   // no native iOS/Android drag preview
 const blockTouch=ev=>{if(state==='lifted')ev.preventDefault();};
 const blockMenu=ev=>ev.preventDefault();
 const timer=setTimeout(lift,LONG_PRESS);
 window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',cancel,true);
 document.addEventListener('touchmove',blockTouch,{passive:false});document.addEventListener('contextmenu',blockMenu,true);

 function lift(){
  if(state!=='pending')return;state='lifted';active={item};
  ghost=makeGhost(item,opts.color);place(ghost,last.x,last.y);
  requestAnimationFrame(()=>ghost?.classList.add('is-up'));
  src?.classList.add('is-lifted');document.documentElement.classList.add('lydia-touch-dragging');
  try{navigator.vibrate?.(12);}catch{}
  opts.onLift?.();
  setOver(findTarget(last.x,last.y,item));
 }
 function setOver(t){if(t===over)return;over?.handlers.over?.(false);over=t;over?.handlers.over?.(true);ghost?.classList.toggle('is-over',!!t);}
 function move(ev){
  if(ev.pointerId!==id)return;last={x:ev.clientX,y:ev.clientY};
  if(state==='pending'){if(Math.hypot(last.x-start.x,last.y-start.y)>SLOP)finish(false,true);return;}
  if(state!=='lifted')return;ev.preventDefault();ev.stopPropagation();
  place(ghost,last.x,last.y);setOver(findTarget(last.x,last.y,item));
  // Near the top/bottom edge, scroll the page (phone layout) so an off-screen tray can be reached.
  const h=innerHeight;edge=last.y>h-72?Math.min(16,(last.y-(h-72))/4):last.y<72?-Math.min(16,(72-last.y)/4):0;
  if(edge&&!raf&&scroller&&scroller.scrollHeight>scroller.clientHeight+4)raf=requestAnimationFrame(scroll);
 }
 function scroll(){if(state!=='lifted'||!edge){raf=0;return;}scroller.scrollTop+=edge;setOver(findTarget(last.x,last.y,item));raf=requestAnimationFrame(scroll);}
 function up(ev){
  if(ev.pointerId!==id)return;
  if(state==='lifted'){ev.preventDefault();ev.stopPropagation();const t=findTarget(ev.clientX,ev.clientY,item);setOver(null);finish(!!t);if(t)t.handlers.drop(item);return;}
  finish(false,true);
 }
 function cancel(ev){if(ev.pointerId===id)finish(false,state!=='lifted');}
 function finish(dropped,quiet=false){
  if(state==='done')return;const wasLifted=state==='lifted';state='done';clearTimeout(timer);cancelAnimationFrame(raf);
  window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel,true);
  document.removeEventListener('touchmove',blockTouch);
  // Keep swallowing the long-press context menu a moment longer; some browsers fire it on release.
  setTimeout(()=>document.removeEventListener('contextmenu',blockMenu,true),400);
  if(src){src.draggable=nativeDraggable;src.classList.remove('is-lifted');}
  document.documentElement.classList.remove('lydia-touch-dragging');
  active=null;setOver(null);
  if(ghost){
   const g=ghost;ghost=null;
   if(dropped){g.classList.add('is-dropped');}
   else{const r=src?.getBoundingClientRect?.();if(r&&r.width)place(g,r.left+r.width/2,r.top+r.height/2+46);g.classList.add('is-returning');}
   g.addEventListener('transitionend',()=>g.remove(),{once:true});setTimeout(()=>g.remove(),420);
  }
  if(wasLifted||!quiet)opts.onEnd?.(dropped);
 }
 return ()=>{if(state==='pending')finish(false,true);};
}
