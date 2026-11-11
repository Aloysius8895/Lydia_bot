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

test('only the owner\'s Tailscale devices on the private HTTPS name skip the password',async()=>{
  const {tailnetConnection}=await import('../backend/phone.ts');
  const host='laptop.tail0000.ts.net';
  assert.equal(tailnetConnection(true,'100.101.2.3','100.80.4.5',host),true);
  assert.equal(tailnetConnection(true,'::ffff:100.127.255.1','100.64.0.1',host),true);
  assert.equal(tailnetConnection(false,'100.101.2.3','100.80.4.5',host),false);          // plain HTTP
  assert.equal(tailnetConnection(true,'192.168.1.20','100.80.4.5',host),false);          // LAN peer
  assert.equal(tailnetConnection(true,'100.63.0.1','100.80.4.5',host),false);            // outside 100.64.0.0/10
  assert.equal(tailnetConnection(true,'100.128.0.1','100.80.4.5',host),false);
  assert.equal(tailnetConnection(true,'100.101.2.3','192.168.1.5',host),false);          // arrived on another interface
  assert.equal(tailnetConnection(true,'100.101.2.3','100.80.4.5','lydia.example'),false); // not the MagicDNS name
  assert.equal(tailnetConnection(true,'127.0.0.1','127.0.0.1','localhost'),false);

  const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-tailnet-access-'));
  const origin='https://'+host+':4318';
  const app=await createApp({dataDir:path.join(temp,'pg'),origin,secure:true,startWorker:false,localAutoLogin:false,tailnetAutoLogin:true});
  // Drive the handler with the socket addresses a real Tailscale connection carries.
  const call=(remote:string,local:string,route:string,headers:Record<string,string>={},method='GET')=>new Promise<{status:number;cookie:string;body:any}>(resolve=>{
    const res:any={statusCode:200,headers:{} as Record<string,any>,headersSent:false,setHeader(k:string,v:any){this.headers[k.toLowerCase()]=v;},
      end(data?:any){resolve({status:this.statusCode,cookie:String(this.headers['set-cookie']||''),body:data?JSON.parse(String(data)):null});},destroy(){}};
    const req:any={method,url:route,headers:{host:host+':4318',...headers},socket:{remoteAddress:remote,localAddress:local},async *[Symbol.asyncIterator](){}};
    void app.handler(req,res);
  });
  try{
    const phone=await call('100.101.2.3','100.80.4.5','/api/auth/status');
    assert.equal(phone.body.authenticated,true);assert.equal(phone.body.passwordless,true);assert.match(phone.cookie,/HttpOnly; SameSite=Strict; Max-Age=43200; Secure/);
    const cookie=phone.cookie.split(';')[0];
    assert.equal((await call('100.101.2.3','100.80.4.5','/api/cases',{cookie})).status,200);
    assert.equal((await call('100.101.2.3','100.80.4.5','/api/cases')).status,401);              // still needs the session cookie
    assert.equal((await call('100.101.2.3','100.80.4.5','/api/auth/status',{'sec-fetch-site':'cross-site'})).status,403);
    assert.equal((await call('100.101.2.3','100.80.4.5','/api/auth/logout',{cookie,origin},'POST')).status,403,'CSRF still required');
    const lan=await call('192.168.1.20','192.168.1.5','/api/auth/status');
    assert.equal(lan.body.authenticated,false);assert.equal(lan.body.passwordless,false);assert.equal(lan.cookie,'');
  }finally{await app.close();}
  const off=await createApp({dataDir:path.join(temp,'pg'),origin,secure:true,startWorker:false,localAutoLogin:false});
  try{
    const res:any={statusCode:200,headers:{} as Record<string,any>,setHeader(k:string,v:any){this.headers[k.toLowerCase()]=v;},end(){}};
    await off.handler({method:'GET',url:'/api/auth/status',headers:{host:host+':4318'},socket:{remoteAddress:'100.101.2.3',localAddress:'100.80.4.5'}} as any,res);
    assert.equal(res.headers['set-cookie'],undefined,'without the remote setting a password is still required');
  }finally{await off.close();}
});
