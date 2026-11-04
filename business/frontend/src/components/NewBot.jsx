import { useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar, botColor } from './Avatars.jsx';
import { palette, suggestions } from '../data.js';

export default function NewBot({ isMobile, onCreate }) {
  const [color, setColor] = useState(palette[0].key);
  const [name, setName] = useState('');

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onCreate({ name: trimmed, color });
  }

  return (
    <main className="main">
      <header className={`chat-header${isMobile ? ' chat-header--mobile' : ''}`}>
        {isMobile && (
          <a className="icon-btn icon-btn--round" href="#/" aria-label="Back to bots">
            <Icon name="back" size={22} />
          </a>
        )}
        <div className="chat-header__who">
          <span className="color-dot" style={{ background: botColor(color) }} />
          <strong className="chat-header__title">New bot</strong>
        </div>
      </header>

      <div className="create">
        <form className="create__form" onSubmit={submit}>
          <BotAvatar color={color} size={120} className="create__preview" />

          <fieldset className="swatches">
            <legend>Color</legend>
            <div className="swatches__list">
              {palette.map((c) => {
                const selected = c.key === color;
                return (
                  <button
                    key={c.key}
                    type="button"
                    className="swatch"
                    aria-label={c.label}
                    aria-pressed={selected}
                    onClick={() => setColor(c.key)}
                    style={{
                      background: botColor(c.key),
                      boxShadow: selected ? `0 0 0 3px var(--main-bg), 0 0 0 5px ${botColor(c.key)}` : 'none',
                    }}
                  />
                );
              })}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="bot-name">Name</label>
            <input id="bot-name" type="text" placeholder="Name your bot" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <button type="submit" className="btn-primary">
            Get started
          </button>
        </form>

        <section className="suggestions">
          <h2 className="panel__heading">Or start from a suggestion</h2>
          <div className="suggestions__grid">
            {suggestions.map((s) => (
              <button key={s.name} type="button" className="suggestion" onClick={() => onCreate(s)}>
                <BotAvatar color={s.color} size={48} />
                <span className="item__body">
                  <strong>{s.name}</strong>
                  <span>{s.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
