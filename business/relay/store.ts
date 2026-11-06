import { randomUUID } from 'node:crypto';
import { AppError } from '../shared/config.ts';
import { relayStatements } from './schema.ts';
import { hashPassword, newSecret, sha256, tokenEquals, verifyPassword } from './secrets.ts';
import { sanitizeCheckpoint, sanitizeError, sanitizeSummary } from './sanitize.ts';
import { LEASE_SECONDS, ONLINE_SECONDS, type AgentTask, type PublicTask, type Queryable } from './types.ts';

type TaskRow = Record<string, unknown>;

function text(value: unknown) {
  return value == null ? null : String(value);
}

function time(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function jsonValue(value: unknown) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export function publicTask(row: TaskRow): PublicTask {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    kind: row.kind === 'question' ? 'question' : 'research',
    message: String(row.message),
    status: String(row.status),
    checkpoint: sanitizeCheckpoint(jsonValue(row.checkpoint)),
    error: sanitizeError(jsonValue(row.error)),
    resultSummary: text(row.result_summary),
    updatedAt: time(row.updated_at),
  };
}

function agentTask(row: TaskRow, lease: string): AgentTask {
  return { ...publicTask(row), requestKey: String(row.request_key), resume: row.resume_requested === true, lease };
}

export class CoordinationStore {
  private readonly db: Queryable;
  constructor(db: Queryable) { this.db = db; }

  async ensure() {
    for (const statement of relayStatements) await this.db.exec(statement);
  }

  async ownerConfigured() {
    return !!(await this.db.query('SELECT key FROM relay_meta WHERE key=$1', ['owner'])).rows[0];
  }

  async setupOwner(password: string) {
    if (await this.ownerConfigured()) throw new AppError('ALREADY_CONFIGURED', '远程账号已设置', 409);
    if (password.length < 12 || password.length > 128) throw new AppError('PASSWORD_LENGTH', '密码长度需为 12–128 字符');
    const stored = await hashPassword(password);
    await this.db.query('INSERT INTO relay_meta(key,data) VALUES($1,$2::jsonb)', ['owner', JSON.stringify(stored)]);
  }

  async login(password: string) {
    const row = (await this.db.query('SELECT data FROM relay_meta WHERE key=$1', ['owner'])).rows[0];
    if (!row) throw new AppError('SETUP_REQUIRED', '请先在本机注册脚本中设置密码', 409);
    const stored = jsonValue(row.data) as { salt: string; hash: string };
    if (!await verifyPassword(password, stored)) throw new AppError('LOGIN_INVALID', '密码不正确', 401);
    const token = newSecret();
    const csrf = newSecret();
    await this.db.query('DELETE FROM relay_sessions WHERE expires_at<now()');
    await this.db.query("INSERT INTO relay_sessions(token_hash,csrf,expires_at) VALUES($1,$2,now()+interval '12 hours')", [sha256(token), csrf]);
    return { token, csrf };
  }

  async session(token: string | undefined) {
    if (!token) return null;
    const row = (await this.db.query('SELECT csrf FROM relay_sessions WHERE token_hash=$1 AND expires_at>now()', [sha256(token)])).rows[0];
    return row ? { csrf: String(row.csrf) } : null;
  }

  async logout(token: string | undefined) {
    if (token) await this.db.query('DELETE FROM relay_sessions WHERE token_hash=$1', [sha256(token)]);
  }

  async registerDevice(label: string) {
    const id = randomUUID();
    const token = newSecret('ld_');
    await this.db.transaction(async tx => {
      await tx.query('UPDATE relay_devices SET revoked_at=now() WHERE revoked_at IS NULL');
      await tx.query('DELETE FROM relay_heartbeats');
      await tx.query('INSERT INTO relay_devices(id,token_hash,label) VALUES($1,$2,$3)', [id, sha256(token), label.slice(0, 80)]);
    });
    return { deviceId: id, deviceToken: token };
  }

