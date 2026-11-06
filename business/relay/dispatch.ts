import { z } from 'zod';
import { AppError } from '../shared/config.ts';
import { tokenEquals } from './secrets.ts';
import { CoordinationStore } from './store.ts';
import { relayConfigurationError, openConfiguredStore } from './open.ts';
import type { Queryable } from './types.ts';

const ready = new WeakSet<CoordinationStore>();
const password = z.string().min(1).max(128);
const taskBody = z.object({
  caseId: z.string().uuid(),
  kind: z.enum(['research', 'question']),
  message: z.string().trim().min(1).max(8000),
  requestKey: z.string().trim().min(8).max(100),
});

export type RelayResult = { status: number; headers: Record<string, string>; body: unknown };

function header(headers: Headers, name: string) {
  return headers.get(name) || '';
}

function cookieToken(cookie: string) {
  return /(?:^|;\s*)lydia_relay_session=([^;]+)/.exec(cookie)?.[1];
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): RelayResult {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }, body };
}

function failure(error: unknown, secrets: string[]): RelayResult {
  if (error instanceof z.ZodError) return json(400, { error: { code: 'INPUT_INVALID', message: '输入格式或长度不符合要求' } });
  if (error instanceof AppError) return json(error.status, { error: { code: error.code, message: error.message } });
  const message = error instanceof Error ? error.message : '';
  for (const secret of secrets) if (secret && message.includes(secret)) return json(500, { error: { code: 'INTERNAL_ERROR', message: '请求未能完成' } });
  return json(500, { error: { code: 'INTERNAL_ERROR', message: '请求未能完成' } });
}

async function storeOf(env: NodeJS.ProcessEnv, injected?: Queryable) {
  const blocked = injected ? null : relayConfigurationError(env);
  if (blocked) throw blocked;
  const db = injected ?? await openConfiguredStore(env);
  const store = new CoordinationStore(db);
  if (!ready.has(store)) {
    await store.ensure();
    ready.add(store);
  }
  return store;
}

function requestHost(request: Request) {
  const forwarded = header(request.headers, 'x-forwarded-host');
  if (forwarded) return forwarded.split(',')[0].trim();
  return new URL(request.url).host;
}

function assertBrowser(request: Request) {
  const origin = header(request.headers, 'origin');
  const host = requestHost(request);
  if (!origin || !host) throw new AppError('ORIGIN_INVALID', '仅接受本站请求', 403);
  if (new URL(origin).host !== host) throw new AppError('ORIGIN_INVALID', '仅接受本站请求', 403);
}

async function user(store: CoordinationStore, request: Request) {
  const session = await store.session(cookieToken(header(request.headers, 'cookie')));
  if (!session) throw new AppError('LOGIN_REQUIRED', '请先登录', 401);
  return session;
}

function requireCsrf(session: { csrf: string }, request: Request) {
  if (!tokenEquals(header(request.headers, 'x-csrf-token'), session.csrf)) throw new AppError('CSRF_INVALID', '会话校验未通过，请刷新页面', 403);
}

function deviceToken(request: Request) {
  const value = header(request.headers, 'authorization');
  const token = /^Bearer\s+(\S+)$/.exec(value)?.[1] || '';
  if (!token) throw new AppError('DEVICE_INVALID', '设备凭据无效', 401);
  return token;
}

function cookie(token: string, request: Request, remove = false) {
  const secure = new URL(request.url).protocol === 'https:' || header(request.headers, 'x-forwarded-proto') === 'https';
  return `lydia_relay_session=${remove ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${remove ? 0 : 43200}${secure ? '; Secure' : ''}`;
}

