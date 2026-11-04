import { useState } from 'react';
import Icon from './Icon.jsx';

function ProjectIntake({ caseId, busy, onAdd }) {
  const [mode, setMode] = useState('text'), [title, setTitle] = useState(''), [content, setContent] = useState(''), [url, setUrl] = useState(''), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  async function readFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (!/\.(txt|md|json|csv)$/i.test(file.name) || file.size > 1024 * 1024) throw Error('请上传 1 MiB 以内的 TXT、MD、JSON 或 CSV；PDF 请先提取文字。');
      const text = await file.text(); if (text.length > 150000) throw Error('文本超过 150,000 字符，请分批上传。');
      setTitle(file.name); setContent(text); setError(''); setSaved(false);
    } catch (e) { setError(e.message); }
    event.target.value = '';
  }
  async function submit(event) {
    event.preventDefault(); setSaved(false); setError('');
    const result = await onAdd(caseId, mode === 'url' ? 'sources' : 'documents', mode === 'url' ? { url, collection: 'PROJECT' } : { title, content, collection: 'PROJECT' });
    if (result !== false) { setTitle(''); setContent(''); setUrl(''); setSaved(true); }
  }
  return <section className="projects-materials"><h3>添加项目资料</h3><p>放入比赛 brief、规则、项目说明或实现资料。Steve 会将它们作为当前项目的背景与约束。</p>
    <div className="projects-intake-tabs" role="group" aria-label="项目资料方式"><button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>文本 / 文件</button><button type="button" aria-pressed={mode === 'url'} onClick={() => setMode('url')}>公开链接</button></div>
    <form className="projects-intake" onSubmit={submit}>
      {mode === 'url' ? <label>项目资料链接<input type="url" required maxLength={2000} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label> : <>
        <label className="projects-upload"><Icon name="plus" size={18} /><span>选择文本文件<small>TXT / MD / JSON / CSV · 最大 1 MiB</small></span><input aria-label="上传项目文件" type="file" accept=".txt,.md,.json,.csv" onChange={readFile} disabled={busy} /></label>
        <label>资料标题<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：比赛 brief / 项目技术说明" /></label>
        <label>资料正文<textarea required rows={6} maxLength={150000} value={content} onChange={e => setContent(e.target.value)} placeholder="粘贴项目内容，或先选择一个文件。" /></label>
      </>}
      {error && <p role="alert">{error}</p>}{saved && <p role="status">已保存到此项目，Steve 讨论时可以读取。</p>}
      <button type="submit" className="set-btn set-btn--primary" disabled={busy}>{busy ? '正在保存…' : '保存到项目'}</button>
    </form>
  </section>;
}

export default function ProjectsPage({ cases, active, snapshot, query, onQuery, onSelect, onDiscuss, onAdd, busy, onSettings }) {
  const selected = cases.find(c => c.id === active), current = snapshot?.case.id === active ? snapshot : null;
  const list = cases.filter(c => !query.trim() || (c.title + ' ' + c.brief).toLowerCase().includes(query.trim().toLowerCase()));
  return <main className="main projects-page">
    <header className="projects-page__header"><div><a className="projects-mobile-back" href="#/" aria-label="Back to bots"><Icon name="back" size={18} /></a><span className="grok-eyebrow">YOUR WORKSPACE</span><h1>Projects</h1><p>先整理项目资料，再和 Steve 针对这个项目讨论与执行。</p></div><div><button type="button" className="icon-btn projects-mobile-settings" aria-label="Settings" onClick={onSettings}><Icon name="settings" /></button><a className="set-btn" href="#/new" aria-label="New project"><Icon name="plus" size={16} />新建项目</a></div></header>
    <div className="projects-page__body"><section className="projects-list" aria-label="项目列表"><label className="projects-list__search"><Icon name="search" size={17} /><input type="search" aria-label="搜索项目" value={query} onChange={e => onQuery(e.target.value)} placeholder="搜索项目" /></label>
      <div className="projects-list__items">{list.map(c => <button type="button" className="projects-list__item" key={c.id} aria-label={c.title} aria-pressed={c.id === active} onClick={() => onSelect(c.id)} disabled={busy}><Icon name="folder" size={19} /><span><strong>{c.title}</strong><small>{c.brief.slice(0,90)}</small></span><Icon name="chevronRight" size={15} /></button>)}
        {!list.length && <div className="projects-empty"><Icon name="folder" size={28} /><strong>{query ? '没有匹配的项目' : '先创建一个研究项目'}</strong><p>每个项目的资料、对话和执行记录分别保存。</p>{!cases.length && <a href="#/new" className="set-btn">创建项目</a>}</div>}
      </div>
    </section><section className="projects-detail" aria-label="项目资料">
      {selected ? <><div className="projects-detail__heading"><Icon name="folder" size={28} /><h2>{selected.title}</h2><p>{selected.brief}</p><button type="button" className="set-btn set-btn--primary" disabled={busy || !current} onClick={() => onDiscuss(selected.id)}><Icon name="chat" size={17} />与 Steve 讨论此项目</button><small>打开讨论不会自动执行任务；发送消息后才会执行。</small></div>
        <ProjectIntake key={selected.id} caseId={selected.id} busy={busy} onAdd={onAdd} />
        <section className="projects-documents"><h3>已保存的项目资料</h3>{!current ? <p>正在加载资料…</p> : <>{current.project_documents.map(doc => <details key={doc.id}><summary><Icon name="doc" size={17} /><span>{doc.title}</span><small>PROJECT · v{doc.version}</small></summary><pre>{doc.content}</pre>{doc.character_count > doc.content.length && <p>当前显示前 {doc.content.length} 字；完整内容已保存，可供项目检索。</p>}</details>)}{!current.project_documents.length && <p>尚未添加附件。上面的项目 brief 已作为讨论背景保存。</p>}</>}</section>
      </> : <div className="projects-empty"><Icon name="folder" size={36} /><h2>选择一个项目</h2><p>在项目里添加 hackathon 资料，再进入 Steve 对话。</p></div>}
    </section></div>
  </main>;
}
