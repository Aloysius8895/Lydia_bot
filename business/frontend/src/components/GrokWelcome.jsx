import { BotAvatar, StackedAvatars } from './Avatars.jsx';
import Icon from './Icon.jsx';

export default function GrokWelcome({ bot, room, members, onPick, onAttachment }) {
  const title = room ? room.name : bot.name;
  const starters = (room || bot).starters || [];
  return <section className="grok-welcome" aria-label="会话起点">
    <div className="grok-welcome__avatar">{room ? <StackedAvatars colors={members.map(b => b.color)} /> : <BotAvatar color={bot.color} size={82} />}</div>
    <span className="grok-eyebrow">{room ? 'YOUR RESEARCH TEAM' : 'YOUR RESEARCH PARTNER'}</span>
    <h1>{title}</h1><p className="grok-welcome__intro">{room ? '把问题交给团队，Steve 会按研究阶段协调专家。' : '从一个问题开始，把想法变成有依据的判断。'}</p>
    <div className="grok-starter-grid">{starters.map((text, index) => <button type="button" className="grok-starter" onClick={() => onPick(text)} key={text}><Icon name={['target', 'search', 'doc'][index % 3]} size={20} /><span>{text}</span><Icon name="chevronRight" size={16} /></button>)}</div>
    <button type="button" className="grok-inline-action" onClick={onAttachment}><Icon name="plus" size={16} />先添加项目资料</button>
  </section>;
}
