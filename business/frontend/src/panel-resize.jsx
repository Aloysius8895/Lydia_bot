// Draggable dividers between a side panel and the middle column (desktop only).
// The handle lives in the gap next to its panel and is positioned from the panel's
// measured box, so it works for flex rows (main app), grids (knowledge workspace)
// and the overlay research panel alike. Widths are remembered per device.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const KEY = 'lydia-panel-width:';
const read = key => { try { const v = Number(localStorage.getItem(KEY + key)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } };
const write = (key, v) => { try { if (v == null) localStorage.removeItem(KEY + key); else localStorage.setItem(KEY + key, String(Math.round(v))); } catch { /* not remembered; still applies now */ } };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Width chosen on this device, or null for the layout's own default. */
export function usePanelWidth(key) {
  const [width, setWidth] = useState(() => read(key));
  const update = useCallback((value, { save = false } = {}) => { setWidth(value); if (save || value == null) write(key, value); }, [key]);
  return [width, update];
}

/**
 * side="start": the panel is left of the handle (left sidebar). side="end": right of it (right panel).
 * target / middle: selectors for direct children of the handle's parent.
 */
export function ResizeHandle({ side, target, middle, min, max, minMiddle = 380, width, onResize, label, disabled = false }) {
  const ref = useRef(null), drag = useRef(null), frame = useRef(0);
  const [box, setBox] = useState(null), [dragging, setDragging] = useState(false);
  const panel = () => ref.current?.parentElement?.querySelector(':scope > ' + target) || null;

  const place = useCallback(() => {
    const el = ref.current, parent = el?.parentElement, t = parent?.querySelector(':scope > ' + target);
    if (disabled || !t || !t.offsetWidth) { setBox(null); return; }
    const pr = parent.getBoundingClientRect(), tr = t.getBoundingClientRect(), gap = parseFloat(getComputedStyle(parent).columnGap) || 0;
    const x = (side === 'start' ? tr.right + gap / 2 : tr.left - gap / 2) - pr.left - parent.clientLeft;
    const next = { x: Math.round(x), y: Math.round(tr.top - pr.top - parent.clientTop), h: Math.round(tr.height), w: Math.round(tr.width) };
    setBox(b => b && b.x === next.x && b.y === next.y && b.h === next.h && b.w === next.w ? b : next);
  }, [side, target, disabled]);

  useLayoutEffect(place);
  useEffect(() => {
    const parent = ref.current?.parentElement; if (!parent) return;
    let observed = null;
    const sizes = new ResizeObserver(place);
    const watch = () => { const t = parent.querySelector(':scope > ' + target); if (t !== observed) { if (observed) sizes.unobserve(observed); if (t) sizes.observe(t); observed = t; } place(); };
    sizes.observe(parent); watch();
    const children = new MutationObserver(watch); children.observe(parent, { childList: true });
    window.addEventListener('resize', place);
    return () => { sizes.disconnect(); children.disconnect(); window.removeEventListener('resize', place); };
  }, [place, target]);

  function emit(value, options) {
    cancelAnimationFrame(frame.current);
    if (options?.save) { onResize(value, options); return; }
    frame.current = requestAnimationFrame(() => onResize(value));
  }
  function limits(current) {
    const mid = ref.current?.parentElement?.querySelector(':scope > ' + middle);
    const room = mid ? mid.getBoundingClientRect().width - minMiddle : Infinity;
    return [min, Math.max(Math.min(current, max), Math.min(max, current + Math.max(0, room)))];
  }
  function down(e) {
    const t = panel(); if (e.button !== 0 || !t) return;
    e.preventDefault(); ref.current.setPointerCapture(e.pointerId); ref.current.focus({ preventScroll: true });
    const start = t.getBoundingClientRect().width;
    drag.current = { x: e.clientX, start, last: start, before: width, range: limits(start) };
    setDragging(true); document.documentElement.classList.add('is-panel-resizing');
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x; d.last = clamp(d.start + (side === 'start' ? dx : -dx), ...d.range); emit(d.last);
  }
  function end(cancel) {
    const d = drag.current; if (!d) return; drag.current = null;
    setDragging(false); document.documentElement.classList.remove('is-panel-resizing');
    if (cancel) emit(d.before, { save: true }); else emit(Math.round(d.last), { save: true });
  }
  function key(e) {
    if (e.key === 'Escape' && drag.current) { end(true); return; }
    const grow = side === 'start' ? 'ArrowRight' : 'ArrowLeft', shrink = side === 'start' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key !== grow && e.key !== shrink) return;
    const t = panel(); if (!t) return; e.preventDefault();
    const current = t.getBoundingClientRect().width, step = (e.shiftKey ? 64 : 16) * (e.key === grow ? 1 : -1);
    emit(Math.round(clamp(current + step, ...limits(current))), { save: true });
  }

  return <div ref={ref} className={'panel-resize' + (dragging ? ' is-dragging' : '')} hidden={!box} role="separator" aria-orientation="vertical" aria-label={label}
    aria-valuenow={box?.w} aria-valuemin={min} aria-valuemax={max} tabIndex={box ? 0 : -1} title="拖动调整宽度 · 双击恢复默认"
    style={box ? { left: box.x, top: box.y, height: box.h } : undefined}
    onPointerDown={down} onPointerMove={move} onPointerUp={() => end(false)} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(false)}
    onDoubleClick={() => onResize(null, { save: true })} onKeyDown={key} />;
}
