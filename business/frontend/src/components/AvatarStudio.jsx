import { useState } from 'react';
import Icon from './Icon.jsx';
import { BotAvatar } from './Avatars.jsx';
import { bots, me } from '../data.js';
import { SHAPES, EXPR, COLORS, INKS, BGS, HEX, avatarInner, avatarSvg, avatarPng, defaultAvatar, randomAvatar } from '../avatarKit.js';
import { useAvatars, setAvatar, resetAvatar } from '../avatarStore.js';

const targets = [{ key: 'ink', name: '你', file: 'me' }, ...bots.map((b) => ({ key: b.color, name: b.name, file: b.id }))];
const gazeNames = ['左上', '上', '右上', '左', '正前', '右', '左下', '下', '右下'];

function Art({ config, bg = false, size }) {
  return <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: avatarInner(config, { bg, outline: !bg || config.bg === 'none' }) }} />;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AvatarStudio() {
  const avatars = useAvatars();
  const [target, setTarget] = useState('ink');
  const [size, setSize] = useState(512);
  const [error, setError] = useState('');
  const custom = avatars[target];
  const config = custom || defaultAvatar(target);
  const who = targets.find((t) => t.key === target);
  const update = (patch) => setAvatar(target, { ...config, ...patch });
  const presetColor = COLORS.some(([, hex]) => hex === config.color.toLowerCase());

  async function exportPng() {
    try { setError(''); download(await avatarPng(config, size), `lydia-avatar-${who.file}-${size}.png`); }
    catch { setError('PNG 生成失败，请换个浏览器再试。'); }
  }
  const exportSvg = () => download(new Blob([avatarSvg(config, 512)], { type: 'image/svg+xml' }), `lydia-avatar-${who.file}.svg`);

  return (
    <div className="studio">
      <section className="set-section">
        <h3 className="set-section__title">为谁设计</h3>
        <div className="studio-targets">
          {targets.map((t) => (
            <button key={t.key} type="button" className="studio-target" aria-pressed={t.key === target} onClick={() => { setTarget(t.key); setError(''); }}>
              <BotAvatar color={t.key} size={36} />
              <span>{t.key === 'ink' ? me.name : t.name}</span>
              {avatars[t.key] && <span className="studio-target__dot" aria-label="已自定义" />}
            </button>
          ))}
        </div>
      </section>

      <section className="studio-stage">
        <div className={`studio-preview${config.bg === 'none' ? ' studio-preview--clear' : ''}`}>
          <Art config={config} bg />
        </div>
        <div className="studio-stage__side">
          <div>
            <strong className="studio-stage__name">{who.name}</strong>
            <p className="set-muted">{custom ? '自定义头像已生效，改动会立即同步到侧栏和聊天。' : '正在使用原始角色。做任何修改都会替换它，随时可以恢复。'}</p>
          </div>
          <div className="studio-actions">
            <button type="button" className="set-btn" onClick={() => update(randomAvatar(config))}><Icon name="dice" size={16} />随机</button>
            <button type="button" className="set-btn" disabled={!custom} onClick={() => resetAvatar(target)}><Icon name="undo" size={16} />恢复原始角色</button>
          </div>
          <div className="studio-actions">
            <button type="button" className="set-btn set-btn--primary" onClick={exportPng}><Icon name="download" size={16} />导出 PNG</button>
            <button type="button" className="set-btn" onClick={exportSvg}>SVG</button>
            <select className="set-select" aria-label="PNG 尺寸" value={size} onChange={(e) => setSize(+e.target.value)}>
              {[256, 512, 1024].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
          </div>
          {error && <p className="set-muted" role="alert">{error}</p>}
        </div>
      </section>

      <section className="set-section">
        <h3 className="set-section__title">形状</h3>
        <div className="studio-grid">
          {Object.entries(SHAPES).map(([key, s]) => (
            <button key={key} type="button" className="studio-opt" aria-pressed={config.shape === key} onClick={() => update({ shape: key })}>
              <Art config={{ ...config, shape: key }} /><span>{s.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="set-section">
        <h3 className="set-section__title">表情</h3>
        <div className="studio-grid">
          {Object.entries(EXPR).map(([key, e]) => (
            <button key={key} type="button" className="studio-opt" aria-pressed={config.expr === key} onClick={() => update({ expr: key })}>
              <Art config={{ ...config, expr: key }} /><span>{e.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="set-section">
        <h3 className="set-section__title">颜色</h3>
        <div className="studio-swatches">
          {COLORS.map(([name, hex]) => (
            <button key={hex} type="button" className="studio-swatch" title={name} aria-label={name} aria-pressed={config.color.toLowerCase() === hex} style={{ background: hex }} onClick={() => update({ color: hex })} />
          ))}
          <label className="studio-swatch studio-swatch--custom" title="自定义颜色" data-on={!presetColor} style={presetColor ? undefined : { background: config.color }}>
            <input type="color" aria-label="自定义颜色" value={config.color} onChange={(e) => HEX.test(e.target.value) && update({ color: e.target.value })} />
          </label>
        </div>
        <div className="set-row">
          <div className="set-row__text"><span className="set-row__label">五官颜色</span></div>
          <div className="set-chips">
            {INKS.map(([key, label]) => <button key={key} type="button" className="set-chip" aria-pressed={config.ink === key} onClick={() => update({ ink: key })}>{label}</button>)}
          </div>
        </div>
      </section>

      <section className="set-section">
        <h3 className="set-section__title">细节</h3>
        <div className="set-row">
          <div className="set-row__text"><span className="set-row__label">视线方向</span><span className="set-row__desc">眼睛和嘴巴整体朝这个方向偏移。</span></div>
          <div className="studio-gaze">
            {gazeNames.map((name, i) => {
              const x = (i % 3) - 1, y = Math.floor(i / 3) - 1;
              return <button key={name} type="button" aria-label={`看向${name}`} aria-pressed={config.gx === x && config.gy === y} onClick={() => update({ gx: x, gy: y })} />;
            })}
          </div>
        </div>
        <label className="set-row set-row--toggle">
          <span className="set-row__text"><span className="set-row__label">腮红</span></span>
          <input type="checkbox" className="set-toggle" checked={config.blush} onChange={(e) => update({ blush: e.target.checked })} />
        </label>
        <label className="set-row set-row--toggle">
          <span className="set-row__text"><span className="set-row__label">显示嘴巴</span><span className="set-row__desc">平静、专注本来就没有嘴巴。</span></span>
          <input type="checkbox" className="set-toggle" checked={config.mouth} onChange={(e) => update({ mouth: e.target.checked })} />
        </label>
      </section>

      <section className="set-section">
        <h3 className="set-section__title">导出背景</h3>
        <div className="set-row">
          <div className="set-row__text"><span className="set-row__label">背景</span><span className="set-row__desc">只影响导出的 PNG / SVG，应用里的头像始终透明。</span></div>
          <div className="set-chips">
            {BGS.map(([key, label]) => key === 'custom' ? (
              <label key={key} className="set-chip set-chip--color" data-on={config.bg === 'custom'}>
                <span className="set-chip__dot" style={{ background: config.bgColor }} />{label}
                <input type="color" aria-label="自定义背景色" value={config.bgColor} onChange={(e) => HEX.test(e.target.value) && update({ bg: 'custom', bgColor: e.target.value })} />
              </label>
            ) : <button key={key} type="button" className="set-chip" aria-pressed={config.bg === key} onClick={() => update({ bg: key })}>{label}</button>)}
          </div>
        </div>
      </section>
    </div>
  );
}
