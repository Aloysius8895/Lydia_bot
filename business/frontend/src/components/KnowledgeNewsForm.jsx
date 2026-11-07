import {useState} from 'react';
import {api} from '../api.js';

export default function KnowledgeNewsForm({activeCase,onCreated,onClose}){
 const [data,setData]=useState({title:'',url:'',content:'',publisher:'',published_at:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[documents,setDocuments]=useState(null);
 async function submit(body){if(busy)return;setBusy(true);setError('');try{const news=await api('/api/knowledge/news','POST',body);onCreated(news);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="kw-news-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="kw-news-dialog" role="dialog" aria-modal="true" aria-label="添加新闻资料"><header><div><small>NEWS / CONTEXT</small><h2>留下一条值得思考的新闻</h2></div><button type="button" aria-label="关闭添加新闻" onClick={onClose} disabled={busy}>×</button></header><p className="knowledge-muted">粘贴公开链接让 Lydia 读取，或直接粘贴正文。新闻报道会作为创意线索，保留媒体、时间和出处。</p>
  {error&&<p role="alert" className="kw-alert">{error}</p>}
  <form onSubmit={e=>{e.preventDefault();void submit({...data,url:data.url||undefined});}}>
   <label className="kw-field">新闻链接<input aria-label="新闻链接" type="url" value={data.url} maxLength={2000} placeholder="https://…" onChange={e=>setData(v=>({...v,url:e.target.value}))}/></label>
   <label className="kw-field">新闻标题<input aria-label="新闻标题" value={data.title} maxLength={200} placeholder="读取链接时可自动填写" onChange={e=>setData(v=>({...v,title:e.target.value}))}/></label>
   <label className="kw-field">新闻正文<textarea aria-label="新闻正文" value={data.content} maxLength={150000} placeholder="可以直接粘贴正文；仅有标题不足以分析。" onChange={e=>setData(v=>({...v,content:e.target.value}))}/></label>
   <div className="kw-news-meta"><label className="kw-field">媒体 / 发布者<input aria-label="新闻发布者" value={data.publisher} maxLength={160} placeholder="未知可留空" onChange={e=>setData(v=>({...v,publisher:e.target.value}))}/></label><label className="kw-field">报道日期<input aria-label="新闻日期" type="date" value={data.published_at} onChange={e=>setData(v=>({...v,published_at:e.target.value}))}/></label></div>
   <button className="kw-primary" type="submit" disabled={busy||(!data.url&&(!data.title.trim()||data.content.trim().length<30))}>{busy?'读取并保存中…':'保存新闻资料'}</button>
  </form>
  <details><summary>从现有 Lydia 研究资料选择新闻</summary><p className="knowledge-muted">不会把所有市场资料自动当成新闻。请明确选择要放入新闻库的原文。</p>{!activeCase?<p>先返回 Lydia 选择一个研究项目。</p>:<><button type="button" disabled={busy} onClick={async()=>{setError('');try{setDocuments(await api('/api/knowledge/news/importable?case_id='+activeCase));}catch(e){setError(e.message);}}}>读取当前研究项目的资料</button>{documents?.map(d=><article className="kw-news-import" key={d.id}><span>{d.title}<small>版本 {d.version}</small></span><button type="button" disabled={busy} onClick={()=>submit({document_id:d.id,case_id:activeCase})}>作为新闻导入</button></article>)}{documents?.length===0&&<p>当前项目没有可导入的市场资料。</p>}</>}</details>
 </section></div>;
}
