import { useEffect, useState } from 'react';
import { api, setCsrf } from './api.js';
import { TaskProgress } from './components/ResearchForms.jsx';

const remoteStatus = { queued: 'QUEUED', claimed: 'QUEUED', running: 'RUNNING', paused: 'PAUSED', completed: 'COMPLETED', cancelled: 'CANCELLED' };

function present(task) {
  return {
    ...task,
    status: remoteStatus[task.status] || task.status,
    checkpoint: { ...task.checkpoint, current: task.checkpoint?.current || (task.status === 'claimed' ? '已由本机领取' : null) },
    error: task.error,
    resultSummary: task.resultSummary,
  };
}

export default function RemoteApp() {
  const [meta, setMeta] = useState(null);
  const [blocked, setBlocked] = useState('');
  const [auth, setAuth] = useState(null);
  const [password, setPassword] = useState('');
  const [executor, setExecutor] = useState(null);
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [tasks, setTasks] = useState([]);
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState('question');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    api('/api/relay/meta').then(value => { if (!ignore) setMeta(value); }).catch(error => { if (!ignore) setBlocked(error.code === 'COORDINATION_UNCONFIGURED' ? error.message : error.message); });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!meta?.ownerConfigured) return;
    let ignore = false;
    api('/api/relay/session').then(value => { if (!ignore) { setCsrf(value.csrf); setAuth(value); } }).catch(error => { if (!ignore) setNotice(error.message); });
    return () => { ignore = true; };
  }, [meta?.ownerConfigured]);

  useEffect(() => {
    if (!auth?.authenticated) return;
    let ignore = false;
    let timer;
    async function poll() {
      try {
        const [nextExecutor, nextCases, nextTasks] = await Promise.all([api('/api/relay/executor'), api('/api/relay/cases'), api('/api/relay/tasks')]);
        if (ignore) return;
        setExecutor(nextExecutor);
        setCases(nextCases.cases);
        setCaseId(current => nextCases.cases.some(item => item.id === current) ? current : (nextCases.cases[0]?.id || ''));
        setTasks(nextTasks.tasks);
      } catch (error) { if (!ignore) setNotice(error.message); }
      finally { if (!ignore) timer = setTimeout(poll, 3000); }
    }
    void poll();
    return () => { ignore = true; clearTimeout(timer); };
  }, [auth?.authenticated]);

  async function login(event) {
    event.preventDefault();
    setBusy(true); setNotice('');
    try {
      const value = await api('/api/relay/login', 'POST', { password });
      setCsrf(value.csrf); setPassword(''); setAuth({ authenticated: true, csrf: value.csrf });
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!executor?.acceptsTasks) return;
    setBusy(true); setNotice('');
    try {
      await api('/api/relay/tasks', 'POST', { caseId, kind, message, requestKey: crypto.randomUUID() });
      setMessage('');
      setTasks((await api('/api/relay/tasks')).tasks);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  const online = !!executor?.acceptsTasks;
  if (blocked || meta?.configured === false) {
    return <main className="research-panel" style={{ width: 'min(720px, 100%)', margin: '40px auto' }}><h1>Lydia</h1><p className="executor-banner" data-executor="offline" role="alert">{blocked || '远程通道未配置。'}</p></main>;
  }
  if (!meta) return <main className="research-panel" style={{ margin: '40px auto' }}><p>正在检查远程通道…</p></main>;
  if (!meta.ownerConfigured) {
    return <main className="research-panel" style={{ width: 'min(720px, 100%)', margin: '40px auto' }}><h1>Lydia</h1><p role="status">远程账号还未在电脑上创建。请在本机运行注册脚本，不要在网页里设置设备凭据。</p></main>;
  }
  if (!auth?.authenticated) {
    return <main className="auth-card" style={{ margin: '40px auto' }}><h1>登录 Lydia</h1><form onSubmit={login}><div className="field"><label htmlFor="relay-password">个人密码</label><input id="relay-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={12} maxLength={128} /></div><button className="btn-primary" type="submit" disabled={busy}>登录</button></form>{notice && <p role="alert">{notice}</p>}</main>;
  }
  return <main className="research-panel" style={{ width: 'min(760px, 100%)', margin: '24px auto' }}>
    <h1>Lydia</h1>
    <p className="executor-banner" data-executor={online ? 'online' : 'offline'} role="status">{online ? '电脑上的执行器在线。研究仍在那台电脑上运行。' : '执行器离线。新任务会被拒绝，已保存的进度不会被丢弃。'}</p>
    {notice && <p role="alert">{notice}</p>}
    <form className="research-form" onSubmit={submit}>
      <div className="field"><label htmlFor="relay-case">项目</label><select id="relay-case" value={caseId} onChange={event => setCaseId(event.target.value)} disabled={!cases.length}>{cases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}{!cases.length && <option value="">等待电脑公布项目</option>}</select></div>
      <div className="field"><label htmlFor="relay-kind">任务</label><select id="relay-kind" value={kind} onChange={event => setKind(event.target.value)}><option value="question">顾问问答</option><option value="research">需求研究</option></select></div>
      <div className="field"><label htmlFor="relay-message">交给固定专家流程</label><textarea id="relay-message" value={message} onChange={event => setMessage(event.target.value)} required minLength={1} maxLength={8000} rows={4} /></div>
      <button className="btn-primary" type="submit" disabled={busy || !online || !caseId}>提交任务</button>
    </form>
    <TaskProgress tasks={tasks.map(present)} busy={busy} onTaskAction={(id, action) => { void api(`/api/relay/tasks/${id}/${action}`, 'POST', {}).then(async () => setTasks((await api('/api/relay/tasks')).tasks)).catch(error => setNotice(error.message)); }} />
  </main>;
}
