function privateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.localhost')) return true;
  const mapped = host.startsWith('::ffff:') ? host.slice(7) : host;
  const parts = mapped.split('.').map(Number);
  if (parts.length === 4 && parts.every(part => Number.isInteger(part))) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return true;
  }
  return false;
}

export function apiUrl(base, route) {
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || route.includes('\\') || route.includes('://')) {
    throw new Error('API 路径无效');
  }
  const trimmed = String(base || '').trim().replace(/\/$/, '');
  if (!trimmed) return route;
  let url;
  try { url = new URL(trimmed); } catch { throw new Error('API 基址无效'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('API 基址不能携带凭据或路径');
  if (url.protocol !== 'https:' || privateHost(url.hostname)) throw new Error('远程 API 基址必须是公网 https，不能指向本机');
  return `${url.origin}${route}`;
}
