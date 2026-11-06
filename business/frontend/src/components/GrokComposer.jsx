import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function GrokComposer({ placeholder, value, onChange, inputRef, busy, onSend, onStop, onAttachment }) {
  const form = useRef(null), submitting = useRef(false);
  useEffect(() => {
    const input = inputRef.current;
    if (input) { input.style.height = 'auto'; input.style.height = Math.min(180, Math.max(28, input.scrollHeight)) + 'px'; }
  }, [value, inputRef]);
  async function submit(event) {
    event.preventDefault();
    if (!value.trim() || busy || submitting.current) return;
    submitting.current = true;
    try { if (await onSend(value.trim()) !== false) onChange(''); }
    finally { submitting.current = false; }
  }
  return <div className="composer-wrap grok-composer-wrap">
    <form className="composer grok-composer" ref={form} onSubmit={submit}>
      <textarea ref={inputRef} rows={1} maxLength={8000} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!busy) form.current?.requestSubmit(); } }} />
      <div className="grok-composer__toolbar"><div className="grok-composer__tools">
        <button type="button" className="composer__add" aria-label="Add attachment" title="添加案件资料" onClick={onAttachment}><Icon name="plus" size={18} /></button>
        <button type="button" className="grok-composer__source" onClick={onAttachment}><Icon name="doc" size={15} />资料与引用</button>
      </div><div className="grok-composer__right"><span className="grok-composer__hint">{value.length > 7000 ? `${value.length}/8000` : 'Enter 发送 · Shift+Enter 换行'}</span>
        {busy ? <button type="button" className="composer__send" aria-label="Stop replying" onClick={onStop}><Icon name="stop" size={17} /></button> : <button type="submit" className="composer__send" aria-label="Send message" disabled={!value.trim()}><Icon name="send" size={18} /></button>}
      </div></div>
    </form>
    <p className="grok-composer__footnote">研究结论以来源为依据，未知信息会保留待验证。</p>
  </div>;
}
