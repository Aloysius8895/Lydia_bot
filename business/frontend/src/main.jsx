import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import RemoteApp from './RemoteApp.jsx';
import './styles.css';
import './research.css';
import './settings.css';
import './grok-design.css';
import './grok-pages.css';
import './sidebar-reference.css';
import './projects.css';
import './call.css';
import './soft-workspace.css';
import './mobile-workspace.css';

// Optional, local-only fonts (not distributed in the public repo). When src/assets/grok/ is empty the glob is
// empty: no build error, no font request, and the system font stack in grok-design.css is used.
const grokFonts = import.meta.glob('./assets/grok/*.woff2', { eager: true, query: '?url', import: 'default' });
for (const [file, url] of Object.entries(grokFonts)) {
  const face = new FontFace(file.includes('XMono') ? 'Grok XVF Mono' : 'Grok XVF', `url(${url}) format('woff2')`, { style: 'normal', weight: '200 800', display: 'swap' });
  document.fonts.add(face); face.load().catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {import.meta.env.VITE_LYDIA_REMOTE === '1' ? <RemoteApp /> : <App />}
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
