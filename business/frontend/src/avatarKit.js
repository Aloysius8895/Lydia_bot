// Avatar engine for the Settings → 头像 studio. Pure functions that turn a small,
// validated config into SVG markup; nothing user-typed ever reaches the markup
// except hex colours that pass HEX below.

const f = (n) => +(+n).toFixed(1);
export const HEX = /^#[0-9a-f]{6}$/i;

function superellipse(cx, cy, r, n) {
  let d = '';
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = cx + r * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + r * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += (i ? 'L' : 'M') + f(x) + ' ' + f(y);
  }
  return d + 'Z';
}

function roundPoly(pts, r) {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const ta = Math.min(r / Math.hypot(a[0] - p[0], a[1] - p[1]), 0.5);
    const tb = Math.min(r / Math.hypot(b[0] - p[0], b[1] - p[1]), 0.5);
    const p1 = [p[0] + (a[0] - p[0]) * ta, p[1] + (a[1] - p[1]) * ta];
    const p2 = [p[0] + (b[0] - p[0]) * tb, p[1] + (b[1] - p[1]) * tb];
    d += `${i ? 'L' : 'M'}${f(p1[0])} ${f(p1[1])}Q${f(p[0])} ${f(p[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

const hexPts = [0, 60, 120, 180, 240, 300].map((a) => [100 + 84 * Math.cos((a * Math.PI) / 180), 100 + 84 * Math.sin((a * Math.PI) / 180)]);

// face: [centre x, centre y, scale] for the eyes/mouth group on this body.
export const SHAPES = {
  circle: { name: '圆形', face: [100, 104, 1], el: (a) => `<circle cx="100" cy="100" r="80"${a}/>` },
  pebble: { name: '鹅卵石', face: [102, 104, 0.95], d: 'M106 38C152 36 186 68 184 108C182 148 148 168 100 166C52 164 16 142 18 104C20 64 60 40 106 38Z' },
  squircle: { name: '圆角方', face: [100, 102, 1], d: superellipse(100, 100, 80, 4.5) },
  capsule: { name: '胶囊', face: [100, 102, 0.85], el: (a) => `<rect x="12" y="54" width="176" height="96" rx="48"${a}/>` },
  triangle: { name: '三角', face: [100, 128, 0.8], d: roundPoly([[100, 22], [188, 174], [12, 174]], 30) },
  hexagon: { name: '六边形', face: [100, 102, 0.95], d: roundPoly(hexPts, 24) },
  cloud: { name: '云朵', face: [100, 118, 0.9], d: 'M52 160C26 160 14 140 18 120C21 104 34 94 48 94C50 68 72 50 98 52C120 53 136 66 140 84C162 82 184 98 184 122C184 144 166 160 146 160Z' },
  droplet: { name: '水滴', face: [100, 134, 0.85], d: 'M100 18C112 40 166 88 166 128C166 166 136 186 100 186C64 186 34 166 34 128C34 88 88 40 100 18Z' },
};

function kit(I) {
  return {
    p: (d, w = 6) => `<path d="${d}" fill="none" stroke="${I}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`,
    fp: (d) => `<path d="${d}" fill="${I}"/>`,
    pill: (x, y, w, h, rot = 0) => `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="${I}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}/>`,
    dot: (x, y, r, c = I) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`,
    ring: (x, y, r, w) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${I}" stroke-width="${w}"/>`,
  };
}

