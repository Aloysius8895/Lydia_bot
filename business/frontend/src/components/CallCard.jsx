import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar } from './Avatars.jsx';
import { api } from '../api.js';
import { createRecognizer, detectVoice, requestMic, speak, stopAllSpeech, voicesFor } from '../voice.js';

const turnLabels = {
  idle: '已接通 · 点击麦克风开始说话，或直接输入文字',
  requesting_permission: '正在请求麦克风权限…',
  listening: '正在听 · 说完后再点一次麦克风结束本轮',
  transcribing: '正在整理识别结果…',
  review: '请检查识别文字，可修改后发送',
  queued: '排队中 · 等待共享推理通道（可取消）',
  thinking: '思考中 · 专家正在生成回答（可取消）',
  speaking: '正在朗读 · 点麦克风可打断并开始新一轮',
  interrupted: '已停止朗读',
  error: '出错 · 可重试或改用文字',
};
const LANGS = [['zh-CN', '简体中文'], ['en-US', 'English']];
const locations = { BROWSER_VENDOR_SERVICE_POSSIBLE: '可能由浏览器厂商的在线服务处理，需要联网', ON_DEVICE_REPORTED: '浏览器报告可在本机识别', UNKNOWN: '处理位置未知' };
const labels = { SOURCE_SUPPORTED: '来源支持', RESEARCH_INFERENCE: '研究推断', TO_VALIDATE: '待验证' };
const playbackText = { PLAYED: '朗读完成（浏览器报告）', INTERRUPTED: '朗读被打断', SKIPPED_SPEAKER_OFF: '扬声器关闭，未朗读', NO_VOICE: '无可用音色，未朗读', FAILED: '朗读失败' };
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const join = (a, b, lang) => (a ? a + (lang.startsWith('zh') ? '' : ' ') + b : b);
const BUSY = ['queued', 'thinking'];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Turn({ turn, onCorrect }) {
  const reply = turn.reply, last = turn.corrections?.at(-1);
  return <li className="call-turn">
    <div className="call-turn__me">
      <span className="call-turn__tag">你 · {turn.input_source === 'BROWSER_STT' ? `语音识别${turn.stt?.edited ? '（已修改）' : ''}` : '文字'}</span>
      <p>{turn.user_text}</p>
      {last && <p className="call-turn__correction">更正记录：{last.text}<small>（只更正记录，未重新生成回答）</small></p>}
      {onCorrect && !BUSY.includes(turn.status.toLowerCase()) && <button type="button" className="call-link" onClick={() => onCorrect(turn)}>更正转写</button>}
    </div>
    {reply && <div className="call-turn__expert">
      <span className="call-turn__tag">{reply.expert_name} · <span className={`call-label call-label--${reply.claim_label}`}>{labels[reply.claim_label]}</span></span>
      <p>{reply.display_text}</p>
      {reply.evidence_ids?.length > 0 && <p className="call-turn__meta">证据：{reply.evidence_ids.join('、')}</p>}
      {reply.limitations?.length > 0 && <p className="call-turn__meta">限制：{reply.limitations.join('；')}</p>}
      {reply.proposed_actions?.length > 0 && <div className="call-turn__actions"><span>候选动作（未执行，需在原有流程中明确确认）</span><ul>{reply.proposed_actions.map((a, i) => <li key={i}>{a.description}</li>)}</ul></div>}
      <p className="call-turn__meta">{turn.playback?.status ? `${playbackText[turn.playback.status]}${turn.playback.progress === 'UNKNOWN' ? '，实际播放进度未知' : ''}` : '朗读：未报告'}</p>
    </div>}
    {turn.status === 'QUEUED' && <p className="call-turn__pending">排队中…</p>}
    {turn.status === 'THINKING' && <p className="call-turn__pending">{'思考中…'}</p>}
    {turn.status === 'FAILED' && <p className="call-turn__error" role="alert">{turn.error?.message || '本轮未成功'}（{turn.error?.code}）</p>}
    {turn.status === 'CANCELLED' && <p className="call-turn__pending">本轮已取消{turn.error?.message ? `：${turn.error.message}` : ''}</p>}
  </li>;
}

