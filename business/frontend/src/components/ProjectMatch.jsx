import {useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../api.js';

// 「相似与搭档」 in the Hackathon workbench. One Claude call (only when the user asks) compares the
// target project with the whole library, or with every news item after reading each article's
// original from its source links; the result is stored and reopened for free.
// Radar = how alike the selected pair is on each axis; map = every returned match placed by
// its scores (positions and zones are computed by the backend, not chosen by Claude).
const ZONES={
 project:{
  duplicate:{label:'撞车',hint:'问题和做法都像',corner:'tl'},merge:{label:'合体',hint:'同一群人，做法不同',corner:'tr',best:true},
  transfer:{label:'搬运',hint:'做法像，问题不同',corner:'bl'},loose:{label:'关系不大',hint:'问题和做法都不同',corner:'br'},
 },
 news:{
  related:{label:'相关',hint:'对得上，但不是新变化',corner:'tl'},timely:{label:'时机',hint:'对得上，而且正是时候',corner:'tr',best:true},
  loose:{label:'关系不大',hint:'',corner:'bl'},distant:{label:'离得远',hint:'有变化，但离项目远',corner:'br'},
 },
};
const AXIS_TEXT={project:{x:'做法差异 →',y:'同一个问题 / 同一群人 →'},news:{x:'时机 →',y:'和项目的关联 →'}};
const MODES=[['project','作品 × 作品'],['news','作品 × 新闻']];
const day=s=>s?new Date(s).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}):'';
const url=(id,mode)=>'/api/knowledge/projects/'+encodeURIComponent(id)+'/match?mode='+mode;
const safe=u=>/^https?:\/\//.test(u||'')?u:undefined;

function Radar({axes,pair,average,count}){
 const W=340,H=290,cx=W/2,cy=H/2+4,R=96,n=axes.length;
 const pt=(i,v)=>{const a=-Math.PI/2+i*2*Math.PI/n,r=R*v/5;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];};
 const poly=vals=>axes.map((a,i)=>pt(i,vals[a.key]??0).join(',')).join(' ');
 return <svg className="pm-radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'各维度相似度：'+axes.map(a=>`${a.label} ${pair[a.key]} 分`).join('，')}>
  {[1,2,3,4,5].map(l=><polygon key={l} className={'pm-radar__ring'+(l===5?' is-outer':'')} points={axes.map((_,i)=>pt(i,l).join(',')).join(' ')}/>)}
  {axes.map((a,i)=>{const [x,y]=pt(i,5);return <line key={a.key} className="pm-radar__spoke" x1={cx} y1={cy} x2={x} y2={y}/>;})}
  {count>1&&<polygon className="pm-radar__avg" points={poly(average)}/>}
  <polygon className="pm-radar__pair" points={poly(pair)}/>
  {axes.map((a,i)=>{const [x,y]=pt(i,pair[a.key]??0);return <circle key={a.key} className="pm-radar__dot" cx={x} cy={y} r="4"/>;})}
  {axes.map((a,i)=>{const [x,y]=pt(i,5.9),c=Math.cos(-Math.PI/2+i*2*Math.PI/n);
   return <text key={a.key} className="pm-radar__label" x={x} y={y} textAnchor={Math.abs(c)<.2?'middle':c>0?'start':'end'} dominantBaseline="middle">{a.label}<tspan className="pm-radar__score" dx="5">{pair[a.key]}</tspan></text>;})}
 </svg>;
}

