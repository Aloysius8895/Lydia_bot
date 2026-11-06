// Browser voice adapters. Capability is reported from what the browser actually exposes;
// "API exists" is never reported as "speech works". Audio is not stored or uploaded by the app.

export function recognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function loadVoices(timeout = 1500) {
  return new Promise(resolve => {
    const synth = window.speechSynthesis;
    if (!synth) { resolve([]); return; }
    const now = synth.getVoices();
    if (now.length) { resolve(now); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; synth.removeEventListener?.('voiceschanged', finish); resolve(synth.getVoices()); } };
    synth.addEventListener?.('voiceschanged', finish);
    setTimeout(finish, timeout);
  });
}

export function voicesFor(voices, lang) {
  const base = lang.split('-')[0].toLowerCase(), exact = lang.toLowerCase();
  return voices
    .filter(v => (v.lang || '').replace('_', '-').toLowerCase().startsWith(base))
    .sort((a, b) => (Number(b.lang.toLowerCase() === exact) - Number(a.lang.toLowerCase() === exact)) || (Number(b.localService) - Number(a.localService)));
}

export async function detectVoice(lang) {
  const Rec = recognitionCtor();
  const stt = {
    available: Boolean(Rec),
    provider: Rec ? (window.SpeechRecognition ? 'web-speech:SpeechRecognition' : 'web-speech:webkitSpeechRecognition') : null,
    onDevice: 'UNKNOWN',
  };
  // Some browsers report on-device recognition. Only "available" changes the reported location.
  if (Rec && typeof Rec.available === 'function') {
    try { stt.onDevice = String(await Rec.available({ langs: [lang], processLocally: true })); } catch { stt.onDevice = 'UNKNOWN'; }
  }
  stt.location = stt.onDevice === 'available' ? 'ON_DEVICE_REPORTED' : stt.available ? 'BROWSER_VENDOR_SERVICE_POSSIBLE' : 'UNKNOWN';
  const mic = { api: Boolean(navigator.mediaDevices?.getUserMedia), secure: window.isSecureContext };
  const voices = await loadVoices();
  const tts = { available: 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function', voices };
  return { stt, mic, tts };
}

const micErrors = {
  NotAllowedError: '麦克风权限被拒绝。可在浏览器地址栏的权限设置中允许，或改用文字输入。',
  SecurityError: '当前页面不是安全上下文，浏览器不允许使用麦克风。手机请使用受信任的 HTTPS 地址。',
  NotFoundError: '没有找到可用的麦克风设备，可改用文字输入。',
  NotReadableError: '麦克风正被其他程序占用或无法读取，请关闭占用程序后重试。',
  AbortError: '麦克风启动被中断，请重试。',
};

/** Explicit, user-initiated permission check. Tracks are released immediately; the app never records audio. */
export async function requestMic() {
  if (!window.isSecureContext) return { ok: false, reason: micErrors.SecurityError };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: '此浏览器不支持麦克风访问，可改用文字输入。' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return { ok: true };
  } catch (e) { return { ok: false, reason: micErrors[e?.name] || '无法打开麦克风，可改用文字输入。' }; }
}

const recognitionErrors = {
  'no-speech': '没有听到语音，请靠近麦克风再试，或改用文字输入。',
  'audio-capture': '无法读取麦克风音频，请检查设备。',
  'not-allowed': '浏览器不允许语音识别（权限被拒绝或策略禁止）。',
  'service-not-allowed': '浏览器的语音识别服务不可用。',
  network: '语音识别需要联网，但连接浏览器识别服务失败。',
  'language-not-supported': '当前浏览器不支持所选语言的识别。',
  aborted: null,
};