// Each expression returns [eyes + brows, mouth] in face-local coordinates (centre 0,0).
export const EXPR = {
  neutral: { name: '平静', d: (k) => [k.pill(-19, -10, 11, 25, 12) + k.pill(19, -10, 11, 25, 12), ''] },
  attentive: { name: '专注', d: (k) => [k.pill(-19, -7, 12, 26) + k.pill(19, -7, 12, 26) + k.p('M-29 -31L-10 -29', 5) + k.p('M10 -29L29 -31', 5), ''] },
  surprised: { name: '惊讶', d: (k) => [k.dot(-19, -10, 10) + k.dot(19, -10, 10) + k.p('M-28 -32Q-19 -39 -10 -32', 4.5) + k.p('M10 -32Q19 -39 28 -32', 4.5), k.fp('M0 9C4 9 6 13 6 17C6 21 4 25 0 25C-4 25 -6 21 -6 17C-6 13 -4 9 0 9Z')] },
  excited: { name: '兴奋', d: (k, B) => [k.dot(-19, -10, 12) + k.dot(19, -10, 12) + k.dot(-15, -14, 4, B) + k.dot(23, -14, 4, B) + k.dot(-23, -5, 2, B) + k.dot(15, -5, 2, B), k.fp('M-13 9L13 9Q13 28 0 28Q-13 28 -13 9Z')] },
  happy: { name: '开心', d: (k) => [k.p('M-28 -6Q-19 -21 -10 -6') + k.p('M10 -6Q19 -21 28 -6'), k.p('M-9 12Q0 21 9 12', 5)] },
  laughing: { name: '大笑', d: (k) => [k.p('M-27 -19L-13 -10L-27 -1') + k.p('M27 -19L13 -10L27 -1'), k.fp('M-17 7L17 7Q17 31 0 31Q-17 31 -17 7Z')] },
  angry: { name: '生气', d: (k) => [k.pill(-19, -6, 11, 18) + k.pill(19, -6, 11, 18) + k.p('M-31 -27L-10 -19', 5.5) + k.p('M31 -27L10 -19', 5.5), k.p('M-9 19Q0 11 9 19', 5)] },
  sad: { name: '难过', d: (k) => [k.pill(-19, -5, 10, 17) + k.pill(19, -5, 10, 17) + k.p('M-29 -20L-11 -27', 5) + k.p('M29 -20L11 -27', 5), k.p('M-8 19Q0 13 8 19', 5)] },
  scared: { name: '害怕', d: (k) => [k.ring(-19, -10, 10, 4) + k.ring(19, -10, 10, 4) + k.dot(-19, -10, 4) + k.dot(19, -10, 4) + k.p('M-29 -26L-12 -32', 4.5) + k.p('M29 -26L12 -32', 4.5), k.p('M-13 17q3.25 -5 6.5 0t6.5 0t6.5 0t6.5 0', 4)] },
  suspicious: { name: '怀疑', d: (k) => [k.pill(-19, -8, 20, 9) + k.pill(19, -8, 20, 9) + k.p('M-29 -19L-10 -19', 5) + k.p('M10 -27Q19 -33 28 -27', 5), k.p('M-5 16L10 13', 5)] },
  confused: { name: '困惑', d: (k) => [k.dot(-19, -10, 10) + k.pill(19, -8, 9, 13) + k.p('M-29 -30Q-19 -36 -9 -30', 4.5) + k.p('M10 -24L28 -28', 4.5), k.p('M-10 17Q-5 12 0 17T10 17', 4.5)] },
  curious: { name: '好奇', d: (k) => [k.dot(-19, -10, 9) + k.dot(19, -10, 9) + k.p('M-29 -30Q-19 -37 -9 -30', 4.5), k.dot(4, 16, 4)] },
  proud: { name: '得意', d: (k) => [k.p('M-28 -12Q-19 -3 -10 -12') + k.p('M10 -12Q19 -3 28 -12'), k.p('M-7 15Q4 20 12 11', 5)] },
  shy: { name: '害羞', blush: true, d: (k) => [k.p('M-26 -6Q-19 -15 -12 -6', 5) + k.p('M12 -6Q19 -15 26 -6', 5), k.p('M-4 15Q0 18 4 15', 4)] },
  unimpressed: { name: '无语', d: (k) => [k.fp('M-30 -12L-8 -12A11 11 0 0 1 -30 -12Z') + k.fp('M8 -12L30 -12A11 11 0 0 1 8 -12Z'), k.p('M-8 16L8 16', 5)] },
  sleepy: { name: '困倦', d: (k) => [k.p('M-28 -8Q-19 -4 -10 -8', 5) + k.p('M10 -8Q19 -4 28 -8', 5) + k.p('M30 -42h8l-8 9h8', 3) + k.p('M42 -54h6l-6 7h6', 2.5), k.ring(0, 16, 4, 3)] },
};

