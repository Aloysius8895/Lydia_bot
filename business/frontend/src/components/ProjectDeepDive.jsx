import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import Icon from './Icon.jsx';

// "深入了解" reading panel: covers the book area while open. Every point shows which source it
// came from and the exact source line. The server has checked that each line is really in the
// source, and Claude Haiku has checked that the line supports the point (partial support is marked).
const SECTIONS=[['problem','解决什么问题，给谁用'],['usage','用户怎么用'],['architecture','系统由哪些部分组成'],['details','关键实现细节'],['evidence','做到了哪一步']];
const KIND={page:'项目页',readme:'README',repo:'仓库信息',tree:'文件目录',manifest:'配置文件'};
const MODEL={'claude-sonnet-5-5':'Claude Sonnet 5.5','claude-haiku-5-5':'Haiku 5.5','claude-opus-5-5':'Claude Opus 5.5'};
const safe=url=>/^https?:\/\//.test(url||'')?url:undefined;
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};
const short=s=>s.label.replace(/^[^·]*·\s*/,'');

function Point({p,sources,all}){
 const [open,setOpen]=useState(false);const shown=open||all;
 const quotes=p.quotes||(p.quote?[{source:p.source,quote:p.quote}]:[]),cited=[...new Set(quotes.map(q=>q.source))];
 return <li className={'kw-deep__point'+(shown?' is-open':'')}>
  <p>{p.text}<button type="button" className="kw-deep__cite" aria-expanded={shown} onClick={()=>setOpen(v=>!v)} title="查看原文">{cited.map(i=>`[${i}] ${KIND[sources[i-1]?.kind]||'资料'}`).join(' ')}{quotes.length>1?` · ${quotes.length} 段原文`:''}</button>
   {p.support==='partial'&&<span className="kw-deep__partial" title={p.note||''}>原文只支持一部分{p.note?`：${p.note}`:''}</span>}</p>
  {shown&&quotes.map((q,i)=>{const s=sources[q.source-1];return <blockquote key={i} className="kw-deep__quote"><span>{q.quote}</span><cite>{s?<a href={safe(s.url)} target="_blank" rel="noreferrer">{s.label} ↗</a>:'来源'}</cite></blockquote>;})}
 </li>;
}

function Progress({data,onClose}){
 const steps=data.steps?.length?data.steps:[data.status==='queued'?'正在排队，等 Claude 空出来':'正在准备'];
 const checking=/核对/.test(steps[steps.length-1]);
 return <div className="kw-deep__progress" role="status">
  <ol>{steps.map((s,i)=>{const done=i<steps.length-1;return <li key={i} className={done?'is-done':'is-now'}><i/>{done?s.replace(/^正在/,'已'):s}</li>;})}{!checking&&<li className="is-next"><i/>逐条核对原文</li>}</ol>
  <p>通常 20–60 秒。可以先关掉，完成后再点「深入了解」查看。</p>
  <button type="button" className="kw-deep__btn" onClick={onClose}>先关掉</button>
 </div>;
}

function checkText(check){
 const parts=[`${check.kept} 条找到原文`];
 if(check.dropped)parts.push(`${check.dropped} 条找不到原文，已删除`);
 const r=check.review||{};
 if(r.status==='done'){if(r.removed)parts.push(`${r.removed} 条原文不支持，已删除`);if(r.partial)parts.push(`${r.partial} 条原文只支持一部分，已标出`);}
 if(r.status==='failed')parts.push('这次没有完成「原文是否支持」的复核');
 return parts.join(' · ');
}

export default function ProjectDeepDive({project,onClose}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[all,setAll]=useState(false),timer=useRef(0),alive=useRef(true);
 async function load(start=false){
  try{const d=await api(`/api/knowledge/projects/${encodeURIComponent(project.id)}/deep-dive`,start?'POST':'GET',start?{}:undefined);if(alive.current){setData(d);setError('');}return d;}
  catch(e){if(alive.current)setError(e.message||'读取失败');return null;}
 }
 useEffect(()=>{alive.current=true;
  (async()=>{const d=await load();if(alive.current&&d?.status==='none')await load(true);})();
  return ()=>{alive.current=false;clearTimeout(timer.current);};
 },[project.id]);
 useEffect(()=>{clearTimeout(timer.current);if(['queued','running'].includes(data?.status))timer.current=setTimeout(()=>void load(),2000);},[data]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[onClose]);

 const r=data?.result,check=r?.check,sources=r?.sources||[],log=data?.log||[];
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
  {pending?<Progress data={data||{steps:[]}} onClose={onClose}/>:
   data.status==='failed'?<div className="kw-deep__failed"><h3>这次没有解读成功</h3><p>{data.error?.message||'读取或生成失败。'}</p>
    {!!log.length&&<ul className="kw-brief__sources">{log.map((s,i)=><li key={i} data-status={s.status}><span>{host(s.url)}</span><em>{s.reason||'已读取'}</em></li>)}</ul>}
    <button type="button" className="kw-primary" onClick={()=>void load(true)}>重试</button></div>:
   <div className="kw-deep__body">
    <p className="kw-deep__overview">{r.overview}</p>
    <div className="kw-deep__check">
     <span>✓ 每条都附原文，已逐条核对：{checkText(check)}</span>
     <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>展开全部原文</label>
    </div>
    {SECTIONS.map(([id,label])=>{const s=r.sections.find(x=>x.id===id);return s?<article key={id} className="kw-deep__sec"><h3>{label}</h3><ol>{s.points.map((p,i)=><Point key={i} p={p} sources={sources} all={all}/>)}</ol></article>:null;})}
    {!!r.unknowns?.length&&<article className="kw-deep__sec kw-deep__unknowns"><h3>资料里没说清楚的</h3><ul>{r.unknowns.map((u,i)=><li key={i}>{u}</li>)}</ul></article>}
    <article className="kw-deep__sec kw-deep__sources"><h3>读过的资料</h3>
     <ol>{sources.map(s=><li key={s.index}><b>[{s.index}]</b><a href={safe(s.url)} target="_blank" rel="noreferrer">{KIND[s.kind]} · {short(s)}</a><em>{s.kind==='tree'||s.kind==='repo'?'':s.chars.toLocaleString()+' 字符'}</em></li>)}
      {log.filter(l=>l.status!=='read').map((l,i)=><li key={'x'+i} className="is-skipped"><b>–</b><span>{host(l.url)}</span><em>{l.reason}</em></li>)}</ol>
    </article>
    <footer className="kw-deep__foot">{MODEL[r.model]||r.model} 解读{r.review_model&&check.review?.status==='done'?`，${MODEL[r.review_model]||r.review_model} 复核`:''} · {date} · 用时 {took} 秒 · 原文核对只证明这句话出自来源，不代表来源本身属实</footer>
   </div>}
 </section>;
}