export default function CallCard({ bot, caseId, caseTitle, isMobile, onClose, controlRef }) {
  const [phase, setPhase] = useState('setup');
  const [turnPhase, setTurnPhase] = useState('idle');
  const [lang, setLang] = useState('zh-CN'), [caps, setCaps] = useState(null), [voiceURI, setVoiceURI] = useState('');
  const [speakerOn, setSpeakerOn] = useState(true), [captions, setCaptions] = useState(true), [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState(''), [interim, setInterim] = useState(''), [sttOriginal, setSttOriginal] = useState(null);
  const [turns, setTurns] = useState([]), [message, setMessage] = useState(''), [elapsed, setElapsed] = useState(0);
  const [records, setRecords] = useState(null), [viewing, setViewing] = useState(null);
  const call = useRef(null), gen = useRef(0), rec = useRef(null), speech = useRef(null), poll = useRef(null), activeTurn = useRef(null);
  const startedAt = useRef(0), endClick = useRef(0), mounted = useRef(true), pendingKey = useRef(null), listRef = useRef(null);
  const voices = caps ? voicesFor(caps.tts.voices, lang) : [];
  const voice = voices.find(v => v.voiceURI === voiceURI) || voices[0] || null;
  const live = useRef({}); live.current = { speakerOn, voice, lang, caps };

  useEffect(() => { let ignore = false; setCaps(null); detectVoice(lang).then(c => { if (!ignore) setCaps(c); }); return () => { ignore = true; }; }, [lang]);
  useEffect(() => {
    if (phase !== 'active') return undefined;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns, interim]);

  const path = (callId, suffix = '') => `/api/cases/${caseId}/calls/${callId}${suffix}`;
  function stopLocal() {
    gen.current++;
    rec.current?.abort(); rec.current = null;
    speech.current?.stop(); speech.current = null; stopAllSpeech();
    clearTimeout(poll.current); poll.current = null; activeTurn.current = null;
  }
  function endBeacon() {
    const c = call.current; if (!c) return; call.current = null;
    api(path(c.id, '/end'), 'POST', {}, { keepalive: true }).catch(() => {});
  }
  async function hangup() {
    const c = call.current; stopLocal(); setTurnPhase('idle'); setInterim('');
    if (!c) return; call.current = null; setPhase('ended');
    try { await api(path(c.id, '/end'), 'POST', {}); } catch (e) { if (mounted.current) setMessage(`本机已停止收音和朗读，但服务器未确认挂断：${e.message}`); }
  }
  useEffect(() => {
    mounted.current = true;
    const onHide = () => { stopLocal(); endBeacon(); };
    window.addEventListener('pagehide', onHide);
    // Unmount covers project/expert switches, logout and closing: release everything, drop late callbacks.
    return () => { window.removeEventListener('pagehide', onHide); mounted.current = false; stopLocal(); endBeacon(); };
  }, []);
  useEffect(() => { if (!controlRef) return undefined; controlRef.current = { hangup }; return () => { controlRef.current = null; }; });

  async function connect() {
    const g = ++gen.current; setPhase('connecting'); setMessage('');
    try {
      const c = await api(`/api/cases/${caseId}/calls`, 'POST', { role: bot.id, request_key: crypto.randomUUID(), lang });
      if (g !== gen.current || !mounted.current) { api(path(c.id, '/end'), 'POST', {}).catch(() => {}); return; }
      call.current = c; startedAt.current = Date.now(); setElapsed(0); setTurns([]); setDraft(''); setSttOriginal(null); setTurnPhase('idle'); setPhase('active');
    } catch (e) { if (g === gen.current) { setPhase('setup'); setMessage(e.message); } }
  }

  function interruptSpeech() { speech.current?.stop(); speech.current = null; setTurnPhase('interrupted'); }

  async function micPress() {
    if (phase !== 'active') return;
    if (turnPhase === 'listening') { endClick.current = Date.now(); setTurnPhase('transcribing'); rec.current?.stop(); return; }
    if (BUSY.includes(turnPhase) || turnPhase === 'requesting_permission' || turnPhase === 'transcribing') return;
    if (turnPhase === 'speaking') interruptSpeech();
    if (!caps?.stt.available) { setMessage('当前未配置可用的语音识别：此浏览器没有 SpeechRecognition。请使用 Chrome / Edge，或直接输入文字。'); return; }
    const g = gen.current, prefix = draft.trim(), current = lang;
    setMessage(''); setTurnPhase('requesting_permission');
    const permission = await requestMic();
    if (g !== gen.current || !mounted.current) return;
    if (!permission.ok) { setTurnPhase('error'); setMessage(permission.reason); return; }
    try {
      const r = createRecognizer({
        lang: current, processLocally: caps.stt.location === 'ON_DEVICE_REPORTED',
        onText: (fin, int) => { if (g === gen.current) { setDraft(join(prefix, fin, current)); setInterim(int); } },
        onError: m => { if (g === gen.current) setMessage(m); },
        onEnd: ({ text, confidence }) => {
          if (g !== gen.current) return; rec.current = null; setInterim('');
          if (!text) { setTurnPhase(prefix ? 'review' : 'idle'); setMessage(m => m || '没有识别到文字。可以再试一次，或直接输入。'); return; }
          const full = join(prefix, text, current); setDraft(full);
          setSttOriginal({ text: full, confidence, recognition_ms: endClick.current ? Date.now() - endClick.current : null }); endClick.current = 0;
          setTurnPhase('review');
        },
      });
      rec.current = r; r.start(); setTurnPhase('listening');
    } catch (e) { setTurnPhase('error'); setMessage(e.message || '无法启动语音识别'); }
  }

  function play(turn, g) {
    const { speakerOn: on, voice: v, lang: l, caps: c } = live.current;
    let startDelay = null;
    const report = result => api(path(turn.call_id, `/turns/${turn.id}/playback`), 'POST', { status: result.status, progress: result.progress, error: result.error || null, voice_name: v?.name || null, voice_local: v ? Boolean(v.localService) : null, lang: l, start_delay_ms: startDelay })
      .then(r => { if (mounted.current) setTurns(list => list.map(t => (t.id === turn.id ? r.turn : t))); }).catch(() => {});
    if (!on) { void report({ status: 'SKIPPED_SPEAKER_OFF', progress: 'NONE' }); setTurnPhase('idle'); return; }
    if (!c?.tts.available || !v) { void report({ status: 'NO_VOICE', progress: 'NONE' }); setTurnPhase('idle'); setMessage(`没有可用的${l.startsWith('zh') ? '中文' : '英文'}朗读音色，仅显示文字。`); return; }
    const t0 = Date.now(), s = speak(turn.reply.spoken_text, { voice: v, lang: l, onStart: () => { startDelay = Date.now() - t0; } });
    speech.current = s; setTurnPhase('speaking');
    s.promise.then(result => {
      void report(result); if (speech.current === s) speech.current = null;
      if (g !== gen.current || !mounted.current) return;
      setTurnPhase(tp => (tp === 'speaking' ? (result.status === 'FAILED' ? 'error' : 'idle') : tp));
      if (result.status === 'FAILED') setMessage('朗读失败，回答已显示为文字。');
    });
  }

  async function watch(callId, id, g) {
    try {
      const { turn } = await api(path(callId, `/turns/${id}`));
      if (g !== gen.current || !mounted.current) return;
      setTurns(list => list.map(t => (t.id === id ? turn : t)));
      if (turn.status === 'QUEUED' || turn.status === 'THINKING') { setTurnPhase(turn.status.toLowerCase()); poll.current = setTimeout(() => watch(callId, id, g), 1000); return; }
      activeTurn.current = null;
      if (turn.status === 'COMPLETED') play(turn, g);
      else if (turn.status === 'FAILED') { setTurnPhase('error'); setMessage(`${turn.error?.message || '本轮未成功'}。可以重新发送或改用文字。`); }
      else setTurnPhase('idle');
    } catch (e) {
      if (g !== gen.current || !mounted.current) return;
      setMessage(`查询状态失败：${e.message}；稍后自动重试`); poll.current = setTimeout(() => watch(callId, id, g), 2000);
    }
  }

  async function send(event) {
    event?.preventDefault();
    const text = draft.trim(), c = call.current;
    if (!text || !c || BUSY.includes(turnPhase) || turnPhase === 'listening' || turnPhase === 'transcribing' || turnPhase === 'requesting_permission') return;
    if (turnPhase === 'speaking') interruptSpeech();
    const g = gen.current;
    const key = pendingKey.current?.text === text ? pendingKey.current.key : crypto.randomUUID(); pendingKey.current = { text, key };
    const body = sttOriginal
      ? { request_key: key, text, input_source: 'BROWSER_STT', stt: { provider: caps.stt.provider, lang, processing_location: caps.stt.location, confidence: sttOriginal.confidence, transcript_original: sttOriginal.text.slice(0, 2000), edited: text !== sttOriginal.text.trim(), recognition_ms: sttOriginal.recognition_ms } }
      : { request_key: key, text, input_source: 'TEXT' };
    setMessage(''); setTurnPhase('queued');
    try {
      const r = await api(path(c.id, '/turns'), 'POST', body);
      pendingKey.current = null;
      if (g !== gen.current || !mounted.current) return;
      activeTurn.current = r.turn.id; setTurns(list => [...list.filter(t => t.id !== r.turn.id), r.turn]); setDraft(''); setSttOriginal(null);
      void watch(c.id, r.turn.id, g);
    } catch (e) { if (g === gen.current) { setTurnPhase('error'); setMessage(e.message); } }
  }

  async function cancelTurn() {
    const id = activeTurn.current, c = call.current; if (!id || !c) return;
    clearTimeout(poll.current); poll.current = null; const g = ++gen.current;
    try { const r = await api(path(c.id, `/turns/${id}/cancel`), 'POST', {}); if (g === gen.current) { setTurns(list => list.map(t => (t.id === id ? r.turn : t))); activeTurn.current = null; setTurnPhase('idle'); } }
    catch (e) { if (g === gen.current) { setMessage(e.message); void watch(c.id, id, g); } }
  }

  function toggleSpeaker() {
    if (speakerOn && speech.current) interruptSpeech();
    setSpeakerOn(!speakerOn);
  }

  async function correct(turn) {
    const text = window.prompt('更正这条转写记录（已发送的原文保留；不会重新生成回答）：', turn.corrections?.at(-1)?.text || turn.user_text);
    if (!text?.trim() || text.trim() === turn.user_text) return;
    try { const r = await api(path(turn.call_id, `/turns/${turn.id}/correction`), 'POST', { text: text.trim() }); setTurns(list => list.map(t => (t.id === turn.id ? r.turn : t))); setViewing(v => (v ? { ...v, turns: v.turns.map(t => (t.id === turn.id ? r.turn : t)) } : v)); }
    catch (e) { setMessage(e.message); }
  }

  async function toggleRecords() {
    if (records) { setRecords(null); setViewing(null); return; }
    try { setRecords(await api(`/api/cases/${caseId}/calls`)); } catch (e) { setMessage(e.message); }
  }
  async function viewRecord(id) { try { setViewing(await api(path(id))); } catch (e) { setMessage(e.message); } }
  async function exportRecord(id) { try { const r = await api(path(id, '/export')); download(r.filename, r.markdown); } catch (e) { setMessage(e.message); } }
  async function deleteRecord(id) {
    if (!window.confirm('删除这次通话的全部文字记录？此操作不能撤销。')) return;
    try {
      await api(path(id), 'DELETE');
      setRecords(list => list.filter(c => c.id !== id)); if (viewing?.call.id === id) setViewing(null);
      if (call.current?.id === id) { stopLocal(); call.current = null; setPhase('ended'); }
      setTurns(list => (list[0]?.call_id === id ? [] : list));
    } catch (e) { setMessage(e.message); }
  }

  async function close() { if (call.current) await hangup(); onClose(); }

  const listening = turnPhase === 'listening', busy = BUSY.includes(turnPhase);
  const micDisabledReason = phase !== 'active' ? '尚未接通' : busy ? '专家正在回答；可先取消本轮' : turnPhase === 'transcribing' || turnPhase === 'requesting_permission' ? '请稍候' : !caps ? '正在检查语音能力' : !caps.stt.available ? '当前未配置可用的语音识别，请用文字输入' : '';
  const status = phase === 'setup' ? '未接通 · 检查语音能力后点击接通' : phase === 'connecting' ? '正在建立通话…' : phase === 'ended' ? `通话已结束 · ${fmt(elapsed)}` : turnLabels[turnPhase];
  const voiceSummary = !caps ? '检测中…' : !caps.tts.available ? '浏览器不支持朗读，仅显示文字' : voices.length ? `${voices.length} 个可用音色（${voices.filter(v => v.localService).length} 个本机）` : '没有该语言的音色，仅显示文字';
  const sttSummary = !caps ? '检测中…' : caps.stt.available ? `${caps.stt.provider} · ${locations[caps.stt.location]}` : '当前未配置可用的语音识别；可以用文字通话';
  const micSummary = !caps ? '检测中…' : !caps.mic.secure ? '非安全上下文，浏览器不允许麦克风（手机需受信任 HTTPS）' : !caps.mic.api ? '浏览器不支持麦克风访问' : '点击麦克风时才请求权限；应用不录制或上传音频';
  const shownTurns = viewing ? viewing.turns : turns;

  return <section className={`call-card${isMobile ? ' call-card--mobile' : ''}${collapsed ? ' call-card--collapsed' : ''}`} aria-label={`与 ${bot.name} 的语音通话`}>
    <div className="call-card__top">
      <button type="button" className="call-icon-btn" aria-label={records ? '返回通话' : '通话记录'} aria-pressed={Boolean(records)} onClick={toggleRecords}><Icon name={records ? 'back' : 'clock'} size={17} /></button>
      <span className="call-card__badge" title="该专家的语音通话尚未经过真实设备验收">待实测验证</span>
      <div>
        <button type="button" className="call-icon-btn" aria-label={collapsed ? '展开通话卡片' : '收起通话卡片（不会挂断）'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Icon name={collapsed ? 'chevronDown' : 'chevronUp'} size={17} /></button>
        <button type="button" className="call-icon-btn" aria-label={call.current ? '挂断并关闭通话卡片' : '关闭通话卡片'} onClick={close}><Icon name="close" size={17} /></button>
      </div>
    </div>
    <div className="call-card__identity">
      <BotAvatar color={bot.color} size={collapsed ? 40 : 76} />
      <div>
        <strong className="call-card__name">{bot.name}</strong>
        <span className="call-card__project" title={caseTitle}>AI 方法角色 · {caseTitle || '未选择项目'}</span>
        <span className="call-card__timer" aria-label="通话时长">{phase === 'active' || phase === 'ended' ? fmt(elapsed) : '--:--'}</span>
      </div>
    </div>
    <p className="call-card__status" role="status" aria-live="polite">{status}</p>

    {!collapsed && records && <div className="call-records">
      {viewing ? <><button type="button" className="call-link" onClick={() => setViewing(null)}>← 返回记录列表</button><ol className="call-turns" ref={listRef}>{viewing.turns.map(t => <Turn key={t.id} turn={t} onCorrect={correct} />)}{!viewing.turns.length && <li className="call-turn__pending">这次通话没有轮次。</li>}</ol></>
        : <ul>{records.map(c => <li key={c.id}><span><strong>{c.meta?.expert_name || c.role}</strong><small>{new Date(c.created_at).toLocaleString()} · {c.turn_count} 轮 · {c.status === 'ACTIVE' ? '进行中' : '已结束'}</small></span>
          <span><button type="button" className="call-link" onClick={() => viewRecord(c.id)}>查看</button><button type="button" className="call-link" onClick={() => exportRecord(c.id)}>导出</button><button type="button" className="call-link call-link--danger" onClick={() => deleteRecord(c.id)}>删除</button></span></li>)}
          {!records.length && <li className="call-turn__pending">这个项目还没有通话记录。</li>}</ul>}
      <p className="call-card__note">记录是系统用户与 AI 方法角色的对话，不是真人访谈或市场证据。</p>
    </div>}

    {!collapsed && !records && phase === 'setup' && <div className="call-setup">
      <dl>
        <div><dt>语音识别</dt><dd>{sttSummary}</dd></div>
        <div><dt>麦克风</dt><dd>{micSummary}</dd></div>
        <div><dt>朗读</dt><dd>{voiceSummary}</dd></div>
        <div><dt>回答</dt><dd>共享 Claude CLI 串行通道，非流式；研究任务进行中时会排队</dd></div>
      </dl>
      <label>语言<select value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
      <label>朗读音色<select value={voice?.voiceURI || ''} onChange={e => setVoiceURI(e.target.value)} disabled={!voices.length}>{voices.length ? voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}（{v.localService ? '本机' : '在线'}）</option>) : <option value="">无可用音色</option>}</select></label>
    </div>}

    {!collapsed && !records && (phase === 'active' || phase === 'ended') && <>
      {captions && <ol className="call-turns" ref={listRef} aria-label="通话字幕">
        {shownTurns.map(t => <Turn key={t.id} turn={t} onCorrect={correct} />)}
        {!shownTurns.length && <li className="call-turn__pending">{phase === 'active' ? '开始说话或输入文字。普通通话不会自动启动完整研究。' : '本次通话没有轮次。'}</li>}
        {interim && <li className="call-turn__interim" aria-live="polite">识别中：{interim}</li>}
      </ol>}
      {phase === 'active' && <form className="call-draft" onSubmit={send}>
        <label className="call-draft__label" htmlFor="call-draft">{sttOriginal ? '识别文字（发送前可修改，数字、金额、否定词请核对）' : '输入文字或使用麦克风'}</label>
        <textarea id="call-draft" rows={2} maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} disabled={listening || turnPhase === 'transcribing'}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} placeholder={`对 ${bot.name} 说…`} />
        <div className="call-draft__row">
          <button type="button" className="call-link" onClick={() => setCaptions(!captions)} aria-pressed={captions}>{captions ? '隐藏字幕' : '显示字幕'}</button>
          {draft && !busy && <button type="button" className="call-link" onClick={() => { setDraft(''); setSttOriginal(null); }}>清空</button>}
          {busy ? <button type="button" className="call-send" onClick={cancelTurn}>取消本轮</button> : <button type="submit" className="call-send" disabled={!draft.trim() || listening || turnPhase === 'transcribing'}>发送</button>}
        </div>
      </form>}
    </>}

    {message && <p className="call-card__msg" role="alert">{message}<button type="button" aria-label="关闭提示" onClick={() => setMessage('')}>×</button></p>}

    <div className="call-card__controls">
      <div className="call-ctl"><button type="button" className={`call-btn${speakerOn ? '' : ' call-btn--off'}`} aria-label={speakerOn ? '关闭朗读' : '打开朗读'} aria-pressed={speakerOn} onClick={toggleSpeaker}><Icon name={speakerOn ? 'speaker' : 'speakerOff'} size={22} /></button><span>{speakerOn ? '朗读开' : '朗读关'}</span></div>
      {phase === 'active' || phase === 'connecting'
        ? <div className="call-ctl" key="hangup"><button type="button" className="call-btn call-btn--hangup" aria-label="挂断" onClick={hangup} disabled={phase === 'connecting'}><Icon name="hangup" size={26} /></button><span>挂断</span></div>
        : <div className="call-ctl" key="answer"><button type="button" className="call-btn call-btn--answer" aria-label={phase === 'ended' ? `重新拨打 ${bot.name}` : `接通 ${bot.name}`} onClick={connect} disabled={!caseId}><Icon name="call" size={24} /></button><span>{phase === 'ended' ? '重新拨打' : '接通'}</span></div>}
      <div className="call-ctl"><button type="button" className={`call-btn${listening ? ' call-btn--live' : ''}`} aria-label={listening ? '结束本轮说话' : '开始说话'} aria-pressed={listening} onClick={micPress} disabled={Boolean(micDisabledReason)} title={micDisabledReason || undefined}><Icon name={caps && !caps.stt.available ? 'micOff' : 'mic'} size={22} /></button><span>{listening ? '结束本轮' : '开始说话'}</span></div>
    </div>
    {micDisabledReason && phase === 'active' && <p className="call-card__hint">麦克风不可用：{micDisabledReason}</p>}
  </section>;
}
