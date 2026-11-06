import { useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar } from './Avatars.jsx';
import { BotRow, RoomRow } from './Sidebar.jsx';

export default function MobileHome({ bots, rooms, botsById, query, onQuery, projectPicker, onSettings, onOpenCrawl, theme, onToggleTheme }) {
  const [searching, setSearching] = useState(false), [scope, setScope] = useState('all');
  const q = query.trim().toLowerCase();
  const matches = item => !q || item.name.toLowerCase().includes(q);
  const shownBots = bots.filter(b => matches(b) && (scope === 'all' || b.pinned));
  const shownRooms = scope === 'all' ? rooms.filter(matches) : [];
  return <div className="m-home mobile-workspace-home">
    <header className="m-home__header">
      <a className="mobile-brand" href="#/"><BotAvatar color="ink" size={29} /><h1 className="m-home__title">Lydia</h1></a>
      <div className="m-home__actions">
        <button type="button" className="icon-btn" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onToggleTheme}><Icon name={theme === 'dark' ? 'moon' : 'sun'} /></button>
        <button type="button" className="icon-btn" aria-label="Search" aria-expanded={searching} onClick={() => setSearching(s => !s)}><Icon name="search" /></button>
        <a className="icon-btn" href="#/new" aria-label="New project"><Icon name="plus" /></a>
      </div>
    </header>
    <div className="mobile-home-scroll">
      {searching && <label className="search m-home__search"><Icon name="search" size={18} /><input type="search" placeholder="Search" aria-label="Search bots and rooms" autoFocus value={query} onChange={e => onQuery(e.target.value)} /></label>}
      <div className="m-home__project">{projectPicker}</div>
      <p className="grok-mobile-intro">你的研究顾问和团队，都在这里。</p>
      <div className="mobile-conversation-scope" role="group" aria-label="会话筛选"><button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>全部会话</button><button type="button" aria-pressed={scope === 'pinned'} onClick={() => setScope('pinned')}><Icon name="star" size={14} />已置顶</button></div>
      {!!shownRooms.length && <><h2 className="mobile-section-label">团队会话</h2><div className="m-sheet mobile-team-group">{shownRooms.map(r => <RoomRow key={r.id} room={r} botsById={botsById} />)}</div></>}
      <h2 className="mobile-section-label">研究专家</h2>
      <div className="m-sheet mobile-expert-group">
        {shownBots.map(b => <BotRow key={b.id} bot={b} />)}
        {!shownBots.length && <p className="sidebar__empty">{q ? `No matches for “${query.trim()}”` : '没有置顶的专家'}</p>}
        {!bots.length && <a className="row" href="#/new"><Icon name="plus" /><strong>Create your first bot</strong></a>}
      </div>
      <div className="mobile-home-tools"><button type="button" onClick={onOpenCrawl}><Icon name="spider" size={16} />Crawl</button><button type="button" onClick={onSettings}><Icon name="settings" size={16} />Settings</button></div>
    </div>
  </div>;
}