// Each dot sits at its scores, kept inside its own zone (away from the midlines and the corner
// labels). Dots with equal scores are nudged apart along a spiral, never into another zone.
function spread(points,min=26){
 const placed=[],clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 for(const p of points){const {box}=p;let k=0,px=clamp(p.px,box.x0,box.x1),py=clamp(p.py,box.y0,box.y1);
  while(placed.some(q=>Math.hypot(q.px-px,q.py-py)<min)&&k<80){k++;const a=k*2.4,r=8+k*2.6;px=clamp(p.px+r*Math.cos(a),box.x0,box.x1);py=clamp(p.py+r*Math.sin(a),box.y0,box.y1);}
  placed.push({...p,px,py});}
 return placed;
}
function MatchMap({mode,matches,selected,onSelect}){
 const W=380,H=340,L=34,T=14,PW=W-L-12,PH=H-T-34,zones=ZONES[mode],[hover,setHover]=useState(null);
 const box=zone=>{const c=zones[zone]?.corner||'br',right=c.endsWith('r'),top=c.startsWith('t'),mx=L+PW/2,my=T+PH/2;
  return {x0:(right?mx:L)+14,x1:(right?L+PW:mx)-14,y0:(top?T+32:my+14),y1:(top?my-14:T+PH-28)};};
 const pts=useMemo(()=>spread(matches.map((m,i)=>({m,i,box:box(m.zone),px:L+m.x*PW,py:T+(1-m.y)*PH}))),[matches]);
 const corner={tl:[L+8,T+18,'start'],tr:[L+PW-8,T+18,'end'],bl:[L+8,T+PH-10,'start'],br:[L+PW-8,T+PH-10,'end']};
 const best=Object.values(zones).find(z=>z.best),h=pts.find(p=>p.m.id===hover);
 return <div className="pm-map">
  <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="搭档地图">
   <rect className="pm-map__plot" x={L} y={T} width={PW} height={PH}/>
   <rect className="pm-map__best" x={best.corner.endsWith('r')?L+PW/2:L} y={T} width={PW/2} height={PH/2}/>
   <line className="pm-map__mid" x1={L+PW/2} y1={T} x2={L+PW/2} y2={T+PH}/><line className="pm-map__mid" x1={L} y1={T+PH/2} x2={L+PW} y2={T+PH/2}/>
   {Object.entries(zones).map(([k,z])=>{const [x,y,a]=corner[z.corner];return <text key={k} className={'pm-map__zone'+(z.best?' is-best':'')} x={x} y={y} textAnchor={a}>{z.best?'★ ':''}{z.label}{z.hint&&<tspan className="pm-map__hint" dx="6">{z.hint}</tspan>}</text>;})}
   <text className="pm-map__axis" x={L+PW} y={H-8} textAnchor="end">{AXIS_TEXT[mode].x}</text>
   <text className="pm-map__axis" x={14} y={T+PH} transform={`rotate(-90 14 ${T+PH})`}>{AXIS_TEXT[mode].y}</text>
   {pts.map(({m,i,px,py})=><g key={m.id} className={'pm-map__dot'+(m.id===selected?' is-selected':'')} data-corner={zones[m.zone]?.corner} role="button" tabIndex={0} aria-pressed={m.id===selected}
     aria-label={`第 ${i+1} 名 ${m.title}，${zones[m.zone]?.label}`} onClick={()=>onSelect(m.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(m.id);}}}
     onPointerEnter={()=>setHover(m.id)} onPointerLeave={()=>setHover(null)} onFocus={()=>setHover(m.id)} onBlur={()=>setHover(null)}>
    <circle className="pm-map__hit" cx={px} cy={py} r="16"/><circle className="pm-map__mark" cx={px} cy={py} r="11"/>
    <text x={px} y={py} textAnchor="middle" dominantBaseline="central">{i+1}</text>
   </g>)}
  </svg>
  {h&&<div className="pm-map__tip" style={{left:(h.px/W*100)+'%',top:(h.py/H*100)+'%'}} role="tooltip"><b>{h.i+1}. {h.m.title}</b><span>{zones[h.m.zone]?.label} · {h.m.source}{h.m.published_at?' · '+h.m.published_at:''}</span></div>}
 </div>;
}

function Quotes({title,items,news}){
 return <div className="pm-quotes"><h5>{title}{news&&<em>原文读不到，只有 Grok 摘要</em>}</h5>
  <ul>{items.map((q,i)=><li key={i}>“{q.quote}”<cite>{safe(q.url)?<a href={safe(q.url)} target="_blank" rel="noreferrer">{q.label} ↗</a>:q.label}</cite></li>)}</ul></div>;
}

