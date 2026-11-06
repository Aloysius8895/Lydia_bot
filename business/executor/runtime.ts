import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runtimeRoot } from '../shared/config.ts';
import { startPoller, type LocalExecutor } from './poller.ts';

type ResearchApp = {
  store: {
    rows: (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;
    one: (sql: string, params?: unknown[]) => Promise<Record<string, any> | undefined>;
    enqueue: (caseId: string, kind: string, input: { message: string }, key: string) => Promise<unknown>;
    resumeTask: (id: string) => Promise<unknown>;
  };
  worker: {
    active: unknown;
    checking: boolean;
    tick: () => Promise<void>;
    cancel: (id: string) => Promise<unknown>;
  };
};

export function localResearchAdapter(app: ResearchApp): LocalExecutor {
  const kick = () => { void app.worker.tick().catch(() => {}); };
  return {
    cases: async () => (await app.store.rows('SELECT id,title,updated_at FROM cases ORDER BY updated_at DESC LIMIT 100')).map(row => ({
      id: String(row.id), title: String(row.title), updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(String(row.updated_at)).toISOString(),
    })),
    find: async requestKey => {
      const task = await app.store.one('SELECT id,status,checkpoint,error FROM tasks WHERE request_key=$1', [requestKey]);
      if (!task) return null;
      const run = await app.store.one("SELECT output->>'summary' AS summary FROM expert_runs WHERE task_id=$1 ORDER BY created_at DESC LIMIT 1", [task.id]).catch(() => undefined);
      return { id: String(task.id), status: String(task.status), checkpoint: task.checkpoint, error: task.error, resultSummary: typeof run?.summary === 'string' ? run.summary.slice(0, 240) : null };
    },
    enqueue: async task => { await app.store.enqueue(task.caseId, task.kind, { message: task.message }, task.requestKey); },
    resume: async id => { await app.store.resumeTask(id); kick(); },
    cancel: async id => { await app.worker.cancel(id); },
    kick,
    busy: () => Boolean(app.worker.active || app.worker.checking),
  };
}

export function relayUrlAllowed(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return url.protocol === 'https:' && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '0.0.0.0';
  } catch { return false; }
}

export async function startOptionalRelay(app: ResearchApp, env: NodeJS.ProcessEnv = process.env) {
  const relayUrl = env.LYDIA_RELAY_URL?.trim() || '';
  if (!relayUrl) return { enabled: false, stop: async () => {} };
  if (!relayUrlAllowed(relayUrl)) {
    console.error('远程执行器未启动：协调地址必须是公网 https，不能指向本机。本地服务没有因此开放端口。');
    return { enabled: false, stop: async () => {} };
  }
  let deviceToken = '';
  try { deviceToken = (await readFile(path.join(runtimeRoot, 'device-token'), 'utf8')).trim(); } catch { deviceToken = ''; }
  if (!deviceToken) {
    console.error('远程执行器未启动：缺少本机设备凭据。本地服务仍只使用现有监听地址。');
    return { enabled: false, stop: async () => {} };
  }
  const poller = startPoller({ relayUrl, deviceToken, local: localResearchAdapter(app), log: message => console.error(message) });
  return { enabled: true, stop: poller.stop };
}
