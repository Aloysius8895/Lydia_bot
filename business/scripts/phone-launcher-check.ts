import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {readFile} from 'node:fs/promises';
import {X509Certificate} from 'node:crypto';
import path from 'node:path';
import {certsRoot} from '../shared/config.ts';

export const assertPhonePortAvailable=(host:string,port:number)=>new Promise<void>((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',()=>reject(new Error(`端口 ${port} 已被使用。请先在已有 Lydia 启动窗口按 Ctrl+C 正常停止，再运行；不要同时启动两个实例。`)));
  // Windows may allow a wildcard bind alongside an existing specific-IP listener.
  // Probe the address we will actually use, with exclusive ownership.
  server.listen({port,host,exclusive:true},()=>server.close(()=>resolve()));
});

export async function existingPhoneService(host:string,servicePort=4318,certificatePort=4319) {
  try{
    const root=await readFile(path.join(certsRoot,'crew-local-ca.pem'));
    const get=(secure:boolean,port:number,route:string)=>new Promise<Buffer>((resolve,reject)=>{
      const request=(secure?https:http).get({hostname:host,port,path:route,ca:root},response=>{
        if(response.statusCode!==200){response.resume();reject(new Error('Unexpected HTTP status'));return;}
        const chunks:Buffer[]=[];let bytes=0;
        response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>65536)request.destroy(new Error('Response too large'));else chunks.push(chunk);});
        response.on('error',reject);response.on('end',()=>resolve(Buffer.concat(chunks)));
      });
      request.setTimeout(1500,()=>request.destroy(new Error('Timeout')));request.on('error',reject);
    });
    const state=JSON.parse((await get(true,servicePort,'/api/auth/status')).toString());
    if(state.secure!==true||typeof state.configured!=='boolean'||typeof state.authenticated!=='boolean')return false;
    const certificate=await get(false,certificatePort,'/lydia-local-ca.cer');
    return new X509Certificate(certificate).fingerprint256===new X509Certificate(root).fingerprint256;
  }catch{return false;}
}
