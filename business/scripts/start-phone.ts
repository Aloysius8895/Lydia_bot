import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { businessRoot, assert } from '../shared/config.ts';
import { lanAddresses, publicCA } from '../backend/phone.ts';
import {assertPhonePortAvailable,existingPhoneService} from './phone-launcher-check.ts';

const args=process.argv.slice(2),index=args.indexOf('--host'),addresses=lanAddresses();
const host=index>=0?args[index+1]:addresses.length===1?addresses[0]:null;
assert(host&&addresses.includes(host),'PHONE_ADDRESS','请连接 Wi-Fi；多个网卡时用 --host 指定地址。可用地址：'+addresses.join(', '));
const run=(command:string,params:string[])=>new Promise<void>((resolve,reject)=>{
  const child=spawn(command,params,{cwd:businessRoot,stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('启动准备未完成，退出码 '+code)));
});
if(await existingPhoneService(host)){
  console.log(`Lydia 手机服务已在运行，无需重复启动。\n电脑与 iPhone 打开：https://${host}:4318\n本次未创建新服务。需要重启时，请在原启动窗口按 Ctrl+C。`);
  process.exit(0);
}
try{await assertPhonePortAvailable(host,4318);await assertPhonePortAvailable(host,4319);}
catch(error){console.error((error as Error).message);process.exit(1);}
await run(process.execPath,['--experimental-strip-types','scripts/prepare-https.ts','--host',host]);
const prepared=await readFile(path.join(businessRoot,'deployment','.env.lan.example'),'utf8');
await writeFile(path.join(businessRoot,'deployment','.env.phone'),prepared.replace('HOST=0.0.0.0',`HOST=${host}`));
await run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd run build:frontend']);
const ca=await publicCA();
const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lydia iPhone 安装</title><body style="font:18px system-ui;max-width:680px;margin:40px auto;padding:20px;line-height:1.7"><h1>Lydia iPhone 安装</h1><p>手机与电脑需连接同一个 Wi-Fi。</p><p><a href="/lydia-local-ca.cer">1. 下载公开根证书</a></p><p>下载前请与电脑终端显示的 SHA-256 指纹核对：</p><p style="overflow-wrap:anywhere">${ca.fingerprint}</p><p>2. 设置 → 通用 → VPN 与设备管理，安装描述文件。</p><p>3. 设置 → 通用 → 关于本机 → 证书信任设置，开启 Crew Personal Local CA 的完全信任。</p><p><a href="https://${host}:4318/?settings=phone">4. 打开 Lydia HTTPS</a>，无证书警告后登录，再用 Safari 分享 → 添加到主屏幕。</p><p>首次设置密码需在电脑操作。如页面无法打开，请检查 Wi-Fi 是否隔离设备，以及 Windows 防火墙。此下载入口只提供公开证书，不提供私人资料。</p></body></html>`;
const bootstrap=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  if(req.headers.host!==`${host}:4319`){res.writeHead(403);res.end();return;}
  if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405);res.end();return;}
  if(req.url==='/lydia-local-ca.cer'){
    res.setHeader('Content-Type','application/pkix-cert');res.setHeader('Content-Disposition','attachment; filename="lydia-local-ca.cer"');res.end(req.method==='HEAD'?undefined:ca.bytes);
  }else if(req.url==='/'){
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method==='HEAD'?undefined:page);
  }else{res.writeHead(404);res.end();}
});
try{await new Promise<void>((resolve,reject)=>{bootstrap.once('error',reject);bootstrap.listen({port:4319,host,exclusive:true},resolve);});}
catch(error){console.error((error as NodeJS.ErrnoException).code==='EADDRINUSE'?'证书端口 4319 在准备期间被占用。请正常停止已有启动器后重试。':(error as Error).message);process.exit(1);}
const service=spawn(process.execPath,['--env-file-if-exists=deployment/.env','--env-file=deployment/.env.phone','--experimental-strip-types','backend/server.ts'],{cwd:businessRoot,stdio:['inherit','inherit','inherit','ipc'],windowsHide:true});
console.log(`\n电脑与 iPhone: https://${host}:4318/?settings=phone\niPhone 首次下载证书: http://${host}:4319\nCA SHA-256: ${ca.fingerprint}\n首次设置密码请在此电脑浏览器打开 HTTPS 地址（至少 12 字符）。\n若无法连接，请检查同一 Wi-Fi、访客网络隔离与防火墙。未修改防火墙或系统信任库。\n按 Ctrl+C 关闭。`);
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;bootstrap.close();if(service.connected)service.send('LYDIA_SHUTDOWN');};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
service.on('error',error=>{console.error(error.message);bootstrap.close();process.exitCode=1;});
service.on('exit',code=>{bootstrap.close();process.exitCode=code||0;});