export const COLORS = [
  ['墨黑', '#17181f'], ['可可', '#95683f'], ['番茄', '#e5484d'], ['橘子', '#ff7100'], ['琥珀', '#ffa000'], ['薄荷', '#38bf86'],
  ['青碧', '#00b9a9'], ['天蓝', '#1686fa'], ['葡萄', '#9553fc'], ['莓果', '#fc2ba2'], ['石灰', '#808181'], ['奶白', '#efebe2'],
];
export const INKS = [['auto', '自动'], ['light', '白色'], ['dark', '深色']];
export const BGS = [['none', '透明'], ['white', '白色'], ['soft', '同色浅底'], ['custom', '自定义']];

const BASE = { expr: 'neutral', ink: 'auto', gx: 0, gy: 0, blush: false, mouth: true, bg: 'none', bgColor: '#dfe6ff' };
// Closest editable starting point for each original character (keyed by its colour token).
const STARTERS = {
  ink: { shape: 'circle', color: '#17181f' },
  blue: { shape: 'squircle', color: '#1686fa' },
  orange: { shape: 'pebble', color: '#ff7100' },
  green: { shape: 'pebble', color: '#00b9a9' },
  rose: { shape: 'triangle', color: '#fc2ba2' },
  purple: { shape: 'squircle', color: '#9553fc' },
};
export const defaultAvatar = (key) => ({ ...BASE, ...(STARTERS[key] || STARTERS.ink) });

export function randomAvatar(prev) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return { ...prev, shape: pick(Object.keys(SHAPES)), expr: pick(Object.keys(EXPR)), color: pick(COLORS)[1], gx: pick([-1, 0, 0, 1]), gy: pick([-1, 0, 0, 1]), blush: Math.random() < 0.3 };
}

// Returns a clean config or null; used for anything read back from storage.
export function sanitizeAvatar(v) {
  if (!v || typeof v !== 'object' || !SHAPES[v.shape] || !EXPR[v.expr] || !HEX.test(v.color)) return null;
  const step = (n) => (n === -1 || n === 0 || n === 1 ? n : 0);
  return {
    shape: v.shape, expr: v.expr, color: v.color,
    ink: INKS.some(([k]) => k === v.ink) ? v.ink : 'auto',
    gx: step(v.gx), gy: step(v.gy), blush: v.blush === true, mouth: v.mouth !== false,
    bg: BGS.some(([k]) => k === v.bg) ? v.bg : 'none', bgColor: HEX.test(v.bgColor) ? v.bgColor : BASE.bgColor,
  };
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const luminance = (h) => rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const inkFor = (c) => (c.ink === 'light' ? '#ffffff' : c.ink === 'dark' ? '#1a1b24' : luminance(c.color) > 0.42 ? '#1a1b24' : '#ffffff');
const bgFill = (c) => (c.bg === 'white' ? '#ffffff' : c.bg === 'soft' ? mix(c.color, '#ffffff', 0.8) : c.bg === 'custom' ? c.bgColor : null);

/** Inner markup for a 0 0 200 200 viewBox. `bg` adds the export background, `outline` a hairline on very light bodies. */
export function avatarInner(c, { bg = false, outline = false } = {}) {
  const S = SHAPES[c.shape], [cx, cy, k] = S.face, E = EXPR[c.expr];
  const [eyes, mouth] = E.d(kit(inkFor(c)), c.color);
  const line = outline && luminance(c.color) > 0.7 ? ' stroke="rgba(20,22,40,.22)" stroke-width="2"' : '';
  const attrs = ` fill="${c.color}"${line}`;
  const body = S.el ? S.el(attrs) : `<path d="${S.d}"${attrs}/>`;
  const op = E.blush ? 0.8 : 0.55;
  const blush = c.blush || E.blush ? `<ellipse cx="-31" cy="7" rx="8" ry="5" fill="#ff6f9f" opacity="${op}"/><ellipse cx="31" cy="7" rx="8" ry="5" fill="#ff6f9f" opacity="${op}"/>` : '';
  const fill = bg && bgFill(c);
  return (fill ? `<rect width="200" height="200" fill="${fill}"/>` : '') + body +
    `<g transform="translate(${f(cx + c.gx * 8 * k)} ${f(cy + c.gy * 6 * k)}) scale(${k})">${blush}${eyes}${c.mouth ? mouth : ''}</g>`;
}

export const avatarSvg = (c, size = 512) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">${avatarInner(c, { bg: true })}</svg>`;

export async function avatarPng(c, size) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSvg(c, size));
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(img, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 生成失败'))), 'image/png'));
}
