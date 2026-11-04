// Messages support one inline format: [label](href).
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function plainText(text) {
  return text.replace(LINK, '$1');
}

export default function RichText({ text }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    parts.push(text.slice(last, m.index));
    const href = /^(https?:|#)/.test(m[2]) ? m[2] : '#';
    const external = href.startsWith('http');
    parts.push(
      <a key={m.index} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {m[1]}
      </a>
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}
