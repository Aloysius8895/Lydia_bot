import { AppError } from '../shared/config.ts';
import { openPostgres } from './postgres.ts';
import type { Queryable } from './types.ts';

const pools = new Map<string, Promise<Queryable>>();

export function databaseHost(databaseUrl: string) {
  return new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

export function databaseHostIsLocal(databaseUrl: string) {
  const host = databaseHost(databaseUrl);
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
}

export function relayConfigurationError(env: NodeJS.ProcessEnv) {
  const databaseUrl = env.LYDIA_COORDINATION_DATABASE_URL?.trim() || '';
  const bootstrap = env.LYDIA_RELAY_BOOTSTRAP_TOKEN?.trim() || '';
  const driver = env.LYDIA_COORDINATION_DRIVER?.trim() || '';
  if (driver === 'memory' || driver === 'file' || driver === 'pglite') {
    return new AppError('COORDINATION_UNCONFIGURED', '远程通道不能使用内存、文件或本机 PGlite。未配置共享持久库时拒绝任务。', 503);
  }
  if (!databaseUrl || !bootstrap) {
    return new AppError('COORDINATION_UNCONFIGURED', '远程任务通道尚未配置持久协调库和引导凭据。新任务已拒绝，没有写入临时队列。', 503);
  }
  let local = false;
  try { local = databaseHostIsLocal(databaseUrl); } catch {
    return new AppError('COORDINATION_UNCONFIGURED', '协调库地址无效。远程任务已拒绝。', 503);
  }
  if (env.VERCEL && local) {
    return new AppError('COORDINATION_UNCONFIGURED', 'Vercel 上的协调库不能指向 localhost。多实例之间无法共享本机数据库。', 503);
  }
  return null;
}

export async function openConfiguredStore(env: NodeJS.ProcessEnv) {
  const error = relayConfigurationError(env);
  if (error) throw error;
  const databaseUrl = env.LYDIA_COORDINATION_DATABASE_URL!.trim();
  let pending = pools.get(databaseUrl);
  if (!pending) {
    pending = openPostgres(databaseUrl).catch(failure => {
      pools.delete(databaseUrl);
      throw failure;
    });
    pools.set(databaseUrl, pending);
  }
  return pending;
}
