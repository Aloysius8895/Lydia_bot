import { useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar } from './Avatars.jsx';
import { ProjectPicker } from './ResearchForms.jsx';

const labels = { SOURCE_SUPPORTED: '来源支持', RESEARCH_INFERENCE: '研究推断', TO_VALIDATE: '待验证假设' };
const tabs = [['project', '项目', 'folder'], ['sources', '资料', 'doc'], ['gaps', '缺口', 'target'], ['requirements', '企业要求', 'building']];
function Empty({ children }) { return <p className="panel__empty research-empty">{children}</p>; }
function Claim({ value }) { return <span className="research-badge">{labels[value] || '待验证'}</span>; }
function Detail({ data }) { return <details className="research-detail"><summary>查看详情与限制</summary><pre>{JSON.stringify(data, null, 2)}</pre></details>; }

export default function ResearchPanel({ snapshot, cases, active, onProjectChange, method, tab, onTab, onClose, onOpenSettings, busy, onAddSource, onRetrieve, onSelectGap }) {
  const [sourceMode, setSourceMode] = useState('text'), [title, setTitle] = useState(''), [content, setContent] = useState(''), [url, setUrl] = useState('');
  const [collection, setCollection] = useState('MARKET'), [query, setQuery] = useState(''), [results, setResults] = useState(null), [fileError, setFileError] = useState('');
  async function upload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    if (!/\.(txt|md|json|csv)$/i.test(file.name) || file.size > 1024 * 1024) { setFileError('请提供 1 MiB 以内的 TXT、MD、JSON 或 CSV 文件。'); return; }
    try { const text = await file.text(); if (text.length > 150000) throw new Error('文本超过 150,000 字符，请分批上传。'); setTitle(file.name); setContent(text); setFileError(''); } catch (error) { setFileError(error.message); }
    e.target.value = '';
  }
  async function add(e) {
    e.preventDefault();
    const ok = sourceMode === 'url' ? await onAddSource('sources', { url }) : await onAddSource('documents', { title, content, collection });
    if (ok) { setTitle(''); setContent(''); setUrl(''); }
  }
  const evidence = snapshot?.evidence.filter(e => e.active) || [];
  let body;
  if (tab === 'project') body = <>
    <section className="panel__section grok-project-summary"><h2 className="panel__heading">当前项目</h2><ProjectPicker cases={cases} active={active} onChange={onProjectChange} />
      {snapshot ? <><h3 className="research-title">{snapshot.case.title}</h3><p className="research-copy">{snapshot.case.brief}</p><div className="grok-metrics"><button type="button" onClick={() => onTab('sources')}><strong>{evidence.length}</strong><span>市场来源</span></button><button type="button" onClick={() => onTab('gaps')}><strong>{snapshot.gaps.length}</strong><span>候选缺口</span></button><button type="button" onClick={() => onTab('requirements')}><strong>{snapshot.requirements.length}</strong><span>企业要求</span></button></div><div className="grok-project-meta"><Icon name="folder" size={15} />{snapshot.case.meta.region || '研究地区待补充'}<span>{snapshot.tasks.filter(t => t.status === 'COMPLETED').length} 项任务已完成</span></div></> : <div className="grok-detail-empty"><Icon name="folder" size={28} /><strong>给这次研究一个起点</strong><Empty>创建项目或直接发送你的 idea，资料和研究记录会保存在当前工作区。</Empty></div>}
      <a className="btn-outline research-link" href="#/new"><Icon name="plus" size={16} />New project</a>
    </section><section className="panel__section"><h2 className="panel__heading">研究工具</h2><div className="grok-detail-actions"><button type="button" onClick={() => onTab('sources')}><Icon name="doc" size={20} /><span><strong>资料与引用</strong><small>上传、整理并检索证据</small></span><Icon name="chevronRight" size={16} /></button><button type="button" onClick={() => onTab('gaps')}><Icon name="target" size={20} /><span><strong>选择研究方向</strong><small>查看候选缺口与验证计划</small></span><Icon name="chevronRight" size={16} /></button></div></section><details className="panel__section grok-method-notes"><summary>这位顾问怎样工作</summary><p className="research-copy">{method.role}</p><p className="panel__empty">Steve 负责统一对接。只有你明确选定 Gap 后才进入商业模式；公开资料、研究推断与待验证假设分别记录。</p></details>
  </>;
  if (tab === 'sources') body = !active ? <Empty>请先创建项目，再添加来源或检索。</Empty> : <>
    <section className="panel__section"><h2 className="panel__heading">Add a source</h2><form id="source-form" className="research-form" onSubmit={add}>
      <label className="field"><span>资料方式</span><select aria-label="资料方式" value={sourceMode} onChange={e => setSourceMode(e.target.value)}><option value="text">文本 / 文件</option><option value="url">公开网页 URL</option></select></label>
      {sourceMode === 'url' ? <label className="field"><span>公开网页 URL</span><input name="url" type="url" required maxLength={2000} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} /></label> : <>
        <label className="field"><span>资料标题</span><input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="field"><span>原文</span><textarea name="content" rows={4} required maxLength={150000} value={content} onChange={e => setContent(e.target.value)} /></label>
        <label className="field"><span>资料类别</span><select aria-label="资料类别" value={collection} onChange={e => setCollection(e.target.value)}><option value="MARKET">市场 / 客户资料</option><option value="PROJECT">比赛 / 项目约束</option></select></label>
        <label className="file-input">选择文本文件<input aria-label="选择文本文件" type="file" accept=".txt,.md,.json,.csv" onChange={upload} /></label>{fileError && <p role="alert">{fileError}</p>}
      </>}
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? '正在处理…' : '添加并索引资料'}</button><p className="panel__empty">PDF 请先提取文本；项目约束单独索引，不计市场证据。</p>
    </form></section>
    <section className="panel__section"><h2 className="panel__heading">Search your evidence</h2><form className="research-form" onSubmit={async e => { e.preventDefault(); const value = await onRetrieve(query); if (value) setResults(value); }}><input aria-label="检索资料" required maxLength={500} placeholder="搜索需求、客户或采用条件" value={query} onChange={e => setQuery(e.target.value)} /><button className="btn-outline" type="submit" disabled={busy}>检索资料</button></form>
      {results && <div id="retrieval-results"><p className="panel__empty">{results.mode} · {results.reason}</p>{results.matches.length ? results.matches.map(m => <article className="research-card" key={m.chunk_id || m.id}><strong>{m.source_id} · {m.title}</strong><p>{m.content}</p></article>) : <Empty>没有足够相关的片段。</Empty>}</div>}
    </section>
    <section className="panel__section"><h2 className="panel__heading">Sources · {evidence.length}</h2>{evidence.map(e => <article className="research-card" key={e.id}><div className="research-card__head"><span className="research-badge">{e.source_id} · v{e.version}</span></div><h3>{e.title}</h3>{e.url && <a href={e.url} target="_blank" rel="noreferrer">查看原文 ↗</a>}<p>{e.content.slice(0, 480)}{e.content.length > 480 ? '…' : ''}</p><p className="panel__empty">{e.meta?.limitations || '来源尚需人工核对'}</p></article>)}{!evidence.length && <Empty>暂无市场证据。上传资料不等于已验证需求。</Empty>}{snapshot?.fetch_attempts.filter(a => a.status === 'FAILED').map(a => <article className="research-card" key={a.id}><strong>正文读取失败 · 不计证据</strong><p>{a.url}</p><p>{a.details?.code || 'FETCH_FAILED'}</p></article>)}</section>
  </>;
  if (tab === 'gaps') body = <section className="panel__section"><h2 className="panel__heading">Choose your direction</h2><p className="research-copy">“继续”不会自动选方向。只有点击明确选择后，才能启动商业模式研究。</p>
    {(snapshot?.gaps || []).map(g => <article className="research-card" key={g.id}><span className="research-badge">{g.id}</span> <Claim value={g.data.claim_label} /><h3>{g.data.name}</h3><p>{g.data.problem}</p><p>使用者：{g.data.users}<br />付款方：{g.data.payer}</p><p>证据：{g.data.evidence_ids?.join('、') || '暂无'}<br />首先验证：{g.data.first_validation_question}</p><Detail data={g.data} /><button className="btn-outline" disabled={busy || snapshot.case.selected_gap_id === g.id} onClick={() => onSelectGap(g)}>{snapshot.case.selected_gap_id === g.id ? `已选择 ${g.id}` : `选择 ${g.id} 并进入商业模式`}</button></article>)}
    {!snapshot?.gaps.length && <Empty>研究完成后，Steve 会在这里汇总候选缺口。</Empty>}{snapshot?.case.selected_gap_id && <p className="research-copy">当前选择：{snapshot.case.selected_gap_id}。可在聊天上方选择“商业模式”任务。</p>}
    {snapshot?.artifacts.filter(a => ['model', 'validation'].includes(a.kind) && a.selection_version === snapshot.case.selection_version).map(a => <article className="research-card" key={a.id}><h3>{a.kind === 'model' ? '一页商业模式' : '最小验证计划'}</h3><p>{a.content}</p></article>)}
  </section>;
  if (tab === 'requirements') body = <section className="panel__section"><h2 className="panel__heading">Company requirements</h2>{(snapshot?.requirements || []).map(r => <article className="research-card" key={r.id}><span className="research-badge">{r.id}</span> <Claim value={r.data.claim_label} /><h3>{r.data.statement}</h3><p>{r.data.company_or_segment} · {r.data.requesting_role}</p><p>优先级：{r.data.priority === 'EXPLICIT_MUST' ? '有明确来源的必需项' : r.data.priority === 'RECOMMENDED' ? '建议项' : '待确认'}<br />依据：{r.data.priority_basis || '未知'}<br />验收：{r.data.acceptance_criterion || '待验证'}</p><Detail data={r.data} /></article>)}{!snapshot?.requirements.length && <Empty>这里记录企业采用条件、决策方和对产品的具体要求；没有依据的指标保持未知。</Empty>}</section>;
  return <aside className="panel research-panel" aria-label="研究工作区">
    <div className="research-panel__header"><strong>Details</strong><div className="research-panel__tools"><button type="button" className="icon-btn" aria-label="打开设置" onClick={onOpenSettings}><Icon name="settings" size={18} /></button><button type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}><Icon name="close" size={18} /></button></div></div>
    <section className="grok-detail-profile"><BotAvatar color={method.color} size={64} /><div><h2>{method.name}</h2><span className="grok-detail-role">研究顾问 · 方法角色</span><p>{method.status}</p></div></section>
    <nav className="research-tabs" aria-label="研究页面">{tabs.map(([key, text, icon]) => <button type="button" key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => onTab(key)}><Icon name={icon} size={16} strokeWidth={1.8} />{text}</button>)}</nav>
    <div className="research-panel__body">{body}</div>
  </aside>;
}
