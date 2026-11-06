import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { relayDispatch } from '../relay/dispatch.ts';
import { CoordinationStore } from '../relay/store.ts';
import { databaseHostIsLocal, relayConfigurationError } from '../relay/open.ts';
import { relayTick } from '../executor/poller.ts';
import { registerDevice } from '../executor/register.ts';
import { relayUrlAllowed } from '../executor/runtime.ts';
import { createApp } from '../backend/server.ts';
import handler from '../../api/relay.ts';
import type { Queryable } from '../relay/types.ts';

const bootstrap = 'bootstrap-test-token-value';
const env = { LYDIA_RELAY_BOOTSTRAP_TOKEN: bootstrap } as NodeJS.ProcessEnv;
const password = 'correct-horse-battery';

function txOf(tx: { query: PGlite['query']; exec: PGlite['exec'] }): Queryable {
  return {
    query: (sql, params = []) => tx.query(sql, params),
    exec: async sql => { await tx.exec(sql); },
    transaction: fn => fn(txOf(tx)),
    close: async () => {},
  };
}

function wrap(db: PGlite): Queryable {
  return {
    query: (sql, params = []) => db.query(sql, params),
    exec: async sql => { await db.exec(sql); },
    transaction: fn => db.transaction(tx => fn(txOf(tx))),
    close: () => db.close(),
  };
}

async function relayStore() {
  const db = new PGlite();
  const queryable = wrap(db);
  const store = new CoordinationStore(queryable);
  await store.ensure();
  return { db, queryable, store };
}

