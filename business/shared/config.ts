import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {defaultDatabaseDir,caseExportsRoot} from './data-paths.ts';

export const businessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtimeRoot = path.join(businessRoot, '.runtime');
export const frontendRoot = path.join(businessRoot, 'frontend', 'dist');
export const certsRoot = path.join(businessRoot, 'deployment', 'certs');
const fromRoot = (value: string | undefined) => value ? path.resolve(businessRoot, value) : undefined;
export const config = {
  host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 4318),
  origin: process.env.APP_ORIGIN || 'http://127.0.0.1:4318',
  dataDir: fromRoot(process.env.LYDIA_DATA_DIR || process.env.CREW_DATA_DIR) || defaultDatabaseDir,
  skillsDir: path.join(businessRoot, 'skills'), casesDir: caseExportsRoot,
  cli: process.env.CLAUDE_EXECUTABLE || 'claude', cliWorkspace: path.join(runtimeRoot, 'claude'),
  cliTimeout: Math.min(Number(process.env.CLAUDE_TIMEOUT_MS || 300000), 300000),
  subscriptionNoOverage: process.env.SUBSCRIPTION_NO_OVERAGE_CONFIRMED === 'true',
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text:latest',
  httpsKey: fromRoot(process.env.HTTPS_KEY_FILE), httpsCert: fromRoot(process.env.HTTPS_CERT_FILE),
};

export class AppError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}
export const now = () => new Date().toISOString();
export function assert(condition: unknown, code: string, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(code, message, status);
}
