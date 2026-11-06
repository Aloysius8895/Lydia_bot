import type { IncomingMessage, ServerResponse } from 'node:http';
import { relayDispatch, relayNode } from '../business/relay/dispatch.ts';

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export default async function handler(request: IncomingMessage | Request, response?: ServerResponse) {
  if (!response) return relayNode(request as Request, process.env);
  const incoming = request as IncomingMessage;
  const host = String(incoming.headers['x-forwarded-host'] || incoming.headers.host || 'localhost');
  const proto = String(incoming.headers['x-forwarded-proto'] || 'https');
  const body = incoming.method === 'GET' || incoming.method === 'HEAD' ? '' : await readBody(incoming);
  const headers = new Headers();
  headers.set('x-forwarded-host', host);
  headers.set('x-forwarded-proto', proto);
  for (const name of ['origin', 'cookie', 'authorization', 'x-csrf-token', 'x-lydia-bootstrap', 'content-type']) {
    const value = incoming.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  const web = new Request(`${proto}://${host}${incoming.url || '/'}`, { method: incoming.method, headers, body: body || undefined });
  const result = await relayDispatch(web, process.env);
  response.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) response.setHeader(key, value);
  response.end(JSON.stringify(result.body));
}
