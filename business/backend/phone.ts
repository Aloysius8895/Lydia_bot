import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';
import { certsRoot } from '../shared/config.ts';

export const privateIPv4 = (address:string) => /^(10\.|192\.168\.)/.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
export function selfLANConnection(secure:boolean,remote:string|undefined,local:string|undefined,hostname:string) {
  const normalize=(address:string|undefined)=>(address||'').replace(/^::ffff:/,'');
  return secure&&!!remote&&privateIPv4(normalize(local))&&normalize(remote)===normalize(local)&&normalize(local)===hostname;
}
// Tailscale hands out 100.64.0.0/10; the firewall only admits those peers on the Tailscale address.
export const tailscaleIPv4 = (address:string) => { const m = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(address); return !!m && +m[1] >= 64 && +m[1] <= 127; };
/** A request from one of the owner's own Tailscale devices to the private MagicDNS HTTPS address. */
export function tailnetConnection(secure:boolean,remote:string|undefined,local:string|undefined,hostname:string) {
  const normalize=(address:string|undefined)=>(address||'').replace(/^::ffff:/,'');
  return secure&&tailscaleIPv4(normalize(remote))&&tailscaleIPv4(normalize(local))&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.ts\.net$/i.test(hostname);
}
export function lanAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flatMap(items => (items || []).filter(item => item.family === 'IPv4' && !item.internal && privateIPv4(item.address)).map(item => item.address)))];
}
export async function publicCA() {
  const pem = await readFile(path.join(certsRoot, 'crew-local-ca.pem'));
  const cert = new X509Certificate(pem);
  return { bytes: cert.raw, fingerprint: cert.fingerprint256, expires: cert.validTo };
}
export async function phoneInfo(origin:string, secure:boolean) {
  const url = new URL(origin), addresses = lanAddresses();
  if(secure&&url.protocol==='https:'&&/^[a-z0-9][a-z0-9.-]*\.ts\.net$/i.test(url.hostname)){
    return {origin,enabled:true,mode:'tailscale',addresses:[],suggestedOrigin:origin,certificate:null,bootstrapURL:null};
  }
  const enabled = secure && addresses.includes(url.hostname);
  const ca = await publicCA().catch(() => null);
  return { origin, enabled, mode:'lan', addresses, suggestedOrigin: enabled ? origin : addresses[0] ? `https://${addresses[0]}:4318` : null,
    certificate: ca ? { fingerprint: ca.fingerprint, expires: ca.expires } : null,
    bootstrapURL: enabled ? `http://${url.hostname}:4319` : null };
}
