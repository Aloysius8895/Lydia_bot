import { AppError } from '../shared/config.ts';
import type { Queryable } from './types.ts';

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
};

type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  connect: () => Promise<PgClient>;
  end: () => Promise<void>;
};

function sslConfig(databaseUrl: string) {
  const mode = new URL(databaseUrl).searchParams.get('sslmode');
  if (mode === 'disable') return false;
  if (mode === 'require' || mode === 'verify-full' || mode === 'verify-ca') return { rejectUnauthorized: true };
  return undefined;
}

export async function openPostgres(databaseUrl: string): Promise<Queryable> {
  let pool: PgPool;
  try {
    const imported = await import('pg');
    const Pool = imported.default?.Pool ?? imported.Pool;
    pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 8000, statement_timeout: 8000, ssl: sslConfig(databaseUrl) });
  } catch {
    throw new AppError('COORDINATION_UNAVAILABLE', '协调库驱动未能加载。远程任务已拒绝。', 503);
  }
  const wrap = (queryable: { query: PgPool['query'] }): Queryable => ({
    query: async (sql, params) => {
      try { return await queryable.query(sql, params); }
      catch { throw new AppError('COORDINATION_UNAVAILABLE', '协调库请求失败。远程任务已拒绝。', 503); }
    },
    exec: async sql => { await wrap(queryable).query(sql); },
    transaction: fn => fn(wrap(queryable)),
    close: async () => {},
  });
  return {
    ...wrap(pool),
    transaction: async fn => {
      const client = await pool.connect().catch(() => { throw new AppError('COORDINATION_UNAVAILABLE', '协调库连接失败。远程任务已拒绝。', 503); });
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => { await pool.end().catch(() => {}); },
  };
}
