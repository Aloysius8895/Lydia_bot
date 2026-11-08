import path from 'node:path';
import net from 'node:net';
import {execFile,spawn,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {businessRoot,runtimeRoot} from '../shared/config.ts';
import {remoteAddress,validateRemoteCertificate} from './remote-config.ts';

const exec=promisify(execFile),dir=path.join(runtimeRoot,'remote');
const tailscale=path.join(process.env.ProgramFiles||'C:/Program Files','Tailscale','tailscale.exe');
await mkdir(dir,{recursive:true});
const log=async(message:string)=>{
  const line=`${new Date().toISOString()} ${message}\n`;
  console.log(line.trim());await appendFile(path.join(dir,'supervisor.log'),line);
};
// Held for this process lifetime, including retries and network outages.
const guard=net.createServer(socket=>socket.destroy());
try{await new Promise<void>((resolve,reject)=>{guard.once('error',reject);guard.listen({host:'127.0.0.1',port:4317,exclusive:true},resolve);});}
catch{console.error('Lydia 远程启动器已运行，或保护端口 4317 被占用。');process.exit(1);}
let stopping=false,child:ChildProcess|undefined,retry:NodeJS.Timeout|undefined,renewal:NodeJS.Timeout|undefined;
const stop=()=>{
  stopping=true;clearTimeout(retry);clearInterval(renewal);
  if(child?.connected)child.send('LYDIA_SHUTDOWN');else guard.close();
};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const cli=(args:string[])=>exec(tailscale,args,{windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
async function provision(hostname:string) {
  // Stage both files; never load an unverified or partially issued pair.
  const certFile=path.join(dir,'pending.crt'),keyFile=path.join(dir,'pending.key');
  await cli(['cert','--min-validity','336h','--cert-file',certFile,'--key-file',keyFile,hostname]);
  const cert=await readFile(certFile),key=await readFile(keyFile);
  const fingerprint=validateRemoteCertificate(cert,key,hostname);
  await writeFile(path.join(dir,'server.key'),key,{mode:0o600});
  await writeFile(path.join(dir,'server.crt'),cert);
  return fingerprint;
}
async function attempt() {
  if(stopping)return;
  try{
    // Check every interface: a loopback instance uses the same persistent DB.
    const occupied=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue).Count"],{windowsHide:true,timeout:15000});
    if(Number(occupied.stdout.trim())!==0)throw new Error('4318 已有服务：请在原运行窗口按 Ctrl+C 正常停止，启动器稍后自动重试。');
    const address=remoteAddress(JSON.parse((await cli(['status','--json'])).stdout));
    let fingerprint=await provision(address.hostname);
    if(stopping)return;
    await writeFile(path.join(dir,'address.txt'),address.origin+'\n');
    await log(`启动远程入口 ${address.origin}`);
    const output=createWriteStream(path.join(dir,'server.log'),{flags:'a'});
    child=spawn(process.execPath,['--env-file-if-exists=deployment/.env','--experimental-strip-types','backend/server.ts'],{
      cwd:businessRoot,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
      env:{...process.env,HOST:address.host,PORT:'4318',APP_ORIGIN:address.origin,
        HTTPS_KEY_FILE:path.join(dir,'server.key'),HTTPS_CERT_FILE:path.join(dir,'server.crt'),LYDIA_LOCAL_AUTO_LOGIN:'false'},
    });
    child.stdout!.pipe(output,{end:false});child.stderr!.pipe(output,{end:false});
    let renewing=false;
    renewal=setInterval(()=>{
      if(renewing||stopping)return;renewing=true;
      void provision(address.hostname).then(async next=>{
        if(next!==fingerprint&&child?.connected){child.send('LYDIA_RELOAD_TLS');fingerprint=next;await log('已更新 HTTPS 证书。');}
      }).catch(error=>log('证书更新失败，下次重试：'+error.message)).finally(()=>{renewing=false;});
    },24*60*60*1000);
    const code=await new Promise<number|null>(resolve=>{
      child!.once('error',error=>{void log('后端启动失败：'+error.message);});
      child!.once('close',resolve);
    });
    clearInterval(renewal);output.end();child=undefined;
    await log(`后端已退出 (${code})。`);
  }catch(error){await log((error as Error).message);}
  if(stopping)guard.close();else retry=setTimeout(()=>void attempt(),30000);
}
await attempt();
