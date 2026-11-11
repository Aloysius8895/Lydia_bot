import {useEffect,useMemo,useRef,useState} from 'react';
import Icon from './Icon.jsx';
import RichText from './RichText.jsx';

// 成果: everything a project has produced, readable as documents. Research report → gap
// candidates (the user picks one) → business model and validation plan → 企业计划书.
const LABEL={SOURCE_SUPPORTED:['有资料支持','is-evidence'],RESEARCH_INFERENCE:['研究推断','is-research'],TO_VALIDATE:['待验证','is-assumption']};
const BASIS={evidence:['有资料支持','is-evidence'],research:['研究推断','is-research'],assumption:['待验证假设','is-assumption'],decision:['你的决定','is-decision']};
const ROLE={steve:'Steve Blank',teresa:'Teresa Torres',april:'April Dunford',bob:'Bob Moesta',ash:'Ash Maurya'};
const PLAN_SECTIONS={summary:'执行摘要',problem:'问题与机会',customer:'目标客户与付款方',solution:'解决方案',market:'市场与证据',competition:'竞争与替代方案',model:'商业模式',gtm:'进入市场',operations:'运营与所需资源',financials:'财务假设',risks:'主要风险',milestones:'验证计划与里程碑'};
const safe=url=>/^https?:\/\//.test(url||'')?url:undefined;
const date=v=>v?new Date(v).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const parse=a=>{try{return JSON.parse(a.content);}catch{return null;}};

function derive(s){
 if(!s)return null;
 const v=s.case.selection_version,tasks=s.tasks||[],arts=s.artifacts||[];
 const research=[...tasks].reverse().find(t=>t.kind==='research'&&t.status==='COMPLETED');
 const summary=research&&arts.filter(a=>a.kind==='summary'&&a.task_id===research.id).at(-1);
 const latest=kind=>arts.filter(a=>a.kind===kind&&a.selection_version===v).at(-1);
 const planArt=latest('business_plan'),plan=planArt&&parse(planArt);
 const running=tasks.filter(t=>['QUEUED','RUNNING'].includes(t.status));
 const gap=s.gaps.find(g=>g.id===s.case.selected_gap_id);
 return {research,summary,claims:research?s.claims.filter(c=>c.data.task_id===research.id):[],gap,model:latest('model'),validation:latest('validation'),planArt,plan,
  busy:{research:running.some(t=>t.kind==='research'),model:running.some(t=>t.kind==='model'),plan:running.some(t=>t.kind==='plan')}};
}

function Chip({id,refs,onRef}){
 const e=refs.evidence.get(id),c=refs.claims.get(id);
 return <button type="button" className="out-ref" title={e?e.title:c?c.data.statement:id} onClick={()=>onRef(id)}>{id}</button>;
}

function Steps({d,s,onGo}){
 const items=[['research','完整研究',!!d.research],['gaps','选择缺口',!!d.gap],['model','商业模式',!!d.model],['plan','企业计划书',!!d.plan]];
 const next=items.findIndex(i=>!i[2]);
 return <ol className="out-steps">{items.map(([id,label,done],i)=><li key={id} className={done?'is-done':i===next?'is-next':''}><button type="button" onClick={()=>onGo(id==='research'?'report':id)}><i>{done?'✓':i+1}</i>{label}</button></li>)}</ol>;
}

