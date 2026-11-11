import {useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../api.js';
import Icon from './Icon.jsx';
import KnowledgeScene,{IdeaShelf,dragProject} from './KnowledgeScene.jsx';
import {dropTarget,pressToDrag,setDragGhost} from '../material-drag.js';
import WorkbenchModal from './WorkbenchModal.jsx';
import HackathonTracker,{TrackerToast,trackerCounts} from './HackathonTracker.jsx';
import {titleColor,zoneKey,zoneLabel,zoneOf} from '../knowledge-warehouse.js';
import KnowledgeResults from './KnowledgeResults.jsx';
import KnowledgeNewsForm from './KnowledgeNewsForm.jsx';
import KnowledgeMaterialDetails from './KnowledgeMaterialDetails.jsx';

const defaults={audience:'',region:'',skills:'',time:'',budget:'',theme:''};
export default function KnowledgeWorkspace({theme,onToggleTheme,onReturn,onOpenCrawl,onResearch,activeCase}){
 const [library,setLibrary]=useState({items:[],total:0,sources:[]}),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[source,setSource]=useState(''),[offset,setOffset]=useState(0),[reload,setReload]=useState(0);
 const [view,setView]=useState('iso'),[collapsed,setCollapsed]=useState(false),[selected,setSelected]=useState(''),[detail,setDetail]=useState(null),[tray,setTray]=useState([]),[constraints,setConstraints]=useState(defaults);
 const [run,setRun]=useState(null),[saved,setSaved]=useState([]),[bench,setBench]=useState(null),[benchIdea,setBenchIdea]=useState(null);
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[results,setResults]=useState(false),[over,setOver]=useState(false),[obsidian,setObsidian]=useState(null),[ready,setReady]=useState(false);
 const [materialType,setMaterialType]=useState('hackathon'),[selectedKind,setSelectedKind]=useState('hackathon'),[newsForm,setNewsForm]=useState(false);
 const [zoneFocus,setZoneFocus]=useState(null),[colors,setColors]=useState(()=>new Map()),[totals,setTotals]=useState({}),scene=useRef(null);
 const [tracker,setTracker]=useState(null),[trackerOpen,setTrackerOpen]=useState(false),[trackerToast,setTrackerToast]=useState(null);
 // Library search (local only): Enter brings the found books into a new 搜索区. Several
 // stay open side by side (kept on this device) until deleted with the button beside each.
 const SEARCH_KEY='lydia-library-searches',MAX_SEARCHES=5;
 const [ask,setAsk]=useState(''),[searchNote,setSearchNote]=useState(null);
 const [searches,setSearches]=useState(()=>{try{return (JSON.parse(localStorage.getItem(SEARCH_KEY)||'[]')||[]).filter(s=>s.status==='ready').map(s=>({...s,restored:true}));}catch{return [];}});
 useEffect(()=>{try{localStorage.setItem(SEARCH_KEY,JSON.stringify(searches.filter(s=>s.status==='ready').map(({restored,...s})=>s)));}catch{}},[searches]);
 useEffect(()=>{if(!searchNote)return;const t=setTimeout(()=>setSearchNote(null),6000);return()=>clearTimeout(t);},[searchNote]);
 async function summon(text){
  const q=text.trim();if(!q)return;const kind=materialType,id=crypto.randomUUID();
  if(view==='list')setView('iso');setAsk('');setSearchNote(null);
  setSearches(list=>[...list,{id,query:q,kind,status:'casting',ids:[],items:[],reasons:{}}].slice(-MAX_SEARCHES));
  try{
   const r=await api('/api/knowledge/search','POST',{query:q,kind});
   if(!r.matches.length){setSearches(list=>list.filter(s=>s.id!==id));setSearchNote(r.note||'没有找到相关资料');return;}
   setSearches(list=>list.map(s=>s.id===id?{...s,status:'ready',ids:r.matches.map(m=>m.id),items:r.matches.map(m=>({...m.item,kind})),reasons:Object.fromEntries(r.matches.map(m=>[m.id,m.reason])),mode:r.mode}:s));
   if(r.mode==='keyword')setSearchNote('Claude 暂时不可用，这次用的是关键词匹配，结果可能不全');
  }catch(e){setSearches(list=>list.filter(s=>s.id!==id));setSearchNote('搜索失败：'+e.message);}
 }
 function removeSearch(id){setSearches(list=>list.filter(s=>s.id!==id));}
 const casting=[...searches].reverse().find(s=>s.status==='casting'),focusedSearch=searches.find(s=>zoneOf(s.id)===zoneFocus);
 const colorOf=p=>colors.get(p.id)||titleColor(p.title);
 const projectIds=tray.filter(p=>p.kind!=='news').map(p=>p.id),newsIds=tray.filter(p=>p.kind==='news').map(p=>p.id);
 const draftValue={project_ids:projectIds,news_ids:newsIds,constraints,run_id:run?.id||null};
 const briefURL=id=>'/api/knowledge/projects/'+encodeURIComponent(id)+'/brief';
 const loadMaterial=(id,kind)=>kind==='news'?api('/api/knowledge/news/'+id).then(p=>({...p,kind:'news'}))
  :Promise.all([api('/api/crawl/projects/'+id),api(briefURL(id)).catch(()=>null)]).then(([p,brief])=>({...p,brief,kind:kind||'hackathon'}));
 const [briefStatus,setBriefStatus]=useState(null);
 function selectMaterial(p){if(!p)return;setSelected(p.id);setSelectedKind(p.kind||materialType);}
 function switchMaterial(kind){if(kind!==materialType){setZoneFocus(null);setSelected('');setDetail(null);}setMaterialType(kind);setSource('');setQuery('');setOffset(0);}
 const counts=trackerCounts(tracker);
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
  const timer=setTimeout(()=>api((materialType==='news'?'/api/knowledge/news?':'/api/knowledge/projects?')+new URLSearchParams({query,source,offset:String(offset)}),'GET',undefined,{signal:controller.signal}).then(data=>{if(live){setLibrary({...data,items:data.items.map(p=>({...p,kind:materialType}))});if(!query&&!source)setTotals(t=>({...t,[materialType]:data.total}));setError('');}}).catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(live)setLoading(false);}),180);
  return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[query,source,offset,reload,materialType]);
 useEffect(()=>{
  if(!selected){setDetail(null);return;}
  let live=true;setDetail(null);loadMaterial(selected,selectedKind).then(p=>{if(live)setDetail(p);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
 },[selected,selectedKind]);
 // A brief still queued or being written: refresh it until it is ready or failed.
 const briefPending=detail?.kind==='hackathon'&&['queued','running'].includes(detail?.brief?.status);
 useEffect(()=>{
  if(!briefPending)return;const id=detail.id;let live=true;
  const timer=setTimeout(()=>api(briefURL(id)).then(brief=>{if(live)setDetail(d=>d&&d.id===id?{...d,brief}:d);}).catch(()=>{}),4000);
  return()=>{live=false;clearTimeout(timer);};
 },[briefPending,detail?.id,detail?.brief?.status,detail?.brief?.updated_at,reload]);
 useEffect(()=>{let live=true;api('/api/knowledge/briefs/status').then(s=>{if(live)setBriefStatus(s);}).catch(()=>{});return()=>{live=false;};},[reload]);
 async function generateBrief(p){await act(async()=>{const brief=await api(briefURL(p.id),'POST',{});setDetail(d=>d&&d.id===p.id?{...d,brief}:d);});}
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
 async function act(fn){if(busy)return;setBusy(true);setError('');try{return await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{
  let live=true;api('/api/knowledge/hackathons').then(d=>{if(!live)return;setTracker(d);
   // Announce one unseen discovery per browser session: still-open events first, nearest deadline first.
   const rank=e=>e.phase==='open'?0:e.phase==='unknown'?1:2,found=trackerCounts(d).newFound.sort((a,b)=>rank(a)-rank(b)||String(a.submission_deadline).localeCompare(String(b.submission_deadline))||b.discovered_at.localeCompare(a.discovered_at))[0];
   let shown='';try{shown=sessionStorage.getItem('lydia-tracker-toast')||'';}catch{}
   if(found&&shown!==found.id+found.discovered_at)setTrackerToast(found);
  }).catch(()=>{});return()=>{live=false;};
 },[reload]);
 function dismissToast(){if(trackerToast){try{sessionStorage.setItem('lydia-tracker-toast',trackerToast.id+trackerToast.discovered_at);}catch{}}setTrackerToast(null);}
 function openTracker(){setTrackerOpen(true);dismissToast();api('/api/knowledge/hackathons/seen','POST',{}).then(r=>setTracker(t=>t&&{...t,seen_at:r.seen_at})).catch(()=>{});}
 function viewEvent(e,pick){
  setTrackerOpen(false);const switching=materialType!=='hackathon';if(switching)switchMaterial('hackathon');else{setSource('');setQuery('');setOffset(0);}if(view==='list')setView('iso');
  const target=pick||e.results[0];if(target){setSelected(target.id);setSelectedKind('hackathon');}
  setTimeout(()=>scene.current?.focus(e.source_id),switching||view==='list'||source||query?650:0);
 }
 async function untrack(e){await act(async()=>{await api('/api/knowledge/hackathons/'+e.id+'/untrack','POST',{});setTracker(t=>t&&{...t,events:t.events.filter(x=>x.id!==e.id)});setMessage('已停止追踪 '+e.name);});}
 function add(p){setTray(old=>{if(old.some(i=>i.id===p.id))return old;if(old.length>=6){setError('一次最多分析 6 条资料，新闻和项目可以混合。');return old;}return [...old,p];});setMessage('已加入分析托盘');}
 // Touch long-press drags land here too (they carry the material itself, not a dataTransfer).
 const trayRef=useRef(null),dropRef=useRef(null);dropRef.current=add;
 useEffect(()=>dropTarget(trayRef.current,{over:setOver,drop:p=>dropRef.current(p)}),[]);
 const dragRow=p=>({draggable:true,onDragStart:e=>{dragProject(e,p);setDragGhost(e,p,colorOf(p));},onPointerDown:e=>pressToDrag(e,p,{color:colorOf(p)})});
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
 // Idea 实验台 / 我的 Idea / Lydia 研究 open as one small page (WorkbenchModal).
 function openBench(section,ideaId=null){setBenchIdea(ideaId);setBench(section);}
 function newCompare(){setTray([]);setRun(null);setResults(false);requestKey.current=null;setMessage('已开始新的比较会话');}
 async function updateIdea(idea,change){await act(async()=>{const next=await api('/api/knowledge/ideas/'+idea.id,'PATCH',change);setSaved(list=>list.map(i=>i.id===next.id?next:i));setMessage('备注已保存');});}
 async function researchIdea(idea){await act(async()=>{const r=await api('/api/knowledge/ideas/'+idea.id+'/research','POST',{});setSaved(list=>list.map(i=>i.id===idea.id?{...i,case_id:r.id}:i));await onResearch(r.id);});}
 async function sync(){await act(async()=>{const r=await api('/api/knowledge/obsidian/sync','POST',{});setObsidian(await api('/api/knowledge/obsidian'));setMessage(r.connected?`Obsidian：写入 ${r.written} 篇，${r.conflicts.length} 篇需复核`:r.message);});}
 const active=detail;
 const filteredMessage=useMemo(()=>source?library.sources.find(s=>s.source_id===source)?.source_id:materialType==='news'?'全部媒体':'全部平台',[source,library.sources,materialType]);
 return <main className={'knowledge-workspace'+(collapsed?' kw-collapsed':'')} aria-label="知识库工作区">
  <header className="kw-header"><button className="kw-brand" type="button" onClick={onReturn} title="返回原来的 Lydia 页面"><img src="/icons/icon.svg" alt="" width="27" height="27"/><strong>Lydia</strong></button><span className="kw-header__divider"/><span className="kw-header__name">Hackathon 工作区</span><nav aria-label="知识库视图"><button type="button" className="kw-logic" title="返回 Lydia 商业逻辑研究" onClick={onReturn}>商业逻辑</button><button type="button" aria-current={bench?undefined:'page'} onClick={()=>{setBench(null);switchMaterial('hackathon');setResults(false);}}>项目库</button><button type="button" aria-current={bench==='lab'?'page':undefined} onClick={()=>openBench('lab')}>Idea 实验台</button></nav><form className={'kw-global-search'+(casting?' is-casting':'')} role="search" onSubmit={e=>{e.preventDefault();summon(ask);}}><Icon name="search" size={17}/><input aria-label="在资料库里找资料" placeholder={materialType==='news'?'描述你想找的新闻，按 Enter':'描述你想找的项目，按 Enter，例如：用硬件解决环境问题'} value={ask} onChange={e=>setAsk(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setAsk('');}}/><kbd className="kw-search-kbd">Enter</kbd></form><button className="kw-theme" type="button" aria-label={theme==='dark'?'切换到白天模式':'切换到黑夜模式'} onClick={onToggleTheme}><Icon name={theme==='dark'?'moon':'sun'} size={19}/></button><button type="button" className="kw-return" onClick={onReturn}>商业逻辑 <span>↗</span></button></header>
  <div className="kw-layout">
   <aside className="kw-sidebar" aria-label="知识库导航"><div className="kw-sidebar__identity"><img src="/icons/icon.svg" alt="" width="25" height="25"/><span>LYDIA WORKSPACE</span><button className="kw-collapse" type="button" aria-label={collapsed?'展开知识库侧栏':'收起知识库侧栏'} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'›':'‹'}</button></div><div className="kw-sidebar__context"><span>◉</span><strong>我的 Hackathon 项目</strong></div><div className="kw-sidebar__section">工作区</div>
    <nav><button className={materialType==='hackathon'?'is-active':''} type="button" title="项目库" onClick={()=>{switchMaterial('hackathon');setResults(false);}}><Icon name="folder"/><span>项目库</span><small>{materialType==='hackathon'?library.total:''}</small></button><div className="kw-sidebar__sub"><label><span className="kw-sr">采集平台</span><select aria-label="按采集平台筛选" value={source} onChange={e=>{setSource(e.target.value);if(!e.target.value)setQuery('');setOffset(0);}}><option value="">全部平台</option>{library.sources.map(s=><option key={s.source_id} value={s.source_id}>{s.source_id} · {s.count}</option>)}</select></label></div><button type="button" className={bench==='lab'?'is-active':''} title="Idea 实验台" onClick={()=>openBench('lab')}><Icon name="panel"/><span>Idea 实验台</span><small>{tray.length||''}</small></button><button type="button" className={bench==='ideas'?'is-active':''} title="我的 Idea" onClick={()=>openBench('ideas')}><Icon name="star"/><span>我的 Idea</span><small>{saved.length||''}</small></button><button type="button" className={bench==='research'?'is-active':''} title="Lydia 研究" onClick={()=>openBench('research')}><Icon name="chat"/><span>Lydia 研究</span></button><button type="button" title="新闻与资讯" aria-label="打开新闻资料库" className={materialType==='news'?'is-active':''} onClick={()=>switchMaterial('news')}><Icon name="copy"/><span>新闻与资讯</span><small>{materialType==='news'?library.total:''}</small></button><button type="button" title="采集项目" onClick={onOpenCrawl}><Icon name="spider"/><span>采集项目</span></button><button type="button" className={'kw-track'+(trackerOpen?' is-active':'')} title="追踪 Hackathon" aria-label={`追踪 Hackathon，追踪中 ${counts.tracking}，新结果 ${counts.newResults}`} aria-expanded={trackerOpen} onClick={()=>trackerOpen?setTrackerOpen(false):openTracker()}><span className="kw-track__icon" aria-hidden="true">{(counts.newFound.length>0||tracker?.drive_sync?.pending?.length>0)&&<i/>}</span><span>追踪 Hackathon</span><small className="kw-track__counts">{counts.tracking>0&&<b className="is-tracking">{counts.tracking}</b>}{counts.newResults>0&&<b className="is-results">{counts.newResults}</b>}</small></button></nav>
    <div className="kw-recent"><div className="kw-sidebar__section">最近资料</div>{!library.items.length&&<p className="kw-recent__empty">还没有资料</p>}{library.items.slice(0,8).map(p=><button type="button" key={p.id} {...dragRow(p)} onClick={()=>selectMaterial(p)}><i className="kw-book" style={{'--book':colorOf(p)}} aria-hidden="true"/><span>{p.title}</span><small>⠿</small></button>)}</div>
   </aside>
   <section className="kw-center" aria-label="空间项目书库">
    <div className="kw-center__bar">
     <div className="kw-crumb"><button type="button" className="kw-back" aria-label="返回总览" disabled={!zoneFocus||view==='list'} onClick={()=>scene.current?.overview()}>‹</button><span className="knowledge-muted">{materialType==='news'?'新闻资料':'比赛项目'}</span><span className="kw-sep">›</span>
      {focusedSearch&&view!=='list'?<><button type="button" className="kw-crumb__link" onClick={()=>scene.current?.overview()}>{filteredMessage}</button><span className="kw-sep">›</span><strong className="kw-crumb__magic">✦ {focusedSearch.query}</strong><small>· {focusedSearch.ids.length} 本</small></>
       :zoneFocus&&view!=='list'?<><button type="button" className="kw-crumb__link" onClick={()=>scene.current?.overview()}>{filteredMessage}</button><span className="kw-sep">›</span><strong>{zoneLabel(zoneFocus,materialType)}</strong><small>· {library.items.filter(p=>zoneKey(p)===zoneFocus).length} {materialType==='news'?'条新闻':'个项目'}</small></>
       :<><strong>{filteredMessage}</strong><small>· {new Set(library.items.map(zoneKey)).size} 个区 · {library.total} {materialType==='news'?'条新闻':'个项目'}</small></>}
      {loading&&<small>加载中…</small>}</div>
     <div className="kw-seg" role="group" aria-label="资料类型"><button type="button" aria-pressed={materialType==='hackathon'} onClick={()=>switchMaterial('hackathon')}>比赛项目{totals.hackathon!=null&&<em>{totals.hackathon}</em>}</button><button type="button" aria-pressed={materialType==='news'} onClick={()=>switchMaterial('news')}>新闻资料{totals.news!=null&&<em>{totals.news}</em>}</button></div>
     <div className="kw-seg" role="group" aria-label="视图"><button type="button" aria-pressed={view==='iso'} onClick={()=>setView('iso')}>等距</button><button type="button" aria-pressed={view==='top'} onClick={()=>setView('top')}>俯视</button><button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}>列表</button></div>
     <div className="kw-bar-tools"><button type="button" aria-label="刷新资料库" onClick={()=>setReload(n=>n+1)}>↻</button><button type="button" className="kw-bench-mobile" aria-label="打开 Idea 工作台" onClick={()=>openBench('lab')}><Icon name="star" size={15}/><span>Idea</span></button><button type="button" className="kw-add-news" aria-label="添加新闻" title="添加新闻" onClick={()=>setNewsForm(true)}>＋<span>新闻</span></button><button type="button" className={'kw-track-mobile'+(counts.newFound.length?' has-new':'')} aria-label="打开追踪 Hackathon" onClick={openTracker}>◉<span>追踪</span>{counts.tracking>0&&<b className="is-tracking">{counts.tracking}</b>}{counts.newResults>0&&<b className="is-results">{counts.newResults}</b>}</button></div>
    </div>
    {casting?<div className="kw-magic-chip is-casting" role="status"><span aria-hidden="true">✦</span>正在资料库里寻找「{casting.query}」…</div>
     :searchNote&&<div className="kw-magic-chip" role="status"><span aria-hidden="true">✦</span>{searchNote}<button type="button" onClick={()=>setSearchNote(null)}>知道了</button></div>}
    {error&&<div className="kw-alert" role="alert">{error}<button type="button" onClick={()=>setError('')}>×</button></div>}
    {message&&<div className="kw-toast" role="status">{message}<button type="button" onClick={()=>setMessage('')}>×</button></div>}
    {view!=='list'?<KnowledgeScene ref={scene} projects={library.items} selected={selected} onSelect={id=>selectMaterial(library.items.find(p=>p.id===id)||searches.flatMap(s=>s.items).find(p=>p.id===id))} onAdd={add} materialType={materialType} tray={tray.map(p=>p.id)} view={view} onFocusChange={setZoneFocus} onColors={setColors} searches={searches.filter(s=>s.kind===materialType)} onRemoveSearch={removeSearch}/>:<div className="kw-project-list"><div className="kw-list-heading"><span>{materialType==='news'?'新闻':'项目'}</span><span>来源 / 资料</span><span/></div>{!library.items.length&&!loading&&<div className="kw-empty"><h2>{materialType==='news'?'新闻库，等待新的线索':'还没有匹配的项目'}</h2><p>{materialType==='news'?'添加公开链接、粘贴新闻正文，或从现有研究资料选择新闻。':'先采集项目，或试试其他筛选条件。'}</p><button type="button" onClick={materialType==='news'?()=>setNewsForm(true):onOpenCrawl}>{materialType==='news'?'添加新闻':'打开 Crawl'}</button></div>}{library.items.map(p=><article key={p.id} {...dragRow(p)} className={selected===p.id?'is-selected':''}><button className="kw-list-title" type="button" onClick={()=>selectMaterial(p)}><i className="kw-book" style={{'--book':colorOf(p)}} aria-hidden="true"/><strong>{p.title}</strong></button><span>{p.source_id}<small>{p.kind==='news'?(p.published_at||'报道日期未知'):p.depth+' · '+p.quality}</small></span><button type="button" aria-label={'加入分析 '+p.title} onClick={()=>add(p)}>＋ 加入</button></article>)}</div>}
    {library.total>48&&<div className="kw-pagination"><button type="button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-48))}>上一页</button><span>{offset+1}–{Math.min(offset+48,library.total)} / {library.total}</span><button type="button" disabled={offset+48>=library.total} onClick={()=>setOffset(n=>n+48)}>下一页</button></div>}
    <div ref={trayRef} className={'kw-tray'+(over?' is-over':'')} aria-label="分析托盘" onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-lydia-project')){e.preventDefault();setOver(true);}}} onDragLeave={()=>setOver(false)} onDrop={dropProject}>
     <div className="kw-tray__heading"><span className="kw-tray__icon">▱</span><div><strong>分析托盘 <small>{projectIds.length} 项目 · {newsIds.length} 新闻 / 共 {tray.length} 条</small></strong><p>新闻变化 × 项目机制 → 新的 idea</p></div></div><div className="kw-tray__items">{tray.map((p,n)=><span key={p.id} data-kind={p.kind||'hackathon'}><b className="kw-tray__num" style={{'--book':colorOf(p)}}>{n+1}</b><i>{p.kind==='news'?'新闻':'项目'}</i><span className="kw-tray-label">{p.title}</span><button type="button" aria-label={'移除 '+p.title} onClick={()=>setTray(list=>list.filter(i=>i.id!==p.id))}>×</button></span>)}</div><div className="kw-tray__actions"><button type="button" title="设置团队、时间与预算" onClick={()=>openBench('lab')}><Icon name="settings" size={17}/><span>条件</span></button><button className="kw-primary" type="button" disabled={busy||!!pending||tray.length<2||!ready} onClick={analyze}>{pending?'分析中…':'分析并生成'}<span>↗</span></button>{run&&<button type="button" className="kw-result-toggle" onClick={()=>setResults(v=>!v)}><Icon name="chevronUp" size={17}/>结果</button>}</div>
    </div>
    {results&&<KnowledgeResults run={run} stale={stale} busy={busy} onClose={()=>setResults(false)} onCancel={()=>act(async()=>setRun(await api('/api/knowledge/runs/'+run.id+'/cancel','POST',{})))} onSave={save} saved={saved}/>}
   </section>
   <aside className="kw-inspector" aria-label="项目详情与我的 Idea 书架">
    <section className="kw-detail">
    {active&&(why=>why.length>0&&<div className="kw-why"><span aria-hidden="true">✦</span><span><b>为什么找到它</b>{why.map(s=><span key={s.id} className="kw-why__row">{why.length>1&&<em>{s.query}：</em>}{s.reasons[active.id]}</span>)}</span></div>)(searches.filter(s=>s.reasons?.[active.id]))}
    {<KnowledgeMaterialDetails active={active} selected={selected} materialType={materialType} onAdd={add} onGenerateBrief={generateBrief} briefStatus={briefStatus}/>}
    </section>
    <section className="kw-saved"><h2>我的 Idea 书架 <small>{saved.length}</small></h2><IdeaShelf ideas={saved} selected={bench==='ideas'?benchIdea:null} onSelect={i=>openBench('ideas',i.id)} onDrop={value=>{if(value!=='')void save(value);}}/></section>
    <footer className="kw-obsidian"><div><span className={'kw-connection-dot'+(obsidian?.connected?' is-connected':'')}/><strong>Obsidian</strong><small>{obsidian?.connected?'已连接 · 每分钟同步':'未连接'}</small></div><p>{obsidian?.connected?'项目、Idea 与研究摘要 → Vault / Lydia':'未发现可用 Vault，请先在本机 Obsidian 打开资料库。'}</p>{obsidian?.last?.at&&<small>最近同步 {new Date(obsidian.last.at).toLocaleTimeString()}{obsidian.last.conflicts?.length?' · 有笔记待复核':''}</small>}<button type="button" onClick={sync} disabled={busy||!obsidian?.connected}>立即同步 <Icon name="share" size={14}/></button></footer>
   </aside>
  </div>
  <HackathonTracker data={tracker} open={trackerOpen} busy={busy} onClose={()=>setTrackerOpen(false)} onView={e=>viewEvent(e)} onPick={(e,r)=>viewEvent(e,r)} onUntrack={untrack}/>
  {bench&&<WorkbenchModal section={bench} onSection={openBench} onClose={()=>setBench(null)} tray={tray} colorOf={colorOf} onRemove={p=>setTray(list=>list.filter(i=>i.id!==p.id))} onNewCompare={newCompare}
   constraints={constraints} setConstraints={setConstraints} analyze={analyze} canAnalyze={!busy&&!pending&&tray.length>=2&&ready} pending={!!pending} run={run} stale={stale} busy={busy}
   onCancel={()=>act(async()=>setRun(await api('/api/knowledge/runs/'+run.id+'/cancel','POST',{})))} onSave={save} saved={saved} focus={benchIdea}
   onUpdate={updateIdea} onResearch={researchIdea} onOpenCase={id=>onResearch(id)} onReturn={onReturn}/>}
  <TrackerToast event={trackerOpen?null:trackerToast} onOpen={openTracker} onDismiss={dismissToast}/>
  {newsForm&&<KnowledgeNewsForm activeCase={activeCase} onClose={()=>setNewsForm(false)} onCreated={p=>{switchMaterial('news');setSelected(p.id);setSelectedKind('news');setReload(n=>n+1);setMessage('新闻资料已保存');}}/>}
 </main>;
}
