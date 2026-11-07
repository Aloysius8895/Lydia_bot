import Icon from './Icon.jsx';
import { useRef, useState } from 'react';
import { BotAvatar, RoomAvatar } from './Avatars.jsx';
import { me } from '../data.js';

export function Brand() {
  return (
    <a className="brand" href="#/">
      <img className="brand__mark" src="/icons/icon.svg" width="28" height="28" alt="" />
      <span className="brand__name">Lydia</span>
    </a>
  );
}

export function RoomRow({ room, botsById, current }) {
  return (
    <a className="row" href={`#/room/${room.id}`} aria-current={current ? 'page' : undefined}>
      <RoomAvatar colors={room.members.map((m) => botsById[m.id]?.color ?? 'ink')} />
      <span className="row__body">
        <span className="row__top">
          <strong className="row__name">{room.name}</strong>
          <span className="row__time">{room.time}</span>
        </span>
        <span className="row__preview">{room.preview}</span>
      </span>
    </a>
  );
}

export function BotRow({ bot, current }) {
  return (
    <a className="row" href={`#/bot/${bot.id}`} aria-current={current ? 'page' : undefined}>
      <BotAvatar color={bot.color} />
      <span className="row__body">
        <span className="row__top">
          <strong className="row__name">{bot.name}</strong>
          <span className="row__time">
            {bot.time}
            {bot.unread && <span className="unread-dot" aria-label="Unread" />}
          </span>
        </span>
        <span className="row__preview">{bot.preview}</span>
      </span>
    </a>
  );
}

export default function Sidebar({ bots, rooms, botsById, route, query, onQuery, theme, onToggleTheme, onSettings, onOpenWorkspace, onOpenCrawl, onOpenProjects, onOpenKnowledge }) {
  const [searching, setSearching] = useState(false);
  const [scope, setScope] = useState('all');
  const search = useRef(null);
  const q = query.trim().toLowerCase();
  const matches = item => !q || item.name.toLowerCase().includes(q);
  const shownRooms = scope === 'pinned' ? [] : rooms.filter(matches);
  const shownBots = bots.filter(item => matches(item) && (scope !== 'pinned' || item.pinned));
  function openSearch() { onOpenProjects(); setSearching(true); requestAnimationFrame(() => search.current?.focus()); }

  return <aside className="sidebar claude-sidebar" aria-label="Bots and rooms">
    <header className="claude-sidebar__header">
      <a className="brand claude-sidebar__brand" href="#/"><img className="brand__mark" src="/icons/icon.svg" width="28" height="28" alt="" /><span className="brand__name">Lydia</span></a>
      <div className="claude-sidebar__header-actions"><button type="button" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onToggleTheme}><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={19} /></button><button type="button" aria-label="打开 Crawl" title="Crawl" onClick={onOpenCrawl}><Icon name="spider" size={19} /></button></div>
    </header>
    <nav className="claude-sidebar__menu" aria-label="工作区导航">
      <a href="#/new" className="claude-sidebar__new" aria-label="New project" aria-current={route.kind === 'new' ? 'page' : undefined}><Icon name="plus" /><span>New</span></a>
      <button type="button" onClick={openSearch} aria-expanded={searching}><Icon name="search" /><span>Search</span></button>
      <button type="button" onClick={onOpenProjects} aria-current={route.kind === 'projects' ? 'page' : undefined}><Icon name="folder" /><span>Projects</span></button>
      <button type="button" onClick={onOpenKnowledge}><Icon name="panel" /><span>知识库</span></button>
      <button type="button" onClick={onOpenCrawl}><Icon name="spider" /><span>Crawl</span></button>
      <button type="button" onClick={() => onSettings('avatar')}><Icon name="palette" /><span>Design</span></button>
      <button type="button" onClick={() => onSettings('connections')}><Icon name="settings" /><span>Customize</span></button>
    </nav>
    {searching && <label className="claude-sidebar__search"><Icon name="search" size={17} /><input ref={search} type="search" placeholder="Search projects and team" aria-label="Search bots and rooms" value={query} onChange={e => onQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { onQuery(''); setSearching(false); } }} /><button type="button" aria-label="关闭侧栏搜索" onClick={() => { onQuery(''); setSearching(false); }}><Icon name="close" size={16} /></button></label>}
    <div className="claude-sidebar__scroll" aria-label="项目与团队列表">
      <section className="claude-sidebar__team">
        <div className="grok-scope" role="group" aria-label="会话筛选"><button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>全部会话</button><button type="button" aria-pressed={scope === 'pinned'} onClick={() => setScope('pinned')}><Icon name="star" size={14} />已置顶</button></div>
        {shownRooms.length > 0 && <nav aria-label="Rooms"><div className="claude-sidebar__section claude-sidebar__subsection">团队会话</div>{shownRooms.map(room => <RoomRow key={room.id} room={room} botsById={botsById} current={route.kind === 'room' && route.id === room.id} />)}</nav>}
        {shownBots.length > 0 && <nav aria-label="Bots"><div className="claude-sidebar__section claude-sidebar__subsection">研究专家</div>{shownBots.map(bot => <BotRow key={bot.id} bot={bot} current={route.kind === 'bot' && route.id === bot.id} />)}</nav>}
        {!shownRooms.length && !shownBots.length && <p className="claude-sidebar__empty">没有匹配的团队成员</p>}
      </section>
    </div>
    <footer className="claude-sidebar__footer"><button type="button" className="claude-sidebar__account" aria-label="Settings" onClick={() => onSettings('account')}><span className="me__avatar me__avatar--character"><BotAvatar color="ink" size={28} /></span><span className="claude-sidebar__account-name">{me.name}<small>本机工作区</small></span><Icon name="chevronDown" size={14} /></button><button type="button" className="claude-sidebar__preferences" aria-label="工作区连接设置" onClick={() => onSettings('connections')}><Icon name="plug" size={19} /></button></footer>
  </aside>;
}
