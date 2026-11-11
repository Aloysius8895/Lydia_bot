import {useEffect,useMemo,useRef,useState} from 'react';
import Icon from './Icon.jsx';
import KnowledgeResults from './KnowledgeResults.jsx';
import ProjectMatch from './ProjectMatch.jsx';
import DetectiveIcon from './DetectiveIcon.jsx';

// Idea 实验台 / 我的 Idea / Lydia 研究 as one small page, laid out like Settings:
// a left list of sections and one scrollable content column.
export const WORKBENCH=[
 {id:'lab',label:'Idea 实验台',icon:'panel',eyebrow:'IDEA 实验台',desc:'把新闻变化和项目机制放在一起，生成待验证的新 idea。'},
 {id:'match',label:'相似与搭档',icon:'detective',eyebrow:'相似与搭档',desc:'选一个比赛项目，看库里谁和它撞车、谁能和它合体，哪条新闻给了它时机。'},
 {id:'ideas',label:'我的 Idea',icon:'star',eyebrow:'我的 IDEA',desc:'收藏的候选 idea：写备注、标状态，挑出值得深入的方向。'},
 {id:'research',label:'Lydia 研究',icon:'chat',eyebrow:'LYDIA 研究',desc:'把值得深入的 idea 交给 Lydia，在「商业逻辑」里做完整的商业研究。'},
];
const FIELDS={audience:'目标用户',region:'地区',skills:'团队技能',time:'可用时间',budget:'预算',theme:'比赛主题'};
const LIMIT={skills:500,time:120,budget:120,region:120};
export const IDEA_STATUS={explore:'待探索',shortlist:'优先研究',archived:'已归档'};
const day=s=>s?new Date(s).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}):'';

function Lab({tray,colorOf,onRemove,onNewCompare,constraints,setConstraints,analyze,canAnalyze,pending,run,stale,busy,onCancel,onSave,saved}){
 const projects=tray.filter(p=>p.kind!=='news').length,news=tray.length-projects;
 const hint=pending?'Lydia 正在比较这些资料…':tray.length<2?'至少放入 2 条资料（新闻和项目可以混合）':stale?'资料或条件有变化，重新分析后结果才会更新':'准备好了';
 return <>
  <section className="wb-section">
   <div className="wb-section__head"><h4>分析托盘</h4><span>{projects} 个项目 · {news} 条新闻 · 最多 6 条</span></div>
   {tray.length?<ol className="wb-tray">{tray.map((p,i)=><li key={p.id}>
     <b className="kw-tray__num" style={{'--book':colorOf(p)}}>{i+1}</b><em>{p.kind==='news'?'新闻':'项目'}</em>
     <span className="wb-tray__title">{p.title}<small>{p.source_id}</small></span>
     <button type="button" className="wb-icon" aria-label={'移除 '+p.title} onClick={()=>onRemove(p)}><Icon name="close" size={15}/></button>
    </li>)}</ol>
    :<p className="wb-muted wb-empty">托盘是空的。在项目库里长按或拖动资料到底部托盘，或在右侧详情点「加入分析」。</p>}
  </section>
  <section className="wb-section">
   <div className="wb-section__head"><h4>让建议更适合你</h4><span>都可以留空</span></div>
   <div className="wb-fields">{Object.keys(FIELDS).map(k=><label key={k}>{FIELDS[k]}<input value={constraints[k]} maxLength={LIMIT[k]||300} placeholder="未指定" onChange={e=>setConstraints(c=>({...c,[k]:e.target.value}))}/></label>)}</div>
  </section>
  <div className="wb-actions">
   <button className="kw-primary" type="button" disabled={!canAnalyze} onClick={analyze}>{pending?'分析中…':'分析并生成'}<span aria-hidden="true">↗</span></button>
   <button type="button" disabled={busy||(!tray.length&&!run)} onClick={onNewCompare}><Icon name="plus" size={15}/>新建比较</button>
   <span className="wb-muted">{hint}</span>
  </div>
  {run&&<section className="wb-section"><div className="wb-section__head"><h4>分析结果</h4><span>{day(run.created_at)}</span></div>
   <div className="wb-results"><KnowledgeResults run={run} stale={stale} busy={busy} onClose={()=>{}} onCancel={onCancel} onSave={onSave} saved={saved}/></div></section>}
 </>;
}

