import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import slate from '../assets/knowledge/binders-slate.png';
import ivory from '../assets/knowledge/binders-ivory.png';
import sand from '../assets/knowledge/binders-sand.png';
import Warehouse from '../knowledge-warehouse.js';
import {setDragGhost} from '../material-drag.js';

export const binderImages=[slate,ivory,sand];
export function dragProject(event,project){
 event.dataTransfer.setData('application/x-lydia-project',project.id);
 event.dataTransfer.setData('application/x-lydia-material',JSON.stringify({id:project.id,kind:project.kind||'hackathon'}));
 event.dataTransfer.setData('text/plain',project.id);event.dataTransfer.effectAllowed='copy';
}

/* The warehouse engine owns the SVG, labels and camera; React only feeds it data. */
const KnowledgeScene=forwardRef(function KnowledgeScene({projects,selected,onSelect,onAdd,materialType='hackathon',tray=[],view='iso',onFocusChange,onColors,searches=[],onRemoveSearch},ref){
 const host=useRef(null),viewport=useRef(null),cam=useRef(null),world=useRef(null),flight=useRef(null),labels=useRef(null),ctrls=useRef(null),hits=useRef(null),zoom=useRef(null),engine=useRef(null);
 const handlers=useRef({});handlers.current={onSelect,onAdd,onFocusChange,onColors,onRemoveSearch};
 const [touch,setTouch]=useState(false);
 useLayoutEffect(()=>{
  const w=new Warehouse({viewport:viewport.current,cam:cam.current,world:world.current,flight:flight.current,labels:labels.current,ctrls:ctrls.current,hits:hits.current,zoomLabel:zoom.current},{
   onSelect:id=>handlers.current.onSelect?.(id),onAdd:p=>handlers.current.onAdd?.(p),onFocus:z=>handlers.current.onFocusChange?.(z),
   onRemoveSearch:id=>handlers.current.onRemoveSearch?.(id),
   onColors:m=>handlers.current.onColors?.(m),onDragStart:(e,p,color)=>{dragProject(e,p);setDragGhost(e,p,color);}
  });
  engine.current=w;
  const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.width&&r.height)w.resize(r.width,r.height);});
  observer.observe(host.current);setTouch(matchMedia('(pointer:coarse)').matches);
  return()=>{observer.disconnect();w.destroy();engine.current=null;};
 },[]);
 useEffect(()=>{engine.current?.setData(projects.map(p=>({...p,kind:p.kind||materialType})),materialType);},[projects,materialType]);
 useEffect(()=>{engine.current?.setSelected(selected||null);},[selected,projects]);
 useEffect(()=>{engine.current?.setTray(tray);},[tray.join(','),projects]);
 useEffect(()=>{engine.current?.setView(view);},[view]);
 // Matches are passed in full (items) so books from other pages can fly in from above.
 useEffect(()=>{engine.current?.setSearches(searches.map(s=>({...s,items:(s.items||[]).map(p=>({...p,kind:p.kind||materialType}))})));},[searches.map(s=>s.id+s.status+(s.ids||[]).join(',')).join(';')]);
 useImperativeHandle(ref,()=>({overview:()=>engine.current?.overview(),focus:id=>engine.current?.focus(id)}),[]);
 const news=materialType==='news';
 return <div className="knowledge-scene" ref={host} aria-label={news?'新闻空间资料库':'Hackathon 空间项目库'}>
  <div className="knowledge-scene__viewport" ref={viewport}>
   <div className="knowledge-scene__world" ref={cam}><svg className="knowledge-scene__svg" width="1" height="1" aria-hidden="true"><g ref={world}/><g ref={flight} className="ks-flight"/></svg></div>
   <div className="ks-hits" ref={hits}/>
  </div>
  <div className="ks-labels" ref={labels} aria-hidden="true"/>
  <div className="ks-zone-ctrls" ref={ctrls}/>
  {!!projects.length&&<div className="knowledge-scene__legend" aria-label="图例"><span><i className="ks-sw-multi"/>每个标题一种颜色</span><span><i className="ks-sw-sel"/>已选中</span><span><i className="ks-sw-empty"/>空位</span><span><i className="ks-sw-tray">1</i>在托盘</span><span className="ks-legend-hint">{touch?'单指移动 · 双指缩放 · 轻点区域聚焦':'拖动移动 · 滚轮缩放 · 点区域聚焦'}</span></div>}
  {!projects.length&&<div className="knowledge-scene__empty"><span className="knowledge-empty-mark">◇</span><h2>{news?'新闻库，等待新的线索':'项目书库，等待你的第一批案例'}</h2><p>{news?'添加公开链接、粘贴新闻正文，或从现有研究资料选择新闻。':'从 Crawl 收集 Hackathon 项目后，它们会出现在这里。'}<br/>清除筛选可以查看其他资料。</p></div>}
  <button type="button" className="ks-overview" onClick={()=>engine.current?.overview()}><span aria-hidden="true">⛶</span>查看整个书库</button>
  <div className="knowledge-camera"><button type="button" aria-label="缩小空间" onClick={()=>engine.current?.zoomBy(1/1.3)}>−</button><span ref={zoom} aria-label="空间缩放比例">100%</span><button type="button" aria-label="放大空间" onClick={()=>engine.current?.zoomBy(1.3)}>+</button></div>
 </div>;
});
export default KnowledgeScene;

export function IdeaShelf({ideas,onSelect,onDrop,selected}){
 const [over,setOver]=useState(false);
 return <div className={'knowledge-shelf'+(over?' is-over':'')} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-lydia-idea')){e.preventDefault();setOver(true);}}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);onDrop(e.dataTransfer.getData('application/x-lydia-idea'));}}>
  <div className="knowledge-shelf__model" aria-hidden="true"><div/><div/><i/><i/>{ideas.slice(0,6).map((p,i)=><img key={p.id} src={binderImages[i%3]} alt="" style={{left:20+(i%3)*54,top:i<3?-2:62}}/>)}</div>
  <p>{over?'松开，保存这个 idea':'将候选 idea 拖到这里收藏'}</p>
  <div className="knowledge-shelf__list">{ideas.map(i=><button key={i.id} type="button" aria-pressed={selected===i.id} onClick={()=>onSelect(i)}><span>▱</span><strong>{i.title}</strong><small>{i.status==='shortlist'?'优先研究':i.status==='archived'?'已归档':'待探索'}</small></button>)}</div>
  {!ideas.length&&<p className="knowledge-muted">你留下的想法，会在这里慢慢积累。</p>}
 </div>;
}
