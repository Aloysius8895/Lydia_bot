import Icon from './Icon.jsx';
const safe=url=>/^https?:\/\//.test(url||'')?url:undefined;
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};
const SECTIONS=[['problem','要解决的问题'],['solution','提出的方案'],['implementation','如何实现']];

/** "项目简介 · AI 整理": problem / solution / implementation, written in the background from the project's own pages. */
function BriefCard({brief,onGenerate,onDeepDive}){
 const b=brief||{status:'queued'};
 if(b.status==='queued')return <section className="kw-brief is-empty" aria-label="项目简介">
  <header><strong>项目简介</strong><span>排队中</span></header>
  <p>{b.paused?'Claude 暂时不可用（登录或额度），恢复后会自动继续生成。':'后台正在逐个读取项目页面并整理简介，这个项目还在排队。'}</p>
  <button type="button" className="kw-primary" onClick={onGenerate}>✦ 优先生成</button>
  <small>读取项目页面后整理成：要解决的问题、提出的方案、如何实现 · 不会改动原始资料</small>
 </section>;
 if(b.status==='running')return <section className="kw-brief is-running" aria-label="项目简介" aria-busy="true">
  <header><strong>项目简介</strong><span>生成中</span></header>
  <p className="kw-brief__step"><i/>正在读取项目页面并整理…</p>
  {SECTIONS.map(([k,label])=><div key={k} className="kw-brief__sec"><h3>{label}</h3><b/><b/><b className="is-short"/></div>)}
 </section>;
 if(b.status==='failed')return <section className="kw-brief is-failed" aria-label="项目简介">
  <header><strong>项目简介</strong><span>未生成</span></header>
  <p>{b.error?.message||'这次没有生成成功。'}</p>
  {!!b.sources?.length&&<ul className="kw-brief__sources">{b.sources.map((s,i)=><li key={i} data-status={s.status}><span>{host(s.url)}</span><em>{s.reason||(s.status==='read'?'已读取':'')}</em></li>)}</ul>}
  <button type="button" className="kw-primary" onClick={onGenerate}>重试</button>
 </section>;
 const read=[...new Set((b.sources||[]).filter(s=>s.status==='read').map(s=>host(s.url)))];
 const date=b.generated_at?new Date(b.generated_at).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'';
 return <section className="kw-brief" aria-label="项目简介">
  <header><strong>项目简介</strong><span>AI 整理</span><button type="button" className="kw-brief__deep" title="让 Claude 读完项目页和 GitHub，给出更详细的解释" onClick={onDeepDive}>深入了解</button><button type="button" aria-label="重新生成简介" title="重新生成" onClick={onGenerate}>↻</button></header>
  {b.basis==='summary_only'&&<p className="kw-brief__warn">项目页面读不到，仅依据资料包摘要，信息有限</p>}
  {SECTIONS.map(([k,label])=><div key={k} className={'kw-brief__sec'+(b.missing?.includes(k)?' is-missing':'')}><h3>{label}</h3><p>{b[k]}</p></div>)}
  <footer>根据 {read.length?read.join('、'):'资料包摘要'} 整理 · {date} · 未独立核实</footer>
 </section>;
}

export default function KnowledgeMaterialDetails({active,selected,materialType,onAdd,onGenerateBrief,onDeepDive,briefStatus}){
 const news=active?.kind==='news'||(!active&&materialType==='news');
 const imported=active?.meta?.content_kind==='summary_only',meta=active?.meta||{};
 return <><div className="kw-detail__eyebrow">{news?'NEWS / 报道待核对':'HACKATHON / 项目自述'}</div>
  <h2>{active?.title||(selected?'正在读取资料…':news?'选择一条新闻':'选择一个比赛项目')}</h2>
  {!active?<><p className="knowledge-muted">点击书架上的资料查看正文与出处，拖入托盘或点击加入分析。可以混合新闻与比赛项目。</p>
   {!news&&briefStatus&&briefStatus.total>0&&<p className="kw-brief-progress">项目简介：已生成 {briefStatus.ready} / {briefStatus.total}{briefStatus.pending>0?(briefStatus.paused?' · Claude 暂不可用，稍后继续':' · 后台正在逐个生成'):''}{briefStatus.failed>0?` · ${briefStatus.failed} 个未成功`:''}</p>}</>:<>
   {!news&&<BriefCard brief={active.brief} onGenerate={()=>onGenerateBrief?.(active)} onDeepDive={()=>onDeepDive?.(active)}/>}
   <details className="kw-detail__package" open={news||undefined}><summary>资料包信息</summary>
    <p className="kw-detail__excerpt">{imported?'外部资料摘要（非原文）：'+meta.imported_summary:active.content?.slice(0,450)||'尚未取得完整正文。'}</p>
    {imported&&<><p className="knowledge-muted">仅摘要，未独立核实；取得原文前不能作为原文证据加入分析。</p><dl><dt>原始日期（按资料包记载）</dt><dd>{meta.original_date||'未提供'}</dd><dt>采集日期</dt><dd>{meta.collected_date||'未提供'}</dd><dt>分类</dt><dd>{meta.tags?.join(' · ')||'未提供'}</dd><dt>上游状态声称</dt><dd>{meta.source_claimed_status||'未提供'}</dd><dt>核实说明</dt><dd>{meta.verification_notes||'资料包未提供'}{meta.claims_note&&'；'+meta.claims_note}</dd></dl>{meta.imported_implementation&&<p className="kw-prewrap">资料包中的实现描述：{meta.imported_implementation}</p>}{meta.source_urls?.map((url,index)=><p key={index}><a href={safe(url)} target="_blank" rel="noreferrer">来源 {index+1}：{url}</a></p>)}</>}
   </details>
   <dl><dt>{news?'媒体 / 发布者':'采集平台'}</dt><dd>{active.source_id}</dd><dt>{news?'报道日期':'赛事'}</dt><dd>{news?(active.published_at||'未知，待核验'):(active.submissions?.map(s=>s.event_name).join(' · ')||'待核验')}</dd><dt>资料版本</dt><dd>v{active.revision} · {news?'新闻报道，非独立核实':active.quality}</dd></dl>
   <div className="kw-detail__actions">{safe(active.url)&&<a href={safe(active.url)} target="_blank" rel="noreferrer"><Icon name="link" size={15}/>原始来源</a>}<button className="kw-primary" type="button" disabled={imported} onClick={()=>onAdd(active)}>{imported?'需取得原文后分析':'＋ 加入分析'}</button></div>
   <details><summary>{news?'新闻正文与来源边界':'正文与直接资源'}</summary><p className="kw-prewrap">{active.content||'尚未取得原文。'}</p>{news&&!imported&&<p>此内容是报道或用户提供的原文。发布日期、地区与事实仍需按来源核对；报道不能直接证明用户愿意付费。</p>}{active.resources?.map(r=><p key={r.id}><a href={safe(r.url)} target="_blank" rel="noreferrer">{r.kind} · {r.url}</a></p>)}</details>
  </>}
 </>;
}