function Ideas({saved,focus,onUpdate,onResearch,onOpenCase,busy}){
 const [filter,setFilter]=useState('all'),[pick,setPick]=useState(focus||saved.find(i=>i.status!=='archived')?.id||saved[0]?.id||null),[note,setNote]=useState(''),[status,setStatus]=useState('explore');
 const list=useMemo(()=>saved.filter(i=>filter==='all'||i.status===filter),[saved,filter]);
 const idea=saved.find(i=>i.id===pick)||list[0]||null;
 useEffect(()=>{if(focus)setPick(focus);},[focus]);
 useEffect(()=>{setNote(idea?.note||'');setStatus(idea?.status||'explore');},[idea?.id,idea?.updated_at]);
 if(!saved.length)return <p className="wb-muted wb-empty">还没有收藏的 idea。在「Idea 实验台」生成结果后，点候选上的「收藏」，或把它拖到右侧的 Idea 书架。</p>;
 const c=idea?.snapshot?.candidate,dirty=idea&&(note!==idea.note||status!==idea.status);
 return <>
  <div className="wb-seg" role="group" aria-label="按状态筛选">{[['all','全部',saved.length],...Object.entries(IDEA_STATUS).map(([k,l])=>[k,l,saved.filter(i=>i.status===k).length])].map(([k,l,n])=><button type="button" key={k} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{l}<em>{n}</em></button>)}</div>
  <div className="wb-ideas">
   <ul className="wb-idea-list" aria-label="Idea 列表">{list.map(i=><li key={i.id}><button type="button" aria-current={idea?.id===i.id?'true':undefined} onClick={()=>setPick(i.id)}>
     <strong>{i.title}</strong><small><i className={'wb-dot is-'+i.status}/>{IDEA_STATUS[i.status]}{i.case_id?' · 已交给 Lydia':''} · {day(i.created_at)}</small></button></li>)}
    {!list.length&&<li className="wb-muted">这个状态下没有 idea。</li>}</ul>
   {idea&&<article className="wb-idea" aria-label={'Idea 详情 '+idea.title}>
    <span className="wb-eyebrow">候选 IDEA · 待验证</span><h4>{idea.title}</h4>
    {c?.summary&&<p>{c.summary}</p>}
    {(c?.difference||c?.first_test)&&<dl>{c.difference&&<><dt>和已有案例的差异</dt><dd>{c.difference}</dd></>}{c.first_test&&<><dt>第一步怎么验证</dt><dd>{c.first_test}</dd></>}</dl>}
    {!!idea.snapshot?.sources?.length&&<p className="wb-muted wb-sources">来源：{idea.snapshot.sources.map(s=>(s.kind==='news'?'[新闻] ':'')+s.title).join(' · ')}</p>}
    <label className="wb-field">我的备注<textarea aria-label="Idea 备注" value={note} maxLength={10000} rows={4} onChange={e=>setNote(e.target.value)}/></label>
    <label className="wb-field">状态<select aria-label="Idea 状态" value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(IDEA_STATUS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    <div className="wb-actions">
     <button type="button" disabled={busy||!dirty} onClick={()=>onUpdate(idea,{note,status})}>保存备注</button>
     {idea.case_id?<button type="button" onClick={()=>onOpenCase(idea.case_id)}>打开研究<span aria-hidden="true">↗</span></button>
      :<button className="kw-primary" type="button" disabled={busy} onClick={()=>onResearch(idea)}>交给 Lydia 研究<span aria-hidden="true">↗</span></button>}
    </div>
   </article>}
  </div>
 </>;
}

function Research({saved,onResearch,onOpenCase,onReturn,onSection,busy}){
 const waiting=saved.filter(i=>!i.case_id&&i.status!=='archived').sort((a,b)=>(a.status==='shortlist'?0:1)-(b.status==='shortlist'?0:1)||String(b.updated_at).localeCompare(String(a.updated_at)));
 const sent=saved.filter(i=>i.case_id);
 const row=(i,action)=><li key={i.id}><div><strong>{i.title}</strong><small><i className={'wb-dot is-'+i.status}/>{IDEA_STATUS[i.status]}{i.snapshot?.candidate?.summary?' · '+i.snapshot.candidate.summary:''}</small></div>{action}</li>;
 return <>
  <section className="wb-section">
   <div className="wb-section__head"><h4>等待研究</h4><span>优先研究排在前面</span></div>
   {waiting.length?<ul className="wb-rows">{waiting.map(i=>row(i,<button type="button" className="kw-primary" disabled={busy} onClick={()=>onResearch(i)}>交给 Lydia<span aria-hidden="true">↗</span></button>))}</ul>
    :<p className="wb-muted wb-empty">没有等待研究的 idea。先在<button type="button" className="wb-link" onClick={()=>onSection('ideas')}>「我的 Idea」</button>把想法标为「优先研究」。</p>}
  </section>
  <section className="wb-section">
   <div className="wb-section__head"><h4>已交给 Lydia</h4><span>{sent.length} 个</span></div>
   {sent.length?<ul className="wb-rows">{sent.map(i=>row(i,<button type="button" onClick={()=>onOpenCase(i.case_id)}>打开研究<span aria-hidden="true">↗</span></button>))}</ul>
    :<p className="wb-muted wb-empty">还没有交给 Lydia 的 idea。</p>}
  </section>
  <div className="wb-actions"><button type="button" onClick={onReturn}>打开商业逻辑<span aria-hidden="true">↗</span></button><span className="wb-muted">完整的研究、专家讨论和报告都在「商业逻辑」里。</span></div>
 </>;
}

export default function WorkbenchModal({section,onSection,onClose,...props}){
 const dialog=useRef(null),current=WORKBENCH.find(s=>s.id===section)||WORKBENCH[0];
 useEffect(()=>{
  const previous=document.activeElement;dialog.current?.focus();
  const key=e=>{if(e.key==='Escape')onClose();};addEventListener('keydown',key);
  return()=>{removeEventListener('keydown',key);previous?.focus?.();};
 },[]);
 const counts={lab:props.tray.length||'',match:'',ideas:props.saved.length||'',research:props.saved.filter(i=>!i.case_id&&i.status==='shortlist').length||''};
 return <div className="wb-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="wb-dialog" role="dialog" aria-modal="true" aria-labelledby="wb-title" tabIndex={-1} ref={dialog}>
   <header className="wb-dialog__header"><h2 id="wb-title">Hackathon 工作区</h2><button type="button" className="wb-icon" aria-label="关闭工作台" onClick={onClose}><Icon name="close"/></button></header>
   <div className="wb-dialog__body">
    <nav className="wb-nav" aria-label="工作台分类">{WORKBENCH.map(s=><button key={s.id} type="button" aria-current={s.id===current.id?'page':undefined} onClick={()=>onSection(s.id)}>
     {s.icon==='detective'?<DetectiveIcon size={20}/>:<Icon name={s.icon} size={18} strokeWidth={1.8}/>}<span>{s.label}</span>{counts[s.id]!==''&&<small>{counts[s.id]}</small>}</button>)}</nav>
    <div className="wb-content" key={current.id}>
     <div className="wb-heading"><span className="wb-eyebrow">HACKATHON 工作区 / {current.eyebrow}</span><h3>{current.label}</h3><p>{current.desc}</p></div>
     {current.id==='lab'&&<Lab {...props}/>}
     {current.id==='match'&&<ProjectMatch target={props.matchTarget} candidates={props.matchCandidates||[]} onTarget={props.onMatchTarget} onPair={props.onPair} trayIds={props.tray.map(p=>p.id)}/>}
     {current.id==='ideas'&&<Ideas {...props}/>}
     {current.id==='research'&&<Research {...props} onSection={onSection}/>}
    </div>
   </div>
  </div>
 </div>;
}
