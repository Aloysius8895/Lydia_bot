import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { personasById, systemPrompt } from './personas.js';

// "api" calls the Claude API with ANTHROPIC_API_KEY; "cli" reuses the local `claude` login.
export const PROVIDER =
  process.env.CREW_PROVIDER ?? (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'api' : 'cli');
// The CLI alias resolves to the newest Opus the installed Claude Code supports.
export const MODEL = process.env.CREW_MODEL ?? (PROVIDER === 'api' ? 'claude-opus-5-5' : 'opus');
const EFFORT = process.env.CREW_EFFORT ?? 'medium';

const nameOf = (from) => (from === 'me' ? '用户' : (personasById[from]?.name ?? from));

// history: [{ from: 'me' | personaId, text }], oldest first, ending with the user's turn.
// From the responder's point of view its own lines are assistant turns; everyone else is user input.
function toMessages(responder, history, isRoom) {
  const messages = [];
  for (const m of history) {
    const role = m.from === responder ? 'assistant' : 'user';
    const text = role === 'user' && (isRoom || m.from !== 'me') ? `[${nameOf(m.from)}]: ${m.text}` : m.text;
    const last = messages.at(-1);
    if (last?.role === role) last.content += `\n\n${text}`;
    else if (messages.length || role === 'user') messages.push({ role, content: text });
  }
  if (messages.at(-1)?.role !== 'user') messages.push({ role: 'user', content: '（请继续）' });
  return messages;
}

function toTranscript(responder, history) {
  const lines = history.map((m) => `[${nameOf(m.from)}]: ${m.text}`);
  return `以下是目前的对话记录：\n\n${lines.join('\n\n')}\n\n请以 ${nameOf(responder)} 的方法角色回复最新消息，只输出回复正文。`;
}

let client;

async function replyWithApi({ responder, history, isRoom, onDelta, signal }) {
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk').catch(() => {
      throw new Error('API mode needs the SDK: run `npm install @anthropic-ai/sdk` in business/frontend.');
    });
    client = new Anthropic();
  }
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64000,
      system: [{ type: 'text', text: systemPrompt(responder), cache_control: { type: 'ephemeral' } }],
      messages: toMessages(responder, history, isRoom),
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      // Refusals are retried server-side on a fallback model instead of ending the reply.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    },
    { signal }
  );
  stream.on('text', onDelta);
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw new Error('The model declined to answer this message.');
}

// Variables Claude Code sets for its own child processes; a nested `claude -p` must not inherit them.
const NESTED_ENV = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_(ENTRYPOINT|SESSION_ID|CHILD_SESSION|SESSION_ATTENDED|MESSAGING_\w+))$/;

function replyWithCli({ responder, history, onDelta, signal }) {
  const promptFile = path.join(os.tmpdir(), `crew-${responder}-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(promptFile, systemPrompt(responder));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !NESTED_ENV.test(k)));
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--system-prompt-file', promptFile,
    '--tools', '',
    '--no-session-persistence',
    '--model', MODEL,
    '--effort', EFFORT,
  ];

  return new Promise((resolve, reject) => {
    // Run outside the project so no CLAUDE.md or project settings leak into the persona.
    const child = spawn(process.env.CREW_CLAUDE_BIN ?? 'claude', args, { cwd: os.tmpdir(), env, signal, windowsHide: true });
    let buffered = '';
    let streamed = false;
    let result = null;
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffered += chunk;
      let nl;
      while ((nl = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, nl).trim();
        buffered = buffered.slice(nl + 1);
        if (!line) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        const delta = event.type === 'stream_event' && event.event?.type === 'content_block_delta' ? event.event.delta : null;
        if (delta?.type === 'text_delta') {
          streamed = true;
          onDelta(delta.text);
        } else if (event.type === 'result') {
          result = event;
        }
      }
    });
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdin.end(toTranscript(responder, history));

    child.on('error', (err) =>
      reject(err.code === 'ENOENT' ? new Error('`claude` CLI not found. Install Claude Code or set ANTHROPIC_API_KEY.') : err)
    );
    child.on('close', (code) => {
      fs.rm(promptFile, { force: true }, () => {});
      if (result?.is_error || (code !== 0 && !result)) {
        return reject(new Error(result?.result || stderr.trim().split('\n').at(-1) || `claude exited with code ${code}`));
      }
      if (!streamed && result?.result) onDelta(result.result);
      resolve();
    });
  });
}

export function reply(opts) {
  return PROVIDER === 'api' ? replyWithApi(opts) : replyWithCli(opts);
}
