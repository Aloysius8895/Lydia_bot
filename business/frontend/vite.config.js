import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const backend = 'http://127.0.0.1:4318';
const publicShell = ['/','/manifest.webmanifest','/icons/icon.svg','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/fonts/dm-sans-latin.woff2','/fonts/bricolage-grotesque-latin.woff2'];
export default defineConfig({
  plugins: [react(), {
    name: 'lydia-public-shell',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(js|css|woff2)$/.test(name)).sort();
      const versionHash = createHash('sha256').update(JSON.stringify(assets));
      for (const file of publicShell.filter(file => file !== '/')) {
        versionHash.update(readFileSync(new URL('./public' + file, import.meta.url)));
      }
      const version = versionHash.digest('hex').slice(0,16);
      const template = readFileSync(new URL('./pwa/service-worker.template.js',import.meta.url),'utf8');
      this.emitFile({type:'asset',fileName:'sw.js',source:template.replace('__CACHE_NAME__','lydia-design-'+version).replace('__SHELL_FILES__',JSON.stringify([...publicShell,...assets.map(name=>'/'+name)]))});
    },
  }],
  build: { manifest: true },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': { target: backend, changeOrigin: true, configure(proxy) {
      // Only this local dev origin is rewritten. Other origins retain the backend CSRF rejection.
      proxy.on('proxyReq',(request,incoming)=>{if(['http://127.0.0.1:5173','http://localhost:5173'].includes(incoming.headers.origin))request.setHeader('origin',backend);});
    } } },
  },
});
