import Icon from './Icon.jsx';

export default function MobileNav({ active, onHome, onProjects, onSettings }) {
  return <nav className="mobile-glass-nav" aria-label="手机主导航">
    {[['chat','会话',onHome],['folder','项目',onProjects],['settings','设置',onSettings]].map(([icon,label,onClick]) =>
      <button key={label} type="button" aria-label={label} aria-current={active === label ? 'page' : undefined} onClick={onClick}>
        <Icon name={icon} size={21} /><span>{label}</span>
      </button>)}
  </nav>;
}
