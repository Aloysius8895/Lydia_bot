import {useEffect,useState} from 'react';
import Icon from './Icon.jsx';

export default function KnowledgeResults({run,stale,onClose,onCancel,onSave,saved,busy}){
 const [tab,setTab]=useState('ideas');
 useEffect(()=>setTab('ideas'),[run?.id]);
 if(!run)return null;
 const sources=run.sources||[],pending=['queued','running'].includes(run.status);
 const sourceNames=ids=>ids.map(id=>{const s=sources.find(s=>s.id===id);return s?(s.kind==='news'?'[新闻] ':'[项目] ')+s.title:'未知来源';}).join(' · ');
 return <section className="knowledge-results" aria-label="Idea 分析结果">
  <header><div><small>IDEA LAB / 案例启发</small><h2>从共同点，到新的可能</h2></div><button className="kw-icon" type="button" aria-label="收起分析结果" onClick={onClose}><Icon name="chevronDown"/></button></header>
  {stale&&<p className="kw-alert">这份结果基于上一组项目或条件。重新分析后才会更新。</p>}
  {pending?<div className="knowledge-generating" role="status"><span className="kw-spinner"/><h3>{run.status==='queued'?'正在排队':'Lydia 正在比较这些案例'}</h3><p>读取已选版本、核对共同点与差异，再提出待验证方向。</p><button type="button" onClick={onCancel}>取消分析</button></div>:run.status!=='completed'?<div className="kw-empty"><h3>{run.status==='cancelled'?'分析已取消':run.status==='interrupted'?'服务重启，分析已中断':'这次分析没有完成'}</h3><p>{run.error?.message||'已保留项目选择，你可以重新分析。'}</p></div>:<>
   <nav className="kw-tabs" aria-label="分析结果分类"><button type="button" aria-pressed={tab==='ideas'} onClick={()=>setTab('ideas')}>候选 Idea <small>{run.output.ideas.length}</small></button><button type="button" aria-pressed={tab==='patterns'} onClick={()=>setTab('patterns')}>共同点与差异</button><button type="button" aria-pressed={tab==='sources'} onClick={()=>setTab('sources')}>来源与条件</button></nav>
   <div className="knowledge-results__body">
   {tab==='ideas'&&<><p className="knowledge-muted">这些是案例启发的假设，尚不代表真实需求已得到验证。</p>{!run.output.ideas.length&&<p>资料不足以提出有依据的候选。请查看共同点与资料缺口。</p>}
    {run.output.ideas.map((idea,index)=>{const kept=saved.some(s=>s.run_id===run.id&&s.candidate_index===index);return <article className="knowledge-candidate" key={index} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-lydia-idea',String(index));e.dataTransfer.effectAllowed='copy';}}>
     <span className="kw-drag" aria-hidden="true">⠿</span><div><span className="kw-eyebrow">IDEA {String(index+1).padStart(2,'0')} <i>待验证</i></span><h3>{idea.title}</h3><p>{idea.summary}</p><small>来源：{sourceNames(idea.source_project_ids)}</small>{idea.news_angle&&<p className="kw-news-angle"><strong>新闻启发：</strong>{idea.news_angle}</p>}<p className="kw-first-test">第一步验证：{idea.first_test}</p><details><summary>适配理由与最小演示</summary><dl><dt>目标用户</dt><dd>{idea.users}</dd><dt>与案例的差异</dt><dd>{idea.difference}</dd><dt>为什么适合</dt><dd>{idea.fit}</dd><dt>最小演示</dt><dd>{idea.mvp}</dd></dl><h4>待验证假设</h4><ul>{idea.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul></details></div>
     <button type="button" disabled={busy||kept} onClick={()=>onSave(index)}><Icon name="star" size={16}/>{kept?'已收藏':'收藏'}</button>
    </article>;})}</>}
   {tab==='patterns'&&<>{[['共同点',run.output.commonalities],['差异',run.output.differences]].map(([label,items])=><div key={label}><h3>{label}</h3>{!items.length&&<p className="knowledge-muted">未找到有足够依据的{label}。</p>}{items.map((p,i)=><article className="knowledge-pattern" key={i}><p>{p.statement}</p><small>{p.project_ids.length===sources.length?'全部选中项目':'部分案例'} · {sourceNames(p.project_ids)}</small><details><summary>查看原文依据</summary>{p.quotes.map((q,n)=><blockquote key={n}><strong>{sourceNames([q.project_id])}</strong><p>{q.quote}</p></blockquote>)}</details></article>)}</div>)}<h3>局限与资料缺口</h3><ul>{run.output.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul></>}
   {tab==='sources'&&<><h3>输入版本快照</h3>{sources.map(s=><article className="knowledge-pattern" key={s.id}><strong>{s.title}</strong><p>版本 {s.revision} · {s.truncated?'正文截取前 12000 字符':'完整项目正文'}</p><a href={/^https?:\/\//.test(s.url)?s.url:undefined} target="_blank" rel="noreferrer">打开原项目</a><details><summary>分析使用的正文</summary><p className="kw-prewrap">{s.content}</p></details></article>)}<h3>分析条件</h3><dl>{Object.entries(run.constraints).map(([k,v])=><div key={k}><dt>{{audience:'目标用户',region:'地区',skills:'团队技能',time:'时间',budget:'预算',theme:'主题'}[k]}</dt><dd>{v||'未指定'}</dd></div>)}</dl></>}
   </div>
  </>}
 </section>;
}
