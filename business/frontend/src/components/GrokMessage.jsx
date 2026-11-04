import { useState } from 'react';
import RichText from './RichText.jsx';
import { BotAvatar } from './Avatars.jsx';
import Icon from './Icon.jsx';

export default function GrokMessage({ message, bot }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  const mine = message.from === 'me';
  async function copy() {
    try { await navigator.clipboard.writeText(message.text); setCopied(true); setError(''); }
    catch { setError('无法复制，请选择正文手动复制。'); }
  }
  return <article className={`grok-message ${mine ? 'grok-message--me' : 'grok-message--bot'}`}>
    <div className="grok-message__heading">{!mine && <BotAvatar color={bot?.color || 'ink'} size={26} />}<strong>{mine ? 'You' : bot?.name || '研究团队'}</strong></div>
    <div className={`bubble ${mine ? 'bubble--me' : 'bubble--bot'}`}><RichText text={message.text} /></div>
    <div className="grok-message__actions"><button type="button" className="grok-inline-action" aria-label={mine ? '复制我的消息' : '复制回复'} onClick={copy}><Icon name="copy" size={14} />{copied ? '已复制' : '复制'}</button>{copied && <span role="status">已复制到剪贴板</span>}{error && <span role="alert">{error}</span>}</div>
  </article>;
}
