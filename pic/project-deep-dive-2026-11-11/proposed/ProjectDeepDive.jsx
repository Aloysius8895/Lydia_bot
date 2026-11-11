import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import Icon from './Icon.jsx';

// "深入了解" reading panel: covers the book area while open. Every point shows which source it
// came from and the exact source line, already checked by the server.
const SECTIONS=[['problem','解决什么问题，给谁用'],['usage','用户怎么用'],['architecture','系统由哪些部分组成'],['details','关键实现细节'],['evidence','做到了哪一步']];
const KIND={page:'项目页',readme:'README',repo:'仓库信息',tree:'文件目录',manifest:'配置文件'};
const safe=url=>/^https?:\/\//.test(url||'')?url:undefined;
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};
const short=s=>s.label.replace(/^[^·]*·\s*/,'');

function Point({p,source,all}){
 const [open,setOpen]=useState(false);const shown=open||all;
 return <li className={'kw-deep__point'+(shown?' is-open':'')}>
  <p>{p.text}<button type="button" className="kw-deep__cite" aria-expanded={shown} onClick={()=>setOpen(v=>!v)} title="查看原文">[{p.source}] {KIND[source?.kind]||'资料'}</button></p>
  {shown&&<blockquote className="kw-deep__quote"><span>{p.quote}</span><cite>{source?<a href={safe(source.url)} target="_blank" rel="noreferrer">{source.label} ↗</a>:'来源'}</cite></blockquote>}
 </li>;
}

function Progress({data,onClose}){
 const steps=data.steps||[];
 return <div className="kw-deep__progress" role="status">
  <ol>{steps.map((s,i)=>{const done=i<steps.length-1;return <li key={i} className={done?'is-done':'is-now'}><i/>{done?s.replace(/^正在/,'已'):s}</li>;})}<li className="is-next"><i/>逐条核对原文</li></ol>
  <p>通常 20–40 秒。可以先关掉，完成后再点「深入了解」查看。</p>
  <button type="button" className="kw-deep__btn" onClick={onClose}>先关掉</button>
 </div>;
}

export default function ProjectDeepDive({project,onClose}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[all,setAll]=useState(false),timer=useRef(0);
 async function load(start=false){
  try{const d=await api(`/api/knowledge/projects/${encodeURIComponent(project.id)}/deep-dive`,start?'POST':'GET',start?{}:undefined);setData(d);setError('');return d;}
  catch(e){setError(e.message||'读取失败');return null;}
 }
 useEffect(()=>{let alive=true;
  (async()=>{let d=await load();if(alive&&d?.status==='none')d=await load(true);})();
  return ()=>{alive=false;clearTimeout(timer.current);};
 },[project.id]);
 useEffect(()=>{clearTimeout(timer.current);if(['queued','running'].includes(data?.status))timer.current=setTimeout(()=>void load(),2000);},[data]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[onClose]);

 const r=data?.result,check=r?.check,sources=r?.sources||[];
 const pending=!data||['none','queued','running'].includes(data.status);
 const took=r?.took_ms?Math.round(r.took_ms/1000):0,date=r?.generated_at?new Date(r.generated_at).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'';
 return <section className="kw-deep" aria-label={`深入解读：${project.title}`}>
  <header className="kw-deep__head">
   <div><small>深入解读 · AI 整理</small><h2>{project.title}</h2></div>
   <div className="kw-deep__tools">
    {data?.status==='ready'&&<button type="button" className="kw-deep__btn" onClick={()=>void load(true)} title="重新读取资料并解读">↻ 重新解读</button>}
    <button type="button" className="kw-deep__btn kw-deep__close" aria-label="关闭深入解读" onClick={onClose}><Icon name="close" size={18}/></button>
   </div>
  </header>
  {error&&<p className="kw-alert">{error}</p>}
  {pending?<Progress data={data||{steps:['正在准备']}} onClose={onClose}/>:
   data.status==='failed'?<div className="kw-deep__failed"><h3>这次没有解读成功</h3><p>{data.error?.message||'读取或生成失败。'}</p>
    {!!data.log?.length&&<ul className="kw-brief__sources">{data.log.map((s,i)=><li key={i} data-status={s.status}><span>{host(s.url)}</span><em>{s.reason||'已读取'}</em></li>)}</ul>}
    <button type="button" className="kw-primary" onClick={()=>void load(true)}>重试</button></div>:
   <div className="kw-deep__body">
    <p className="kw-deep__overview">{r.overview}</p>
    <div className="kw-deep__check">
     <span>✓ 每条都附原文，已逐条核对：{check.kept} 条找到原文{check.dropped?` · ${check.dropped} 条找不到原文，已删除`:''}</span>
     <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>展开全部原文</label>
    </div>
    {SECTIONS.map(([id,label])=>{const s=r.sections.find(x=>x.id===id);return s?<article key={id} className="kw-deep__sec"><h3>{label}</h3><ol>{s.points.map((p,i)=><Point key={i} p={p} source={sources[p.source-1]} all={all}/>)}</ol></article>:null;})}
    {!!r.unknowns?.length&&<article className="kw-deep__sec kw-deep__unknowns"><h3>资料里没说清楚的</h3><ul>{r.unknowns.map((u,i)=><li key={i}>{u}</li>)}</ul></article>}
    <article className="kw-deep__sec kw-deep__sources"><h3>读过的资料</h3>
     <ol>{sources.map(s=><li key={s.index}><b>[{s.index}]</b><a href={safe(s.url)} target="_blank" rel="noreferrer">{KIND[s.kind]} · {short(s)}</a><em>{s.kind==='tree'?'':s.chars.toLocaleString()+' 字符'}</em></li>)}
      {(r.log||[]).filter(l=>l.status!=='read').map((l,i)=><li key={'x'+i} className="is-skipped"><b>–</b><span>{host(l.url)}</span><em>{l.reason}</em></li>)}</ol>
    </article>
    <footer className="kw-deep__foot">{r.model==='claude-sonnet-5-5'?'Claude Sonnet 5.5':r.model} · {date} · 用时 {took} 秒 · 原文核对只证明这句话出自来源，不代表来源本身属实</footer>
   </div>}
 </section>;
}