  async executorOnline() {
    await this.expireLeases();
    const row = (await this.db.query(
      `SELECT h.seen_at FROM relay_heartbeats h
       JOIN relay_devices d ON d.id=h.device_id
       WHERE d.revoked_at IS NULL AND h.seen_at > now() - make_interval(secs => $1::int)`,
      [ONLINE_SECONDS],
    )).rows[0];
    return { online: !!row, lastSeen: row ? new Date(String(row.seen_at)).toISOString() : null, acceptsTasks: !!row };
  }

  async heartbeat(deviceToken: string, cases: { id: string; title: string; updatedAt?: string }[]) {
    const device = await this.device(deviceToken);
    const clean = cases.slice(0, 100).map(item => ({
      id: String(item.id).slice(0, 80),
      title: String(item.title).slice(0, 120),
      updatedAt: item.updatedAt && !Number.isNaN(Date.parse(item.updatedAt)) ? new Date(item.updatedAt).toISOString() : new Date().toISOString(),
    })).filter(item => item.id && item.title);
    const cancellations = await this.db.transaction(async tx => {
      await tx.query(
        `INSERT INTO relay_heartbeats(device_id,seen_at) VALUES($1,now())
         ON CONFLICT(device_id) DO UPDATE SET seen_at=now()`,
        [device.id],
      );
      await tx.query('DELETE FROM relay_cases');
      for (const item of clean) {
        await tx.query('INSERT INTO relay_cases(id,title,updated_at) VALUES($1,$2,$3)', [item.id, item.title, item.updatedAt]);
      }
      return (await tx.query("SELECT request_key FROM relay_tasks WHERE status='cancelled' AND cancel_acked=false")).rows.map(row => String(row.request_key));
    });
    return { ok: true, cancellations };
  }

  async enqueue(input: { caseId: string; kind: 'research' | 'question'; message: string; requestKey: string }) {
    return this.db.transaction(async tx => {
      await this.expireLeases(tx);
      const existing = (await tx.query('SELECT * FROM relay_tasks WHERE request_key=$1', [input.requestKey])).rows[0];
      if (existing) {
        const same = existing.case_id === input.caseId && existing.kind === input.kind && existing.message === input.message;
        if (!same) throw new AppError('IDEMPOTENCY_CONFLICT', '相同请求标识不能用于不同内容', 409);
        return publicTask(existing);
      }
      const online = (await tx.query(
        `SELECT 1 FROM relay_heartbeats h JOIN relay_devices d ON d.id=h.device_id
         WHERE d.revoked_at IS NULL AND h.seen_at > now() - make_interval(secs => $1::int)`,
        [ONLINE_SECONDS],
      )).rows[0];
      if (!online) throw new AppError('EXECUTOR_OFFLINE', '电脑上的执行器不在线，新任务已拒绝，没有写入队列。', 503);
      const known = (await tx.query('SELECT id FROM relay_cases WHERE id=$1', [input.caseId])).rows[0];
      if (!known) throw new AppError('CASE_NOT_PUBLISHED', '执行器还没有公布这个项目', 404);
      const id = randomUUID();
      const inserted = (await tx.query(
        `INSERT INTO relay_tasks(id,case_id,kind,message,request_key,status)
         VALUES($1,$2,$3,$4,$5,'queued') RETURNING *`,
        [id, input.caseId, input.kind, input.message, input.requestKey],
      )).rows[0];
      return publicTask(inserted);
    });
  }

  async listCases() {
    const rows = (await this.db.query('SELECT id,title,updated_at FROM relay_cases ORDER BY updated_at DESC')).rows;
    return rows.map(row => ({ id: String(row.id), title: String(row.title), updatedAt: time(row.updated_at) }));
  }

  async listTasks() {
    await this.expireLeases();
    const rows = (await this.db.query('SELECT id,case_id,kind,message,status,checkpoint,error,result_summary,updated_at FROM relay_tasks ORDER BY created_at DESC')).rows;
    return rows.map(publicTask);
  }

