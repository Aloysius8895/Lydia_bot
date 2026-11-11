// Authenticated, same-origin RAG API. No legacy reply endpoint or API-key fallback.
let csrf = null, passwordless = false;
export function setCsrf(value) { csrf = value || null; }
// Owner-only mode: an expired session is renewed silently instead of showing a login page.
export function setPasswordless(value) { passwordless = !!value; }
export async function apiResponse(route, method = 'GET', data, { keepalive = false, signal, renewed = false } = {}) {
  let response;
  try {
    response = await fetch(route, {
      method, credentials: 'same-origin', cache: 'no-store', keepalive, signal,
      headers: { ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } catch (e) { if (e.name === 'AbortError') throw e; throw new Error('无法连接电脑上的研究服务，请确认电脑与服务正在运行。'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && !route.startsWith('/api/auth/')) {
      // 401 is only LOGIN_REQUIRED, returned before any work is done, so one repeat is safe.
      if (passwordless && !renewed) {
        const status = await fetch('/api/auth/status', { credentials: 'same-origin', cache: 'no-store', signal }).then(r => r.ok ? r.json() : null).catch(() => null);
        if (status?.authenticated) { setCsrf(status.csrf); return apiResponse(route, method, data, { keepalive, signal, renewed: true }); }
      }
      setCsrf(null); window.dispatchEvent(new Event('lydia-auth-expired'));
    }
    const error = new Error(body?.error?.message || `请求未成功 (${response.status})`);
    error.code = body?.error?.code; throw error;
  }
  return response;
}
export async function api(route, method = 'GET', data, options = {}) { return (await apiResponse(route, method, data, options)).json(); }
