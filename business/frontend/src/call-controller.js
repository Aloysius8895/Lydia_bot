// Browser-independent continuous-input state machine. Timers and recognizer are injectable.
const normalize = value => value.toLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu, '');
const ack = /^(嗯+|对+|好+|好的|是的|哦+|okay|ok|yes|yeah|uhhuh|right)$/i;
const stopWords = /等等|等一下|停一下|不是|不对|我说的是|wait|stop|hold on|^no$|no[, ]|actually/i;

export class ContinuousInput {
  constructor({ recognizer, lang, processLocally = false, onDraft, onUtterance, onInterrupt, onState, onError,
    now = Date.now, schedule = (fn, ms) => setTimeout(fn, ms), unschedule = id => clearTimeout(id), endpointMs = 1100 }) {
    Object.assign(this, { recognizer, lang, processLocally, onDraft, onUtterance, onInterrupt, onState, onError, now, schedule, unschedule, endpointMs });
    this.parts = new Map(); this.consumed = new Set(); this.epoch = 0; this.session = 0;
    this.running = false; this.failures = 0; this.shortEnds = 0; this.output = ''; this.echoUntil = 0;
  }
  state(value) { this.onState?.(value); }
  clear(name) { this.unschedule(this[name]); this[name] = null; }
  start() {
    if (this.running) return;
    this.running = true; this.failures = 0; this.shortEnds = 0; this.open();
  }
  open() {
    if (!this.running) return;
    const epoch = ++this.epoch, session = ++this.session; let failed = false;
    this.state('reconnecting'); this.openedAt = this.now();
    const valid = () => this.running && this.epoch === epoch;
    try {
      const rec = this.recognizer({ lang: this.lang, processLocally: this.processLocally,
        onStart: () => { if (valid()) { this.clear('startTimer'); this.state('listening'); } },
        onSpeech: active => { if (valid() && active) this.activity(true); },
        onSegment: part => { if (valid()) { this.failures = 0; this.shortEnds = 0; this.segment(`${session}:${part.id}`, part); } },
        onError: (message, code) => {
          if (!valid()) return;
          if (code === 'no-speech' || code === 'aborted') return;
          failed = true; this.failures++;
          if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(code) || this.failures >= 4) this.pause(message);
          else { this.onError?.(message); rec.abort(); this.recover(); }
        },
        onEnd: () => {
          if (!valid()) return;
          this.clear('startTimer'); this.rec = null;
          this.shortEnds = this.now() - this.openedAt < 2000 ? this.shortEnds + 1 : 0;
          if (this.shortEnds >= 4) { this.pause('语音识别连续停止，请点击恢复语音或使用文字。'); return; }
          if (!failed) this.recover();
        },
      });
      this.rec = rec;
      this.startTimer = this.schedule(() => { if (valid()) this.pause('语音识别启动超时，请点击恢复语音。'); }, 12000);
      rec.start();
    } catch (e) { this.pause(e.message || '语音识别无法启动'); }
  }
  recover() {
    this.epoch++; this.clear('startTimer'); this.rec = null;
    this.state('reconnecting'); this.clear('restartTimer');
    this.restartTimer = this.schedule(() => { if (this.running) this.open(); }, Math.min(250 * 2 ** Math.max(this.failures, this.shortEnds), 4000));
  }
  pause(message) { this.suspend(); this.state('error'); this.onError?.(message); }
  suspend() {
    this.running = false; this.epoch++; this.rec?.abort(); this.rec = null;
    for (const name of ['startTimer', 'restartTimer', 'endpointTimer', 'flushTimer']) this.clear(name);
  }
  stop() { this.suspend(); this.parts.clear(); this.consumed.clear(); this.onDraft?.(''); }
  mute() { this.suspend(); this.parts.clear(); this.onDraft?.(''); this.state('muted'); }
  setOutput(text) {
    if (text) { this.output = text; this.echoText = text; this.echoUntil = Infinity; }
    else { this.output = ''; this.echoUntil = this.now() + 700; }
  }
  activity(active) {
    if (!this.running || !active) return;
    this.lastVoice = this.now();
    if (this.parts.size && this.now() - this.lastText < 8000) this.arm();
  }
  segment(id, part) {
    if (this.consumed.has(id)) return;
    const text = part.text.trim(), normalized = normalize(text);
    if (!normalized) return;
    if (this.now() < this.echoUntil) {
      const echo = normalize(this.echoText || '');
      if (ack.test(normalized) || (normalized.length >= 4 && echo.includes(normalized))) {
        if (part.final) this.consumed.add(id);
        this.parts.delete(id); this.publish(); return;
      }
      if (this.output && normalized.length < 4 && !stopWords.test(text)) return;
    }
    if (this.output) {
      this.output = ''; this.onInterrupt?.(); this.echoUntil = this.now() + 700;
    }
    this.parts.set(id, part); this.lastText = this.now();
    this.state('user_speaking'); this.publish(); this.arm();
  }
  publish() { this.onDraft?.([...this.parts.values()].map(p => p.text.trim()).join(this.lang.startsWith('zh') ? '' : ' ').trim()); }
  arm() {
    this.clear('endpointTimer');
    this.endpointTimer = this.schedule(() => this.endpoint(), this.endpointMs);
  }
  endpoint() {
    if (!this.running || !this.parts.size) return;
    const all = [...this.parts.values()];
    // Never send provisional recognition as an authoritative final transcript.
    if (all.some(p => !p.final)) {
      this.state('transcribing'); this.rec?.stop();
      this.clear('flushTimer'); this.flushTimer = this.schedule(() => {
        if (this.running && [...this.parts.values()].some(p => !p.final)) this.pause('识别没有返回最终文字。已保留草稿，请检查后用文字发送或恢复语音。');
      }, 4000); return;
    }
    this.clear('flushTimer');
    const text = all.map(p => p.text.trim()).join(this.lang.startsWith('zh') ? '' : ' ').trim();
    if (text.length > 2000) { this.pause('本段发言超过 2000 字，请缩短草稿后发送。'); return; }
    const confidences = all.map(p => p.confidence).filter(n => typeof n === 'number');
    for (const id of this.parts.keys()) this.consumed.add(id);
    this.parts.clear(); this.onDraft?.(''); this.state('listening');
    this.onUtterance?.(text, { confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
      endpoint_ms: this.now() - this.lastText, recognition_ms: null, final_at: new Date(this.lastText).toISOString() });
    // Bound identifiers to this recognizer session; old callbacks are epoch-fenced.
    if (this.consumed.size > 500) this.consumed = new Set([...this.consumed].slice(-250));
  }
}
