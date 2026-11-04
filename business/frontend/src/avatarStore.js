import { useSyncExternalStore } from 'react';
import { sanitizeAvatar } from './avatarKit.js';

// Custom avatars live on this device only, keyed by the character colour token
// (ink = you, blue = Steve, orange = Ash, green = Teresa, rose = April, purple = Bob).
const KEY = 'lydia-avatars-v1';
const listeners = new Set();
let state = read();

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, sanitizeAvatar(v)]).filter(([, v]) => v));
  } catch {
    return {};
  }
}

function commit(next) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the change still applies for this visit.
  }
  listeners.forEach((fn) => fn());
}

export function setAvatar(key, config) {
  const clean = sanitizeAvatar(config);
  if (clean) commit({ ...state, [key]: clean });
}

export function resetAvatar(key) {
  const { [key]: _removed, ...rest } = state;
  commit(rest);
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key === KEY) { state = read(); fn(); }
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}

export const useAvatars = () => useSyncExternalStore(subscribe, () => state);
