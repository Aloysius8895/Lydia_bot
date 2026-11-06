import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../backend/server.ts';

test('local passwordless access issues a real session and preserves request checks',async()=>{
  let app:Awaited<ReturnType<typeof createApp>>;
  const server=http.createServer((req,res)=>void app.handler(req,res));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-local-access-'));
  app=await createApp({dataDir:path.join(temp,'pg'),origin,startWorker:false,localAutoLogin:true});
  try{
    const status=await fetch(origin+'/api/auth/status');const state=await status.json();
    assert.equal(state.authenticated,true);assert.equal(state.passwordless,true);
    assert.equal(await app.auth.configured(),false);
    const cookie=status.headers.get('set-cookie')!.split(';')[0];
    assert.match(status.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
    assert.equal((await fetch(origin+'/api/cases',{headers:{cookie}})).status,200);
    assert.equal((await fetch(origin+'/api/cases')).status,401);
    const mutate=(headers:Record<string,string>)=>fetch(origin+'/api/auth/logout',{method:'POST',headers:{origin,cookie,...headers}});
    assert.equal((await mutate({})).status,403);
    assert.equal((await mutate({'x-csrf-token':state.csrf,origin:'https://evil.example'})).status,403);
    assert.equal((await fetch(origin+'/api/auth/status',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    assert.equal((await mutate({'x-csrf-token':state.csrf})).status,200);
    assert.equal((await fetch(origin+'/api/cases',{headers:{cookie}})).status,401);
    assert.equal((await (await fetch(origin+'/api/auth/status')).json()).authenticated,true);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await app.close();}
});

test('local auto login never applies to a LAN origin',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-lan-access-'));
  const app=await createApp({dataDir:path.join(temp,'pg'),origin:'https://lydia.example',startWorker:false,localAutoLogin:true});
  const server=http.createServer((req,res)=>void app.handler(req,res));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try{
    const result=await new Promise<{status:number;cookie:unknown;state:any}>((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:(server.address() as any).port,path:'/api/auth/status',headers:{host:'lydia.example'}},res=>{
        let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode!,cookie:res.headers['set-cookie'],state:JSON.parse(body)}));
      }).on('error',reject);
    });
    assert.equal(result.status,200);assert.equal(result.state.authenticated,false);assert.equal(result.state.passwordless,false);assert.equal(result.cookie,undefined);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await app.close();}
});
