import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function SourceLink({ url, children }) {
  try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return null; } catch { return null; }
  return <a href={url} target="_blank" rel="noopener noreferrer">{children || url}</a>;
}
export function Technical({ value, label = '查看记录与证据' }) {
  return <details className="crawl-record"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}

export default function CrawlProject({ id, activeCase, onClose, act, busy, watch }) {
  const [data, setData] = useState(null), [cases, setCases] = useState([]), [target, setTarget] = useState(activeCase || ''), [error, setError] = useState(''), [evidence, setEvidence] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([api(`/api/crawl/projects/${id}`), api('/api/cases'), api(`/api/crawl/projects/${id}/relations`)]).then(([project, list, graph]) => {
      if (live) { setData({ project, graph }); setCases(list); setTarget(list.some(c => c.id === activeCase) ? activeCase : list[0]?.id || ''); }
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id, activeCase]);
  const p = data?.project;
  return <section className="set-section crawl-project">
    <div className="set-section__head"><h3 className="set-section__title">{p?.title || '项目详情'}</h3><button type="button" className="set-btn" onClick={onClose}>返回列表</button></div>
    {error && <p role="alert">{error}</p>}
    {!p && !error && <p className="set-muted">正在加载项目…</p>}
    {p && <>
      <p className="set-muted">{p.meta.year || '年份待核验'} · {p.depth} · {p.quality}</p><SourceLink url={p.url}>查看原始来源</SourceLink>
      <div className="crawl-actions"><label className="crawl-field">导入目标案件<select aria-label="导入目标案件" value={target} onChange={e => setTarget(e.target.value)}>{!cases.length && <option value="">请先创建案件</option>}{cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <button type="button" className="set-btn" disabled={busy || !target} onClick={() => act(async () => watch(await api(`/api/cases/${target}/crawl-imports`, 'POST', { project_ids: [id], request_key: crypto.randomUUID() })))}>导入 PROJECT 资料</button>
        {p.meta.source_nature !== 'SOCIAL_POST' && <button type="button" className="set-btn" disabled={busy} onClick={() => act(async () => watch(await api(`/api/crawl/projects/${id}/enrich`, 'POST', {})))}>检查公开实现资料</button>}
      </div>
      <h4>{p.meta.source_nature === 'SOCIAL_POST' ? '推文正文' : '项目正文'}</h4><div className="crawl-content">{p.content || '尚未取得正文。'}</div>
      <h4>{p.meta.source_nature === 'SOCIAL_POST' ? '推文来源与可见互动' : '官方奖项与来源记录'}</h4><Technical value={p.meta.source_nature === 'SOCIAL_POST' ? { id: p.native_id, author: p.meta.author_handle, published_at: p.meta.published_at, metrics: p.meta.metrics, text_truncated: p.meta.text_truncated, coverage: p.meta.coverage } : { id: p.id, awards: p.awards, year_basis: p.meta.year_basis }} />
      <h4>直接资源</h4>{!p.resources.length && <p className="set-muted">没有已识别的直接资源。</p>}{p.resources.map(r => <div className="crawl-item" key={r.id}><SourceLink url={r.url} /><span className="set-muted">{r.kind} · {r.status}</span></div>)}
      <h4>证据关系</h4>{!data.graph.edges.length && <p className="set-muted">暂无已关联证据关系。</p>}{data.graph.edges.map(edge => <div className="crawl-item" key={edge.id}><span>{edge.relation_type} → {data.graph.nodes.find(n => n.id === edge.target_id)?.label || edge.target_id}</span>{edge.evidence_id && <button type="button" className="set-btn" disabled={busy} onClick={() => act(async () => setEvidence(await api(`/api/crawl/evidence/${edge.evidence_id}`)))}>查看关系证据</button>}</div>)}
      <h4>字段证据</h4><div className="crawl-actions">{p.evidence.map(e => <button type="button" className="set-btn" disabled={busy} key={e.id} onClick={() => act(async () => setEvidence(await api(`/api/crawl/evidence/${e.id}`)))}>{e.field} · {e.nature}</button>)}</div>
      {evidence && <Technical value={evidence} label="证据内容、快照与定位" />}
    </>}
  </section>;
}

export function ResultReview({ result: c, act, busy }) {
  const [project, setProject] = useState(''), [note, setNote] = useState('');
  return <article className="crawl-item">
    <strong>{c.project_name || c.project_native_id || '待识别项目'}</strong><p className="set-muted">{c.event_name} · {c.label} · {c.status}</p>
    {c.project_url && <SourceLink url={c.project_url}>项目来源</SourceLink>}<Technical value={c} />
    {c.status !== 'rejected' && <form className="crawl-form" onSubmit={e => { e.preventDefault(); act(() => api(`/api/crawl/results/${c.id}/review`, 'POST', { expected_revision: c.revision, action: 'match', project_id: project.trim(), note: note.trim() })); }}>
      <label className="crawl-field">核对后的项目 ID<input required value={project} onChange={e => setProject(e.target.value)} /></label>
      <label className="crawl-field">复核依据<input required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="crawl-actions"><button className="set-btn" disabled={busy}>匹配项目</button><button type="button" className="set-btn" disabled={busy || !note.trim()} onClick={() => act(() => api(`/api/crawl/results/${c.id}/review`, 'POST', { expected_revision: c.revision, action: 'reject', note: note.trim() }))}>驳回结果</button></div>
    </form>}
  </article>;
}
