import Icon from './Icon.jsx';
const safe=url=>/^https?:\/\//.test(url||'')?url:undefined;
export default function KnowledgeMaterialDetails({active,selected,materialType,onAdd}){
 const news=active?.kind==='news'||(!active&&materialType==='news');
 return <><div className="kw-detail__eyebrow">{news?'NEWS / 报道待核对':'HACKATHON / 项目自述'}</div>
  <h2>{active?.title||(selected?'正在读取资料…':news?'选择一条新闻':'选择一个比赛项目')}</h2>
  {!active?<p className="knowledge-muted">点击书架上的资料查看正文与出处，拖入托盘或点击加入分析。可以混合新闻与比赛项目。</p>:<>
   <p className="kw-detail__excerpt">{active.content?.slice(0,450)||'尚未取得完整正文。'}</p>
   <dl><dt>{news?'媒体 / 发布者':'采集平台'}</dt><dd>{active.source_id}</dd><dt>{news?'报道日期':'赛事'}</dt><dd>{news?(active.published_at||'未知，待核验'):(active.submissions?.map(s=>s.event_name).join(' · ')||'待核验')}</dd><dt>资料版本</dt><dd>v{active.revision} · {news?'新闻报道，非独立核实':active.quality}</dd></dl>
   <div className="kw-detail__actions">{safe(active.url)&&<a href={safe(active.url)} target="_blank" rel="noreferrer"><Icon name="link" size={15}/>原始来源</a>}<button className="kw-primary" type="button" onClick={()=>onAdd(active)}>＋ 加入分析</button></div>
   <details><summary>{news?'新闻正文与来源边界':'正文与直接资源'}</summary><p className="kw-prewrap">{active.content}</p>{news&&<p>此内容是报道或用户提供的原文。发布日期、地区与事实仍需按来源核对；报道不能直接证明用户愿意付费。</p>}{active.resources?.map(r=><p key={r.id}><a href={safe(r.url)} target="_blank" rel="noreferrer">{r.kind} · {r.url}</a></p>)}</details>
  </>}
 </>;
}
