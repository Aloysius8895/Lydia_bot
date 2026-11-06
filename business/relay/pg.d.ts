declare module 'pg' {
  export class Pool {
    constructor(config: Record<string, unknown>);
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
  export class PoolClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    release(): void;
  }
  const pg: { Pool: typeof Pool };
  export default pg;
}
