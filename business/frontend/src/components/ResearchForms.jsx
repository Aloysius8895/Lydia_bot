import { useState } from 'react';
import { Brand } from './Sidebar.jsx';
import { BotAvatar } from './Avatars.jsx';
import Icon from './Icon.jsx';

export function ThemeSwitch({ theme, onToggleTheme }) {
  const dark = theme === 'dark';
  return <button type="button" className="theme-switch" role="switch" aria-label="黑夜模式" aria-checked={dark} onClick={onToggleTheme}>
    <span className="theme-switch__icon"><Icon name={dark ? 'moon' : 'sun'} size={20} strokeWidth={1.6} /></span>
    <span>{dark ? '黑夜模式' : '白天模式'}</span><span className="theme-switch__track"><span /></span>
  </button>;
}

export function AuthScreen({ status, onLogin, busy, theme, onToggleTheme }) {
  const [password, setPassword] = useState('');
  return <div className="auth-layout grok-auth-layout">
    <header className="auth-header"><Brand /><ThemeSwitch theme={theme} onToggleTheme={onToggleTheme} /></header>
    <div className="grok-auth-body"><aside className="grok-auth-story"><span className="grok-eyebrow">YOUR IDEAS, IN GOOD COMPANY</span><h1>一个问题，<br />一整个研究团队。</h1><p>把想法、资料和判断留在同一个工作区，与你的顾问一起找到下一步。</p><div className="grok-auth-steps"><span><Icon name="doc" />整理资料</span><span><Icon name="search" />追溯证据</span><span><Icon name="target" />验证方向</span></div></aside><main className="auth-card grok-auth-card">
      <BotAvatar color="blue" size={72} /><h1>Your ideas. Meet Lydia.</h1>
      <p>{status.configured ? '登录你的个人商业研究空间。' : '在这台电脑上设置个人密码，开启你的商业研究空间。'}</p>
      {!status.configured && !status.local ? <p role="alert">请先在运行服务的电脑上设置密码。</p> :
        <form id="auth-form" onSubmit={e => { e.preventDefault(); void onLogin(password).then(ok => { if (ok) setPassword(''); }); }}>
          <div className="field"><label htmlFor="password">个人密码</label><input id="password" type="password" required minLength={status.configured ? 1 : 12} maxLength={128} autoComplete={status.configured ? 'current-password' : 'new-password'} placeholder={status.configured ? '输入密码' : '至少 12 个字符'} value={password} onChange={e => setPassword(e.target.value)} /></div>
          <button id="auth-submit" className="btn-primary" type="submit" disabled={busy}>{busy ? '正在连接…' : status.configured ? '进入研究空间' : '设置密码并进入'}</button>
        </form>}
      <span className="auth-caption">One advisor. A whole team behind you.</span>
    </main></div>
  </div>;
}

export function NewProject({ isMobile, busy, onCreate }) {
  const [title, setTitle] = useState(''), [brief, setBrief] = useState(''), [region, setRegion] = useState('马来西亚');
  return <main className="main grok-create-page">
    <header className="chat-header">{isMobile && <a className="icon-btn" href="#/" aria-label="Back to bots"><Icon name="back" /></a>}<div className="chat-header__who"><BotAvatar color="blue" size={36} /><strong className="chat-header__title">New project</strong></div></header>
    <div className="create"><form className="create__form project-form" id="new-form" onSubmit={e => { e.preventDefault(); void onCreate({ title, brief, region }); }}>
      <div className="grok-create-intro"><BotAvatar color="blue" size={64} /><span className="grok-eyebrow">NEW RESEARCH PROJECT</span><h1>从一个想法开始。</h1><p>给这次研究起个名字，再告诉 Steve 你已经知道什么。</p></div>
      <div className="field"><label htmlFor="project-title-input">项目名称</label><input id="project-title-input" name="title" required maxLength={120} placeholder="例如：帮助诊所减少预约爽约" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="field"><label htmlFor="project-brief">Idea / 比赛 brief</label><textarea id="project-brief" name="brief" required maxLength={8000} rows={5} placeholder="谁遇到什么问题？你知道什么，还有什么需要团队研究？" value={brief} onChange={e => setBrief(e.target.value)} /></div>
      <div className="field"><label htmlFor="project-region">研究地区</label><input id="project-region" name="region" maxLength={120} value={region} onChange={e => setRegion(e.target.value)} /></div>
      <div className="grok-create-footer"><span><Icon name="database" size={15} />保存到你的本机工作区</span><button className="btn-primary" type="submit" disabled={busy}>{busy ? '正在创建…' : 'Create project'}<Icon name="chevronRight" size={16} /></button></div>
    </form></div>
  </main>;
}

export function ProjectPicker({ cases, active, onChange, compact = false }) {
  return <label className={`project-picker ${compact ? 'project-picker--compact' : ''}`}><span>Project</span><select aria-label="当前研究项目" value={active || ''} onChange={e => onChange(e.target.value)}><option value="" disabled>选择或创建项目</option>{cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>;
}

const statuses = { QUEUED: '排队中', RUNNING: '研究中', PAUSED: '已暂停', FAILED: '未通过', CANCELLED: '已取消', COMPLETED: '已完成' };
export function TaskProgress({ tasks, busy, onTaskAction }) {
  return <div className="research-tasks">{tasks.filter(t => t.status !== 'COMPLETED').map(t => <article className="research-card task-progress" key={t.id} data-task-status={t.status}>
    <div className="research-card__head"><span className="status-dot" /><strong>{statuses[t.status]} · {t.kind === 'model' ? '商业模式' : t.kind === 'research' ? '需求研究' : '顾问问答'}</strong></div>
    {t.checkpoint?.current && <p>当前步骤：{t.checkpoint.current}</p>}{t.error && <p role="status">{t.error.message}</p>}
    {t.checkpoint?.collection && <p>资料采集：{t.checkpoint.collection.status}</p>}
    <div className="research-actions">{t.status === 'PAUSED' && <button className="pill" disabled={busy} onClick={() => onTaskAction(t.id, 'resume')}>恢复此任务</button>}{['QUEUED', 'RUNNING', 'PAUSED'].includes(t.status) && <button className="pill" disabled={busy} onClick={() => onTaskAction(t.id, 'cancel')}>取消任务</button>}</div>
  </article>)}</div>;
}
