import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';

const DAY=86400000,STEPS=['发现','提交','评审','结果'];
const tzLabel=()=>{const m=-new Date().getTimezoneOffset(),h=Math.trunc(m/60),r=Math.abs(m%60);return 'GMT'+(m>=0?'+':'-')+Math.abs(h)+(r?':'+String(r).padStart(2,'0'):'');};
export function formatDeadline(iso){
 const d=new Date(iso),wd='日一二三四五六'[d.getDay()];
 return `${d.getMonth()+1}月${d.getDate()}日 周${wd} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function timeLeft(iso,now=Date.now()){
 const ms=new Date(iso).getTime()-now;if(ms<=0)return {text:'已截止',urgent:false};
 if(ms<DAY)return {text:`还剩 ${Math.max(1,Math.ceil(ms/3600000))} 小时`,urgent:true};
 const days=Math.ceil(ms/DAY);return {text:`还剩 ${days} 天`,urgent:days<=3};
}
const ago=iso=>{if(!iso)return '尚无交付';const m=Math.round((Date.now()-new Date(iso).getTime())/60000);return m<1?'刚刚':m<60?m+' 分钟前':m<1440?Math.round(m/60)+' 小时前':Math.round(m/1440)+' 天前';};
const isTracking=e=>e.phase!=='results';
/* The panel and toast sit beside the sidebar, whose width changes with breakpoints and collapse. */
function useAnchor(active){
 const [style,setStyle]=useState({});
 useLayoutEffect(()=>{
  if(!active)return;
  const place=()=>{const side=document.querySelector('.kw-sidebar')?.getBoundingClientRect(),btn=document.querySelector('.kw-track')?.getBoundingClientRect();
   if(!side||!side.width)return setStyle({});
   setStyle({'--kt-left':side.right+10+'px','--kt-top':side.top+'px','--kt-bottom':innerHeight-side.bottom+'px','--kt-toast-top':Math.max(side.top,(btn?.top||side.top)-8)+'px'});};
  place();addEventListener('resize',place);const ro=new ResizeObserver(place),side=document.querySelector('.kw-sidebar');if(side)ro.observe(side);
  return()=>{removeEventListener('resize',place);ro.disconnect();};
 },[active]);
 return style;
}
export function TrackerToast({event,onOpen,onDismiss}){
 const style=useAnchor(!!event);if(!event)return null;
 return <div className="kt-toast" role="status" style={style}><div><span>GROK BOT · 新赛事</span><button type="button" aria-label="关闭提示" onClick={onDismiss}>×</button></div><h4>发现新的 Hackathon</h4><p>{event.name}</p>
  {event.submission_deadline?<p>提交截止 <b>{formatDeadline(event.submission_deadline)}</b> · {timeLeft(event.submission_deadline).text}</p>:<p>提交日期待确认</p>}
  <footer><button type="button" className="kw-primary" onClick={onOpen}>查看追踪</button><button type="button" onClick={onDismiss}>稍后</button></footer></div>;
}
export function trackerCounts(data){
 const seen=data?.seen_at?new Date(data.seen_at).getTime():0,events=data?.events||[];
 return {tracking:events.filter(isTracking).length,results:events.filter(e=>!isTracking(e)).length,
  newResults:events.filter(e=>!isTracking(e)&&new Date(e.first_result_at).getTime()>seen).length,
  newFound:events.filter(e=>e.kind==='tracked'&&isTracking(e)&&new Date(e.discovered_at).getTime()>seen)};
}

function Timeline({phase}){
 const done=phase==='results'?4:phase==='judging'?2:1,current=phase==='results'?-1:done;
 return <div className="kt-timeline" aria-label={'进度：'+(phase==='results'?'已有结果':STEPS[current])}>
  <div>{STEPS.map((s,i)=><span key={s} className={i<done?'is-done':i===current?'is-now':''}><i/>{i<3&&<b className={i+1<done||(i+1===current)?'is-done':''}/>}</span>)}</div>
  <p>{STEPS.map(s=><small key={s}>{s}</small>)}</p>
 </div>;
}

function Card({e,seenAt,now,onView,onPick,onUntrack,busy}){
 const tracking=isTracking(e),fresh=tracking?e.kind==='tracked'&&new Date(e.discovered_at).getTime()>seenAt:new Date(e.first_result_at).getTime()>seenAt;
 const left=e.submission_deadline?timeLeft(e.submission_deadline,now):null;
 const status=tracking?(e.phase==='judging'?'等待结果':e.phase==='unknown'?'日期待确认':'提交中'):e.winners?'已抓到获奖作品':'已抓到 finalist';
 const shown=e.results.slice(0,e.winners?2:5);
 return <article className={'kt-card '+(tracking?'is-tracking':'is-results')} aria-label={e.name+' · '+status}>
  {fresh&&<span className="kt-fresh">{tracking?'新发现':'新结果'}</span>}
  <div className="kt-top"><span className="kt-plat">{String(e.platform||e.source_id).toUpperCase()}</span>{e.kind==='grouped'&&<span className="kt-note" title="这些作品已在项目库中，按记录的赛事依据归组；不是核实过的赛事身份。">按作品归组</span>}<span className="kt-status"><i/>{status}</span></div>
  <h4>{e.name}</h4>
  <div className={'kt-date'+(e.submission_deadline?'':' is-unknown')}>
   {e.submission_deadline?<><span>{e.phase==='judging'?'已截止':'提交截止'}</span><strong>{formatDeadline(e.submission_deadline)}</strong></>
    :e.kind==='grouped'?<><span>日期依据</span><strong>{e.event_dates||'作品记录未写明'}</strong></>
    :<><span>提交日期</span><strong className="kt-pending">{e.deadline_note||'官方未写明'} · 待确认</strong></>}
   {tracking&&left&&<em className={left.urgent?'is-urgent':''}>{e.phase==='judging'?'评审中':left.text}</em>}
   {!tracking&&e.kind==='tracked'&&e.first_result_at&&<em>结果 {new Date(e.first_result_at).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</em>}
  </div>
  {e.event_dates&&e.kind==='tracked'&&<p className="kt-dates">活动 {e.event_dates}</p>}
  <Timeline phase={e.phase}/>
  {!tracking&&<div className="kt-results">{shown.map(r=><button type="button" key={r.id} onClick={()=>onPick(e,r)} title={r.kind==='winner'?'获奖（上游声称）':'Finalist（上游声称）'}><em>★</em>{r.kind==='winner'?r.award+' · ':''}{r.title}</button>)}{e.results.length>shown.length&&<span>+{e.results.length-shown.length}</span>}</div>}
  <footer>
   {tracking?<><span>{e.phase==='judging'?'尚未抓到 finalist / 获奖':'grok 发现于 '+new Date(e.discovered_at).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})}</span>
     <button type="button" className="kt-quiet" disabled={busy} onClick={()=>onUntrack(e)}>不再追踪</button>
     {e.url&&<a href={e.url} target="_blank" rel="noopener noreferrer">原始页面 ↗</a>}</>
    :<><span>{[e.finalists&&`Finalist ${e.finalists}`,e.winners&&`获奖 ${e.winners}`].filter(Boolean).join(' · ')}</span><button type="button" className="kw-primary" onClick={()=>onView(e)}>在项目库查看 {e.results.length} 个 →</button></>}
  </footer>
 </article>;
}

/* 10:00 Drive import: last run and anything waiting for a person. */
function DriveSync({s}){
 if(!s)return <p className="kt-sync">Drive 自动导入 · 每天 {'10:00'} · 还没有运行过</p>;
 const when=new Date(s.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 const added=s.imported.reduce((n,i)=>n+(i.records?Object.values(i.records).reduce((a,b)=>a+b,0):0),0);
 const last=s.status==='NO_NEW_BATCH'?'没有新批次':s.status==='ERROR'?'运行失败（'+s.code+'）':s.imported.length?'导入 '+s.imported.length+' 批，'+added+' 条':'未导入';
 return <div className={'kt-sync'+(s.pending.length||s.status==='ERROR'?' has-pending':'')} role="status">
  <p>Drive 自动导入 · 每天 {s.schedule} · 上次 {when}：{last}{s.service_restarted===false&&'，服务未能自动重启'}</p>
  {s.pending.map(p=><p key={(p.batch_id||'')+p.reason} className="kt-sync__item"><b>待处理</b>{p.batch_id||'未识别的批次'}：{p.label}{p.conflict?`（${p.conflict} 条）`:p.invalid?`（${p.invalid} 条）`:''}</p>)}
 </div>;
}
export default function HackathonTracker({data,open,onClose,onView,onPick,onUntrack,busy}){
 const [filter,setFilter]=useState('all'),[now,setNow]=useState(Date.now()),panel=useRef(null),anchor=useAnchor(open);
 // Remember what was "seen" before this opening, so 新 chips stay visible while the panel is open.
 const [seenAt,setSeenAt]=useState(0);
 useEffect(()=>{if(open){setSeenAt(data?.seen_at?new Date(data.seen_at).getTime():0);setNow(Date.now());setFilter('all');panel.current?.focus();}},[open]);
 useEffect(()=>{if(!open)return;const t=setInterval(()=>setNow(Date.now()),60000);const key=e=>{if(e.key==='Escape')onClose();};addEventListener('keydown',key);return()=>{clearInterval(t);removeEventListener('keydown',key);};},[open]);
 const events=data?.events||[];
 const groups=useMemo(()=>{
  const tracking=events.filter(isTracking).sort((a,b)=>(a.submission_deadline?(a.phase==='judging'?1:0):2)-(b.submission_deadline?(b.phase==='judging'?1:0):2)||String(a.submission_deadline).localeCompare(String(b.submission_deadline)));
  const results=events.filter(e=>!isTracking(e)).sort((a,b)=>String(b.first_result_at).localeCompare(String(a.first_result_at)));
  return {tracking,results};
 },[events]);
 if(!open)return null;
 const show=k=>filter==='all'||filter===k;
 return <>
  <div className="kt-scrim" style={anchor} onClick={onClose}/>
  <section className="kt-panel" style={anchor} role="dialog" aria-modal="false" aria-label="追踪 Hackathon" tabIndex={-1} ref={panel}>
   <div className="kt-grab" aria-hidden="true"/>
   <header>
    <div className="kt-head"><h3>追踪 Hackathon</h3><button type="button" aria-label="关闭追踪面板" onClick={onClose}>×</button></div>
    <p className="kt-meta"><i className={data?.last_delivery_at?'is-live':''}/>grok 上次交付 {ago(data?.last_delivery_at)} · 时间为 {tzLabel()}</p>
    <DriveSync s={data?.drive_sync}/>
    <div className="kt-seg" role="group" aria-label="筛选赛事">{[['all','全部',events.length],['tracking','追踪中',groups.tracking.length],['results','已有结果',groups.results.length]].map(([k,l,n])=><button type="button" key={k} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{l}<em>{n}</em></button>)}</div>
    <div className="kt-key"><span><b className="is-tracking"/>追踪中，还没有结果</span><span><b className="is-results"/>已抓到 finalist / 获奖</span></div>
   </header>
   <div className="kt-list">
    {show('tracking')&&<><div className="kt-group"><span>追踪中 · 按截止时间</span><span>{groups.tracking.length}</span></div>
     {groups.tracking.map(e=><Card key={e.id} e={e} seenAt={seenAt} now={now} onView={onView} onPick={onPick} onUntrack={onUntrack} busy={busy}/>)}
     {!groups.tracking.length&&<p className="kt-empty">还没有正在追踪的赛事。grok 交付带有 <code>hackathon_event</code> 的资料包后，新赛事会以黄色卡片出现在这里。</p>}</>}
    {show('results')&&<><div className="kt-group"><span>已有结果 · 最新在前</span><span>{groups.results.length}</span></div>
     {groups.results.map(e=><Card key={e.id} e={e} seenAt={seenAt} now={now} onView={onView} onPick={onPick} onUntrack={onUntrack} busy={busy}/>)}
     {!groups.results.length&&<p className="kt-empty">抓到 finalist 或获奖作品后，赛事会变成绿色。</p>}</>}
   </div>
  </section>
 </>;
}
