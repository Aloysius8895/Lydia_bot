import { personasById } from './personas.js';
import { MODEL, PROVIDER, reply } from './llm.js';

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// POST /api/reply { responder, history: [{ from, text }], room } streams server-sent events:
// { delta } while the persona writes, then { done } or { error }.
async function handleReply(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const { responder, history, room } = body;
  if (!personasById[responder]) return sendJson(res, 400, { error: `Unknown persona "${responder}"` });
  if (!Array.isArray(history) || history.length === 0) return sendJson(res, 400, { error: 'history is required' });
  const clean = history
    .filter((m) => m && typeof m.text === 'string' && m.text.trim() && (m.from === 'me' || personasById[m.from]))
    .map((m) => ({ from: m.from, text: m.text }));

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const controller = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) controller.abort();
  });

  try {
    await reply({ responder, history: clean, isRoom: Boolean(room), onDelta: (delta) => send({ delta }), signal: controller.signal });
    send({ done: true });
  } catch (err) {
    if (!controller.signal.aborted) {
      console.error(`[crew] ${responder} failed:`, err);
      send({ error: err.message || String(err) });
    }
  } finally {
    finished = true;
    res.end();
  }
}

// Connect-style middleware, shared by the Vite dev server and server/index.js.
export function apiMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { provider: PROVIDER, model: MODEL });
  if (url.pathname === '/api/reply' && req.method === 'POST') return void handleReply(req, res);
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
  next();
}
