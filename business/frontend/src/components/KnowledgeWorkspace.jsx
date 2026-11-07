import {useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../api.js';
import Icon from './Icon.jsx';
import KnowledgeScene,{IdeaShelf,binderImages,dragProject} from './KnowledgeScene.jsx';
import KnowledgeResults from './KnowledgeResults.jsx';
import KnowledgeNewsForm from './KnowledgeNewsForm.jsx';
import KnowledgeMaterialDetails from './KnowledgeMaterialDetails.jsx';

const defaults={audience:'',region:'',skills:'',time:'',budget:'',theme:''};
export default function KnowledgeWorkspace({theme,onToggleTheme,onReturn,onOpenCrawl,onResearch,activeCase}){
 const [library,setLibrary]=useState({items:[],total:0,sources:[]}),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[source,setSource]=useState(''),[offset,setOffset]=useState(0),[reload,setReload]=useState(0);
 const [view,setView]=useState('spatial'),[collapsed,setCollapsed]=useState(false),[selected,setSelected]=useState(''),[detail,setDetail]=useState(null),[tray,setTray]=useState([]),[constraints,setConstraints]=useState(defaults);
 const [run,setRun]=useState(null),[saved,setSaved]=useState([]),[savedIdea,setSavedIdea]=useState(null),[note,setNote]=useState(''),[ideaStatus,setIdeaStatus]=useState('explore');
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[results,setResults]=useState(false),[over,setOver]=useState(false),[obsidian,setObsidian]=useState(null),[ready,setReady]=useState(false),[showConstraints,setShowConstraints]=useState(false);
 const [materialType,setMaterialType]=useState('hackathon'),[selectedKind,setSelectedKind]=useState('hackathon'),[newsForm,setNewsForm]=useState(false);
 const projectIds=tray.filter(p=>p.kind!=='news').map(p=>p.id),newsIds=tray.filter(p=>p.kind==='news').map(p=>p.id);
 const draftValue={project_ids:projectIds,news_ids:newsIds,constraints,run_id:run?.id||null};
 const loadMaterial=(id,kind)=>api(kind==='news'?'/api/knowledge/news/'+id:'/api/crawl/projects/'+id).then(p=>({...p,kind:kind||'hackathon'}));
 function selectMaterial(p){if(!p)return;setSelected(p.id);setSelectedKind(p.kind||materialType);setSavedIdea(null);}
 function switchMaterial(kind){setMaterialType(kind);setSource('');setQuery('');setOffset(0);setSelected('');setDetail(null);}
 useEffect(()=>{const timer=setInterval(()=>setReload(n=>n+1),15000);return()=>clearInterval(timer);},[]);
 const requestKey=useRef(null),draftSequence=useRef(0),draftRef=useRef(null);
 draftRef.current=ready?draftValue:null;
 useEffect(()=>()=>{if(draftRef.current)void api('/api/knowledge/draft','PUT',draftRef.current,{keepalive:true}).catch(()=>{});},[]);
 const pending=run&&['queued','running'].includes(run.status);
 useEffect(()=>{if(run&&!['queued','running'].includes(run.status))requestKey.current=null;},[run?.status]);
 const stale=run&&(JSON.stringify([...tray.map(p=>p.id)].sort())!==JSON.stringify([...run.project_ids,...run.news_ids||[]].sort())||Object.keys(defaults).some(k=>constraints[k] !== (run.constraints[k]||'')));
 useEffect(()=>{
  let live=true;
  Promise.all([api('/api/knowledge/draft'),api('/api/knowledge/ideas'),api('/api/knowledge/obsidian')]).then(async([draft,ideas,bridge])=>{
   const projects=await Promise.all([...draft.project_ids.map(id=>loadMaterial(id,'hackathon').catch(()=>null)),...(draft.news_ids||[]).map(id=>loadMaterial(id,'news').catch(()=>null))]);
   const oldRun=draft.run_id?await api('/api/knowledge/runs/'+draft.run_id).catch(()=>null):null;
   if(!live)return;setTray(projects.filter(Boolean));setConstraints({...defaults,...draft.constraints});setRun(oldRun);setSaved(ideas);setObsidian(bridge);setReady(true);
  }).catch(e=>{if(live){setError(e.message);setReady(true);}});
  return()=>{live=false;};
 },[]);
 useEffect(()=>{
  let live=true;const controller=new AbortController();setLoading(true);
  const timer=setTimeout(()=>api((materialType==='news'?'/api/knowledge/news?':'/api/knowledge/projects?')+new URLSearchParams({query,source,offset:String(offset)}),'GET',undefined,{signal:controller.signal}).then(data=>{if(live){setLibrary({...data,items:data.items.map(p=>({...p,kind:materialType}))});setError('');}}).catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(live)setLoading(false);}),180);
  return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[query,source,offset,reload,materialType]);
 useEffect(()=>{
  if(!selected){setDetail(null);return;}
  let live=true;setDetail(null);loadMaterial(selected,selectedKind).then(p=>{if(live)setDetail(p);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
 },[selected,selectedKind]);
 useEffect(()=>{
  if(!ready)return;const seq=++draftSequence.current;
  const timer=setTimeout(()=>{if(seq===draftSequence.current)void api('/api/knowledge/draft','PUT',draftValue).catch(e=>setError(e.message));},300);
  return()=>clearTimeout(timer);
 },[tray,constraints,run?.id,ready]);
 useEffect(()=>{
  if(!pending)return;let live=true,timer;
  const poll=async()=>{try{const next=await api('/api/knowledge/runs/'+run.id);if(live){setRun(next);if(['queued','running'].includes(next.status))timer=setTimeout(poll,1500);}}catch(e){if(live){setError(e.message);timer=setTimeout(poll,3000);}}};
  timer=setTimeout(poll,600);return()=>{live=false;clearTimeout(timer);};
 },[run?.id,pending]);
 useEffect(()=>{if(savedIdea){setNote(savedIdea.note);setIdeaStatus(savedIdea.status);}},[savedIdea?.id]);
 async function act(fn){if(busy)return;setBusy(true);setError('');try{return await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 function add(p){setTray(old=>{if(old.some(i=>i.id===p.id))return old;if(old.length>=6){setError('一次最多分析 6 条资料，新闻和项目可以混合。');return old;}return [...old,p];});setMessage('已加入分析托盘');}
 async function dropProject(e){e.preventDefault();setOver(false);const id=e.dataTransfer.getData('application/x-lydia-project');if(!id)return;const p=library.items.find(p=>p.id===id);if(p)add(p);else{let kind='hackathon';try{kind=JSON.parse(e.dataTransfer.getData('application/x-lydia-material')).kind;}catch{}await act(async()=>add(await loadMaterial(id,kind)));}}
 async function analyze(){await act(async()=>{
  if(tray.length<2)throw Error('请先加入至少两条不同资料，例如一条新闻和一个比赛项目。');
  const signature=JSON.stringify({ids:tray.map(p=>p.id),constraints});
  if(requestKey.current?.signature!==signature)requestKey.current={signature,key:crypto.randomUUID()};
  const next=await api('/api/knowledge/runs','POST',{project_ids:projectIds,news_ids:newsIds,constraints,request_key:requestKey.current.key});setRun(next);setResults(true);
  if(['failed','cancelled','interrupted','completed'].includes(next.status))requestKey.current=null;
 });}
 async function save(index){
  const n=Number(index);if(!Number.isInteger(n)||!run?.output?.ideas[n])return;
  await act(async()=>{const item=await api('/api/knowledge/ideas','POST',{run_id:run.id,candidate_index:n});setSaved(list=>[item,...list.filter(i=>i.id!==item.id)]);setMessage('Idea 已放入书架');});
 }
 function chooseIdea(i){setSavedIdea(i);setNote(i.note);setIdeaStatus(i.status);}
 async function updateIdea(){await act(async()=>{const next=await api('/api/knowledge/ideas/'+savedIdea.id,'PATCH',{note,status:ideaStatus});setSaved(list=>list.map(i=>i.id===next.id?next:i));setSavedIdea(next);setMessage('备注已保存');});}
 async function sync(){await act(async()=>{const r=await api('/api/knowledge/obsidian/sync','POST',{});setObsidian(await api('/api/knowledge/obsidian'));setMessage(r.connected?`Obsidian：写入 ${r.written} 篇，${r.conflicts.length} 篇需复核`:r.message);});}
 const active=detail;
 const filteredMessage=useMemo(()=>source?library.sources.find(s=>s.source_id===source)?.source_id:materialType==='news'?'全部媒体':'全部平台',[source,library.sources,materialType]);
 return <main className={'knowledge-workspace'+(collapsed?' kw-collapsed':'')} aria-label="知识库工作区">
  <header className="kw-header"><button className="kw-brand" type="button" onClick={onReturn} title="返回原来的 Lydia 页面"><img src="/icons/icon.svg" alt="" width="27" height="27"/><strong>Lydia</strong></button><span className="kw-header__divider"/><span className="kw-header__name">Hackathon 工作区</span><nav aria-label="知识库视图"><button type="button" aria-current="page" onClick={()=>{switchMaterial('hackathon');setResults(false);}}>项目库</button><button type="button" onClick={()=>{if(run)setResults(true);else{setShowConstraints(true);setMessage('先将项目拖入底部托盘，再开始分析。');}}}>Idea 实验台</button></nav><label className="kw-global-search"><Icon name="search" size={17}/><input aria-label="搜索比赛项目" placeholder="搜索项目、探索下一个方向…" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label><button className="kw-theme" type="button" aria-label={theme==='dark'?'切换到白天模式':'切换到黑夜模式'} onClick={onToggleTheme}><Icon name={theme==='dark'?'moon':'sun'} size={19}/></button><button type="button" className="kw-return" onClick={onReturn}>返回 Lydia <span>↗</span></button></header>
  <div className="kw-layout">
   <aside className="kw-sidebar" aria-label="知识库导航"><div className="kw-sidebar__identity"><img src="/icons/icon.svg" alt="" width="25" height="25"/><span>LYDIA WORKSPACE</span><button className="kw-collapse" type="button" aria-label={collapsed?'展开知识库侧栏':'收起知识库侧栏'} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'›':'‹'}</button></div><div className="kw-sidebar__context"><span>◉</span><strong>我的 Hackathon 项目</strong></div><div className="kw-sidebar__section">工作区</div>
    <nav><button className={materialType==='hackathon'?'is-active':''} type="button" title="项目库" onClick={()=>{switchMaterial('hackathon');setResults(false);}}><Icon name="folder"/><span>项目库</span><small>{materialType==='hackathon'?library.total:''}</small></button><div className="kw-sidebar__sub"><button type="button" onClick={()=>{setSource('');setQuery('');setOffset(0);}}>全部比赛项目</button><label>采集平台<select aria-label="按采集平台筛选" value={source} onChange={e=>{setSource(e.target.value);setOffset(0);}}><option value="">全部平台</option>{library.sources.map(s=><option key={s.source_id} value={s.source_id}>{s.source_id} · {s.count}</option>)}</select></label></div><button type="button" title="分析托盘" onClick={()=>{setShowConstraints(true);document.querySelector('.kw-tray')?.scrollIntoView({block:'nearest'});}}><Icon name="panel"/><span>Idea 实验台</span><small>{tray.length||''}</small></button><button type="button" title="返回 Lydia 研究" onClick={onReturn}><Icon name="chat"/><span>Lydia 研究</span></button><button type="button" title="已存 Idea" onClick={()=>document.querySelector('.kw-saved')?.scrollIntoView({block:'nearest',behavior:'smooth'})}><Icon name="star"/><span>我的 Idea</span><small>{saved.length||''}</small></button><button type="button" title="采集项目" onClick={onOpenCrawl}><Icon name="spider"/><span>采集项目</span></button></nav>
    <nav className="kw-news-nav"><button type="button" title="新闻与资讯" aria-label="打开新闻资料库" className={materialType==='news'?'is-active':''} onClick={()=>switchMaterial('news')}><Icon name="copy"/><span>新闻与资讯</span></button></nav>
    <div className="kw-recent"><div className="kw-sidebar__section">最近资料</div>{library.items.slice(0,4).map((p,i)=><button type="button" key={p.id} draggable onDragStart={e=>dragProject(e,p)} onClick={()=>selectMaterial(p)}><img src={binderImages[p.kind==='news'?1:i%3]} alt=""/><span>{p.title}</span><small>⠿</small></button>)}</div>
    <div className="kw-sidebar__bottom"><strong>从案例，找到新可能</strong><p>挑选项目、比较机制，留下值得探索的想法。</p><button className="kw-primary" type="button" onClick={()=>{setTray([]);setRun(null);setResults(false);requestKey.current=null;setMessage('已开始新的比较会话');}}><Icon name="plus" size={17}/>新建比较</button></div><button className="kw-sidebar__back" type="button" title="返回 Lydia" onClick={onReturn}>↤ <span>返回 Lydia</span></button>
   </aside>
   <section className="kw-center" aria-label="空间项目书库">
    <div className="kw-center__bar"><div><span className="knowledge-muted">{materialType==='news'?'新闻资料':'项目库'}</span><span>/</span><strong>{filteredMessage}</strong>{loading&&<small>加载中…</small>}</div><div className="kw-view-switch"><button type="button" aria-label="刷新资料库" onClick={()=>setReload(n=>n+1)}>↻</button><button type="button" aria-pressed={view==='spatial'} onClick={()=>setView('spatial')}>◇ 空间</button><button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}><Icon name="menu" size={15}/>列表</button></div></div>
    <div className="kw-material-tabs" aria-label="资料类型"><button type="button" aria-pressed={materialType==='hackathon'} onClick={()=>switchMaterial('hackathon')}>比赛项目</button><button type="button" aria-pressed={materialType==='news'} onClick={()=>switchMaterial('news')}>新闻资料</button><small>两种资料可混合拖入分析</small><button type="button" className="kw-add-news" onClick={()=>setNewsForm(true)}>＋ 添加新闻</button></div>
    {error&&<div className="kw-alert" role="alert">{error}<button type="button" onClick={()=>setError('')}>×</button></div>}
    {message&&<div className="kw-toast" role="status">{message}<button type="button" onClick={()=>setMessage('')}>×</button></div>}
    {view==='spatial'?<KnowledgeScene projects={library.items} selected={selected} onSelect={id=>selectMaterial(library.items.find(p=>p.id===id))} onAdd={add} materialType={materialType}/>:<div className="kw-project-list"><div className="kw-list-heading"><span>{materialType==='news'?'新闻':'项目'}</span><span>来源 / 资料</span><span/></div>{!library.items.length&&!loading&&<div className="kw-empty"><h2>{materialType==='news'?'新闻库，等待新的线索':'还没有匹配的项目'}</h2><p>{materialType==='news'?'添加公开链接、粘贴新闻正文，或从现有研究资料选择新闻。':'先采集项目，或试试其他筛选条件。'}</p><button type="button" onClick={materialType==='news'?()=>setNewsForm(true):onOpenCrawl}>{materialType==='news'?'添加新闻':'打开 Crawl'}</button></div>}{library.items.map((p,i)=><article key={p.id} draggable onDragStart={e=>dragProject(e,p)} className={selected===p.id?'is-selected':''}><button className="kw-list-title" type="button" onClick={()=>selectMaterial(p)}><img src={binderImages[p.kind==='news'?1:i%3]} alt=""/><strong>{p.title}</strong></button><span>{p.source_id}<small>{p.kind==='news'?(p.published_at||'报道日期未知'):p.depth+' · '+p.quality}</small></span><button type="button" aria-label={'加入分析 '+p.title} onClick={()=>add(p)}>＋ 加入</button></article>)}</div>}
    {library.total>48&&<div className="kw-pagination"><button type="button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-48))}>上一页</button><span>{offset+1}–{Math.min(offset+48,library.total)} / {library.total}</span><button type="button" disabled={offset+48>=library.total} onClick={()=>setOffset(n=>n+48)}>下一页</button></div>}
    {showConstraints&&<form className="kw-constraints" onSubmit={e=>{e.preventDefault();setShowConstraints(false);}}><div><strong>让建议更适合你</strong><button type="button" aria-label="收起分析条件" onClick={()=>setShowConstraints(false)}>×</button></div>{Object.keys(defaults).map(k=><label key={k}>{{audience:'目标用户',region:'地区',skills:'团队技能',time:'可用时间',budget:'预算',theme:'比赛主题'}[k]}<input value={constraints[k]} maxLength={k==='skills'?500:k==='time'||k==='budget'||k==='region'?120:300} placeholder="未指定" onChange={e=>setConstraints(c=>({...c,[k]:e.target.value}))}/></label>)}<button type="submit">完成</button></form>}
    <div className={'kw-tray'+(over?' is-over':'')} aria-label="分析托盘" onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-lydia-project')){e.preventDefault();setOver(true);}}} onDragLeave={()=>setOver(false)} onDrop={dropProject}>
     <div className="kw-tray__heading"><span className="kw-tray__icon">▱</span><div><strong>分析托盘 <small>{projectIds.length} 项目 · {newsIds.length} 新闻 / 共 {tray.length} 条</small></strong><p>新闻变化 × 项目机制 → 新的 idea</p></div></div><div className="kw-tray__items">{tray.map(p=><span key={p.id} data-kind={p.kind||'hackathon'}><i>{p.kind==='news'?'新闻':'项目'}</i><span className="kw-tray-label">{p.title}</span><button type="button" aria-label={'移除 '+p.title} onClick={()=>setTray(list=>list.filter(i=>i.id!==p.id))}>×</button></span>)}</div><div className="kw-tray__actions"><button type="button" title="设置团队、时间与预算" onClick={()=>setShowConstraints(v=>!v)}><Icon name="settings" size={17}/><span>条件</span></button><button className="kw-primary" type="button" disabled={busy||!!pending||tray.length<2||!ready} onClick={analyze}>{pending?'分析中…':'分析并生成'}<span>↗</span></button>{run&&<button type="button" className="kw-result-toggle" onClick={()=>setResults(v=>!v)}><Icon name="chevronUp" size={17}/>结果</button>}</div>
    </div>
    {results&&<KnowledgeResults run={run} stale={stale} busy={busy} onClose={()=>setResults(false)} onCancel={()=>act(async()=>setRun(await api('/api/knowledge/runs/'+run.id+'/cancel','POST',{})))} onSave={save} saved={saved}/>}
   </section>
   <aside className="kw-inspector" aria-label="项目详情与我的 Idea 书架">
    <section className="kw-detail">
    {savedIdea?<><div className="kw-detail__eyebrow"><span>我的 IDEA / 待验证</span><button type="button" aria-label="关闭 Idea 详情" onClick={()=>setSavedIdea(null)}>×</button></div><h2>{savedIdea.title}</h2><p>{savedIdea.snapshot.candidate.summary}</p><details><summary>差异与验证方向</summary><p>{savedIdea.snapshot.candidate.difference}</p><p>{savedIdea.snapshot.candidate.first_test}</p><small>来源：{savedIdea.snapshot.sources.map(p=>p.title).join(' · ')}</small></details><label className="kw-field">我的备注<textarea aria-label="Idea 备注" value={note} maxLength={10000} onChange={e=>setNote(e.target.value)}/></label><label className="kw-field">状态<select value={ideaStatus} onChange={e=>setIdeaStatus(e.target.value)}><option value="explore">待探索</option><option value="shortlist">优先研究</option><option value="archived">已归档</option></select></label><button type="button" disabled={busy} onClick={updateIdea}>保存备注</button><button className="kw-primary" type="button" disabled={busy} onClick={()=>act(async()=>{const r=await api('/api/knowledge/ideas/'+savedIdea.id+'/research','POST',{});await onResearch(r.id);})}>交给 Lydia 研究 ↗</button></>:<KnowledgeMaterialDetails active={active} selected={selected} materialType={materialType} onAdd={add}/>}
    </section>
    <section className="kw-saved"><h2>我的 Idea 书架 <small>{saved.length}</small></h2><IdeaShelf ideas={saved} selected={savedIdea?.id} onSelect={chooseIdea} onDrop={value=>{if(value!=='')void save(value);}}/></section>
    <footer className="kw-obsidian"><div><span className={'kw-connection-dot'+(obsidian?.connected?' is-connected':'')}/><strong>Obsidian</strong><small>{obsidian?.connected?'已连接 · 每分钟同步':'未连接'}</small></div><p>{obsidian?.connected?'项目、Idea 与研究摘要 → Vault / Lydia':'未发现可用 Vault，请先在本机 Obsidian 打开资料库。'}</p>{obsidian?.last?.at&&<small>最近同步 {new Date(obsidian.last.at).toLocaleTimeString()}{obsidian.last.conflicts?.length?' · 有笔记待复核':''}</small>}<button type="button" onClick={sync} disabled={busy||!obsidian?.connected}>立即同步 <Icon name="share" size={14}/></button></footer>
   </aside>
  </div>
  {newsForm&&<KnowledgeNewsForm activeCase={activeCase} onClose={()=>setNewsForm(false)} onCreated={p=>{switchMaterial('news');setSelected(p.id);setSelectedKind('news');setReload(n=>n+1);setMessage('新闻资料已保存');}}/>}
 </main>;
}
