// A single call's dialogue/output lifecycle. HTTP remains on the existing authenticated API.
const sameUtterance = (a, b) => a.toLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu, '') === b.toLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu, '');
import {voiceGreeting} from '../../shared/voice-copy.ts';
export class CallSession {
  constructor({ call, request, speak, outputOptions, onTurn, onPhase, onError, onOutput,
    schedule = (fn, ms) => setTimeout(fn, ms), unschedule = id => clearTimeout(id), now = Date.now, key = () => crypto.randomUUID() }) {
    Object.assign(this, { call, request, speak, outputOptions, onTurn, onPhase, onError, onOutput, schedule, unschedule, now, key });
    this.epoch = 0; this.closed = false; this.chain = Promise.resolve(); this.active = null; this.pending = null;
  }
  valid(epoch) { return !this.closed && epoch === this.epoch; }
  stopSpeech() { this.speech?.stop(); this.speech = null; this.outputText = ''; this.onOutput?.(''); }
  stopOutput() { this.stopSpeech(); this.onPhase?.('idle'); }
  setUserSpeaking(value) { this.userSpeaking = value; }
  interrupt() { this.stopSpeech(); this.onPhase?.('interrupted'); }
  submit(text, metadata = null) {
    if (this.closed || !text.trim()) return false;
    // Merge an unanswered question and its corrections, including a submission still in flight.
    const prior = this.pending || this.inflight || this.uncertain || (this.active?.busy ? this.active : null);
    if (metadata && prior?.metadata && sameUtterance(prior.rawText || prior.text, text)) return false;
    const merged = prior ? `${prior.text}\n${text.trim()}` : text.trim();
    if (merged.length > 2000) { this.onError?.('问题与补充合计超过 2000 字，请缩短后发送。'); return false; }
    const input = { text: merged, rawText: text.trim(), metadata, key: this.key() };
    this.pending = input; this.failedWatch = null; this.epoch++; this.unschedule(this.poll); this.stopSpeech(); this.onPhase?.('queued');
    this.failedInput = null; this.onError?.('');
    // Serialize against POSTs whose response has not arrived, so they can be cancelled by ID.
    this.chain = this.chain.then(() => this.drain()).catch(e => { if (!this.closed) this.onError?.(e.message); });
    return true;
  }
  async post(input) {
    const { caps, lang } = this.outputOptions();
    const body = input.metadata ? { request_key: input.key, text: input.text, input_source: 'BROWSER_STT', stt: {
      provider: caps.stt.provider, lang, processing_location: caps.stt.location, confidence: input.metadata.confidence ?? null,
      transcript_original: input.text, edited: false, recognition_ms: input.metadata.recognition_ms ?? null,
      endpoint_ms: input.metadata.endpoint_ms ?? null, final_at: input.metadata.final_at ?? null,
    } } : { request_key: input.key, text: input.text, input_source: 'TEXT' };
    return this.request('/turns', 'POST', body);
  }
  async cancelActive() {
    if (this.uncertain) {
      // Resolve an ambiguous POST using the SAME idempotency key before submitting a replacement.
      const old = await this.post(this.uncertain);
      this.active = { ...this.uncertain, id: old.turn.id, busy: true }; this.uncertain = null;
    }
    const active = this.active;
    if (active?.busy) {
      const r = await this.request(`/turns/${active.id}/cancel`, 'POST', {});
      if (!this.closed) this.onTurn?.(r.turn);
    }
    this.active = null;
  }
  async drain() {
    while (!this.closed && this.pending) {
      await this.cancelActive();
      if (this.closed || !this.pending) return;
      const input = this.pending; this.pending = null; this.inflight = input;
      const epoch = this.epoch;
      try {
        const r = await this.post(input); this.inflight = null;
        this.active = { ...input, id: r.turn.id, busy: true };
        if (this.closed) { await this.request(`/turns/${r.turn.id}/cancel`, 'POST', {}).catch(() => {}); return; }
        this.onTurn?.(r.turn);
        if (this.valid(epoch)) void this.watch(r.turn.id, epoch);
        // Otherwise the while loop cancels the old turn before posting the latest merged intent.
      } catch (e) {
        this.inflight = null; this.uncertain = input;
        if (this.closed) return;
        this.onPhase?.('error'); this.onError?.(`${e.message}。本轮保留，可点击“重试回答”。`);
        return; // No quota-spending automatic retry.
      }
    }
  }
  retry() {
    if (this.closed) return;
    if (this.uncertain && !this.pending) {
      const input = this.uncertain; this.uncertain = null; this.pending = input;
    }
    this.chain = this.chain.then(() => this.drain()).catch(e => this.onError?.(e.message));
  }
  async watch(id, epoch, failures = 0) {
    try {
      const { turn } = await this.request(`/turns/${id}`);
      if (!this.valid(epoch)) return;
      this.onTurn?.(turn);
      if (['QUEUED', 'THINKING'].includes(turn.status)) {
        this.onPhase?.(turn.status.toLowerCase()); this.poll = this.schedule(() => void this.watch(id, epoch), 500); return;
      }
      if (turn.status === 'COMPLETED' && this.userSpeaking) {
        this.poll = this.schedule(() => void this.watch(id, epoch), 250); return;
      }
      if (this.active?.id === id) this.active.busy = false;
      if (turn.status === 'COMPLETED') this.play(turn, epoch);
      else if (turn.status === 'FAILED') {
        this.failedInput = this.active ? { ...this.active } : null; this.active = null;
        this.onPhase?.('answer_error'); this.onError?.(`${turn.error?.message || '专家回答未成功'}。可重试回答，或直接继续说话。`);
      } else this.onPhase?.('idle');
    } catch (e) {
      if (!this.valid(epoch)) return;
      if (failures >= 4) { this.onPhase?.('error'); this.onError?.(`无法查询回答：${e.message}。请点击“重试回答”。`); this.failedWatch = { id, epoch }; return; }
      this.poll = this.schedule(() => void this.watch(id, epoch, failures + 1), Math.min(1000 * 2 ** failures, 8000));
    }
  }
  retryWatch() {
    if (this.failedWatch) { const { id, epoch } = this.failedWatch; this.failedWatch = null; void this.watch(id, epoch); }
    else if (this.failedInput) { const input = this.failedInput; this.failedInput = null; this.onError?.(''); this.submit(input.text, input.metadata); }
    else this.retry();
  }
  play(turn, epoch) {
    const { speakerOn, voice, lang, caps,ttsProvider,ttsConfig } = this.outputOptions();
    let startDelay = null, responseDelay = null,deliveryMode=ttsProvider==='elevenlabs'?'unknown':'browser';
    const report = result => this.request(`/turns/${turn.id}/playback`, 'POST', { status: result.status, progress: result.progress,
      error: result.error || null, voice_name: voice?.name || null, voice_local: voice ? Boolean(voice.localService) : null,
      lang, start_delay_ms: startDelay, response_delay_ms: responseDelay,provider:ttsProvider==='elevenlabs'?'elevenlabs':'browser',model_id:ttsProvider==='elevenlabs'?ttsConfig?.model_id||null:null,delivery_mode:deliveryMode }).then(r => { if (!this.closed) this.onTurn?.(r.turn); }).catch(() => {});
    if (!speakerOn || !caps?.tts.available || !voice) {
      void report({ status: !speakerOn ? 'SKIPPED_SPEAKER_OFF' : 'NO_VOICE', progress: 'NONE' }); this.onPhase?.('idle'); return;
    }
    const t0 = this.now(); this.outputText = turn.reply.spoken_text; this.onOutput?.(this.outputText); this.onPhase?.('speaking');
    const speech = this.speak(turn.reply.spoken_text, { voice, lang, turn,onMode:mode=>{deliveryMode=mode;}, onStart: () => {
      startDelay = this.now() - t0;
      const finalAt = Date.parse(turn.stt?.final_at || '');
      if (Number.isFinite(finalAt)) responseDelay = Math.max(0, this.now() - finalAt);
    } });
    this.speech = speech;
    speech.promise.then(result => {
      void report(result);
      if (this.speech !== speech) return;
      this.speech = null; this.outputText = ''; this.onOutput?.('');
      if (!this.valid(epoch)) return;
      this.onPhase?.('idle');
      if (result.status === 'FAILED') this.onError?.('朗读失败，回答已显示为文字。');
    });
  }
  greet(name) {
    const { speakerOn, voice, lang, caps } = this.outputOptions();
    if (!speakerOn || !voice || !caps?.tts.available || this.closed) return;
    const text = voiceGreeting(name,lang);
    this.outputText = text; this.onOutput?.(text); this.onPhase?.('speaking');
    const speech = this.speak(text, { voice, lang }); this.speech = speech;
    speech.promise.then(() => { if (this.speech === speech) { this.speech = null; this.outputText = ''; this.onOutput?.(''); if (!this.closed) this.onPhase?.('idle'); } });
  }
  cancel() {
    this.pending = null; this.epoch++; this.unschedule(this.poll); this.stopSpeech();
    this.chain = this.chain.then(() => this.cancelActive()).then(() => { if (!this.closed) this.onPhase?.('idle'); }).catch(e => this.onError?.(e.message));
  }
  close() { this.closed = true; this.epoch++; this.pending = null; this.unschedule(this.poll); this.stopSpeech(); }
}