export async function relayDispatch(request: Request, env: NodeJS.ProcessEnv = process.env, injected?: Queryable): Promise<RelayResult> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const presented = [header(request.headers, 'authorization'), header(request.headers, 'x-lydia-bootstrap'), header(request.headers, 'x-csrf-token')].filter(Boolean);
  try {
    if (!path.startsWith('/api/relay')) return json(404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
    const store = await storeOf(env, injected);
    if (method === 'GET' && path === '/api/relay/meta') {
      const executor = await store.executorOnline();
      return json(200, { configured: true, ownerConfigured: await store.ownerConfigured(), executorOnline: executor.online, acceptsTasks: executor.acceptsTasks, lastSeen: executor.lastSeen });
    }
    if (method === 'POST' && path === '/api/relay/setup') {
      const provided = header(request.headers, 'x-lydia-bootstrap');
      const expected = env.LYDIA_RELAY_BOOTSTRAP_TOKEN?.trim() || '';
      if (!expected || !provided || !tokenEquals(provided, expected)) throw new AppError('BOOTSTRAP_INVALID', '引导凭据无效', 403);
      const body = taskless(await readJson(request));
      await store.setupOwner(z.object({ password }).parse(body).password);
      return json(200, { configured: true });
    }
    if (method === 'POST' && path === '/api/relay/login') {
      assertBrowser(request);
      const body = z.object({ password }).parse(await readJson(request));
      const session = await store.login(body.password);
      return json(200, { csrf: session.csrf }, { 'set-cookie': cookie(session.token, request) });
    }
    if (method === 'POST' && path === '/api/relay/logout') {
      assertBrowser(request);
      const session = await user(store, request);
      requireCsrf(session, request);
      await store.logout(cookieToken(header(request.headers, 'cookie')));
      return json(200, { ok: true }, { 'set-cookie': cookie('', request, true) });
    }
    if (method === 'GET' && path === '/api/relay/session') {
      const session = await store.session(cookieToken(header(request.headers, 'cookie')));
      return json(200, { authenticated: !!session, csrf: session?.csrf || null });
    }
    if (path.startsWith('/api/relay/agent/')) {
      if (cookieToken(header(request.headers, 'cookie'))) throw new AppError('CREDENTIAL_TYPE', '设备通道不接受用户会话', 403);
      const token = deviceToken(request);
      if (method === 'POST' && path === '/api/relay/agent/heartbeat') {
        const body = z.object({ cases: z.array(z.object({ id: z.string().min(1).max(80), title: z.string().min(1).max(120), updatedAt: z.string().max(40).optional() })).max(100) }).parse(await readJson(request));
        return json(200, await store.heartbeat(token, body.cases));
      }
      if (method === 'POST' && path === '/api/relay/agent/claim') {
        const body = z.object({ claimKey: z.string().min(8).max(100) }).parse(await readJson(request));
        return json(200, { task: await store.claim(token, body.claimKey) });
      }
      if (method === 'POST' && path === '/api/relay/agent/report') {
        const body = z.object({
          id: z.string().uuid(), lease: z.string().min(8).max(200), status: z.enum(['running', 'paused', 'completed', 'cancelled']),
          checkpoint: z.unknown().optional(), error: z.unknown().optional(), resultSummary: z.string().max(240).nullable().optional(),
        }).parse(await readJson(request));
        return json(200, { task: await store.report(token, body) });
      }
      if (method === 'POST' && path === '/api/relay/agent/ack-cancel') {
        const body = z.object({ requestKey: z.string().min(8).max(100) }).parse(await readJson(request));
        return json(200, await store.ackCancel(token, body.requestKey));
      }
      return json(404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
    }
    if (header(request.headers, 'authorization')) throw new AppError('CREDENTIAL_TYPE', '用户通道不接受设备凭据', 403);
    const session = await user(store, request);
    if (method !== 'GET') {
      assertBrowser(request);
      requireCsrf(session, request);
    }
    if (method === 'POST' && path === '/api/relay/devices') {
      const body = z.object({ label: z.string().trim().min(1).max(80).default('local-executor') }).parse(await readJson(request));
      return json(201, await store.registerDevice(body.label));
    }
    if (method === 'GET' && path === '/api/relay/executor') return json(200, { mode: 'relay', ...(await store.executorOnline()) });
    if (method === 'GET' && path === '/api/relay/cases') return json(200, { cases: await store.listCases() });
    if (method === 'GET' && path === '/api/relay/tasks') return json(200, { tasks: await store.listTasks() });
    if (method === 'POST' && path === '/api/relay/tasks') return json(201, { task: await store.enqueue(taskBody.parse(await readJson(request))) });
    const action = /^\/api\/relay\/tasks\/([^/]+)\/(cancel|resume)$/.exec(path);
    if (action && method === 'POST') {
      const id = z.string().uuid().parse(action[1]);
      return json(200, { task: action[2] === 'cancel' ? await store.cancel(id) : await store.resume(id) });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
  } catch (error) {
    return failure(error, presented);
  }
}

function taskless(value: unknown) {
  return value;
}

async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 64_000) throw new AppError('REQUEST_SIZE', '请求过大', 413);
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new AppError('JSON_INVALID', '请求 JSON 无效'); }
}

export async function relayNode(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const result = await relayDispatch(request, env);
  const headers = new Headers(result.headers);
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}
