// Production server: serves the built app from dist/ plus the /api routes.
// For development, `npm run dev` mounts the same routes inside Vite.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiMiddleware } from './api.js';
import { MODEL, PROVIDER } from './llm.js';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = Number(process.env.PORT ?? 8787);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.join(DIST, pathname);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404).end('Run `npm run build` first.');
    return;
  }
  res.writeHead(200, { 'Content-Type': `${TYPES[path.extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => apiMiddleware(req, res, () => serveStatic(req, res))).listen(PORT, () => {
  console.log(`Crew on http://localhost:${PORT} (provider: ${PROVIDER}, model: ${MODEL})`);
});
