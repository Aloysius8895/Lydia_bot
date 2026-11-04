import https from 'node:https';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {businessRoot,certsRoot} from '../shared/config.ts';
const prepared=JSON.parse(await readFile(path.join(businessRoot,'test-results','https-preparation.json'),'utf8'));
const prefix=`crew-${prepared.host.replaceAll('.','-')}`,root=await readFile(path.join(certsRoot,'crew-local-ca.pem'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=https.createServer({key:await readFile(path.join(certsRoot,`${prefix}-key.pem`)),cert:await readFile(path.join(certsRoot,`${prefix}-cert.pem`))},(req,res)=>void app.handler(req,res));
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`https://127.0.0.1:${(server.address() as any).port}`,temp=await mkdtemp(path.join(os.tmpdir(),'crew-https-test-'));
app=await createApp({dataDir:path.join(temp,'pg'),origin,secure:true,startWorker:false,skillsDir:path.join(temp,'missing')});
const request=(route:string,method='GET',data?:unknown)=>new Promise<{status:number;headers:any;json:any}>((resolve,reject)=>{const req=https.request(origin+route,{method,ca:root,headers:{origin,'content-type':'application/json'}},res=>{let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,json:JSON.parse(text)}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);});
try{
  assert.equal((await request('/api/auth/status')).json.secure,true);
  assert.equal((await request('/api/auth/setup','POST',{password:'TEST_ONLY-HTTPS-password-42'})).status,200);
  const login=await request('/api/auth/login','POST',{password:'TEST_ONLY-HTTPS-password-42'});assert.equal(login.status,200);assert.ok(login.headers['set-cookie'][0].includes('; Secure'));
  const report={timestamp:new Date().toISOString(),status:'TEST_PASSED',checks:['TLS connection validates hostname and chain with explicitly supplied local public CA','HTTPS owner setup and login succeeds','Session cookie has Secure flag'],trustStoreModified:false,phoneTrust:'NOT_VERIFIED',phoneInstallation:'NOT_RUN',fixture:'TEST_ONLY isolated database; no real owner password set'};
  await writeFile(path.join(businessRoot,'test-results','https-transport.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await new Promise<void>(r=>server.close(()=>r()));await app.close();}
