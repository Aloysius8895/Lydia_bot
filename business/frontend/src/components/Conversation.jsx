import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import RichText from './RichText.jsx';
import { BotAvatar, StackedAvatars, botColor } from './Avatars.jsx';
import Composer from './GrokComposer.jsx';
import GrokWelcome from './GrokWelcome.jsx';
import GrokMessage from './GrokMessage.jsx';

function listNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function FileCard({ file }) {
  return (
    <div className="file-card">
      <span className="file-card__badge">{file.type}</span>
      <span className="file-card__body">
        <strong>{file.name}</strong>
        <span>{file.meta}</span>
      </span>
      <button type="button" className="icon-btn icon-btn--round" aria-label={`Download ${file.name}`}>
        <Icon name="download" />
      </button>
    </div>
  );
}

function Message({ msg, isRoom, botsById, onAction }) {
  if (msg.kind === 'time') return <div className="timestamp">{msg.text}</div>;
  if (msg.kind === 'error') return <div className="notice" role="alert">{msg.text}</div>;
  if (!msg.kind || msg.kind === 'text') return <GrokMessage message={msg} bot={botsById[msg.from]} />;

  const mine = msg.from === 'me';
  const bot = botsById[msg.from];
  const content =
    msg.kind === 'file' ? (
      <FileCard file={msg.file} />
    ) : (
      <div className={`bubble ${mine ? 'bubble--me' : 'bubble--bot'}`}>
        <RichText text={msg.text} />
      </div>
    );
  const actions = msg.actions?.length > 0 && (
    <div className="msg-actions">
      {msg.actions.map((label, i) => (
        <button
          key={label}
          type="button"
          className={i === 0 ? 'pill pill--primary' : 'pill'}
          style={i === 0 && bot ? { '--pill-bg': botColor(bot.color) } : undefined}
          onClick={() => onAction(msg.id, label)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (mine) return content;
  if (isRoom && bot) {
    return (
      <div className="group-msg">
        <BotAvatar color={bot.color} size={32} />
        <div className="group-msg__body">
          <span className="group-msg__author">{bot.name}</span>
          {content}
          {actions}
        </div>
      </div>
    );
  }
  return actions ? (
    <div className="bot-msg">
      {content}
      {actions}
    </div>
  ) : (
    content
  );
}

function Typing({ color, text }) {
  return (
    <div className="typing" role="status">
      <span className="typing__dots" style={{ '--dot': botColor(color) }}>
        <span />
        <span />
        <span />
      </span>
      {text}
    </div>
  );
}

function BotPanel({ bot, onClose, onClear }) {
  return (
    <aside className="panel" aria-label={`${bot.name} details`}>
      <div className="panel__tools">
        <button type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <section className="panel__section panel__profile">
        <BotAvatar color={bot.color} size={72} />
        <strong>{bot.name}</strong>
        <p>{bot.role ?? bot.status}</p>
      </section>
      {bot.skill && (
        <section className="panel__section">
          <h2 className="panel__heading">Method skill</h2>
          <div className="item">
            <span className="item__icon">
              <Icon name="doc" />
            </span>
            <span className="item__body">
              <strong>{bot.skill}</strong>
              <span>business/skills/{bot.skill}/SKILL.md</span>
            </span>
          </div>
          <p className="panel__empty">基于公开资料构建的 AI 方法角色，非本人、非授权背书。多角色共识不算市场证据。</p>
        </section>
      )}
      <section className="panel__section">
        <button type="button" className="btn-outline" onClick={onClear}>
          Clear conversation
        </button>
      </section>
    </aside>
  );
}

function RoomPanel({ room, botsById, onClose, onClear }) {
  return (
    <aside className="panel panel--room" aria-label={`${room.name} details`}>
      <div className="panel__tools panel__tools--overlay">
        <button type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <section className="panel__section">
        <h2 className="panel__heading">In this room</h2>
        {room.members.map((m) => {
          const bot = botsById[m.id];
          if (!bot) return null;
          return (
            <a key={m.id} className="item" href={`#/bot/${bot.id}`}>
              <BotAvatar color={bot.color} size={36} />
              <span className="item__body">
                <strong>{bot.name}</strong>
                <span>{m.status}</span>
              </span>
            </a>
          );
        })}
        <p className="panel__empty">Everyone answers in this order. Start with @steve, @ash, @teresa, @april or @bob to ask only them.</p>
        <button type="button" className="btn-outline" onClick={onClear}>
          Clear conversation
        </button>
      </section>
    </aside>
  );
}

export default function Conversation({ bot, room, messages, botsById, pending, isMobile, onSend, onStop, onClear, onAction, busy, toolbar, overlay, progress, renderPanel, openPanelSignal, onAttachment }) {
  const isRoom = Boolean(room);
  const [panelOpen, setPanelOpen] = useState(() => !isMobile && window.matchMedia('(min-width: 1181px)').matches);
  const [draft, setDraft] = useState('');
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const lastText = messages.at(-1)?.text;
  const lastPanelSignal = useRef(openPanelSignal);

  useEffect(() => {
    if (openPanelSignal !== lastPanelSignal.current) {
      lastPanelSignal.current = openPanelSignal;
      setPanelOpen(true);
    }
  }, [openPanelSignal]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastText, pending]);

  const members = isRoom ? room.members.map((m) => botsById[m.id]).filter(Boolean) : [];
  const title = isRoom ? room.name : bot.name;
  const subtitle = isRoom ? `You, ${listNames(members.map((b) => b.name))}` : bot.status;
  const responder = pending && botsById[pending.from];
  const typing = pending && !pending.streaming ? { color: responder?.color ?? 'ink', text: `${responder?.name ?? 'Bot'} is thinking` } : null;

  function pickStarter(text) {
    setDraft(text);
    inputRef.current?.focus();
  }

  return (
    <>
      <main className={`main grok-conversation ${messages.length ? 'grok-conversation--active' : 'grok-conversation--new'}`}>
        <header className={`chat-header${isMobile ? ' chat-header--mobile' : ''}`}>
          {isMobile && (
            <a className="icon-btn icon-btn--round" href="#/" aria-label="Back to bots">
              <Icon name="back" size={22} />
            </a>
          )}
          <div className="chat-header__who">
            {isRoom ? <StackedAvatars colors={members.map((b) => b.color)} /> : <BotAvatar color={bot.color} size={36} />}
            <div className="chat-header__text">
              <strong className="chat-header__title">{title}</strong>
              <span className="chat-header__sub">{subtitle}</span>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="研究工作区"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          >
            <Icon name="panel" />
          </button>
        </header>

        {toolbar}
        {overlay}

        <div className="thread" ref={threadRef}>
          <div className={`thread__inner${isRoom ? ' thread__inner--room' : ''}`}>
            {messages.length === 0 && (
              <GrokWelcome bot={bot} room={room} members={members} onPick={pickStarter} onAttachment={onAttachment} />
            )}
            {messages.map((m) => (
              <Message key={m.id} msg={m} isRoom={isRoom} botsById={botsById} onAction={onAction} />
            ))}
            {typing && <Typing color={typing.color} text={typing.text} />}
            {progress}
          </div>
        </div>

        <Composer
          placeholder={`Message ${title}`}
          value={draft}
          onChange={setDraft}
          inputRef={inputRef}
          busy={Boolean(pending) || busy}
          onSend={onSend}
          onStop={onStop}
          onAttachment={onAttachment}
        />
      </main>

      {panelOpen &&
        (renderPanel ? renderPanel(() => setPanelOpen(false)) : isRoom ? (
          <RoomPanel room={room} botsById={botsById} onClose={() => setPanelOpen(false)} onClear={onClear} />
        ) : (
          <BotPanel bot={bot} onClose={() => setPanelOpen(false)} onClear={onClear} />
        ))}
    </>
  );
}
