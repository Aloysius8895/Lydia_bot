import { useAvatars } from '../avatarStore.js';
import { avatarInner } from '../avatarKit.js';

export const botColor =(color) => `var(--bot-${color})`;

// Vector characters drawn from the user's colorful shape/eyes reference.
// A color always identifies the same character in every view and theme.
const characters = {
  blue: { variant: 'blue-block', fill: '#1686FA', body: <path d="M20 6C30 3 48 9 57 15C61 18 61 21 59 26L49 53C47 59 43 61 37 59C23 56 10 51 6 44C4 40 6 35 9 28L17 10Q18 7 20 6Z" />, eyes: <><ellipse cx="24" cy="31" rx="5.4" ry="7" transform="rotate(-8 24 31)" /><ellipse cx="39" cy="32" rx="7" ry="7" /></> },
  orange: { variant: 'orange-oval', fill: '#FF7100', body: <path d="M60 34C63 50 47 61 30 60C14 61 3 50 4 34C5 18 18 5 33 5C47 4 57 17 60 34Z" />, eyes: <><rect x="17" y="15" width="6.7" height="17" rx="3.3" transform="rotate(32 20 23)" /><rect x="34" y="15" width="6.7" height="17" rx="3.3" transform="rotate(-22 37 23)" /></> },
  green: { variant: 'teal-pebble', fill: '#00B9A9', body: <path d="M17 5C25 3 38 7 47 10C56 14 61 20 60 32L58 47Q56 61 43 60L19 57Q4 55 4 43L6 22Q7 9 17 5Z" />, eyes: <><rect x="22" y="23" width="8" height="21" rx="4" transform="rotate(7 26 34)" /><rect x="38" y="27" width="8" height="21" rx="4" transform="rotate(7 42 37)" /></> },
  rose: { variant: 'pink-triangle', fill: '#FC2BA2', body: <path d="M31 5C36 5 40 11 45 20L58 43C67 57 49 62 31 61C14 61-1 56 5 44L20 16C24 9 27 5 31 5Z" />, eyes: <><rect x="25" y="24" width="6" height="11" rx="3" transform="rotate(-10 28 29)" /><rect x="39" y="25" width="6" height="11" rx="3" transform="rotate(-10 42 30)" /></> },
  purple: { variant: 'purple-diamond', fill: '#9553FC', body: <rect x="9" y="9" width="46" height="46" rx="13" transform="rotate(-34 32 32)" />, eyes: <g transform="rotate(-34 32 32)"><rect x="20" y="31" width="7" height="13" rx="3.5" /><rect x="32" y="29" width="7" height="13" rx="3.5" /></g> },
  amber: { variant: 'amber-cloud', fill: '#FFA000', body: <path d="M18 19C18 10 24 4 32 5C39 4 44 10 46 14C57 14 61 22 58 30C66 39 61 54 51 55C45 63 35 60 31 57C22 62 11 59 9 53C0 51 1 37 7 32Q7 23 18 19Z" />, eyes: <><rect x="21" y="26" width="8" height="20" rx="4" transform="rotate(9 25 36)" /><rect x="36" y="29" width="8" height="20" rx="4" transform="rotate(9 40 39)" /></> },
  teal: { variant: 'teal-pebble', fill: '#00B9A9', body: <path d="M17 5C25 3 38 7 47 10C56 14 61 20 60 32L58 47Q56 61 43 60L19 57Q4 55 4 43L6 22Q7 9 17 5Z" />, eyes: <><rect x="22" y="23" width="8" height="21" rx="4" transform="rotate(7 26 34)" /><rect x="38" y="27" width="8" height="21" rx="4" transform="rotate(7 42 37)" /></> },
  gray: { variant: 'gray-drop', fill: '#808181', body: <path d="M17 6C29 9 47 14 54 26C64 43 47 61 31 58C15 56 7 46 10 32L14 10Q14 5 17 6Z" />, eyes: <><ellipse cx="24" cy="37" rx="5" ry="6.5" /><circle cx="36" cy="29" r="3.5" /></> },
  brown: { variant: 'brown-round', fill: '#95683F', body: <circle cx="32" cy="32" r="28" />, eyes: <><rect x="25" y="23" width="11" height="24" rx="5.5" transform="rotate(-31 30 35)" /><rect x="44" y="14" width="6" height="23" rx="3" transform="rotate(-31 47 26)" /></> },
  ink: { variant: 'ink-round', fill: '#08090B', body: <circle cx="32" cy="32" r="28" />, eyes: <><rect x="30" y="17" width="7.5" height="17" rx="3.7" transform="rotate(-28 34 26)" /><rect x="45" y="12" width="4.5" height="16" rx="2.2" transform="rotate(-28 47 20)" /></> },
};

export function BotAvatar({ color = 'blue', size = 44, className = '' }) {
  const custom = useAvatars()[color];
  if (custom) return <svg className={`crew-avatar crew-avatar--custom ${className}`} data-avatar={`custom-${custom.shape}`} width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }} dangerouslySetInnerHTML={{ __html: avatarInner(custom, { outline: true }) }} />;
  const character = characters[color] || characters.blue;
  return <svg className={`crew-avatar ${className}`} data-avatar={character.variant} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
    <g className={color === 'ink' ? 'crew-avatar__body crew-avatar__body--ink' : 'crew-avatar__body'} fill={character.fill}>{character.body}</g>
    <g fill="#F5F6F7">{character.eyes}</g>
  </svg>;
}

// Miniature versions of the actual characters, rather than anonymous colored dots.
export function RoomAvatar({ colors = [] }) {
  const members = colors.length ? colors : ['blue', 'green', 'rose', 'purple'];
  return <span className="room-dots room-dots--characters" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <span key={index}><BotAvatar color={members[index % members.length]} size={22} /></span>)}</span>;
}

export function StackedAvatars({ colors = [] }) {
  return <span className="stacked stacked--characters" aria-hidden="true">{colors.map((color, index) => <span key={index}><BotAvatar color={color} size={32} /></span>)}</span>;
}
