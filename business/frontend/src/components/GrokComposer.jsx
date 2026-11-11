import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export const MODELS = [
  { id: 'opus', label: 'Opus 5.5', note: '最强，适合复杂判断，较慢' },
  { id: 'sonnet', label: 'Sonnet 5.5', note: '日常推荐，速度和质量平衡' },
  { id: 'haiku', label: 'Haiku 5.5', note: '最快，适合简单问答' },
];
export const EFFORTS = [{ id: 'low', label: '低' }, { id: 'medium', label: '中' }, { id: 'high', label: '高' }];

const Flask = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21.5h11.6a2 2 0 001.7-3L14 9V3" /><path d="M7.5 15h9" /></svg>;
const Blocks = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></svg>;
const Up = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>;

/** Mode toggles and model picker under the message box. mode: 'chat' | 'research' | 'model'. */
function Controls({ controls }) {
  const { mode, onMode, model, onModel, canModel } = controls;
  const [open, setOpen] = useState(false), anchor = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (e.type === 'keydown' ? e.key === 'Escape' : !anchor.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const current = MODELS.find(m => m.id === model.id) || MODELS[1], effort = EFFORTS.find(e => e.id === model.effort) || EFFORTS[0];
  const toggle = value => onMode(mode === value ? 'chat' : value);
  return <>
    <button type="button" className={'composer-chip' + (mode === 'research' ? ' is-on' : '')} aria-pressed={mode === 'research'} title="开启后，消息会启动 5 位专家的完整研究（联网搜索 + 来源引用）；再点一次关闭" onClick={() => toggle('research')}><Flask />完整研究</button>
    {canModel && <button type="button" className={'composer-chip' + (mode === 'model' ? ' is-on' : '')} aria-pressed={mode === 'model'} title="为已选定的 Gap 设计商业模式和验证计划；再点一次关闭" onClick={() => toggle('model')}><Blocks />商业模式</button>}
    <span className="composer-sep" />
    <span className="composer-menu-anchor" ref={anchor}>
      {open && <div className="composer-menu" role="menu" aria-label="选择模型">
        <h6>模型</h6>
        {MODELS.map(m => <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === current.id} className={'row' + (m.id === current.id ? ' is-on' : '')} onClick={() => onModel({ ...model, id: m.id })}><span>{m.label}<small>{m.note}</small></span><em>{m.id === current.id ? '✓' : ''}</em></button>)}
        <h6>思考强度</h6>
        <div className="effort" role="group" aria-label="思考强度">{EFFORTS.map(e => <button key={e.id} type="button" aria-pressed={e.id === effort.id} className={e.id === effort.id ? 'is-on' : ''} onClick={() => onModel({ ...model, effort: e.id })}>{e.label}</button>)}</div>
        <p>聊天回复用这个模型；开启「完整研究」或「商业模式」时，专家和最终复核也用它。查询扩展、排序、引用检查仍用 Haiku。</p>
      </div>}
      <button type="button" className="composer-chip composer-model" aria-haspopup="menu" aria-expanded={open} aria-label={`模型：${current.label}，思考强度${effort.label}`} onClick={() => setOpen(v => !v)}><b>{current.label}</b><i>{effort.label}</i><Up /></button>
    </span>
  </>;
}

export default function GrokComposer({ placeholder, value, onChange, inputRef, busy, onSend, onStop, onAttachment, controls }) {
  const form = useRef(null), submitting = useRef(false);
  useEffect(() => {
    const input = inputRef.current;
    if (input) { input.style.height = 'auto'; input.style.height = Math.min(180, Math.max(26, input.scrollHeight)) + 'px'; }
  }, [value, inputRef]);
  async function submit(event) {
    event.preventDefault();
    if (!value.trim() || busy || submitting.current) return;
    submitting.current = true;
    try { if (await onSend(value.trim()) !== false) onChange(''); }
    finally { submitting.current = false; }
  }
  const mode = controls?.mode || 'chat';
  const hint = mode === 'research' ? '描述要研究的问题，例如：新加坡中小物流公司在用什么调度工具？' : mode === 'model' ? '补充你对商业模式的想法，或直接发送开始' : placeholder;
  return <div className="composer-wrap grok-composer-wrap">
    <form className="composer grok-composer" ref={form} onSubmit={submit}>
      <textarea ref={inputRef} rows={1} maxLength={8000} value={value} onChange={e => onChange(e.target.value)} placeholder={hint} aria-label={placeholder}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!busy) form.current?.requestSubmit(); } }} />
      <div className="grok-composer__toolbar"><div className="grok-composer__tools">
        <button type="button" className="composer__add" aria-label="Add attachment" title="添加案件资料" onClick={onAttachment}><Icon name="plus" size={18} /></button>
        {controls && <Controls controls={controls} />}
      </div><div className="grok-composer__right">
        {value.length > 7000 ? <span className="composer-note">{value.length}/8000</span> : mode === 'research' ? <span className="composer-note">发送后启动 <b>5 位专家</b>完整研究，约 5–15 分钟</span> : mode === 'model' ? <span className="composer-note">发送后为选定 Gap 设计<b>商业模式</b></span> : null}
        {busy ? <button type="button" className="composer__send" aria-label="Stop replying" onClick={onStop}><Icon name="stop" size={17} /></button> : <button type="submit" className="composer__send" aria-label="Send message" disabled={!value.trim()}><Icon name="send" size={18} /></button>}
      </div></div>
    </form>
    <p className="grok-composer__footnote">{mode === 'chat' ? '普通对话由 Claude 直接回答，不查资料；需要带来源的结论请开启「完整研究」。' : '研究结论以来源为依据，未知信息会保留待验证。'}</p>
  </div>;
}
