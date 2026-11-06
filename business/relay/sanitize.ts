import type { CheckpointView, ErrorView } from './types.ts';

export function sanitizeCheckpoint(input: unknown): CheckpointView {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const collection = source.collection && typeof source.collection === 'object' ? source.collection as Record<string, unknown> : {};
  const steps = Array.isArray(source.steps) ? source.steps.slice(0, 8).map(step => String(step).slice(0, 40)) : [];
  const collectionStatus = typeof collection.status === 'string'
    ? collection.status.slice(0, 40)
    : typeof source.collectionStatus === 'string' ? source.collectionStatus.slice(0, 40) : null;
  return {
    current: typeof source.current === 'string' ? source.current.slice(0, 80) : null,
    steps,
    collectionStatus,
  };
}

export function sanitizeError(input: unknown): ErrorView | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  if (!source.code && !source.message) return null;
  return { code: String(source.code || 'ERROR').slice(0, 40), message: String(source.message || '任务未成功').slice(0, 300) };
}

export function sanitizeSummary(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) return null;
  return input.trim().slice(0, 240);
}
