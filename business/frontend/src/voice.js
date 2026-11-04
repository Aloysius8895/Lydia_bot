// Browser voice adapters. Capability is reported from what the browser actually exposes;
// "API exists" is never reported as "speech works". No audio is captured or uploaded by the app.

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

export function createRecognizer({ lang, processLocally, onText, onEnd, onError }) {
  const Rec = recognitionCtor();
  if (!Rec) throw new Error('当前未配置可用的语音识别');
  const rec = new Rec();
  rec.lang = lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  if (processLocally) { try { rec.processLocally = true; } catch { /* not supported */ } }
  let finalText = '', confidences = [], live = true;
  rec.onresult = event => {
    if (!live) return;
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i], alt = result[0];
      if (result.isFinal) { finalText += alt.transcript; if (typeof alt.confidence === 'number' && alt.confidence > 0) confidences.push(alt.confidence); }
      else interim += alt.transcript;
    }
    onText(finalText, interim);
  };
  rec.onerror = event => { if (live && recognitionErrors[event.error] !== null) onError(recognitionErrors[event.error] || `语音识别失败（${event.error}）`); };
  rec.onend = () => { if (!live) return; live = false; onEnd({ text: finalText.trim(), confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null }); };
  return {
    start: () => rec.start(),
    stop: () => { try { rec.stop(); } catch { /* already stopped */ } },
    abort: () => { live = false; rec.onresult = rec.onend = rec.onerror = null; try { rec.abort(); } catch { /* already stopped */ } },
  };
}

/** Speak and report what the engine said happened. Progress stays UNKNOWN when the engine cannot tell. */
export function speak(text, { voice, lang, onStart }) {
  const synth = window.speechSynthesis;
  let stopped = false, started = false, boundary = false, settle;
  const promise = new Promise(resolve => { settle = resolve; });
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') { settle({ status: 'NO_VOICE', progress: 'NONE', error: 'speechSynthesis unavailable' }); return { promise, stop() {} }; }
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = lang; if (voice) utterance.voice = voice;
  utterance.onstart = () => { started = true; onStart?.(); };
  utterance.onboundary = () => { boundary = true; };
  utterance.onend = () => settle(stopped ? { status: 'INTERRUPTED', progress: boundary ? 'PARTIAL' : started ? 'UNKNOWN' : 'NONE' } : { status: 'PLAYED', progress: 'COMPLETE' });
  utterance.onerror = event => settle(['interrupted', 'canceled'].includes(event.error) || stopped
    ? { status: 'INTERRUPTED', progress: boundary ? 'PARTIAL' : started ? 'UNKNOWN' : 'NONE' }
    : { status: 'FAILED', progress: started ? 'UNKNOWN' : 'NONE', error: String(event.error || 'unknown').slice(0, 200) });
  synth.cancel(); synth.speak(utterance);
  return { promise, stop() {
    stopped = true; synth.cancel();
    // Some engines fire neither end nor error after cancel(); report an interruption either way.
    setTimeout(() => settle({ status: 'INTERRUPTED', progress: boundary ? 'PARTIAL' : started ? 'UNKNOWN' : 'NONE' }), 300);
  } };
}

export function stopAllSpeech() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
