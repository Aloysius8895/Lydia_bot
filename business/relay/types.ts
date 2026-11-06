export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  exec: (sql: string) => Promise<void>;
  transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export type CheckpointView = { current: string | null; steps: string[]; collectionStatus: string | null };
export type ErrorView = { code: string; message: string };

export type PublicTask = {
  id: string;
  caseId: string;
  kind: 'research' | 'question';
  message: string;
  status: string;
  checkpoint: CheckpointView;
  error: ErrorView | null;
  resultSummary: string | null;
  updatedAt: string;
};

export type AgentTask = PublicTask & { requestKey: string; resume: boolean; lease: string };

export const LEASE_SECONDS = 20;
export const ONLINE_SECONDS = 15;
