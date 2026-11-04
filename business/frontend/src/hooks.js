import { useEffect, useState } from 'react';

// Routes: #/ (home), #/bot/<id>, #/room/<id>, #/new
function parseRoute(hash) {
  const [kind = '', id = ''] = hash.split('?')[0].replace(/^#\/?/, '').split('/');
  if ((kind === 'bot' || kind === 'room') && id) return { kind, id: decodeURIComponent(id) };
  if (kind === 'new') return { kind: 'new' };
  if (kind === 'projects') return { kind: 'projects' };
  return { kind: 'home' };
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseRoute(hash);
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const THEME_KEY = 'lydia-theme';

function initialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem('crew-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage can be blocked; fall back to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Not persisted; the theme still applies for this visit.
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