function ReportView({d,s,refs,onRef}){
 if(!d.research)return <Empty title="还没有完成的研究" text="在对话框打开「完整研究」后发送你的问题，5 位专家跑完后，研究报告会出现在这里。"/>;
 const byRole=Object.entries(d.claims.reduce((m,c)=>{(m[c.data.role]||=[]).push(c);return m;},{}));
 return <article className="out-doc">
  <header><small>研究报告</small><h1>{s.case.title}</h1><p className="out-meta">完成于 {date(d.research.updated_at)} · 问题：{d.research.input.message}</p>
   <p className="out-meta">依据 {s.evidence.length} 份资料 · {d.claims.length} 条发现 · {s.gaps.length} 个候选缺口</p></header>
  <section id="sec-summary"><h2>研究摘要</h2><RichText text={d.summary?.content||'（这次研究没有留下摘要）'}/></section>
  <section id="sec-findings"><h2>主要发现 <span>{d.claims.length}</span></h2>
   {byRole.map(([role,list])=><div key={role} className="out-group"><h3>{ROLE[role]||role} 方法</h3><ul className="out-claims">{list.map(c=>{const [l,cls]=LABEL[c.data.claim_label]||['',''];return <li key={c.id} className={cls}>
    <p><b>{c.id}</b> <span className="out-basis">{l}</span> {c.data.statement}</p>
    {!!c.data.evidence_ids?.length&&<p className="out-refs">依据：{c.data.evidence_ids.map(id=><Chip key={id} id={id} refs={refs} onRef={onRef}/>)}</p>}
    {c.data.limitations&&<p className="out-limit">局限：{c.data.limitations}</p>}</li>;})}</ul></div>)}
  </section>
  <section id="sec-gaps-brief"><h2>候选缺口 <span>{s.gaps.length}</span></h2><p>{s.gaps.length?'在「选择缺口」里逐个查看，选一个方向继续做商业模式。':'这次研究没有找到足够的缺口候选。'}</p></section>
  <footer className="out-foot">公开资料不等于真人访谈；「有资料支持」的主张仍需核对原文。</footer>
 </article>;
}

function GapsView({d,s,refs,onRef,onSelectGap,busy,onAddSources,onRerun}){
 const [confirm,setConfirm]=useState(null);
 if(!s.gaps.length)return d.research?<article className="out-doc out-empty"><h1>这次研究没有给出缺口</h1>
  <p>5 位专家认为现有资料不足以支持任何一个缺口，所以没有凑数。没有缺口就不能做商业模式和企业计划书。</p>
  <p>本项目现在只有 <b>{s.evidence.length}</b> 份资料{s.evidence.length===1?`（${s.evidence[0].source_id} ${s.evidence[0].title}）`:''}。缺口需要来自用户、竞品、价格或采购的外部资料。</p>
  <h3>怎么补</h3><ol className="out-todo"><li>打开联网搜索：在 设置 → 连接 点「确认搜索额度」（为防止超额扣费，每 24 小时确认一次），之后的研究会自动联网搜索。</li><li>自己添加资料：网址、访谈记录、竞品页面、报告（对话页右侧「资料」）。</li><li>补好资料后，在这里重新跑一次完整研究。</li></ol>
  <div className="out-row"><button type="button" className="out-btn" onClick={onAddSources}>去添加资料</button><button type="button" className="out-btn is-primary" disabled={busy||d.busy.research} onClick={onRerun}>{d.busy.research?'研究进行中…':'重新跑完整研究'}</button></div></article>
  :<Empty title="还没有缺口候选" text="完整研究跑完后，这里会列出候选缺口。"/>;
 return <article className="out-doc">
  <header><small>选择缺口</small><h1>选一个方向继续</h1><p className="out-meta">{d.gap?`已选 ${d.gap.id}：${d.gap.data.name}。换一个会让之后的商业模式和计划书重新生成。`:'选定之后，才能做商业模式和企业计划书。只会按你明确点选的结果继续。'}</p></header>
  {s.gaps.map(g=>{const sel=g.id===s.case.selected_gap_id,[l,cls]=LABEL[g.data.claim_label]||['',''];return <section key={g.id} id={'sec-'+g.id} className={'out-gap'+(sel?' is-selected':'')}>
   <h2><b>{g.id}</b> {g.data.name} {sel&&<em>已选</em>}</h2>
   <p><span className={'out-basis '+cls}>{l}</span> {g.data.problem}</p>
   <dl><dt>谁在用</dt><dd>{g.data.users}</dd><dt>谁付钱</dt><dd>{g.data.payer}</dd><dt>现在怎么做</dt><dd>{g.data.current_practice}</dd><dt>反面证据</dt><dd>{g.data.counterevidence||'未记录'}</dd><dt>先验证</dt><dd>{g.data.first_validation_question}</dd></dl>
   {!!g.data.evidence_ids?.length&&<p className="out-refs">依据：{g.data.evidence_ids.map(id=><Chip key={id} id={id} refs={refs} onRef={onRef}/>)}</p>}
   {!sel&&<button type="button" className="out-btn" disabled={busy} onClick={()=>setConfirm(g)}>选这个方向</button>}
  </section>;})}
  {confirm&&<div className="out-confirm" role="dialog" aria-label="确认选择缺口"><div><h3>确认选择 {confirm.id}？</h3><p>{confirm.data.name}</p><p className="out-meta">之后的商业模式和企业计划书都会建立在这个方向上。</p>
   <div className="out-row"><button type="button" className="out-btn" onClick={()=>setConfirm(null)}>再想想</button><button type="button" className="out-btn is-primary" onClick={()=>{onSelectGap(confirm);setConfirm(null);}}>确认选择</button></div></div></div>}
 </article>;
}

