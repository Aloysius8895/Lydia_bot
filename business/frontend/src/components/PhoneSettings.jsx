import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function PhoneSettings() {
  const [info, setInfo] = useState(null), [error, setError] = useState(''), [worker, setWorker] = useState(false);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  useEffect(() => {
    let active = true;
    api('/api/phone').then(value => { if (active) setInfo(value); }).catch(e => { if (active) setError(e.message); });
    navigator.serviceWorker?.getRegistration().then(reg => { if (active) setWorker(!!reg?.active); });
    return () => { active = false; };
  }, []);
  return <>
    <section className="set-section">
      <h3 className="set-section__title">iPhone 安装</h3>
      {error && <p role="alert">{error}</p>}
      {!info && !error && <p className="set-muted">正在检查手机连接…</p>}
      {info && <>
        <p>{info.enabled ? '局域网 HTTPS 已启用。请让 iPhone 与电脑连接同一个 Wi-Fi。' : '请在电脑双击 Start-Lydia-Phone.cmd，启用手机访问。'}</p>
        {info.suggestedOrigin && <p style={{overflowWrap:'anywhere'}}>手机访问地址：<strong>{info.suggestedOrigin}</strong></p>}
        <p className="set-muted">电脑和服务需要保持运行。更换 Wi-Fi 或电脑 IP 后，请重新运行手机启动器。</p>
        <ol>
          <li>在电脑运行手机启动器。首次使用时，按启动器提示在电脑本机设置登录密码。</li>
          <li>在 iPhone Safari 打开 {info.bootstrapURL || '启动器显示的证书下载地址'}，下载公开根证书。核对下方 SHA-256 指纹。</li>
          <li>打开 iPhone「设置 → 通用 → VPN 与设备管理」，安装已下载的证书描述文件。</li>
          <li>打开「设置 → 通用 → 关于本机 → 证书信任设置」，开启 Crew Personal Local CA 的完全信任。</li>
          <li>在 Safari 打开上方 HTTPS 地址，确认没有证书警告，再使用工作区密码登录。</li>
          <li>点击 Safari 分享菜单 → 添加到主屏幕；如出现「作为网页 App 打开」，保持开启，然后添加。</li>
        </ol>
        {info.certificate && <details><summary>核对证书指纹</summary><p style={{overflowWrap:'anywhere'}}>{info.certificate.fingerprint}</p><p className="set-muted">有效期至 {info.certificate.expires}。仅下载公开 .cer 文件。</p><a className="set-btn" href="/phone-ca.cer">下载公开根证书</a></details>}
        <p><a href="https://support.apple.com/102390" target="_blank" rel="noreferrer">Apple 证书信任说明</a></p>
      </>}
    </section>
    <section className="set-section">
      <h3 className="set-section__title">当前设备检查</h3>
      <p>安全上下文：{window.isSecureContext ? '可用' : '不可用，请使用受信任 HTTPS'}</p>
      <p>主屏幕独立窗口：{standalone ? '已检测到' : '未检测到，请从主屏幕图标打开'}</p>
      <p>应用缓存：{worker ? '已注册' : '未就绪，请联网刷新后重试'}</p>
      <p className="set-muted">以上仅反映当前设备。请在 iPhone 从图标打开后，检查项目恢复、上传资料，以及任务暂停与恢复。麦克风与语音识别还需单独授权和验证。</p>
    </section>
  </>;
}