function request(pathname: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('origin')) headers.set('origin', 'http://relay.test');
  headers.set('x-forwarded-host', 'relay.test');
  return new Request(`http://relay.test${pathname}`, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function call(queryable: Queryable, pathname: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const result = await relayDispatch(request(pathname, options), env, queryable);
  return { ...result, json: result.body as any };
}

async function owner(queryable: Queryable) {
  const setup = await call(queryable, '/api/relay/setup', { body: { password }, headers: { 'x-lydia-bootstrap': bootstrap, origin: '' } });
  assert.equal(setup.status, 200);
  const login = await call(queryable, '/api/relay/login', { body: { password } });
  assert.equal(login.status, 200);
  const cookie = /lydia_relay_session=([^;]+)/.exec(login.headers['set-cookie'])?.[1] || '';
  const auth = { cookie: `lydia_relay_session=${cookie}`, 'x-csrf-token': login.json.csrf, origin: 'http://relay.test' };
  const device = await call(queryable, '/api/relay/devices', { body: { label: 'desk' }, headers: auth });
  assert.equal(device.status, 201);
  return { auth, deviceToken: device.json.deviceToken as string };
}

test('unconfigured relay rejects every remote task path', async () => {
  const result = await relayDispatch(request('/api/relay/tasks', { method: 'POST', body: { caseId: '00000000-0000-4000-8000-000000000001', kind: 'question', message: 'hello', requestKey: 'request-key-1' } }), {});
  assert.equal(result.status, 503);
  assert.equal((result.body as any).error.code, 'COORDINATION_UNCONFIGURED');
  assert.equal(JSON.stringify(result.body).includes('queued'), false);
  assert.equal(relayConfigurationError({ LYDIA_COORDINATION_DRIVER: 'memory', LYDIA_COORDINATION_DATABASE_URL: 'postgres://db.example/lydia', LYDIA_RELAY_BOOTSTRAP_TOKEN: 'x' })?.code, 'COORDINATION_UNCONFIGURED');
  assert.equal(relayConfigurationError({ VERCEL: '1', LYDIA_COORDINATION_DATABASE_URL: 'postgres://127.0.0.1/lydia', LYDIA_RELAY_BOOTSTRAP_TOKEN: 'x' })?.code, 'COORDINATION_UNCONFIGURED');
  assert.equal(databaseHostIsLocal('postgres://db.example:5432/lydia'), false);
  assert.equal(relayUrlAllowed('http://127.0.0.1:4318'), false);
  assert.equal(relayUrlAllowed('https://lydia.example'), true);
});

test('separate databases do not share a hidden memory queue', async () => {
  const left = await relayStore();
  const right = await relayStore();
  const ownerLeft = await owner(left.queryable);
  await call(left.queryable, '/api/relay/agent/heartbeat', { body: { cases: [{ id: '00000000-0000-4000-8000-000000000010', title: 'Only left' }] }, headers: { authorization: `Bearer ${ownerLeft.deviceToken}`, origin: '' } });
  const created = await call(left.queryable, '/api/relay/tasks', { body: { caseId: '00000000-0000-4000-8000-000000000010', kind: 'question', message: 'left only', requestKey: 'left-request-key' }, headers: ownerLeft.auth });
  assert.equal(created.status, 201);
  const rightTasks = await call(right.queryable, '/api/relay/tasks', { headers: (await owner(right.queryable)).auth });
  assert.deepEqual(rightTasks.json.tasks, []);
  await left.db.close();
  await right.db.close();
});

test('relay auth, offline rejection, idempotent claim, expiry and credential boundaries', async () => {
  const { db, queryable } = await relayStore();
  const caseId = '00000000-0000-4000-8000-000000000020';
  const unauthenticated = await call(queryable, '/api/relay/tasks');
  assert.equal(unauthenticated.status, 401);
  const badBootstrap = await call(queryable, '/api/relay/setup', { body: { password }, headers: { 'x-lydia-bootstrap': 'wrong-bootstrap-token', origin: '' } });
  assert.equal(badBootstrap.status, 403);
  assert.equal(badBootstrap.json.error.message.includes('wrong-bootstrap-token'), false);
  const { auth, deviceToken } = await owner(queryable);
  const offline = await call(queryable, '/api/relay/tasks', { body: { caseId, kind: 'question', message: 'should not queue', requestKey: 'offline-request-key' }, headers: auth });
  assert.equal(offline.status, 503);
  assert.equal(offline.json.error.code, 'EXECUTOR_OFFLINE');
  assert.equal((await call(queryable, '/api/relay/tasks', { headers: auth })).json.tasks.length, 0);

  const beat = await call(queryable, '/api/relay/agent/heartbeat', { body: { cases: [{ id: caseId, title: 'Clinic' }] }, headers: { authorization: `Bearer ${deviceToken}`, origin: '' } });
  assert.equal(beat.status, 200);
  const created = await call(queryable, '/api/relay/tasks', { body: { caseId, kind: 'question', message: 'What changed?', requestKey: 'same-request-key' }, headers: auth });
  const repeat = await call(queryable, '/api/relay/tasks', { body: { caseId, kind: 'question', message: 'What changed?', requestKey: 'same-request-key' }, headers: auth });
  assert.equal(repeat.json.task.id, created.json.task.id);
  const conflict = await call(queryable, '/api/relay/tasks', { body: { caseId, kind: 'research', message: 'Different', requestKey: 'same-request-key' }, headers: auth });
  assert.equal(conflict.status, 409);

  const userClaim = await call(queryable, '/api/relay/agent/claim', { body: { claimKey: 'user-claim-key' }, headers: auth });
  assert.equal(userClaim.status, 403);
  const deviceList = await call(queryable, '/api/relay/tasks', { headers: { authorization: `Bearer ${deviceToken}` } });
  assert.equal(deviceList.status, 403);
  assert.equal(JSON.stringify(deviceList.body).includes(deviceToken), false);
  const evilOrigin = await call(queryable, '/api/relay/tasks', { body: { caseId, kind: 'question', message: 'nope', requestKey: 'another-request-key' }, headers: { ...auth, origin: 'https://evil.example' } });
  assert.equal(evilOrigin.status, 403);

  const first = await call(queryable, '/api/relay/agent/claim', { body: { claimKey: 'claim-key-same' }, headers: { authorization: `Bearer ${deviceToken}`, origin: '' } });
  const second = await call(queryable, '/api/relay/agent/claim', { body: { claimKey: 'claim-key-same' }, headers: { authorization: `Bearer ${deviceToken}`, origin: '' } });
  assert.equal(first.json.task.id, second.json.task.id);
  assert.notEqual(first.json.task.lease, second.json.task.lease);
  const listed = await call(queryable, '/api/relay/tasks', { headers: auth });
  const listedText = JSON.stringify(listed.body);
  assert.equal(listedText.includes(deviceToken), false);
  assert.equal(listedText.includes(first.json.task.lease), false);
  assert.equal(listedText.includes(second.json.task.lease), false);
  assert.equal(listed.json.tasks[0].checkpoint.current, null);

  const running = await call(queryable, '/api/relay/agent/report', { body: { id: first.json.task.id, lease: second.json.task.lease, status: 'running', checkpoint: { current: 'steve', steps: ['steve'], collection: { status: 'NOT_ATTEMPTED' } }, resultSummary: '初步判断' }, headers: { authorization: `Bearer ${deviceToken}`, origin: '' } });
  assert.equal(running.status, 200);
  assert.equal(running.json.task.lease, undefined);
  await (new CoordinationStore(queryable)).ageLease(first.json.task.id);
  const paused = await call(queryable, '/api/relay/tasks', { headers: auth });
  assert.equal(paused.json.tasks[0].status, 'paused');
  assert.equal(paused.json.tasks[0].error.code, 'INTERRUPTED');
  assert.equal(paused.json.tasks[0].resultSummary, '初步判断');
  const reclaimed = await call(queryable, '/api/relay/agent/claim', { body: { claimKey: 'after-expiry-claim' }, headers: { authorization: `Bearer ${deviceToken}`, origin: '' } });
  assert.equal(reclaimed.json.task, null);
  const resumed = await call(queryable, '/api/relay/tasks/' + first.json.task.id + '/resume', { body: {}, headers: auth });
  assert.equal(resumed.json.task.status, 'queued');
  const resumedClaim = await call(queryable, '/api/relay/agent/claim', { body: { claimKey: 'resume-claim-key' }, headers: { authorization: `Bearer ${deviceToken}`, origin: '' } });
  assert.equal(resumedClaim.json.task.resume, true);
  await db.close();
});

test('concurrent claims award one lease', async () => {
  const { db, queryable, store } = await relayStore();
  const { deviceToken } = await owner(queryable);
  const caseId = '00000000-0000-4000-8000-000000000030';
  await store.heartbeat(deviceToken, [{ id: caseId, title: 'One' }]);
  await store.enqueue({ caseId, kind: 'question', message: 'only once', requestKey: 'parallel-request-key' });
  const claims = await Promise.all([store.claim(deviceToken, 'parallel-claim-a'), store.claim(deviceToken, 'parallel-claim-b')]);
  const ids = new Set(claims.map(task => task?.id).filter(Boolean));
  assert.equal(ids.size, 1);
  assert.equal((await db.query('SELECT id FROM relay_tasks')).rows.length, 1);
  const taskId = [...ids][0] || '';
  const replacement = await store.registerDevice('other-desk');
  await assert.rejects(() => store.claim(deviceToken, 'revoked-device-claim'), /设备凭据无效/);
  await store.ageLease(taskId);
  const handed = await store.claim(replacement.deviceToken, 'replacement-claim-key');
  assert.equal(handed?.id, taskId);
  await db.close();
});

test('poller starts work once, rejects a dead relay, and cancels without a second kick', async () => {
  const { db, queryable } = await relayStore();
  const { auth, deviceToken } = await owner(queryable);
  const caseId = '00000000-0000-4000-8000-000000000040';
  const logs: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const name of ['origin', 'cookie', 'authorization', 'x-csrf-token', 'x-lydia-bootstrap', 'content-type', 'x-forwarded-host']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    const host = String(req.headers['x-forwarded-host'] || 'relay.test');
    headers.set('x-forwarded-host', host);
    const body = Buffer.concat(chunks).toString('utf8');
    const web = new Request(`http://${host}${req.url}`, { method: req.method, headers, body: body || undefined });
    const result = await relayDispatch(web, env, queryable);
    res.writeHead(result.status, result.headers);
    res.end(JSON.stringify(result.body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port missing');
  const relayUrl = `http://127.0.0.1:${address.port}`;
  let kicks = 0;
  let cancels = 0;
  let resumes = 0;
  const localTasks = new Map<string, { id: string; status: string }>();
  const local = {
    cases: async () => [{ id: caseId, title: 'Clinic', updatedAt: new Date().toISOString() }],
    find: async (requestKey: string) => localTasks.get(requestKey) || null,
    enqueue: async (task: { requestKey: string }) => { localTasks.set(task.requestKey, { id: 'local-1', status: 'QUEUED' }); },
    resume: async (id: string) => { resumes += 1; for (const task of localTasks.values()) if (task.id === id) task.status = 'QUEUED'; },
    cancel: async (id: string) => { cancels += 1; for (const task of localTasks.values()) if (task.id === id) task.status = 'CANCELLED'; },
    kick: () => { kicks += 1; const task = localTasks.get('poller-request-key'); if (task) task.status = 'RUNNING'; },
    busy: () => false,
  };
  const started = new Set<string>();
  const tick = (claimKey: string) => relayTick({ relayUrl, deviceToken, local, claimKey, started, fetchImpl: fetch, log: message => logs.push(message) });
  await call(queryable, '/api/relay/agent/heartbeat', { body: { cases: [{ id: caseId, title: 'Clinic' }] }, headers: { authorization: `Bearer ${deviceToken}`, origin: '' } });
  await call(queryable, '/api/relay/tasks', { body: { caseId, kind: 'question', message: 'Track the step', requestKey: 'poller-request-key' }, headers: auth });
  const first = await tick('poller-claim-1');
  const second = await tick('poller-claim-2');
  assert.equal(first.started, true);
  assert.equal(kicks, 1);
  assert.equal(second.mirrored, 'running');
  assert.equal(kicks, 1);
  localTasks.get('poller-request-key')!.status = 'PAUSED';
  await tick('poller-claim-paused');
  assert.equal(resumes, 0);
  assert.equal(kicks, 1);
  const taskId = (await call(queryable, '/api/relay/tasks', { headers: auth })).json.tasks[0].id;
  await call(queryable, `/api/relay/tasks/${taskId}/cancel`, { body: {}, headers: auth });
  await tick('poller-claim-3');
  assert.equal(cancels, 1);
  assert.equal(kicks, 1);
  const dead = await relayTick({ relayUrl: 'http://127.0.0.1:1', deviceToken, local, claimKey: 'dead-claim-key', started, log: message => logs.push(message) });
  assert.equal(dead.claimed, false);
  assert.equal(kicks, 1);
  assert.equal(logs.some(line => line.includes(deviceToken)), false);
  const directory = await mkdtemp(path.join(tmpdir(), 'lydia-device-'));
  const notes: string[] = [];
  const registered = await registerDevice({ relayUrl, bootstrapToken: bootstrap, password, directory, log: message => notes.push(message) });
  const saved = await readFile(registered.filePath, 'utf8');
  assert.equal(notes.join('\n').includes(saved.trim()), false);
  assert.equal(notes.join('\n').includes(password), false);
  assert.equal((await stat(registered.filePath)).mode & 0o777, 0o600);
  server.close();
  await db.close();
});

test('local server does not expose the relay', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lydia-local-relay-'));
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  const server = createServer((req, res) => { if (app) void app.handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port missing');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    app = await createApp({ dataDir: path.join(directory, 'pg'), origin, startWorker: false, localAutoLogin: true });
    const anonymous = await fetch(origin + '/api/relay/tasks', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(anonymous.status, 401);
    const home = await fetch(origin + '/api/auth/status');
    const state = await home.json();
    assert.equal(state.passwordless, true);
    const cookie = home.headers.get('set-cookie')!.split(';')[0];
    const relay = await fetch(origin + '/api/relay/tasks', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json', 'x-csrf-token': state.csrf }, body: '{}' });
    const body = await relay.json();
    assert.equal(relay.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await app?.close();
  }
});

test('vercel entry refuses work without coordination configuration', async () => {
  const previous = { url: process.env.LYDIA_COORDINATION_DATABASE_URL, token: process.env.LYDIA_RELAY_BOOTSTRAP_TOKEN, driver: process.env.LYDIA_COORDINATION_DRIVER };
  delete process.env.LYDIA_COORDINATION_DATABASE_URL;
  delete process.env.LYDIA_RELAY_BOOTSTRAP_TOKEN;
  delete process.env.LYDIA_COORDINATION_DRIVER;
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port missing');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/relay/tasks`, { method: 'POST', headers: { origin: 'https://lydia.example', 'content-type': 'application/json' }, body: '{}' });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'COORDINATION_UNCONFIGURED');
  } finally {
    if (previous.url) process.env.LYDIA_COORDINATION_DATABASE_URL = previous.url;
    if (previous.token) process.env.LYDIA_RELAY_BOOTSTRAP_TOKEN = previous.token;
    if (previous.driver) process.env.LYDIA_COORDINATION_DRIVER = previous.driver;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
