import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar } from './Avatars.jsx';
import { ThemeSwitch } from './ResearchForms.jsx';
import AvatarStudio from './AvatarStudio.jsx';
import CrawlSettings from './CrawlSettings.jsx';
import { me } from '../data.js';

const GROUPS = [
  [
    { id: 'account', label: '账户', icon: 'user', keywords: 'account profile 账户 个人资料 退出登录 logout 工作区' },
    { id: 'appearance', label: '外观', icon: 'palette', keywords: 'appearance theme dark light 主题 黑夜 白天 外观' },
    { id: 'avatar', label: '头像', icon: 'smile', keywords: 'avatar 头像 表情 形状 颜色 导出 png svg' },
  ],
  [
    { id: 'connections', label: '连接', icon: 'plug', keywords: 'connections claude cli embedding 数据库 订阅 额外用量 技能 skills 连接' },
    { id: 'data', label: '数据', icon: 'database', keywords: 'data export 导出 研究报告 json 数据' },
    { id: 'crawl', label: 'Crawl', icon: 'spider', keywords: 'crawl crawler 爬虫 采集 项目 赛事 导出 下载 获奖' },
  ],
  [{ id: 'phone', label: '手机', icon: 'phone', keywords: 'phone mobile pwa https 手机 主屏幕' }],
];

function Row({ label, desc, children }) {
  return (
    <div className="set-row">
      <div className="set-row__text">
        <span className="set-row__label">{label}</span>
        {desc && <span className="set-row__desc">{desc}</span>}
      </div>
      {children !== undefined && <div className="set-row__control">{children}</div>}
    </div>
  );
}

export default function SettingsModal({ section, onSection, onClose, theme, onToggleTheme, health, busy, active, onReloadHealth, onConfirmSubscription, onExport, onLogout }) {
  const [query, setQuery] = useState('');
  const dialog = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);

  const q = query.trim().toLowerCase();
  const groups = GROUPS.map((g) => g.filter((s) => !q || s.label.includes(q) || s.keywords.toLowerCase().includes(q))).filter((g) => g.length);
  const current = GROUPS.flat().find((s) => s.id === section) || GROUPS[0][0];

  let body;
  if (current.id === 'account') body = <>
    <section className="set-section">
      <h3 className="set-section__title">个人资料</h3>
      <Row label="头像" desc="形状、表情和颜色都可以在「头像」里设计。">
        <button type="button" className="set-avatar-btn" aria-label="编辑头像" onClick={() => onSection('avatar')}><BotAvatar color="ink" size={44} /></button>
      </Row>
      <Row label="工作区名称"><span className="set-field">{me.name}</span></Row>
      <Row label="登录方式"><span className="set-value">本机个人密码</span></Row>
    </section>
    <section className="set-section">
      <h3 className="set-section__title">会话</h3>
      <Row label="退出登录" desc="退出后，这台设备上的私人页面和缓存会被清除。">
        <button type="button" className="set-btn" disabled={busy} onClick={onLogout}><Icon name="logout" size={16} />退出登录</button>
      </Row>
    </section>
  </>;
  if (current.id === 'appearance') body = <section className="set-section">
    <h3 className="set-section__title">外观</h3>
    <Row label="主题" desc="白天是太阳，黑夜是月亮；自动记住这台设备的选择。"><ThemeSwitch theme={theme} onToggleTheme={onToggleTheme} /></Row>
  </section>;
  if (current.id === 'avatar') body = <AvatarStudio />;
  if (current.id === 'crawl') body = <CrawlSettings activeCase={active} />;
  if (current.id === 'connections') body = <>
    <section className="set-section">
      <div className="set-section__head">
        <h3 className="set-section__title">连接状态</h3>
        <button type="button" className="set-btn" disabled={busy} onClick={onReloadHealth}>检查连接</button>
      </div>
      {!health ? <p className="set-muted">正在读取连接状态…</p> : <>
        <Row label="Claude CLI"><span className="set-value">{health.cli.loggedIn ? `已登录 · ${health.cli.subscriptionType}` : health.cli.message || '未确认'}</span></Row>
        <Row label="本地 embedding"><span className="set-value">{health.embedding.status}</span></Row>
        <Row label="数据库"><span className="set-value">PostgreSQL / pgvector</span></Row>
        <Row label="额外付费 API 预算"><span className="set-value">USD 0</span></Row>
        <Row label="额外用量关闭" desc={health.subscriptionNoOverageConfirmed ? undefined : '请先在 Claude 官方设置里关闭额外用量，再回来确认。'}>
          {health.subscriptionNoOverageConfirmed
            ? <span className="set-value">已记录你的确认</span>
            : <button type="button" className="set-btn" disabled={busy} onClick={onConfirmSubscription}>我已关闭</button>}
        </Row>
      </>}
    </section>
    {health?.skills?.length > 0 && <section className="set-section">
      <h3 className="set-section__title">专家方法</h3>
      {health.skills.map((s) => <Row key={s.role} label={s.role === 'controller' ? '流程主控' : s.role}><span className="set-value">{s.status === 'LOADED' ? '已读取方法' : s.message || '未加载'}</span></Row>)}
    </section>}
  </>;
  if (current.id === 'data') body = <section className="set-section">
    <h3 className="set-section__title">你的数据</h3>
    <Row label="导出研究报告" desc={active ? '研究快照保存到电脑 business/cases，并下载 JSON 报告。' : '先选择或创建一个项目，才能导出。'}>
      <button type="button" className="set-btn" disabled={busy || !active} onClick={onExport}><Icon name="download" size={16} />导出研究报告</button>
    </Row>
  </section>;
  if (current.id === 'phone') body = <section className="set-section">
    <h3 className="set-section__title">在手机上使用</h3>
    <Row label="添加到主屏幕" desc="手机需要能访问电脑的地址和可信 HTTPS，再用浏览器添加到主屏幕。电脑要保持运行；目前尚未验收手机安装。" />
  </section>;

  return (
    <div className="set-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="set-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} ref={dialog}>
        <header className="set-dialog__header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="set-dialog__body">
          <nav className="set-nav" aria-label="设置分类">
            <label className="set-search">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Search" aria-label="搜索设置" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {groups.map((g, i) => (
              <div className="set-nav__group" key={i}>
                {g.map((s) => (
                  <button key={s.id} type="button" className="set-nav__item" aria-current={s.id === current.id ? 'page' : undefined} onClick={() => onSection(s.id)}>
                    <Icon name={s.icon} size={18} strokeWidth={1.8} />{s.label}
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <p className="set-muted set-nav__empty">没有匹配“{query.trim()}”的设置</p>}
          </nav>
          <div className="set-content" key={current.id}>
            <div className="grok-settings-heading"><span className="grok-eyebrow">WORKSPACE / SETTINGS</span><h3>{current.label}设置</h3><p>{({account:'管理本机工作区和登录会话。',appearance:'让工作空间适合你的阅读习惯。',avatar:'为顾问和自己设计独立的形象。',connections:'查看模型、资料库和工具的真实连接状态。',data:'导出你的研究记录与来源。',crawl:'采集公开项目，核对证据并下载数据。',phone:'把同一个工作区带到手机上。'})[current.id]}</p></div>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