function TextView({kind,art,d,onStartModel,busy}){
 const title=kind==='model'?'商业模式':'验证计划';
 if(!art)return <Empty title={`还没有${title}`} text={d.gap?'已选定缺口，可以开始商业模式（Ash Maurya 方法，约 3–8 分钟），完成后同时得到商业模式和验证计划。':'先在「选择缺口」里选一个方向。'}
  action={d.gap&&!d.busy.model?<button type="button" className="out-btn is-primary" disabled={busy} onClick={onStartModel}>开始商业模式</button>:d.busy.model?<p className="out-meta">商业模式正在进行…</p>:null}/>;
 return <article className="out-doc"><header><small>{title}</small><h1>{d.gap?.data.name||title}</h1><p className="out-meta">基于缺口 {d.gap?.id} · 生成于 {date(art.created_at)}</p></header><section className="out-prose"><RichText text={art.content}/></section>
  <footer className="out-foot">商业模式和验证计划是研究推断，不是已验证的事实。</footer></article>;
}

function PlanView({d,s,refs,onRef,onGeneratePlan,busy,onExport}){
 if(!d.plan){
  const ready=d.gap&&d.model;
  const steps=[['完整研究',!!d.research,'report'],['选择一个缺口',!!d.gap,'gaps'],['商业模式（会同时生成验证计划）',!!d.model,'model']];
  return <Empty title="企业计划书" text={ready?'研究、缺口和商业模式都已完成。计划书会把它们整合成 12 章，每一段都标明依据：有资料支持、研究推断、待验证假设，或你的决定。约 1–2 分钟。':'企业计划书要建立在你选定的方向和商业模式上。完成下面的步骤后就能生成。'}
   action={<>{!ready&&<ol className="out-checklist">{steps.map(([l,ok])=><li key={l} className={ok?'is-done':''}><i>{ok?'✓':''}</i>{l}{ok?' · 已完成':''}</li>)}</ol>}
    <h3>计划书会写成 12 章</h3><p className="out-meta">{Object.values(PLAN_SECTIONS).join(' · ')}</p>
    <h3>每一段都标明依据</h3><div className="out-legend">{Object.entries(BASIS).map(([k,[l,cls]])=><span key={k} className={cls}><i/>{l}</span>)}</div>
    <p className="out-meta">资料里没有的价格、市场规模、客户数量不会编造，只会写成「待验证假设」，并在最后一章写明怎么验证。</p>
    {d.busy.plan?<p className="out-meta">企业计划书正在生成…</p>:ready?<button type="button" className="out-btn is-primary" disabled={busy} onClick={onGeneratePlan}>生成企业计划书</button>:null}</>}/>;
 }
 const p=d.plan,c=p.check?.counts||{};
 return <article className="out-doc out-plan">
  <header><small>企业计划书 · AI 整理</small><h1>{p.title}</h1><p className="out-lede">{p.one_liner}</p>
   <p className="out-meta">基于缺口 {d.gap?.id} 与商业模式 · 生成于 {date(p.generated_at)} · 用时 {Math.round((p.took_ms||0)/1000)} 秒</p>
   <div className="out-legend">{Object.entries(BASIS).map(([k,[l,cls]])=><span key={k} className={cls}><i/>{l} {c[k]||0} 段</span>)}</div>
   {p.check?.downgraded>0&&<p className="out-warn">{p.check.downgraded} 段原本标为「有资料支持」，但引用里没有原始资料，已改标为待验证假设。</p>}
   <div className="out-row out-export"><button type="button" className="out-btn" onClick={()=>onExport('docx')}><Icon name="copy" size={15}/>导出 Word</button><button type="button" className="out-btn" onClick={()=>onExport('pdf')}>打印 / 存成 PDF</button><button type="button" className="out-btn" onClick={()=>onExport('md')}>Markdown</button><button type="button" className="out-btn" disabled={busy||d.busy.plan} onClick={onGeneratePlan}>↻ 重新生成</button></div>
  </header>
  {p.sections.map(sec=><section key={sec.id} id={'sec-'+sec.id}><h2>{PLAN_SECTIONS[sec.id]||sec.id}</h2>
   {sec.paragraphs.map((x,i)=>{const [l,cls]=BASIS[x.basis];return <div key={i} className={'out-para '+cls}><p>{x.text}</p><p className="out-refs"><span className="out-basis">{l}</span>{x.refs.map(id=><Chip key={id} id={id} refs={refs} onRef={onRef}/>)}{x.note&&<em>{x.note}</em>}</p></div>;})}
  </section>)}
  {!!p.open_questions?.length&&<section id="sec-open"><h2>还没回答的关键问题</h2><ul>{p.open_questions.map((q,i)=><li key={i}>{q}</li>)}</ul></section>}
  <footer className="out-foot">计划书由 AI 依据本项目的研究整理，未独立核实。「待验证假设」必须先按验证计划验证，再作为决策依据。</footer>
 </article>;
}

