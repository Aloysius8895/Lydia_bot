import {X509Certificate,createPrivateKey} from 'node:crypto';
import {isIP} from 'node:net';

export function remoteAddress(status:any) {
  if(status?.BackendState!=='Running')throw new Error('Tailscale 尚未连接，请先在电脑登录 Tailscale。');
  const hostname=String(status?.Self?.DNSName||'').replace(/\.$/,'');
  if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.ts\.net$/i.test(hostname))throw new Error('找不到 Tailscale MagicDNS 名称，请在管理后台启用 MagicDNS。');
  const host=(status?.Self?.TailscaleIPs||[]).find((ip:string)=>{
    const parts=ip.split('.').map(Number);
    return isIP(ip)===4&&parts[0]===100&&parts[1]>=64&&parts[1]<=127;
  });
  if(!host)throw new Error('找不到本人电脑的 Tailscale IPv4 地址。');
  return {host:host as string,hostname,origin:`https://${hostname}:4318`};
}

export function validateRemoteCertificate(cert:Buffer,key:Buffer,hostname:string) {
  const parsed=new X509Certificate(cert);
  if(!parsed.checkHost(hostname)||!parsed.checkPrivateKey(createPrivateKey(key)))throw new Error('HTTPS 证书名称或私钥不匹配。');
  if(Date.parse(parsed.validFrom)>Date.now()||Date.parse(parsed.validTo)<Date.now()+86400000)throw new Error('HTTPS 证书未生效或即将过期。');
  return parsed.fingerprint256;
}
