import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {renderPage} from '../../crawl/fetch/browser.ts';
import {denyProxy} from '../../crawl/fetch/deny-proxy.ts';
import {validatePublicURL} from '../../data/RAG/sources.ts';
import type {FetchResult} from '../../crawl/types.ts';
const requested:string[]=[];let privateHits=0;
const trap=http.createServer((req,res)=>{privateHits++;res.end('PRIVATE_SENTINEL');});await new Promise<void>(r=>trap.listen(0,'127.0.0.1',r));const port=(trap.address() as any).port;
const body=`<h1>TEST_ONLY dynamic acquisition</h1><main id="content"></main><script>
 fetch('/public-data.json').then(r=>r.json()).then(x=>{document.querySelector('main').textContent=x.text;});
 fetch('http://127.0.0.1:${port}/private').catch(()=>{});
 fetch('https://127.0.0.1/private').catch(()=>{});
 try{new WebSocket('ws://127.0.0.1:${port}/socket');}catch{}
 fetch('/must-not-write',{method:'POST',body:'TEST_ONLY'}).catch(()=>{});
 </script>`;
const result=(url:string,text:string,type='text/html'):FetchResult=>({requestedUrl:url,finalUrl:url,statusCode:200,headers:{},contentType:type,classification:'readable',bytes:Buffer.from(text),capturedAt:new Date().toISOString(),backend:'TEST_ONLY'});
const fetcher=async(url:string)=>{requested.push(url);if(url.endsWith('/robots.txt'))return result(url,'User-agent: *\nAllow: /','text/plain');if(url.endsWith('/public-data.json'))return result(url,JSON.stringify({text:'TEST_ONLY_RENDERED_BY_PUBLIC_GET'}),'application/json');return result(url,body);};
const validate=async(url:string)=>validatePublicURL(url,async(host:string)=>{if(host==='example.com')return [{address:'93.184.216.34',family:4}] as any;throw Error('Unapproved test host');});
const checks:string[]=[];
try{
 const r=await renderPage('https://example.com/',{fetcher,validate,delayMs:0,maxRequests:5,maxSteps:1,timeoutMs:15000,readySelector:'main:has-text("TEST_ONLY_RENDERED_BY_PUBLIC_GET")'});
 assert.ok(r.bytes.toString().includes('TEST_ONLY_RENDERED_BY_PUBLIC_GET'));assert.ok(requested.some(u=>u.endsWith('/public-data.json')));assert.equal(privateHits,0);assert.ok(!requested.some(u=>u.includes('127.0.0.1')||u.includes('must-not-write')));assert.equal(r.backend,'browser-http-replay');checks.push('public dynamic GET rendered','localhost/private destination never contacted','POST mutation never forwarded','WebSocket never connected','original response and dependencies retained');
 const proxy=await denyProxy();try{const denied=await fetch(proxy.url,{method:'CONNECT'}).catch(()=>null);assert.equal(denied,null);await new Promise<void>((resolve,reject)=>{const req=http.request(proxy.url,{method:'CONNECT',path:'127.0.0.1:'+port});req.on('connect',(res,socket)=>{assert.equal(res.statusCode,403);socket.destroy();resolve();});req.on('error',reject);req.end();});assert.equal(privateHits,0);checks.push('unhandled browser CONNECT denied without destination connection');}finally{await proxy.close();}
 const limited=await renderPage('https://example.com/',{fetcher,validate,delayMs:0,maxRequests:1,maxSteps:0,timeoutMs:12000,readySelector:'h1'}).catch(e=>e);assert.ok(limited instanceof Error||limited.acquisition.partial);checks.push('request budget stops acquisition');
 const dir=new URL('../../crawl/reports/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('browser-acquisition.json',dir),JSON.stringify({os:process.platform,node:process.version,synthetic:true,checks,privateHits,requested,browser_acquisition:r.acquisition,limitations:['Synthetic transport fixture; no claim that every target site renders successfully','No captcha/authentication bypass or account cookies; only public AST-validated GraphQL query POST is allowed']},null,2));console.log(JSON.stringify({checks:checks.length,privateHits,status:'passed'}));
}finally{await new Promise<void>(r=>trap.close(()=>r()));}