export default function ProjectMatch({target,candidates,onTarget,onPair,trayIds=[]}){
 const [mode,setMode]=useState('project'),[state,setState]=useState({}),[pick,setPick]=useState({}),[now,setNow]=useState(Date.now());
 const key=target?target.id+'|'+mode:'',s=state[key]||{status:'loading'};
 const load=(method='GET')=>api(url(target.id,mode),method,method==='POST'?{}:undefined).then(r=>setState(o=>({...o,[key]:r}))).catch(e=>setState(o=>({...o,[key]:{status:'failed',error:{message:e.message}}})));
 useEffect(()=>{if(target)void load();},[key]);
 const busy=s.status==='queued'||s.status==='running';
 useEffect(()=>{if(!busy)return;const t=setInterval(()=>{setNow(Date.now());},1000),p=setInterval(()=>void load(),2500);return()=>{clearInterval(t);clearInterval(p);};},[key,busy]);
 const result=s.status==='ready'?s.result:null,matches=result?.matches||[];
 const selected=matches.find(m=>m.id===pick[key])||matches[0]||null;
 const average=useMemo(()=>Object.fromEntries((result?.axes||[]).map(a=>[a.key,matches.length?matches.reduce((t,m)=>t+m.axes[a.key],0)/matches.length:0])),[result]);
 const zones=ZONES[mode],picked=selected&&zones[selected.zone];
 if(!target)return <section className="wb-section">
  <p className="wb-muted wb-empty">先选一个比赛项目。在项目库里点开一个项目，按详情里的「相似与搭档」；或者从下面挑一个。</p>
  {!!candidates.length&&<ul className="wb-rows">{candidates.map(p=><li key={p.id}><div><strong>{p.title}</strong><small>{p.source_id}</small></div><button type="button" onClick={()=>onTarget(p)}>选这个</button></li>)}</ul>}
 </section>;
 const inTray=selected&&[target.id,selected.id].every(id=>trayIds.includes(id));
 return <>
  <div className="pm-target">
   <span className="pm-target__label">目标作品</span><strong>{target.title}</strong><small>{target.source_id}</small>
   <div className="wb-seg pm-modes" role="group" aria-label="比较对象">{MODES.map(([k,l])=><button key={k} type="button" aria-pressed={mode===k} onClick={()=>setMode(k)}>{l}</button>)}</div>
  </div>

  {s.status==='loading'&&<p className="wb-muted">读取中…</p>}
  {s.status==='none'&&<section className="pm-start">
   <h4>{mode==='project'?`把 ${target.title} 和库里其他 ${s.candidates??''} 个作品比一遍`:`看看库里 ${s.candidates??''} 条新闻里，哪条和 ${target.title} 有关`}</h4>
   <p>{mode==='project'?'Claude 会读每个作品的简介和原文摘录，挑出最值得看的最多 10 个：可能重复的（撞车）、同一群人但做法不同的（合体）、技术相同但问题不同的（搬运）。':'Claude 会先读每条新闻的原文链接（第一次要读所有网页，之后会记住），再挑出和这个作品有关的，引用的句子必须出自原文。读不到原文的新闻只能用 Grok 摘要，结果里会标明。'}</p>
   <div className="wb-actions"><button className="kw-primary" type="button" onClick={()=>void load('POST')}>让 Claude 比一比<span aria-hidden="true">↗</span></button><span className="wb-muted">用 1 次 Claude 额度 · {mode==='project'?'约 20 秒':'第一次约 1 分钟，之后约 20 秒'} · 结果会保存，之后打开不再花额度</span></div>
  </section>}
  {busy&&<section className="pm-start is-running" aria-busy="true"><h4>{s.status==='queued'?'排队中…':'Claude 正在比较…'}</h4><p>{s.steps?.length?s.steps[s.steps.length-1]+'。':''}{s.started_at&&s.status==='running'?`已用 ${Math.max(0,Math.round((now-new Date(s.started_at).getTime())/1000))} 秒。`:''}可以先关掉这个窗口，后台会继续。</p><div className="pm-skeleton"><b/><b/></div></section>}
  {s.status==='failed'&&<section className="pm-start is-failed"><h4>这次没有比较成功</h4><p>{s.error?.message}</p><div className="wb-actions"><button className="kw-primary" type="button" onClick={()=>void load('POST')}>重试</button></div></section>}

  {result&&<>
   <div className="pm-summary"><span aria-hidden="true">✦</span><p>{result.summary}</p></div>
   {s.added>0&&<p className="pm-added">这次比较之后，库里新增了 {s.added} {mode==='project'?'个作品':'条新闻'}，它们还没算进来。<button type="button" className="wb-link" onClick={()=>void load('POST')}>重新比较（用 1 次额度）</button></p>}
   {!matches.length?<p className="wb-muted wb-empty">没有找到足够相关的{mode==='project'?'作品':'新闻'}。</p>:<>
   <div className="pm-charts">
    <figure className="pm-card">
     <figcaption><span className="pm-card__eyebrow">相似度雷达</span><strong>{target.title} × {selected.title}</strong>{picked&&<em className={'pm-zone'+(picked.best?' is-best':'')}>{picked.best?'★ ':''}{picked.label}</em>}</figcaption>
     <Radar axes={result.axes} pair={selected.axes} average={average} count={matches.length}/>
     <p className="pm-legend"><span><i className="pm-key is-pair"/>这一对</span>{matches.length>1&&<span><i className="pm-key is-avg"/>这 {matches.length} 个的平均</span>}<span>0 = 完全不同 · 5 = 几乎一样</span></p>
    </figure>
    <figure className="pm-card">
     <figcaption><span className="pm-card__eyebrow">搭档地图</span><strong>{matches.length} 个{mode==='project'?'作品':'新闻'}</strong><span className="pm-card__note">点圆点切换左边的雷达</span></figcaption>
     <MatchMap mode={mode} matches={matches} selected={selected.id} onSelect={id=>setPick(p=>({...p,[key]:id}))}/>
     <p className="pm-legend"><span>{mode==='project'?'越往上，越是同一个问题和同一群人；越往右，做法越不同':'越往上，和项目越相关；越往右，越是现在需要它的时机'}</span></p>
    </figure>
   </div>

   <section className="pm-detail" aria-label={'依据：'+selected.title}>
    <div className="pm-detail__head"><h4>{matches.indexOf(selected)+1}. {selected.title}<small>{selected.source}{selected.published_at?' · '+selected.published_at:''}</small></h4>
     <button className="kw-primary" type="button" disabled={inTray} onClick={()=>onPair([target,selected])}>{inTray?'已在分析托盘':'放进分析托盘'}<span aria-hidden="true">↗</span></button></div>
    <p>{selected.reason}</p>
    {selected.combo&&<p className="pm-combo"><b>放在一起可能是</b>{selected.combo}<em>待验证</em></p>}
    <div className="pm-evidence"><Quotes title={target.title+' 原文'} items={selected.evidence.target}/><Quotes title={selected.title+(selected.basis==='summary'?'':' 原文')} items={selected.evidence.match} news={selected.basis==='summary'}/></div>
   </section>

   <section className="wb-section">
    <div className="wb-section__head"><h4>全部 {matches.length} 个</h4><span>按 Claude 认为值得看的程度排序</span></div>
    <ol className="pm-list">{matches.map((m,i)=><li key={m.id}><button type="button" aria-current={m.id===selected.id?'true':undefined} onClick={()=>setPick(p=>({...p,[key]:m.id}))}>
     <b>{i+1}</b><span className="pm-list__title"><strong>{m.title}</strong><small>{m.reason}</small></span><em className={'pm-zone'+(zones[m.zone]?.best?' is-best':'')}>{zones[m.zone]?.label}</em></button></li>)}</ol>
   </section>
   </>}
   <p className="pm-foot">分数是 Claude 根据简介和原文摘录做的判断，表示"有多像"，不代表好坏，也不是市场验证。{mode==='news'&&result.news_read&&`新闻依据原文：${result.news_read.original} 条读到原文${result.news_read.summary?`，${result.news_read.summary} 条读不到、只用 Grok 摘要`:''}。`}程序核对：Claude 给了 {result.check.returned} 个，{result.check.dropped?`${result.check.dropped} 个因为引用对不上原文被去掉，`:'引用全部对得上原文，'}保留 {result.check.kept} 个。{result.model.replace('claude-','').replace('-5-5',' 5.5')} · {Math.round(result.took_ms/1000)} 秒 · {day(result.generated_at)}
    <button type="button" className="wb-link" onClick={()=>void load('POST')}>重新比较（再用 1 次额度）</button></p>
  </>}
 </>;
}
