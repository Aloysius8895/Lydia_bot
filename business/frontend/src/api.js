// Authenticated API. Empty base stays on the page origin. A configured base must be public https.
import { apiUrl } from './api-base.js';

const configuredBase = import.meta.env?.VITE_API_BASE || '';
let csrf = null;
export function setCsrf(value) { csrf = value || null; }
export function resolveRoute(route) { return apiUrl(configuredBase, route); }
export async function apiResponse(route, method = 'GET', data, { keepalive = false, signal } = {}) {
  let response;
  try {
    response = await fetch(resolveRoute(route), {
      method, credentials: configuredBase ? 'include' : 'same-origin', cache: 'no-store', keepalive, signal,
      headers: { ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } catch (e) { if (e.name === 'AbortError') throw e; throw new Error('无法连接电脑上的研究服务，请确认电脑与服务正在运行。'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && !route.startsWith('/api/auth/')) { setCsrf(null); window.dispatchEvent(new Event('lydia-auth-expired')); }
    const error = new Error(body?.error?.message || `请求未成功 (${response.status})`);
    error.code = body?.error?.code; throw error;
  }
  return response;
}
export async function api(route, method = 'GET', data, options = {}) { return (await apiResponse(route, method, data, options)).json(); }
