import https from 'node:https';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createApp } from '../backend/server.ts';
import { lanAddresses, publicCA } from '../backend/phone.ts';
import { businessRoot, certsRoot } from '../shared/config.ts';

const host=lanAddresses()[0];assert.ok(host,'Connect to private Wi-Fi first');
const prefix=`crew-${host.replaceAll('.','-')}`,root=await readFile(path.join(certsRoot,'crew-local-ca.pem'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=https.createServer({key:await readFile(path.join(certsRoot,prefix+'-key.pem')),cert:await readFile(path.join(certsRoot,prefix+'-cert.pem'))},(req,res)=>void app.handler(req,res));
await new Promise<void>(r=>server.listen(0,host,r));
const origin=`https://${host}:${(server.address() as netAddress).port}`;
type netAddress={port:number};
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-phone-'));
app=await createApp({origin,secure:true,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});
const request=(route:string,method='GET',data?:unknown,headers:Record<string,string>={})=>new Promise<{status:number;headers:any;bytes:Buffer}>((resolve,reject)=>{
  const req=https.request(origin+route,{method,ca:root,headers:{origin,'content-type':'application/json',...headers}},res=>{
    const bytes:Buffer[]=[];res.on('data',b=>bytes.push(b));res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,bytes:Buffer.concat(bytes)}));
  });req.on('error',reject);req.end(data===undefined?undefined:JSON.stringify(data));
});
const checks:string[]=[],errors:string[]=[];
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
  const status=JSON.parse((await request('/api/auth/status')).bytes.toString());assert.equal(status.authenticated,false);assert.equal(status.passwordless,false);
  assert.equal((await request('/api/phone')).status,401);
  const download=await request('/phone-ca.cer');assert.equal(download.status,200);assert.equal(new X509Certificate(download.bytes).fingerprint256,(await publicCA()).fingerprint);
  for(const route of ['/deployment/certs/crew-local-ca-key.pem','/phone-ca-key.pem'])assert.equal((await request(route)).status,404);
  checks.push('Real LAN-IP TLS hostname/CA validation; public DER certificate only; private key paths denied; LAN requires login');
  const password='TEST_ONLY-phone-setup-123';assert.equal((await request('/api/auth/setup','POST',{password})).status,200);
  const login=await request('/api/auth/login','POST',{password});assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/; Secure/);
  const cookie=login.headers['set-cookie'][0].split(';')[0],csrf=JSON.parse(login.bytes.toString()).csrf;
  const info=JSON.parse((await request('/api/phone','GET',undefined,{cookie})).bytes.toString());assert.equal(info.enabled,true);assert.equal(info.origin,origin);
  assert.equal((await request('/api/auth/logout','POST',{}, {cookie,'x-csrf-token':csrf,origin:'https://evil.example'})).status,403);
  checks.push('Computer self-LAN initial password setup, HTTPS login/Secure cookie, authenticated phone info, cross-origin mutation rejected');
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  // Browser fixture skips OS trust installation; TLS chain/hostname independently verified above.
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
  await context.addCookies([{name:'crew_session',value:cookie.split('=')[1],url:origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?settings=phone');await page.getByRole('heading',{name:'iPhone 安装',exact:true}).waitFor();
  await page.getByText('局域网 HTTPS 已启用。',{exact:false}).waitFor();
  await page.getByText('核对证书指纹',{exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'下载公开根证书'}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(businessRoot,'test-results','phone-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(businessRoot,'test-results','phone-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);checks.push('Phone settings rendered at 390px and desktop; install guidance and certificate download present; no page errors');
  const report={timestamp:new Date().toISOString(),status:'TEST_PASSED',checks,pageErrors:errors,productionDatabaseTouched:false,fixture:'TEST_ONLY isolated database; browser trust bypass only in fixture; actual TLS verified using explicit CA',phoneTrust:'PENDING_USER',phoneStandalone:'PENDING_USER',phoneInteraction:'PENDING_USER'};
  await writeFile(path.join(businessRoot,'test-results','phone-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
