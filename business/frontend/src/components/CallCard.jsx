import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar } from './Avatars.jsx';
import { api } from '../api.js';
import { createRecognizer, detectVoice, openActivityMonitor, speak, stopAllSpeech, voicesFor } from '../voice.js';

import { ContinuousInput } from '../call-controller.js';
import { CallSession } from '../call-session.js';
import { remoteSpeech } from '../remote-voice.js';

const turnLabels = {
  idle: '已接通 · 正在听你说', listening: '已接通 · 正在听你说',
  user_speaking: '正在听你说 · 停顿后自动发送', transcribing: '正在整理识别结果…',
  reconnecting: '正在恢复语音识别…', muted: '麦克风已静音',
  queued: '排队中 · 仍可补充或纠正', thinking: '专家正在思考 · 仍可补充或纠正',
  speaking: '专家正在说 · 可以直接开口打断', interrupted: '已打断 · 正在听你说',
  answer_error: '本次回答失败 · 可重试，或继续说话',
  error: '语音受限 · 可恢复语音或使用文字',
};
const LANGS = [['zh-CN', '简体中文'], ['en-US', 'English']];
const locations = { BROWSER_VENDOR_SERVICE_POSSIBLE: '可能由浏览器厂商的在线服务处理，需要联网', ON_DEVICE_REPORTED: '浏览器报告可在本机识别', UNKNOWN: '处理位置未知' };
const labels = { SOURCE_SUPPORTED: '来源支持', RESEARCH_INFERENCE: '研究推断', TO_VALIDATE: '待验证' };
const playbackText = { PLAYED: '朗读完成（浏览器报告）', INTERRUPTED: '朗读被打断', SKIPPED_SPEAKER_OFF: '扬声器关闭，未朗读', NO_VOICE: '无可用音色，未朗读', FAILED: '朗读失败' };
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
  const [ttsConfig,setTtsConfig]=useState(null),[ttsProvider,setTtsProvider]=useState('browser'),[cloudVoices,setCloudVoices]=useState([]),[playMode,setPlayMode]=useState('');
  const [speakerOn, setSpeakerOn] = useState(true), [captions, setCaptions] = useState(true), [collapsed, setCollapsed] = useState(false);
  const [inputPhase, setInputPhase] = useState('idle'), [muted, setMuted] = useState(false), [voiceMode, setVoiceMode] = useState(false);
  const [draft, setDraft] = useState(''), [interim, setInterim] = useState('');
  const [turns, setTurns] = useState([]), [message, setMessage] = useState(''), [elapsed, setElapsed] = useState(0);
  const [records, setRecords] = useState(null), [viewing, setViewing] = useState(null);
  const call = useRef(null), gen = useRef(0), input = useRef(null), monitor = useRef(null), session = useRef(null);
  const startedAt = useRef(0), mounted = useRef(true), listRef = useRef(null), voiceStarting = useRef(false);
  const abortVoiceStart = useRef(null);
  const browserVoices = caps ? voicesFor(caps.tts.voices, lang) : [];
  const savedVoice = ttsConfig?.role_voices?.[bot.id] || ttsConfig?.voice_id;
  const remoteVoices=cloudVoices.map(v=>({voiceURI:v.voice_id,name:v.name,lang,localService:false}));
  if(savedVoice&&!remoteVoices.some(v=>v.voiceURI===savedVoice))remoteVoices.unshift({voiceURI:savedVoice,name:'已保存的 ElevenLabs 音色',lang,localService:false});
  const voices=ttsProvider==='elevenlabs'?remoteVoices:browserVoices;
  const voice = voices.find(v => v.voiceURI === voiceURI) || (ttsProvider==='elevenlabs'&&voices.find(v=>v.voiceURI===savedVoice)) || voices[0] || null;
  const live = useRef({}); live.current = { speakerOn, voice, lang, ttsProvider,ttsConfig,
    caps:ttsProvider==='elevenlabs'?{...caps,tts:{available:!!(ttsConfig?.key_configured&&voice)}}:caps };

  useEffect(()=>{
    let valid=true;
    const load=async()=>{try{const c=await api('/api/voice/tts/settings');if(!valid)return;setTtsConfig(c);setTtsProvider(c.provider);setVoiceURI('');
      if(c.key_configured&&c.provider==='elevenlabs'){const list=await api('/api/voice/tts/voices');if(valid)setCloudVoices(list.voices);}
    }catch(e){if(valid)setMessage(e.message);}};
    void load();window.addEventListener('lydia-voice-settings-changed',load);
    return()=>{valid=false;window.removeEventListener('lydia-voice-settings-changed',load);};
  },[]);

  async function chooseProvider(value){
    try{const c=await api('/api/voice/tts/settings','POST',{provider:value,voice_id:ttsConfig?.voice_id||'',model_id:ttsConfig?.model_id||'eleven_flash_v2_5',role_voices:ttsConfig?.role_voices||{}});
      if(mounted.current){setTtsConfig(c);setTtsProvider(c.provider);setVoiceURI('');}
      if(c.provider==='elevenlabs'){const list=await api('/api/voice/tts/voices');if(mounted.current)setCloudVoices(list.voices);}}
    catch(e){setMessage(e.message);}
  }
  function providerSpeak(text,options){
    const current=live.current;
    if(current.ttsProvider!=='elevenlabs')return speak(text,options);
    const route=options.turn?path(options.turn.call_id,`/turns/${options.turn.id}/audio`):'/api/voice/tts/preview';
    const body={voice_id:options.voice.voiceURI,model_id:current.ttsConfig.model_id,...(!options.turn?{lang:options.lang,role:bot.id,kind:'greeting'}:{})};
    return remoteSpeech(route,body,{onStart:options.onStart,onMode:mode=>{options.onMode?.(mode);if(mounted.current)setPlayMode(mode);}});
  }

  useEffect(() => { let ignore = false; setCaps(null); detectVoice(lang).then(c => { if (!ignore) setCaps(c); }); return () => { ignore = true; }; }, [lang]);
  useEffect(() => {
    if (phase !== 'active') return undefined;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns, interim]);

  const path = (callId, suffix = '') => `/api/cases/${caseId}/calls/${callId}${suffix}`;
  function stopInput() {
    abortVoiceStart.current?.('语音启动已取消'); abortVoiceStart.current = null;
    input.current?.stop(); input.current = null;
    monitor.current?.stop(); monitor.current = null;
  }
  function stopLocal() {
    gen.current++; stopInput(); session.current?.close(); session.current = null; stopAllSpeech();
  }
  function endBeacon() {
    const c = call.current; if (!c) return; call.current = null;
    api(path(c.id, '/end'), 'POST', {}, { keepalive: true }).catch(() => {});
  }
  async function hangup() {
    const c = call.current; stopLocal(); setTurnPhase('idle'); setInputPhase('idle'); setInterim(''); setVoiceMode(false); setMuted(false);
    call.current = null; setPhase('ended');
    if (!c) return;
    try { await api(path(c.id, '/end'), 'POST', {}); }
    catch (e) { if (mounted.current) setMessage(`本机已停止收音和朗读，但服务器未确认挂断：${e.message}`); }
  }
  useEffect(() => {
    mounted.current = true;
    const onHide = () => { stopLocal(); endBeacon(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && call.current) {
        stopInput(); session.current?.stopOutput(); setVoiceMode(false); setInputPhase('error'); setInterim('');
        setMessage('页面进入后台，语音已暂停；返回后点击“恢复语音”。文字会话仍保留。');
      }
    };
    window.addEventListener('pagehide', onHide); document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVisibility); mounted.current = false; stopLocal(); endBeacon(); };
  }, []);
  useEffect(() => { if (!controlRef) return undefined; controlRef.current = { hangup }; return () => { controlRef.current = null; }; });

  async function startVoice(g) {
    if (voiceStarting.current) return false;
    voiceStarting.current = true;
    stopInput(); setInputPhase('reconnecting'); setMessage('');
    let activity;
    try {
      const c = live.current.caps;
      if (!c?.stt.available) throw new Error('当前未配置可用的语音识别，请选择文字通话。');
      activity = await openActivityMonitor((active, info) => {
        if (g !== gen.current) return;
        if (info.contextState !== 'running') {
          stopInput(); setInputPhase('error'); setVoiceMode(false); setMessage('音频输入被浏览器暂停，请点击恢复语音。');
        } else input.current?.activity(active);
      });
      if (g !== gen.current || !mounted.current) { activity.stop(); return false; }
      monitor.current = activity;
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => { if (!settled) { settled = true; error ? reject(new Error(error)) : resolve(); } };
        abortVoiceStart.current = finish;
        const controller = new ContinuousInput({ recognizer: createRecognizer, lang: live.current.lang,
          processLocally: c.stt.location === 'ON_DEVICE_REPORTED',
          onState: value => {
            if (g !== gen.current || !mounted.current) return;
            setInputPhase(value);
            if (value === 'listening') finish();
            if (value === 'error') { monitor.current?.stop(); monitor.current = null; setVoiceMode(false); }
          },
          onError: message => { if (g === gen.current && mounted.current) { setMessage(message); if (!controller.running) { setDraft([...controller.parts.values()].map(p => p.text).join(' ')); session.current?.setUserSpeaking(false); if (!settled) finish(message); } } },
          onDraft: text => { if (g === gen.current && mounted.current) { setInterim(text); session.current?.setUserSpeaking(Boolean(text)); } },
          onInterrupt: () => session.current?.interrupt(),
          onUtterance: (text, metadata) => { if (g === gen.current && call.current) session.current?.submit(text, metadata); },
        });
        input.current = controller;
        if (session.current?.outputText) controller.setOutput(session.current.outputText);
        controller.start();
      });
      if (g !== gen.current || !mounted.current) { activity.stop(); return false; }
      setVoiceMode(true); setMuted(false); return true;
    } catch (e) {
      activity?.stop();
      if (g === gen.current && mounted.current) { stopInput(); setInputPhase('error'); setVoiceMode(false); setMessage(e.message); }
      return false;
    } finally { voiceStarting.current = false; abortVoiceStart.current = null; }
  }
  async function connect(textOnly = false) {
    const g = ++gen.current; setPhase('connecting'); setMessage('');
    try {
      // Do not create a live voice session or show a connected timer until recognition actually starts.
      if (!textOnly && !await startVoice(g)) { if (g === gen.current) setPhase('setup'); return; }
      if (g !== gen.current || !mounted.current) return;
      const c = await api(`/api/cases/${caseId}/calls`, 'POST', { role: bot.id, request_key: crypto.randomUUID(), lang });
      if (g !== gen.current || !mounted.current) { api(path(c.id, '/end'), 'POST', {}).catch(() => {}); return; }
      call.current = c;
      session.current = new CallSession({ call: c, request: (suffix, method, body) => api(path(c.id, suffix), method, body),
        speak:providerSpeak, outputOptions: () => live.current,
        onTurn: turn => { if (g === gen.current && mounted.current) setTurns(list => [...list.filter(t => t.id !== turn.id), turn].sort((a, b) => a.seq - b.seq)); },
        onPhase: value => { if (g === gen.current && mounted.current) setTurnPhase(value); },
        onError: message => { if (g === gen.current && mounted.current) setMessage(message); },
        onOutput: text => input.current?.setOutput(text),
      });
      startedAt.current = Date.now(); setElapsed(0); setTurns([]); setDraft(''); setInterim(''); setTurnPhase('idle'); setPhase('active');
      if (!textOnly) session.current.greet(bot.name);
      else { setVoiceMode(false); setInputPhase('idle'); }
    } catch (e) { if (g === gen.current && mounted.current) { stopInput(); setVoiceMode(false); setPhase('setup'); setMessage(e.message); } }
  }
  function micPress() {
    if (phase !== 'active') return;
    if (muted || !voiceMode) { void startVoice(gen.current); return; }
    input.current?.mute(); monitor.current?.stop(); monitor.current = null;
    session.current?.setUserSpeaking(false); setMuted(true); setInputPhase('muted'); setInterim('');
  }
  function send(event) {
    event?.preventDefault(); if (!draft.trim() || !call.current) return;
    if (session.current?.submit(draft.trim())) { setDraft(''); setMessage(''); }
  }
  function cancelTurn() { session.current?.cancel(); }
  function toggleSpeaker() {
    if (speakerOn) session.current?.stopOutput();
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

  const listening = voiceMode && !muted, busy = BUSY.includes(turnPhase);
  const micDisabledReason = phase !== 'active' ? '尚未接通' : !caps?.stt.available ? '当前未配置可用的语音识别，请用文字输入' : '';
  const effectivePhase = inputPhase === 'error' || muted ? (muted ? 'muted' : 'error') : ['user_speaking', 'transcribing', 'reconnecting'].includes(inputPhase) ? inputPhase : turnPhase;
  const status = phase === 'setup' ? '未接通 · 点击接通后自动倾听' : phase === 'connecting' ? '正在连接语音并请求权限…' : phase === 'ended' ? `通话已结束 · ${fmt(elapsed)}` : !voiceMode && !muted ? `文字通话 · ${turnLabels[turnPhase] || ''}` : turnLabels[effectivePhase];
  const voiceSummary = ttsProvider==='elevenlabs'?'ElevenLabs 云端朗读 · 使用账户额度':!caps ? '检测中…' : !caps.tts.available ? '浏览器不支持朗读，仅显示文字' : voices.length ? `${voices.length} 个可用音色（${voices.filter(v => v.localService).length} 个本机）` : '没有该语言的音色，仅显示文字';
  const sttSummary = !caps ? '检测中…' : caps.stt.available ? `${caps.stt.provider} · ${locations[caps.stt.location]}` : '当前未配置可用的语音识别；可以用文字通话';
  const micSummary = !caps ? '检测中…' : !caps.mic.secure ? '非安全上下文，浏览器不允许麦克风（手机需受信任 HTTPS）' : !caps.mic.api ? '浏览器不支持麦克风访问' : '接通时请求权限；通话中持续检测语音，不保存或上传原始音频';
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

    {!collapsed && !records && phase !== 'connecting' && <details className="call-preferences">
      <summary>通话设置</summary>
    {phase === 'setup' && <div className="call-setup">
      <dl>
        <div><dt>语音识别</dt><dd>{sttSummary}</dd></div>
        <div><dt>麦克风</dt><dd>{micSummary}</dd></div>
        <div><dt>朗读</dt><dd>{voiceSummary}</dd></div>
        <div><dt>回答</dt><dd>共享 Claude CLI 串行通道，非流式；研究任务进行中时会排队</dd></div>
      </dl>
      <label>语言<select value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
    </div>}

    <div className="call-setup">
      <label>朗读服务<select aria-label="朗读服务" value={ttsProvider} onChange={e=>void chooseProvider(e.target.value)}><option value="browser">浏览器 / Windows</option><option value="elevenlabs" disabled={!ttsConfig?.key_configured||!ttsConfig?.voice_id}>ElevenLabs{!ttsConfig?.key_configured?'（先到设置 → 语音填写 Key）':''}</option></select></label>
      <label>朗读音色<select aria-label="朗读音色" value={voice?.voiceURI || ''} onChange={e => setVoiceURI(e.target.value)} disabled={!voices.length}>{voices.length ? voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}（{v.localService ? '本机' : '在线'}）</option>) : <option value="">无可用音色</option>}</select></label>
      {ttsProvider==='elevenlabs'&&<p className="call-card__note">朗读文字发送到 ElevenLabs，使用账户额度。{playMode==='buffered'?'此浏览器需完整缓冲后播放。':playMode==='streaming'?'正在使用流式播放。':''}</p>}
    </div>
    </details>}
    {!collapsed && !records && phase === 'setup' && caps && !caps.stt.available && <p className="call-card__hint">浏览器未提供语音识别，请使用文字通话。</p>}

    {!collapsed && !records && (phase === 'active' || phase === 'ended') && <>
      {captions && <ol className="call-turns" ref={listRef} aria-label="通话字幕">
        {shownTurns.map(t => <Turn key={t.id} turn={t} onCorrect={correct} />)}
        {!shownTurns.length && <li className="call-turn__pending">{phase === 'active' ? '开始说话或输入文字。普通通话不会自动启动完整研究。' : '本次通话没有轮次。'}</li>}
        {interim && <li className="call-turn__interim" aria-live="polite">识别中：{interim}</li>}
      </ol>}
      {phase === 'active' && <form className="call-draft" onSubmit={send}>
        <p className="call-card__note">{voiceMode ? '持续通话 · 说完自动发送，可直接开口打断。建议佩戴耳机。' : '文字模式 · 可点击恢复语音。'}</p>
        {(!voiceMode || inputPhase === 'error') && caps?.stt.available && <button type="button" className="call-link" onClick={() => void startVoice(gen.current)}>恢复语音</button>}
        {message && <button type="button" className="call-link" onClick={() => session.current?.retryWatch()}>重试回答</button>}
        {turnPhase === 'speaking' && <button type="button" className="call-link" onClick={() => session.current?.interrupt()}>停止播放 / 打断</button>}
        <label className="call-draft__label" htmlFor="call-draft">补充文字（语音自动发送）</label>
        <textarea id="call-draft" rows={2} maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} placeholder={`对 ${bot.name} 说…`} />
        <div className="call-draft__row">
          <button type="button" className="call-link" onClick={() => setCaptions(!captions)} aria-pressed={captions}>{captions ? '隐藏字幕' : '显示字幕'}</button>
          {draft && !busy && <button type="button" className="call-link" onClick={() => setDraft('')}>清空</button>}
          {busy && <button type="button" className="call-link" onClick={cancelTurn}>取消本轮</button>}<button type="submit" className="call-send" disabled={!draft.trim()}>发送</button>
        </div>
      </form>}
    </>}

    {message && <p className="call-card__msg" role="alert">{message}<button type="button" aria-label="关闭提示" onClick={() => setMessage('')}>×</button></p>}

    <div className="call-card__controls">
      <div className="call-ctl"><button type="button" className={`call-btn${speakerOn ? '' : ' call-btn--off'}`} aria-label={speakerOn ? '关闭朗读' : '打开朗读'} aria-pressed={speakerOn} onClick={toggleSpeaker}><Icon name={speakerOn ? 'speaker' : 'speakerOff'} size={22} /></button><span>{speakerOn ? '朗读开' : '朗读关'}</span></div>
      {phase === 'active' || phase === 'connecting'
        ? <div className="call-ctl" key="hangup"><button type="button" className="call-btn call-btn--hangup" aria-label="挂断" onClick={hangup} ><Icon name="hangup" size={26} /></button><span>挂断</span></div>
        : <div className="call-ctl" key="answer"><button type="button" className="call-btn call-btn--answer" aria-label={phase === 'ended' ? `重新拨打 ${bot.name}` : `接通 ${bot.name}`} onClick={() => void connect(false)} disabled={!caseId || !caps?.stt.available}><Icon name="call" size={24} /></button><span>{phase === 'ended' ? '重新拨打' : '接通'}</span></div>}
      <div className="call-ctl"><button type="button" className={`call-btn${listening ? ' call-btn--live' : ''}`} aria-label={muted ? '取消静音' : voiceMode ? '静音麦克风' : '恢复语音'} aria-pressed={muted} onClick={micPress} disabled={Boolean(micDisabledReason)} title={micDisabledReason || undefined}><Icon name={muted || !voiceMode ? 'micOff' : 'mic'} size={22} /></button><span>{muted ? '取消静音' : voiceMode ? '静音' : '恢复语音'}</span></div>
    </div>
    {(phase === 'setup' || phase === 'ended') && <button type="button" className="call-link" onClick={() => void connect(true)} disabled={!caseId}>使用文字通话</button>}
    {micDisabledReason && phase === 'active' && <p className="call-card__hint">麦克风不可用：{micDisabledReason}</p>}
  </section>;
}