export function createRecognizer({ lang, processLocally, onText, onSegment, onStart, onSpeech, onEnd, onError }) {
  const Rec = recognitionCtor();
  if (!Rec) throw new Error('当前未配置可用的语音识别');
  const rec = new Rec();
  rec.lang = lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  if (processLocally) { try { rec.processLocally = true; } catch { /* not supported */ } }
  const results = new Map();
  let live = true;
  rec.onstart = () => { if (live) onStart?.(); };
  rec.onspeechstart = () => { if (live) onSpeech?.(true); };
  rec.onspeechend = () => { if (live) onSpeech?.(false); };
  rec.onresult = event => {
    if (!live) return;
    for (const index of results.keys()) if (index >= event.results.length) results.delete(index);
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i], alt = result[0];
      const segment = { id: i, text: alt.transcript, final: result.isFinal, confidence: typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : null };
      results.set(i, segment); onSegment?.(segment);
    }
    const all = [...results.values()];
    onText?.(all.filter(r => r.final).map(r => r.text).join(' '), all.filter(r => !r.final).map(r => r.text).join(' '));
  };
  rec.onerror = event => { if (live) onError?.(recognitionErrors[event.error] || `语音识别失败（${event.error}）`, event.error); };
  rec.onend = () => { if (!live) return; live = false; const all = [...results.values()].filter(r => r.final), cs = all.map(r => r.confidence).filter(c => c !== null); onEnd?.({ text: all.map(r => r.text).join(' ').trim(), confidence: cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null }); };
  return {
    start: () => rec.start(),
    stop: () => { try { rec.stop(); } catch { /* already stopped */ } },
    abort: () => { live = false; rec.onresult = rec.onend = rec.onerror = rec.onstart = rec.onspeechstart = rec.onspeechend = null; try { rec.abort(); } catch { /* already stopped */ } },
  };
}

/** Ephemeral, echo-cancelled activity analysis. Browser STT owns a separate input path:
 * these constraints do NOT prove echo cancellation on that path. Never connect input to speakers. */
export async function openActivityMonitor(onActivity) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error(micErrors.SecurityError);
  let stream, context, source, timer;
  const stop = () => { clearInterval(timer); source?.disconnect(); stream?.getTracks().forEach(t => t.stop()); void context?.close().catch(() => {}); };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('此浏览器没有可用的音频活动检测，请使用文字通话。');
    context = new Ctx(); await context.resume();
    if (context.state !== 'running') throw new Error('浏览器暂停了音频输入，请点击恢复语音。');
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    source = context.createMediaStreamSource(stream); source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let floor = .003, voiced = 0;
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
      const active = rms > Math.max(.015, floor * 3);
      if (!active) floor = floor * .97 + rms * .03;
      voiced = active ? voiced + 1 : 0;
      onActivity(voiced >= 3, { rms, contextState: context.state });
    }, 50);
    return { stop, settings: stream.getAudioTracks()[0]?.getSettings?.() || {} };
  } catch (e) { stop(); throw new Error(micErrors[e?.name] || e.message || '无法启动麦克风'); }
}

/** Speak and report what the engine said happened. Progress stays UNKNOWN when the engine cannot tell. */
export function speak(text, { voice, lang, onStart }) {
  const synth = window.speechSynthesis;
  let stopped = false, started = false, boundary = false, settle, startTimer, durationTimer, finished = false;
  const promise = new Promise(resolve => { settle = result => {
    if (finished) return; finished = true; clearTimeout(startTimer); clearTimeout(durationTimer); resolve(result);
  }; });
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') { settle({ status: 'NO_VOICE', progress: 'NONE', error: 'speechSynthesis unavailable' }); return { promise, stop() {} }; }
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = lang; if (voice) utterance.voice = voice;
  utterance.onstart = () => { if (finished) return; started = true; clearTimeout(startTimer); onStart?.(); };
  utterance.onboundary = () => { boundary = true; };
  utterance.onend = () => settle(stopped ? { status: 'INTERRUPTED', progress: boundary ? 'PARTIAL' : started ? 'UNKNOWN' : 'NONE' } : { status: 'PLAYED', progress: 'COMPLETE' });
  utterance.onerror = event => settle(['interrupted', 'canceled'].includes(event.error) || stopped
    ? { status: 'INTERRUPTED', progress: boundary ? 'PARTIAL' : started ? 'UNKNOWN' : 'NONE' }
    : { status: 'FAILED', progress: started ? 'UNKNOWN' : 'NONE', error: String(event.error || 'unknown').slice(0, 200) });
  const timeout = () => { settle({ status: 'FAILED', progress: started ? 'UNKNOWN' : 'NONE', error: 'speech playback timed out' }); try { synth.cancel(); } catch { /* already stopped */ } };
  startTimer = setTimeout(timeout, 12000); durationTimer = setTimeout(timeout, 180000);
  try { synth.cancel(); synth.speak(utterance); }
  catch (e) { settle({ status: 'FAILED', progress: 'NONE', error: String(e.message || 'speech failed').slice(0, 200) }); }
  return { promise, stop() {
    stopped = true; try { synth.cancel(); } catch { /* already stopped */ }
    // Some engines fire neither end nor error after cancel(); report an interruption either way.
    setTimeout(() => settle({ status: 'INTERRUPTED', progress: boundary ? 'PARTIAL' : started ? 'UNKNOWN' : 'NONE' }), 300);
  } };
}

export function stopAllSpeech() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