  async cancel(id: string) {
    const row = await this.requireTask(id);
    if (row.status === 'completed') throw new AppError('TASK_FINISHED', '已完成的任务不能取消', 409);
    if (row.status === 'cancelled') return publicTask(row);
    const updated = (await this.db.query(
      `UPDATE relay_tasks SET status='cancelled', lease_token=NULL, lease_expires_at=NULL, claim_key=NULL, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id],
    )).rows[0];
    return publicTask(updated);
  }

  async resume(id: string) {
    const row = await this.requireTask(id);
    if (row.status !== 'paused') throw new AppError('NOT_PAUSED', '仅暂停任务可以恢复', 409);
    const online = await this.executorOnline();
    if (!online.online) throw new AppError('EXECUTOR_OFFLINE', '电脑上的执行器不在线，恢复已拒绝。', 503);
    const updated = (await this.db.query(
      `UPDATE relay_tasks SET status='queued', resume_requested=true, lease_token=NULL, lease_expires_at=NULL, claim_key=NULL, updated_at=now()
       WHERE id=$1 AND status='paused' RETURNING *`,
      [id],
    )).rows[0];
    return publicTask(updated);
  }

  async claim(deviceToken: string, claimKey: string) {
    const device = await this.device(deviceToken);
    return this.db.transaction(async tx => {
      await this.expireLeases(tx);
      const held = (await tx.query(
        `SELECT * FROM relay_tasks WHERE device_id=$1 AND status IN ('claimed','running') AND lease_expires_at>now()
         ORDER BY updated_at LIMIT 1 FOR UPDATE`,
        [device.id],
      )).rows[0];
      if (held) {
        const lease = newSecret('ls_');
        const updated = (await tx.query(
          `UPDATE relay_tasks SET lease_token=$2, lease_expires_at=now()+make_interval(secs => $3::int), claim_key=$4, updated_at=now()
           WHERE id=$1 RETURNING *`,
          [held.id, lease, LEASE_SECONDS, claimKey],
        )).rows[0];
        return agentTask(updated, lease);
      }
      const next = (await tx.query(
        "SELECT id FROM relay_tasks WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      )).rows[0];
      if (!next) return null;
      const lease = newSecret('ls_');
      const updated = (await tx.query(
        `UPDATE relay_tasks
         SET status='claimed', device_id=$2, lease_token=$3, lease_expires_at=now()+make_interval(secs => $4::int), claim_key=$5, updated_at=now()
         WHERE id=$1 AND status='queued' RETURNING *`,
        [next.id, device.id, lease, LEASE_SECONDS, claimKey],
      )).rows[0];
      if (!updated) return null;
      return agentTask(updated, lease);
    });
  }

  async report(deviceToken: string, input: { id: string; lease: string; status: string; checkpoint?: unknown; error?: unknown; resultSummary?: unknown }) {
    const device = await this.device(deviceToken);
    const allowed = new Set(['running', 'paused', 'completed', 'cancelled']);
    if (!allowed.has(input.status)) throw new AppError('STATUS_INVALID', '不能回写这个状态', 409);
    return this.db.transaction(async tx => {
      const row = (await tx.query('SELECT * FROM relay_tasks WHERE id=$1 AND device_id=$2 FOR UPDATE', [input.id, device.id])).rows[0];
      if (!row) throw new AppError('TASK_NOT_FOUND', '任务不属于这台执行器', 404);
      if (row.status === 'cancelled' && input.status === 'cancelled') {
        await tx.query('UPDATE relay_tasks SET cancel_acked=true, updated_at=now() WHERE id=$1', [input.id]);
        const acked = (await tx.query('SELECT * FROM relay_tasks WHERE id=$1', [input.id])).rows[0];
        return publicTask(acked);
      }
      if (row.status === input.status && row.lease_token && tokenEquals(String(row.lease_token), input.lease)) return publicTask(row);
      if (!row.lease_token || !tokenEquals(String(row.lease_token), input.lease)) throw new AppError('LEASE_INVALID', '领取凭据无效', 409);
      if (row.lease_expires_at && new Date(String(row.lease_expires_at)).getTime() <= Date.now()) throw new AppError('LEASE_EXPIRED', '领取已过期', 409);
      const terminal = row.status === 'completed' || row.status === 'cancelled';
      if (terminal) throw new AppError('TASK_FINISHED', '任务已结束', 409);
      const checkpoint = sanitizeCheckpoint(input.checkpoint ?? row.checkpoint);
      const error = input.error === undefined ? sanitizeError(row.error) : sanitizeError(input.error);
      const summary = input.resultSummary === undefined ? text(row.result_summary) : sanitizeSummary(input.resultSummary);
      const executionStarted = row.execution_started === true || input.status === 'running' || input.status === 'paused' || input.status === 'completed';
      const updated = (await tx.query(
        `UPDATE relay_tasks
         SET status=$2, checkpoint=$3::jsonb, error=$4::jsonb, result_summary=$5, execution_started=$6,
             lease_expires_at=CASE WHEN $2='running' THEN now()+make_interval(secs => $7::int) ELSE NULL END,
             lease_token=CASE WHEN $2='running' THEN lease_token ELSE NULL END,
             resume_requested=CASE WHEN $2='running' THEN false ELSE resume_requested END,
             cancel_acked=CASE WHEN $2='cancelled' THEN true ELSE cancel_acked END,
             updated_at=now()
         WHERE id=$1 RETURNING *`,
        [input.id, input.status, JSON.stringify(checkpoint), error ? JSON.stringify(error) : null, summary, executionStarted, LEASE_SECONDS],
      )).rows[0];
      return publicTask(updated);
    });
  }

  async ackCancel(deviceToken: string, requestKey: string) {
    await this.device(deviceToken);
    const updated = (await this.db.query(
      `UPDATE relay_tasks SET cancel_acked=true, updated_at=now()
       WHERE request_key=$1 AND status='cancelled' AND cancel_acked=false RETURNING request_key`,
      [requestKey],
    )).rows[0];
    return { acked: !!updated };
  }

  private async device(token: string) {
    const row = (await this.db.query(
      'SELECT id FROM relay_devices WHERE token_hash=$1 AND revoked_at IS NULL',
      [sha256(token)],
    )).rows[0];
    if (!row) throw new AppError('DEVICE_INVALID', '设备凭据无效', 401);
    return { id: String(row.id) };
  }

  private async requireTask(id: string) {
    const row = (await this.db.query('SELECT * FROM relay_tasks WHERE id=$1', [id])).rows[0];
    if (!row) throw new AppError('TASK_NOT_FOUND', '任务不存在', 404);
    return row;
  }

  private async expireLeases(tx: Queryable = this.db) {
    await tx.query(
      `UPDATE relay_tasks
       SET status=CASE WHEN execution_started THEN 'paused' ELSE 'queued' END,
           error=CASE WHEN execution_started THEN '{"code":"INTERRUPTED","message":"执行器租约到期，任务已暂停，不会自动重跑模型。"}'::jsonb ELSE error END,
           lease_token=NULL, lease_expires_at=NULL, claim_key=NULL, device_id=CASE WHEN execution_started THEN device_id ELSE NULL END,
           updated_at=now()
       WHERE status IN ('claimed','running') AND lease_expires_at IS NOT NULL AND lease_expires_at<=now()`,
    );
  }

  async ageHeartbeat(seconds: number) {
    await this.db.query('UPDATE relay_heartbeats SET seen_at=now()-make_interval(secs => $1::int)', [seconds]);
  }

  async ageLease(id: string) {
    await this.db.query('UPDATE relay_tasks SET lease_expires_at=now()-interval \'1 second\' WHERE id=$1', [id]);
  }
}