function Empty({title,text,action}){return <article className="out-doc out-empty"><h1>{title}</h1><p>{text}</p>{action}</article>;}

/** Markdown / Word (HTML-based .doc) / print, built from what is on screen. */
function exportPlan(kind,d,s){
 const p=d.plan,refName=id=>id;
 const md=[`# ${p.title}`,'',p.one_liner,'',`> AI 整理，未独立核实。生成于 ${date(p.generated_at)}；基于缺口 ${d.gap?.id}。`,'',...p.sections.flatMap(sec=>[`## ${PLAN_SECTIONS[sec.id]}`,'',...sec.paragraphs.flatMap(x=>[`${x.text}`,'',`*${BASIS[x.basis][0]}${x.refs.length?' · '+x.refs.map(refName).join('、'):''}*`,''])]),
  ...(p.open_questions?.length?['## 还没回答的关键问题','',...p.open_questions.map(q=>'- '+q),'']:[]),'## 引用的资料','',...s.evidence.map(e=>`- ${e.source_id} ${e.title}${e.url?' — '+e.url:''}`)].join('\n');
 if(kind==='pdf'){window.print();return;}
 const name=(p.title||'企业计划书').replace(/[\\/:*?"<>|]/g,'');
 const blob=kind==='md'?new Blob([md],{type:'text/markdown;charset=utf-8'}):new Blob([`<html><head><meta charset="utf-8"><title>${name}</title></head><body>${document.querySelector('.out-plan')?.outerHTML||''}</body></html>`],{type:'application/msword'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+(kind==='md'?'.md':'.doc');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

export default function OutputsPage({snapshot,cases,active,onProjectChange,onBack,theme,onToggleTheme,busy,onSelectGap,onStartModel,onGeneratePlan,onAddSources,onRerun,isMobile,initialView}){
 const d=useMemo(()=>derive(snapshot),[snapshot]),[view,setView]=useState(initialView||'report'),[flash,setFlash]=useState(''),doc=useRef(null);
 useEffect(()=>{doc.current?.scrollTo?.(0,0);},[view,active]);
 const refs=useMemo(()=>({evidence:new Map((snapshot?.evidence||[]).map(e=>[e.source_id,e])),claims:new Map((snapshot?.claims||[]).map(c=>[c.id,c]))}),[snapshot]);
 const onRef=id=>{setFlash(id);document.getElementById('ref-'+id)?.scrollIntoView({block:'nearest',behavior:'smooth'});setTimeout(()=>setFlash(''),1600);};
 const used=useMemo(()=>{if(!d)return [];const ids=new Set();
  if(view==='report')d.claims.forEach(c=>c.data.evidence_ids?.forEach(i=>ids.add(i)));
  if(view==='gaps')snapshot.gaps.forEach(g=>g.data.evidence_ids?.forEach(i=>ids.add(i)));
  if(view==='plan'&&d.plan)d.plan.sections.forEach(s=>s.paragraphs.forEach(p=>p.refs.forEach(i=>ids.add(i))));
  return [...ids].filter(i=>refs.evidence.has(i)||refs.claims.has(i)).sort();},[d,view,snapshot,refs]);
 const outline=view==='plan'&&d?.plan?d.plan.sections.map(s=>[s.id,PLAN_SECTIONS[s.id]]):view==='report'?[['summary','研究摘要'],['findings','主要发现'],['gaps-brief','候选缺口']]:view==='gaps'?(snapshot?.gaps||[]).map(g=>[g.id,`${g.id} ${g.data.name}`]):[];
 const nav=d?[
  ['report','研究报告',d.research?date(d.research.updated_at):d.busy.research?'进行中…':'未完成'],
  ['gaps','选择缺口',d.gap?`已选 ${d.gap.id}`:`${snapshot.gaps.length} 个候选`],
  ['model','商业模式',d.model?'已完成':d.busy.model?'进行中…':'未开始'],
  ['validation','验证计划',d.validation?'已完成':'随商业模式生成'],
  ['plan','企业计划书',d.plan?'已生成':d.busy.plan?'生成中…':d.model?'可以生成':'未解锁'],
 ]:[];
 return <main className="outputs-page" aria-label="成果">
  <header className="out-top"><button type="button" className="out-brand" onClick={onBack} title="返回对话"><img src="/icons/icon.svg" alt="" width="26" height="26"/><strong>Lydia</strong></button><span className="out-divider"/><span className="out-name">成果</span>
   <select aria-label="选择项目" value={active} onChange={e=>onProjectChange(e.target.value)}>{!active&&<option value="">选择项目</option>}{cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>
   <span className="out-spacer"/><button type="button" className="out-btn" onClick={onBack}>← 返回对话</button><button type="button" className="out-icon" aria-label={theme==='dark'?'切换到白天模式':'切换到黑夜模式'} onClick={onToggleTheme}><Icon name={theme==='dark'?'moon':'sun'} size={18}/></button></header>
  {!d?<div className="out-layout"><Empty title="选择一个项目" text="成果按项目整理。先在上方选择项目。"/></div>:
  <div className="out-layout">
   <aside className="out-nav" aria-label="成果列表"><Steps d={d} s={snapshot} onGo={setView}/>
    <nav>{nav.map(([id,label,sub])=><button key={id} type="button" className={view===id?'is-active':''} onClick={()=>setView(id)}><span>{label}</span><small>{sub}</small></button>)}</nav>
    <p className="out-note">导出全部文件（Markdown/JSON 存档）仍在 设置 → 导出。</p></aside>
   <div className="out-reader" ref={doc}>
    {view==='report'&&<ReportView d={d} s={snapshot} refs={refs} onRef={onRef}/>}
    {view==='gaps'&&<GapsView d={d} s={snapshot} refs={refs} onRef={onRef} onSelectGap={onSelectGap} busy={busy} onAddSources={onAddSources} onRerun={()=>onRerun(d.research?.input?.message)}/>}
    {view==='model'&&<TextView kind="model" art={d.model} d={d} onStartModel={onStartModel} busy={busy}/>}
    {view==='validation'&&<TextView kind="validation" art={d.validation} d={d} onStartModel={onStartModel} busy={busy}/>}
    {view==='plan'&&<PlanView d={d} s={snapshot} refs={refs} onRef={onRef} onGeneratePlan={onGeneratePlan} busy={busy} onExport={k=>exportPlan(k,d,snapshot)}/>}
   </div>
   {!isMobile&&<aside className="out-side" aria-label="目录与引用">
    {!!outline.length&&<><h3>目录</h3><ol className="out-outline">{outline.map(([id,l])=><li key={id}><button type="button" onClick={()=>document.getElementById('sec-'+id)?.scrollIntoView({block:'start',behavior:'smooth'})}>{l}</button></li>)}</ol></>}
    <h3>引用的资料 <span>{used.length}</span></h3>
    {!used.length&&<p className="out-meta">这份文档没有引用资料编号。</p>}
    <ul className="out-sources">{used.map(id=>{const e=refs.evidence.get(id),c=refs.claims.get(id);return <li key={id} id={'ref-'+id} className={flash===id?'is-flash':''}><b>{id}</b>{e?<a href={safe(e.url)} target="_blank" rel="noreferrer">{e.title}</a>:<span>{c.data.statement.slice(0,90)}{c.data.statement.length>90?'…':''}</span>}</li>;})}</ul>
   </aside>}
  </div>}
 </main>;
}
