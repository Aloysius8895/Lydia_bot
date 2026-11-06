export type LocalTask = {
  id: string;
  status: string;
  checkpoint?: unknown;
  error?: unknown;
  resultSummary?: string | null;
};

export type LocalExecutor = {
  cases: () => Promise<{ id: string; title: string; updatedAt?: string }[]>;
  find: (requestKey: string) => Promise<LocalTask | null>;
  enqueue: (task: { caseId: string; kind: 'research' | 'question'; message: string; requestKey: string }) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  kick: () => void;
  busy: () => boolean;
};

type TickOptions = {
  relayUrl: string;
  deviceToken: string;
  local: LocalExecutor;
  claimKey: string;
  started: Set<string>;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
};

function mirror(status: string) {
  if (status === 'COMPLETED') return 'completed';
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'PAUSED' || status === 'FAILED') return 'paused';
  return 'running';
}

async function post(fetchImpl: typeof fetch, url: string, deviceToken: string, body: unknown, log: (message: string) => void) {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    log('执行器请求未到达协调服务');
    const error = new Error('RELAY_UNREACHABLE') as Error & { code: string };
    error.code = 'RELAY_UNREACHABLE';
    throw error;
  }
  const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
  if (!response.ok) {
    const code = payload?.error?.code || 'RELAY_REJECTED';
    log(`执行器请求被拒绝：${code}`);
    const error = new Error(code) as Error & { code: string };
    error.code = code;
    throw error;
  }
  return payload as Record<string, any>;
}

export async function relayTick(options: TickOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const root = options.relayUrl.replace(/\/$/, '');
  const agent = (path: string, body: unknown) => post(fetchImpl, root + path, options.deviceToken, body, log);
  try {
    const beat = await agent('/api/relay/agent/heartbeat', { cases: await options.local.cases() });
    for (const requestKey of beat.cancellations || []) {
      const local = await options.local.find(requestKey);
      if (local && ['QUEUED', 'RUNNING', 'PAUSED'].includes(local.status)) await options.local.cancel(local.id);
      await agent('/api/relay/agent/ack-cancel', { requestKey });
    }
    const claimed = await agent('/api/relay/agent/claim', { claimKey: options.claimKey });
    const task = claimed.task;
    if (!task) return { claimed: false as const };
    const local = await options.local.find(task.requestKey);
    const report = (status: string, extra: Record<string, unknown> = {}) => agent('/api/relay/agent/report', { id: task.id, lease: task.lease, status, ...extra });
    if (!local) {
      await report('running', { checkpoint: { current: '已领取' } });
      await options.local.enqueue(task);
      if (!options.started.has(task.requestKey)) {
        options.started.add(task.requestKey);
        options.local.kick();
      }
      return { claimed: true as const, started: true as const };
    }
    if (task.resume && local.status === 'PAUSED') {
      await report('running', { checkpoint: local.checkpoint });
      options.started.delete(task.requestKey);
      await options.local.resume(local.id);
      options.started.add(task.requestKey);
      return { claimed: true as const, resumed: true as const };
    }
    if (local.status === 'QUEUED' && !options.local.busy() && !options.started.has(task.requestKey)) {
      options.started.add(task.requestKey);
      await report('running', { checkpoint: local.checkpoint });
      options.local.kick();
      return { claimed: true as const, started: true as const };
    }
    const status = mirror(local.status);
    await report(status, { checkpoint: local.checkpoint, error: local.error, resultSummary: local.resultSummary });
    return { claimed: true as const, mirrored: status };
  } catch (error) {
    const code = (error as { code?: string }).code || 'RELAY_UNREACHABLE';
    log(`执行器本轮未领取任务：${code}`);
    return { claimed: false as const, code, blocked: code === 'COORDINATION_UNCONFIGURED' };
  }
}

export function startPoller(options: Omit<TickOptions, 'claimKey' | 'started'> & { intervalMs?: number }) {
  const started = new Set<string>();
  let stopped = false;
  let pending: Promise<void> | undefined;
  let lastLog = '';
  const log = (message: string) => { if (message === lastLog) return; lastLog = message; options.log?.(message); };
  const run = () => {
    if (stopped || pending) return;
    pending = relayTick({ ...options, started, log, claimKey: crypto.randomUUID() }).then(() => { lastLog = ''; }, () => undefined).finally(() => { pending = undefined; });
  };
  const timer = setInterval(run, options.intervalMs ?? 3000);
  timer.unref?.();
  void run();
  return { stop: async () => { stopped = true; clearInterval(timer); await pending; } };
}
