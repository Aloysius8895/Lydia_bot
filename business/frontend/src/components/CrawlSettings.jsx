import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import CrawlProject, { SourceLink, Technical, ResultReview } from './CrawlProject.jsx';
import '../crawl.css';

const tabs = [['runs', '开始采集'], ['projects', '采集资料']];
const tools = [['sources', '来源能力'], ['coverage', '发现覆盖'], ['results', '官方结果'], ['quality', '质量复核'], ['projections', '索引同步']];
const states = { running: '采集中', pending: '等待执行', paused: '已暂停', completed: '队列已完成', cancelled: '已取消', failed: '失败', succeeded: '已完成', retry_wait: '等待重试', blocked: '受阻' };
const state = s => states[s] || s;
const formats = [['json', 'JSON'], ['csv', 'CSV'], ['markdown', 'Markdown']];

export default function CrawlSettings({ activeCase }) {
  const [tab, setTab] = useState('runs'), [sources, setSources] = useState([]), [health, setHealth] = useState(null), [data, setData] = useState(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [source, setSource] = useState('ethglobal'), [pages, setPages] = useState(5), [seed, setSeed] = useState(''), [rendering, setRendering] = useState('auto');
  const [eventLimit, setEventLimit] = useState(20), [totalLimit, setTotalLimit] = useState(200);
  const [xMode, setXMode] = useState('account'), [xValue, setXValue] = useState(''), [xLimit, setXLimit] = useState(50), [xScrolls, setXScrolls] = useState(10), [xSession, setXSession] = useState(null);
  const [xTransport, setXTransport] = useState('interactive'), [xAPI, setXAPI] = useState(null);
  useEffect(() => {
    if (source !== 'twitter') return;
    let live = true, timer;
    async function poll() {
      try { const [session, status] = await Promise.all([api('/api/crawl/twitter/session'), api('/api/crawl/twitter/api-status')]); if (live) { setXSession(session); setXAPI(status); } }
      catch (e) { if (live) setError(e.message); }
      finally { if (live) timer = setTimeout(poll, 4000); }
    }
    void poll(); return () => { live = false; clearTimeout(timer); };
  }, [source, reload, xTransport]);
  const [query, setQuery] = useState(''), [year, setYear] = useState(''), [filter, setFilter] = useState({ query: '', year: '', offset: 0 });
  const [selected, setSelected] = useState(null), [runDetail, setRunDetail] = useState(null), [operation, setOperation] = useState(null);
  const [operations, setOperations] = useState([]);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let live = true;
    Promise.all([api('/api/crawl/sources'), api('/api/crawl/health'), api('/api/crawl/operations')]).then(([s, h, ops]) => { if (live) { setSources(s); setHealth(h); setOperations(ops); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [reload]);
  useEffect(() => {
    let live = true, timer; setData(null); setError('');
    const endpoint = tab === 'projects' ? '/api/crawl/projects?' + new URLSearchParams({ limit: '50', offset: String(filter.offset), ...(filter.query ? { query: filter.query } : {}), ...(filter.year ? { year: filter.year } : {}) }) : '/api/crawl/' + tab;
    async function poll() {
      try { const next = await api(endpoint); if (live) setData(next); }
      catch (e) { if (live) setError(e.message); }
      finally { if (live) timer = setTimeout(poll, 5000); }
    }
    void poll(); return () => { live = false; clearTimeout(timer); };
  }, [tab, filter, reload]);
  const operationId = operation?.id, operationStatus = operation?.status;
  useEffect(() => {
    if (!operationId || ['succeeded', 'failed'].includes(operationStatus)) return;
    let live = true, timer;
    async function poll() {
      try { const next = await api(`/api/crawl/operations/${operationId}`); if (live) { setOperation(next); setOperations(previous => previous.map(op => op.id === next.id ? next : op)); } }
      catch (e) { if (live) setError(e.message); }
      finally { if (live) timer = setTimeout(poll, 1500); }
    }
    void poll(); return () => { live = false; clearTimeout(timer); };
  }, [operationId, operationStatus]);
  async function act(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await fn(); if (alive.current) setReload(n => n + 1); }
    catch (e) { if (alive.current) setError(e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function watch(op) { if (alive.current) { setOperation(op); setMessage('已安排后台操作。关闭设置不会取消任务。'); } }
  function navigate(id) { if (id === tab) return; setData(null); setTab(id); setSelected(null); setRunDetail(null); }
  const rows = Array.isArray(data) ? data : [];
  return <div className="crawl-settings">
    <section className="set-section crawl-intro"><div className="set-section__head"><div><span className="crawl-eyebrow">PROJECT DISCOVERY</span><h3 className="set-section__title">发现值得研究的项目</h3></div><button type="button" className="set-btn" disabled={busy} onClick={() => setReload(n => n + 1)}>刷新</button></div>
      <p className="set-muted">选一个网站，Lydia 帮你收集公开项目。找到感兴趣的项目后，可以导入研究或下载。</p>
      <ol className="crawl-steps" aria-label="使用步骤"><li><span>1</span>选择网站</li><li><span>2</span>自动采集</li><li><span>3</span>查看与导入</li></ol>
    </section>
    <div className="crawl-tabs" role="group" aria-label="Crawl 功能">{tabs.map(([id, label]) => <button type="button" className="set-chip" aria-pressed={tab === id} key={id} onClick={() => navigate(id)}>{label}</button>)}</div>
    <details className="crawl-tools"><summary>管理工具{tools.some(([id]) => id === tab) ? ` · ${tools.find(([id]) => id === tab)?.[1]}` : ''}</summary><p className="set-muted">需要检查数据来源、采集范围或同步问题时再使用。</p><p className="set-muted">{health ? (health.browser_available ? '浏览器采集可用' : '浏览器采集暂不可用，仍可尝试普通网页') : '正在连接采集服务…'}</p><div className="crawl-actions">{tools.map(([id, label]) => <button type="button" className="set-chip" aria-pressed={tab === id} key={id} onClick={() => navigate(id)}>{label}</button>)}</div></details>
    {error && <p className="crawl-feedback" role="alert">{error}</p>}{message && <p className="crawl-feedback" role="status">{message}</p>}
    {operation && <section className="set-section crawl-operation" aria-label="后台操作"><h4>后台操作 · {state(operation.status)}</h4><p className="set-muted">{operation.kind} · {operation.id}</p>{operation.error && <p role="alert">{operation.error.message}</p>}
      {operation.kind === 'export' && operation.status === 'succeeded' && <div className="crawl-downloads"><p>导出已完成，点击下载：</p>{['manifest.json', ...Object.keys(operation.result.files)].map(name => <a key={name} className="set-btn" href={`/api/crawl/exports/${operation.id}/files/${encodeURIComponent(name)}`} download>{name}</a>)}</div>}
    </section>}
    {operations.length > 0 && <details className="crawl-record"><summary>最近后台操作（最多 20 条）</summary><div className="crawl-actions">{operations.map(op => <button type="button" key={op.id} className="set-btn" onClick={() => setOperation(op)}>{op.kind === 'export' ? '导出' : op.kind === 'import' ? '导入' : op.kind === 'selection' ? '项目选择' : '资源检查'} · {state(op.status)} · {new Date(op.created_at).toLocaleString()}</button>)}</div></details>}
    {!data && !error && <p className="set-muted" role="status">正在加载…</p>}
    {tab === 'runs' && <>
      <section className="set-section crawl-start"><h4>从哪里采集资料？</h4><p className="set-muted">选择网站即可开始，其余选项已为你设置好。</p><form className="crawl-form" onSubmit={e => { e.preventDefault(); act(async () => { const config = { sources: [source], maxPages: Number(pages), rendering, finalistLimitPerEvent: Number(eventLimit), finalistLimitTotal: Number(totalLimit) }; if (source === 'twitter') { config.rendering = xTransport === 'api' ? 'http' : 'browser'; config.twitter = { mode: xMode, value: xValue.trim(), maxPosts: Number(xLimit), maxScrolls: Number(xScrolls), transport: xTransport }; } else if (seed.trim()) config.seeds = [{ source, url: seed.trim() }]; await api('/api/crawl/runs', 'POST', { config, request_key: crypto.randomUUID() }); setMessage(`采集已开始。你可以留在这里查看进度，也可以稍后回来。`); }); }}>
        <label className="crawl-field crawl-source">资料来源<select aria-label="来源" value={source} onChange={e => setSource(e.target.value)}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {source === 'twitter' && <div className="crawl-form">
          <label className="crawl-field">获取方式<select aria-label="X 获取方式" value={xTransport} onChange={e => { setXTransport(e.target.value); if (e.target.value === 'api') setXLimit(n => Math.max(10, Number(n) || 50)); }}><option value="interactive">本机自动浏览（登录账号）</option><option value="api">官方 API（Bearer Token）</option><option value="browser">网页爬虫（robots 检查）</option></select></label>
          {xTransport === 'api' ? <>
            <p role="status" className="set-muted">{xAPI?.configured ? '已配置 Bearer Token；接口权限和额度将在采集时检查' : '尚未配置 Bearer Token。请在后端环境文件中填写 X_BEARER_TOKEN，然后重启后端。'}</p>
            <p className="set-muted">不需要登录浏览器。关键词搜索覆盖最近 7 天；每次读取可能消耗 X API 额度，请在开发者控制台设置支出上限。</p>
            <a href="https://console.x.com/" target="_blank" rel="noopener noreferrer">打开 X Developer Console</a>
          </> : <>
          <p className="set-muted">{xTransport === 'interactive' ? '首次在本机专用窗口登录 X，保存并关闭窗口。开始后会自动打开浏览器，搜索账号或关键词、滚动并保存本次可见推文。无需 API Key。' : '使用本机专用浏览器登录 X。网页爬虫保留 robots 检查，当前可能因此受阻。'}</p>
          <p role="status" className="set-muted">{xSession?.login_open ? '登录窗口已打开' : xSession?.busy ? '浏览器正在采集' : xSession?.profile_saved ? '已有本机浏览器配置，采集时会检查登录状态' : '尚未建立 X 登录配置'}</p>
          <div className="crawl-actions"><button type="button" className="set-btn" disabled={busy || xSession?.busy || xSession?.login_open} onClick={() => act(async () => setXSession(await api('/api/crawl/twitter/login', 'POST', {})))}>打开 X 登录窗口</button><button type="button" className="set-btn" disabled={busy || !xSession?.login_open} onClick={() => act(async () => setXSession(await api('/api/crawl/twitter/close', 'POST', {})))}>保存并关闭登录窗口</button></div>
          </>}
          <label className="crawl-field">采集模式<select aria-label="X 采集模式" value={xMode} onChange={e => setXMode(e.target.value)}><option value="account">指定账号</option><option value="search">关键词搜索</option></select></label>
          <label className="crawl-field">{xMode === 'account' ? '账号或主页网址' : '搜索关键词'}<input aria-label="X 采集目标" required maxLength={512} value={xValue} onChange={e => setXValue(e.target.value)} placeholder={xMode === 'account' ? '@XDevelopers 或 https://x.com/XDevelopers' : 'hackathon 或 #AI'} /></label>
          <label className="crawl-field">最多推文数<input aria-label="最多推文数" type="number" required min={xTransport === 'api' ? '10' : '1'} max="1000" value={xLimit} onChange={e => setXLimit(e.target.value)} /></label>
          {xTransport !== 'api' && <label className="crawl-field">最多滚动次数<input aria-label="最多滚动次数" type="number" required min="0" max="100" value={xScrolls} onChange={e => setXScrolls(e.target.value)} /></label>}
          <p className="set-muted">{xTransport === 'api' ? '按 API 页保存进度，暂停后继续读取；账号历史和搜索结果均不保证全量。最低每页条数不足时会提前停止，避免超过条数预算。' : '仅保存本次可见推文；账号历史及搜索结果不保证全量。暂停后继续会重新扫描并按推文 ID 去重。'}</p>
        </div>}
        <details className="crawl-advanced"><summary>高级设置 <span>页面数量、指定网址与采集方式</span></summary><div className="crawl-form"><label className="crawl-field">最大页面数<input aria-label="最大页面数" type="number" required min="1" max="100000" value={pages} onChange={e => setPages(e.target.value)} /><small>先采集少量页面，需要更多时可以继续。</small></label>
        {source !== 'twitter' && <><label className="crawl-field">指定入口（可选）<input type="url" value={seed} placeholder="默认从来源的公开入口发现" onChange={e => setSeed(e.target.value)} /></label>
        <label className="crawl-field">页面获取<select aria-label="页面获取" value={rendering} onChange={e => setRendering(e.target.value)}><option value="auto">自动：必要时使用浏览器</option><option value="http">仅 HTTP</option><option value="browser">使用受限浏览器</option></select></label>
        <details><summary>入围项目采集上限</summary><div className="crawl-grid"><label className="crawl-field">每场赛事<input type="number" min="0" required value={eventLimit} onChange={e => setEventLimit(e.target.value)} /></label><label className="crawl-field">总计<input type="number" min="0" required value={totalLimit} onChange={e => setTotalLimit(e.target.value)} /></label></div></details>
        <p className="set-muted">赛事采集范围为 2025–2026。获奖者不占入围项目名额。</p></>}</div></details>
        <button className="set-btn set-btn--primary crawl-start-button" disabled={busy || !sources.length || source === 'twitter' && (!xValue.trim() || (xTransport === 'api' ? !xAPI?.configured : xSession?.busy || xSession?.login_open))}>{busy ? '正在提交…' : '开始采集'}</button><p className="crawl-caption">{source === 'twitter' ? `本次最多保存 ${xLimit} 条推文` : `本次最多读取 ${pages} 页`} · 关闭设置后仍会继续采集</p>
      </form></section>
      <section className="set-section"><h4>采集记录</h4>{data && !rows.length && <div className="crawl-empty"><strong>你的项目探索，从这里开始</strong><p className="set-muted">选择上方的网站，开始第一次采集。</p></div>}{rows.map(r => <article className="crawl-item" key={r.id}><div className="crawl-item__head"><strong>{r.config.sources.map(id => sources.find(s => s.id === id)?.name || id).join(', ')}</strong><span className="crawl-status">{r.blocked_tasks > 0 ? '有受阻任务' : state(r.status)}</span></div><p className="set-muted">已保存 {r.pages} 页 · {r.blocked_tasks > 0 ? (r.last_error?.message || '采集受阻，请查看任务') : r.status === 'completed' ? '本次采集已结束，不代表整个网站已收齐' : r.status === 'paused' ? '采集已暂停，可继续' : r.status === 'cancelled' ? '本次采集已取消' : '采集进度会自动更新'}</p><details className="crawl-record"><summary>采集详情</summary><p className="set-muted">编号 {r.id} · {r.last_error?.message || r.reason || '等待执行'} · 覆盖范围待核验</p></details><div className="crawl-actions">
        {['running', 'pending'].includes(r.status) && <button className="set-btn" disabled={busy} onClick={() => act(() => api(`/api/crawl/runs/${r.id}/pause`, 'POST', {}))}>暂停</button>}
        {r.status === 'paused' && <button className="set-btn" disabled={busy} onClick={() => act(() => api(`/api/crawl/runs/${r.id}/resume`, 'POST', { extend_budget: true }))}>{r.reason === 'budget_exhausted' ? '扩展一批预算并继续' : '继续'}</button>}
        {!['cancelled', 'completed'].includes(r.status) && <button className="set-btn" disabled={busy} onClick={() => act(() => api(`/api/crawl/runs/${r.id}/cancel`, 'POST', {}))}>取消</button>}
        <button className="set-btn" disabled={busy} onClick={() => act(async () => setRunDetail(await api(`/api/crawl/runs/${r.id}`)))}>查看任务</button>{r.config.sources.some(id => id !== 'twitter') && <button className="set-btn" disabled={busy} onClick={() => act(async () => watch(await api(`/api/crawl/runs/${r.id}/selection`, 'POST', {})))}>计算获奖 / finalist 选择</button>}</div>
      </article>)}{runDetail && <><Technical value={runDetail} label="批次任务详情" />{runDetail.tasks.filter(t => ['blocked', 'failed'].includes(t.status)).map(t => <div className="crawl-item" key={t.id}><p role="status">{t.error?.message || t.status}</p><button type="button" className="set-btn" disabled={busy} onClick={() => act(async () => { await api(`/api/crawl/tasks/${t.id}/retry`, 'POST', { note: '用户在爬虫设置中重试任务' }); setRunDetail(await api(`/api/crawl/runs/${runDetail.id}`)); })}>重试任务</button></div>)}</>}</section>
    </>}
    {tab === 'projects' && <>
      <section className="set-section"><h4>下载采集数据</h4><p className="set-muted">导出当前正式库中的爬虫数据，不包含临时验证库和原始网页文件。导出不会受下方搜索筛选限制。</p><div className="crawl-actions">{formats.map(([format, label]) => <button className="set-btn" key={format} disabled={busy} onClick={() => act(async () => watch(await api('/api/crawl/exports', 'POST', { format, request_key: crypto.randomUUID() })))}>导出 {label}</button>)}</div></section>
      {selected ? <CrawlProject key={selected} id={selected} activeCase={activeCase} onClose={() => setSelected(null)} act={act} busy={busy} watch={watch} /> : <section className="set-section"><h4>已入库资料</h4><form className="crawl-actions" onSubmit={e => { e.preventDefault(); setFilter({ query, year, offset: 0 }); }}><label className="crawl-field">关键词<input maxLength={200} value={query} onChange={e => setQuery(e.target.value)} /></label><label className="crawl-field">年份<select aria-label="年份" value={year} onChange={e => setYear(e.target.value)}><option value="">全部年份</option><option>2025</option><option>2026</option></select></label><button className="set-btn">筛选</button></form>
        {data && !rows.length && <p className="set-muted">当前没有匹配的已入库项目。</p>}{rows.map(p => <article className="crawl-item" key={p.id}><strong>{p.title}</strong><p className="set-muted">{p.meta.year || '年份待核验'} · {p.depth} · {p.quality}</p><SourceLink url={p.url} /><div><button type="button" className="set-btn" onClick={() => setSelected(p.id)}>查看资料与证据</button></div></article>)}
        <div className="crawl-actions"><button className="set-btn" disabled={!filter.offset} onClick={() => setFilter(f => ({ ...f, offset: Math.max(0, f.offset - 50) }))}>上一页</button><span className="set-muted">第 {filter.offset / 50 + 1} 页 · 每页最多 50 条</span><button className="set-btn" disabled={rows.length < 50} onClick={() => setFilter(f => ({ ...f, offset: f.offset + 50 }))}>下一页</button></div>
      </section>}
    </>}
    {tab === 'sources' && <section className="set-section"><h4>来源能力与访问状态</h4><p className="set-muted">已接入解析入口不等于动态列表、获奖结果或全年数据已收齐。</p>{rows.map(s => <article className="crawl-item" key={s.id}><strong>{s.name}</strong><span className="set-muted">{state(s.status)}</span><SourceLink url={s.entry_url} /><Technical value={s.audit} label="查看能力与最近访问记录" /></article>)}</section>}
    {tab === 'coverage' && <section className="set-section"><h4>发现覆盖</h4><p className="set-muted">结束证据只适用于对应列表；不能代表整站或全年覆盖。</p>{data && !rows.length && <p className="set-muted">尚无分页覆盖记录。</p>}{rows.map((r, i) => <article className="crawl-item" key={i}><strong>{r.source_id} · {r.complete ? '列表有结束证据' : '覆盖待核验'}</strong><span className="set-muted">{r.pages} 页 · 新增 {r.new_id_count} 个身份 · {r.stalled ? '发现重复页面或游标' : '未标记卡住'}</span><Technical value={r} /></article>)}</section>}
    {tab === 'results' && <section className="set-section"><h4>官方结果复核</h4><p className="set-muted">核对官方结果与项目身份后匹配，同名项目不会自动合并。最多显示最近 200 条。</p>{data && !rows.length && <p className="set-muted">尚未采集到官方结果候选。</p>}{rows.map(c => <ResultReview key={`${c.id}:${c.revision}`} result={c} act={act} busy={busy} />)}</section>}
    {tab === 'quality' && <section className="set-section"><h4>质量复核</h4>{data && !rows.length && <p className="set-muted">暂无复核事项。</p>}{rows.map(q => <article className="crawl-item" key={q.id}><strong>{q.rule} · {q.status}</strong><Technical value={q.details} />{q.status === 'open' && <button className="set-btn" disabled={busy} onClick={() => act(() => api(`/api/crawl/reviews/${q.id}/resolve`, 'POST', { note: '用户在 App Settings 查看了记录；未修改底层事实' }))}>记录已查看</button>}</article>)}</section>}
    {tab === 'projections' && <section className="set-section"><h4>图与 RAG 索引同步</h4><p className="set-muted">PROJECT 资料按案件隔离，更新或撤销来源时使旧索引失效。</p>{data && <Technical value={data} label="查看同步状态" />}<div><button className="set-btn" disabled={busy} onClick={() => act(() => api('/api/crawl/projections/retry', 'POST', {}))}>重试失败的同步</button></div></section>}
  </div>;
}
