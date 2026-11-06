import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function registrationNotice(filePath: string) {
  return `设备凭据已写入 ${filePath}。凭据不会显示在终端或网页中。`;
}

export async function persistDeviceToken(directory: string, token: string) {
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, 'device-token');
  await writeFile(filePath, token, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

type FetchLike = typeof fetch;

export async function registerDevice(options: {
  relayUrl: string;
  bootstrapToken: string;
  password: string;
  directory: string;
  fetchImpl?: FetchLike;
  log?: (message: string) => void;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const root = options.relayUrl.replace(/\/$/, '');
  const call = async (pathName: string, body: unknown, headers: Record<string, string>) => {
    const response = await fetchImpl(root + pathName, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string }; deviceToken?: string; csrf?: string } | null;
    if (!response.ok) throw new Error(payload?.error?.code || 'REGISTRATION_FAILED');
    return { payload, cookie: response.headers.get('set-cookie') || '' };
  };
  const meta = await fetchImpl(root + '/api/relay/meta');
  const state = await meta.json() as { ownerConfigured?: boolean; error?: { code?: string } };
  if (!meta.ok) throw new Error(state.error?.code || 'REGISTRATION_FAILED');
  if (!state.ownerConfigured) await call('/api/relay/setup', { password: options.password }, { 'x-lydia-bootstrap': options.bootstrapToken });
  const origin = new URL(root).origin;
  const login = await call('/api/relay/login', { password: options.password }, { origin, 'x-forwarded-host': new URL(root).host });
  const session = /lydia_relay_session=([^;]+)/.exec(login.cookie)?.[1] || '';
  const created = await call('/api/relay/devices', { label: 'local-executor' }, { origin, 'x-forwarded-host': new URL(root).host, cookie: `lydia_relay_session=${session}`, 'x-csrf-token': login.payload?.csrf || '' });
  const token = created.payload?.deviceToken || '';
  if (!token) throw new Error('REGISTRATION_FAILED');
  const filePath = await persistDeviceToken(options.directory, token);
  log(registrationNotice(filePath));
  return { filePath };
}
