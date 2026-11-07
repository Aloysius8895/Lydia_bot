import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import slate from '../assets/knowledge/binders-slate.png';
import ivory from '../assets/knowledge/binders-ivory.png';
import sand from '../assets/knowledge/binders-sand.png';

export const binderImages=[slate,ivory,sand];
export function dragProject(event,project){
 event.dataTransfer.setData('application/x-lydia-project',project.id);
 event.dataTransfer.setData('application/x-lydia-material',JSON.stringify({id:project.id,kind:project.kind||'hackathon'}));
 event.dataTransfer.setData('text/plain',project.id);event.dataTransfer.effectAllowed='copy';
}
const iso=(x,y,z=0)=>[520+(x-y)*.82,92+(x+y)*.43-z];
const points=(coords)=>coords.map(p=>iso(...p).join(',')).join(' ');
function Slab({x,y,w,d,z=0,kind='floor'}){
 return <g className={'ks-'+kind}>
  <polygon className="ks-edge" points={points([[x,y,z],[x+w,y,z],[x+w,y,z-8],[x+w,y+d,z-8],[x,y+d,z-8]])}/>
  <polygon className="ks-top" points={points([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]])}/>
 </g>;
}
export default function KnowledgeScene({projects,selected,onSelect,onAdd,materialType='hackathon'}){
 const host=useRef(null),[size,setSize]=useState({width:800,height:650}),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const gesture=useRef(null),pointers=useRef(new Map()),camera=useRef({zoom:1,pan:{x:0,y:0}}),suppressClick=useRef(false);
 function updateCamera(next){camera.current=next;setZoom(next.zoom);setPan(next.pan);}
 useLayoutEffect(()=>{const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize({width:r.width,height:r.height});});observer.observe(host.current);return()=>observer.disconnect();},[]);
 const shelves=useMemo(()=>{
  const groups=new Map();for(const p of projects){const key=p.source_id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
  const rows=[];for(const [source,items] of groups){for(let i=0;i<items.length;i+=6)rows.push({source,items:items.slice(i,i+6),first:i===0});}
  return rows;
 },[projects]);
 const sceneHeight=Math.max(640,220+shelves.length*78),fit=Math.min(size.width/1060,size.height/sceneHeight),scale=fit*zoom;
 const transform=`translate(${(size.width-1060*scale)/2+pan.x}px,${(size.height-sceneHeight*scale)/2+pan.y}px) scale(${scale})`;
 const clamp=value=>Math.max(.5,Math.min(4,value));
 function position(e){const r=host.current.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 function beginPinch(){
  const [a,b]=[...pointers.current.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},c=camera.current,s=fit*c.zoom;
  gesture.current={kind:'pinch',distance:Math.max(8,Math.hypot(a.x-b.x,a.y-b.y)),zoom:c.zoom,
   anchor:{x:(mid.x-(size.width-1060*s)/2-c.pan.x)/s,y:(mid.y-(size.height-sceneHeight*s)/2-c.pan.y)/s}};
  suppressClick.current=true;
 }
 function start(e){
  if(e.button!==0)return;
  if(e.pointerType!=='touch'&&e.target.closest('button')){suppressClick.current=false;return;}
  if(!pointers.current.size)suppressClick.current=false;
  const p=position(e);pointers.current.set(e.pointerId,p);
  if(pointers.current.size===1)gesture.current={kind:'pan',start:p,pan:{...camera.current.pan}};
  else beginPinch();
  if(!e.target.closest('button')||pointers.current.size>1)for(const id of pointers.current.keys())e.currentTarget.setPointerCapture(id);
 }
 function move(e){
  if(!pointers.current.has(e.pointerId))return;
  const p=position(e);pointers.current.set(e.pointerId,p);const g=gesture.current;if(!g)return;
  if(g.kind==='pinch'&&pointers.current.size>=2){
   const [a,b]=[...pointers.current.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
   const nextZoom=clamp(g.zoom*Math.hypot(a.x-b.x,a.y-b.y)/g.distance),s=fit*nextZoom;
   updateCamera({zoom:nextZoom,pan:{x:mid.x-g.anchor.x*s-(size.width-1060*s)/2,y:mid.y-g.anchor.y*s-(size.height-sceneHeight*s)/2}});
   e.preventDefault();
  }else if(g.kind==='pan'){
   const dx=p.x-g.start.x,dy=p.y-g.start.y;
   if(Math.hypot(dx,dy)>6)suppressClick.current=true;
   if(suppressClick.current){updateCamera({zoom:camera.current.zoom,pan:{x:g.pan.x+dx,y:g.pan.y+dy}});e.preventDefault();}
  }
 }
 function end(e){
  if(!pointers.current.delete(e.pointerId))return;
  if(pointers.current.size>=2)beginPinch();
  else if(pointers.current.size===1)gesture.current={kind:'pan',start:[...pointers.current.values()][0],pan:{...camera.current.pan}};
  else gesture.current=null;
 }
 function preventGestureClick(e){if(suppressClick.current&&e.detail!==0){e.preventDefault();e.stopPropagation();}}
 const depth=Math.max(540,shelves.length*98+70);
 return <div className="knowledge-scene" ref={host} aria-label="Hackathon 空间项目库">
  <div className="knowledge-scene__viewport" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))end(e);}} onClickCapture={preventGestureClick} onDoubleClickCapture={preventGestureClick} onDragStartCapture={e=>{if(pointers.current.size)e.preventDefault();}}>
   <div className="knowledge-scene__world" style={{width:1060,height:sceneHeight,transform}}>
    <svg className="knowledge-scene__floor" viewBox={`0 0 1060 ${sceneHeight}`} aria-hidden="true">
     <Slab x={-28} y={-24} w={620} d={depth} z={-8}/>
     <g className="ks-grid">{Array.from({length:16},(_,i)=><line key={'x'+i} x1={iso(i*40,0,-7)[0]} y1={iso(i*40,0,-7)[1]} x2={iso(i*40,depth,-7)[0]} y2={iso(i*40,depth,-7)[1]}/>)}{Array.from({length:Math.ceil(depth/40)},(_,i)=><line key={'y'+i} x1={iso(0,i*40,-7)[0]} y1={iso(0,i*40,-7)[1]} x2={iso(590,i*40,-7)[0]} y2={iso(590,i*40,-7)[1]}/>)}</g>
     {shelves.map((s,r)=><g key={r}>
      <Slab x={0} y={r*98} w={560} d={73} z={10} kind="rack"/>
      {[0,560].map(x=><g key={x} className="ks-upright"><line x1={iso(x,r*98,10)[0]} y1={iso(x,r*98,10)[1]} x2={iso(x,r*98,76)[0]} y2={iso(x,r*98,76)[1]}/><line x1={iso(x,r*98+73,10)[0]} y1={iso(x,r*98+73,10)[1]} x2={iso(x,r*98+73,76)[0]} y2={iso(x,r*98+73,76)[1]}/><line x1={iso(x,r*98,76)[0]} y1={iso(x,r*98,76)[1]} x2={iso(x,r*98+73,76)[0]} y2={iso(x,r*98+73,76)[1]}/></g>)}
     </g>)}
    </svg>
    {shelves.map((s,r)=><div key={'row'+r}>
     {s.first&&<span className="knowledge-zone" style={{left:iso(-70,r*98+30)[0]-80,top:iso(-70,r*98+30)[1]+5}}>{s.source}</span>}
     {s.items.map((p,col)=>{const [x,y]=iso(35+col*86,r*98+39,9);const color=[...p.source_id].reduce((n,c)=>n+c.charCodeAt(0),0)%3;return <button type="button" className={'knowledge-object'+(selected===p.id?' is-selected':'')} key={p.id} style={{left:x-48,top:y-94}} draggable onDragStart={e=>dragProject(e,p)} onClick={()=>onSelect(p.id)} onDoubleClick={()=>onAdd(p)} aria-label={'查看项目 '+p.title} aria-pressed={selected===p.id} title={p.title+' · 双击加入分析'}>
      <span className="knowledge-object__base"/><img src={binderImages[p.kind==='news'?1:color]} alt="" draggable={false}/><span className="knowledge-object__label">{p.kind==='news'?'新闻 · ':''}{p.title}</span>
      </button>;})}
    </div>)}
   </div>
  </div>
  {!projects.length&&<div className="knowledge-scene__empty"><span className="knowledge-empty-mark">◇</span><h2>{materialType==='news'?'新闻库，等待新的线索':'项目书库，等待你的第一批案例'}</h2><p>{materialType==='news'?'添加公开链接、粘贴新闻正文，或从现有研究资料选择新闻。':'从 Crawl 收集 Hackathon 项目后，它们会出现在这里。'}<br/>清除筛选可以查看其他资料。</p></div>}
  <div className="knowledge-scene__legend"><i/>{materialType==='news'?'新闻资料':'比赛项目'}<span className="kw-mouse-hint">点击查看 · 拖入分析</span><span className="kw-touch-hint">单指移动 · 双指缩放</span></div>
  <div className="knowledge-camera"><button type="button" aria-label="缩小空间" onClick={()=>updateCamera({...camera.current,zoom:clamp(camera.current.zoom-.15)})}>−</button><span aria-label="空间缩放比例">{Math.round(zoom*100)}%</span><button type="button" aria-label="放大空间" onClick={()=>updateCamera({...camera.current,zoom:clamp(camera.current.zoom+.15)})}>+</button><button type="button" onClick={()=>{pointers.current.clear();gesture.current=null;updateCamera({zoom:1,pan:{x:0,y:0}});}}>总览</button></div>
 </div>;
}

export function IdeaShelf({ideas,onSelect,onDrop,selected}){
 const [over,setOver]=useState(false);
 return <div className={'knowledge-shelf'+(over?' is-over':'')} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-lydia-idea')){e.preventDefault();setOver(true);}}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);onDrop(e.dataTransfer.getData('application/x-lydia-idea'));}}>
  <div className="knowledge-shelf__model" aria-hidden="true"><div/><div/><i/><i/>{ideas.slice(0,6).map((p,i)=><img key={p.id} src={binderImages[i%3]} alt="" style={{left:20+(i%3)*54,top:i<3?-2:62}}/>)}</div>
  <p>{over?'松开，保存这个 idea':'将候选 idea 拖到这里收藏'}</p>
  <div className="knowledge-shelf__list">{ideas.map(i=><button key={i.id} type="button" aria-pressed={selected===i.id} onClick={()=>onSelect(i)}><span>▱</span><strong>{i.title}</strong><small>{i.status==='shortlist'?'优先研究':i.status==='archived'?'已归档':'待探索'}</small></button>)}</div>
  {!ideas.length&&<p className="knowledge-muted">你留下的想法，会在这里慢慢积累。</p>}
 </div>;
}
