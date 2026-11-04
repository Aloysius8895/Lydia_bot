import { useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar } from './Avatars.jsx';
import { BotRow, RoomRow } from './Sidebar.jsx';
import { me } from '../data.js';

export default function MobileHome({ bots, rooms, botsById, query, onQuery, projectPicker, onSettings, onOpenWorkspace, onOpenCrawl, onOpenProjects }) {
  const [searching, setSearching] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = (item) => !q || item.name.toLowerCase().includes(q);
  const pinned = bots.filter((b) => b.pinned);
  const shownRooms = rooms.filter(matches);
  const shownBots = bots.filter((b) => (q ? matches(b) : !b.pinned));

  return (
    <div className="m-home">
      <header className="m-home__header">
        <span className="me__avatar me__avatar--lg me__avatar--character" aria-label={me.name}>
          <BotAvatar color="ink" size={44} />
        </span>
        <div className="m-home__actions">
          <button type="button" className="icon-btn icon-btn--round icon-btn--outlined" aria-label="Settings" onClick={onSettings}><Icon name="settings" /></button>
          <button
            type="button"
            className="icon-btn icon-btn--round icon-btn--outlined"
            aria-label="Search"
            aria-expanded={searching}
            onClick={() => setSearching((s) => !s)}
          >
            <Icon name="search" />
          </button>
          <a className="icon-btn icon-btn--round icon-btn--filled" href="#/new" aria-label="New project">
            <Icon name="plus" />
          </a>
        </div>
      </header>

      {searching && (
        <label className="search m-home__search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search" aria-label="Search bots and rooms" autoFocus value={query} onChange={(e) => onQuery(e.target.value)} />
        </label>
      )}

      <h1 className="m-home__title">Lydia</h1>
      <p className="grok-mobile-intro">你的研究顾问和团队，都在这里。</p>
      <div className="grok-mobile-tools"><a href="#/new"><Icon name="plus" size={18} />新建项目</a><button type="button" onClick={onOpenProjects}><Icon name="folder" size={18} />Projects</button><button type="button" onClick={onOpenCrawl}><Icon name="spider" size={18} />Crawl</button></div>
      <div className="m-home__project">{projectPicker}</div>

      {!q && pinned.length > 0 && (
        <nav className="m-pinned" aria-label="Pinned bots">
          {pinned.map((b) => (
            <a key={b.id} href={`#/bot/${b.id}`}>
              <span className="m-pinned__avatar">
                <BotAvatar color={b.color} size={72} />
                {b.unread && <span className="m-pinned__badge" aria-label="Unread" />}
              </span>
              {b.name}
            </a>
          ))}
        </nav>
      )}

      <div className="m-sheet">
        {shownRooms.map((r) => (
          <RoomRow key={r.id} room={r} botsById={botsById} />
        ))}
        {shownBots.map((b) => (
          <BotRow key={b.id} bot={b} />
        ))}
        {bots.length === 0 && (
          <a className="row" href="#/new">
            <span className="row__create">
              <Icon name="plus" size={22} strokeWidth={2.4} />
            </span>
            <strong className="row__name">Create your first bot</strong>
          </a>
        )}
        {q && shownRooms.length + shownBots.length === 0 && <p className="sidebar__empty">No matches for “{query.trim()}”</p>}
      </div>
    </div>
  );
}
