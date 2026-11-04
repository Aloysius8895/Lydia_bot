import {access} from 'node:fs/promises';
import {chromium,type Browser} from '../../business/shared/browser.ts';
import {denyProxy} from './deny-proxy.ts';
import {fetchPage,decodedBytes,robotsAllowed,userAgent,classify} from './http.ts';
import {validatePublicURL} from '../../data/RAG/sources.ts';
import {document as parseDocument,find,attr,tag} from '../../data/crawl/html.ts';
import {AppError} from '../../business/shared/config.ts';
import type {FetchResult} from '../types.ts';
import {readOnlyGraphQL} from '../../data/crawl/graphql.ts';

const staticCache=new Map<string,{response:FetchResult;expires:number}>();let staticCacheBytes=0;
export function browserReadySelector(source:string,url:string){
 if(source==='devfolio'&&new URL(url).pathname.includes('/past'))return 'a[href*=".devfolio.co/"]';
 if(source==='taikai')return 'a[href*="/projects/"], [data-testid="no-projects"]';
 if(source==='hackquest'&&new URL(url).pathname.startsWith('/hackathons/'))return 'a[href*="/projects/"]:not([href*="prize-leaderboard"])';
 if(source==='junction')return 'a[href*="/hackathons/"], a[href*="2026.hackjunction.com"]';
 return 'main,article,h1';
}

export type BrowserOptions={maxRequests?:number;maxBytes?:number;maxSteps?:number;timeoutMs?:number;delayMs?:number;readySelector?:string;signal?:AbortSignal;initial?:FetchResult;fetcher?:typeof fetchPage;validate?:(url:string)=>Promise<unknown>;allowURL?:(url:string)=>boolean};
export async function browserExecutable(){
 const candidates=[process.env.BROWSER_EXECUTABLE,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].filter(Boolean) as string[];
 for(const candidate of candidates)try{await access(candidate);return candidate;}catch{}
 throw new AppError('BROWSER_NOT_AVAILABLE','未找到 Chrome/Chromium/Edge；可配置 BROWSER_EXECUTABLE',503);
}
export async function renderPage(url:string,options:BrowserOptions={}):Promise<FetchResult>{
 const fetcher=options.fetcher||fetchPage,validate=options.validate||validatePublicURL,timeout=options.timeoutMs??45000,deadline=Date.now()+timeout,remaining=()=>Math.max(1,deadline-Date.now());
 const abort=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,abort.signal]):abort.signal;
 const timer=setTimeout(()=>abort.abort(new Error('Browser acquisition deadline')),timeout),proxy=await denyProxy();let browser:Browser|undefined;
 const captured:FetchResult[]=[],blocked:{url:string;reason:string}[]=[],allowed=new Set([new URL(url).hostname]);
 let requestCount=0,byteCount=options.initial?Math.max(options.initial.bytes.length,decodedBytes(options.initial).length):0,main:FetchResult|undefined=options.initial,partial=false,queue=Promise.resolve(),lastRequest=0,cacheHits=0;
 const robots=new Map<string,{status:number;rules:string|null}>();
 const maxRequests=options.maxRequests??40,maxBytes=options.maxBytes??20*1024*1024;
 const deny=(input:string,reason:string)=>{if(blocked.length<100)blocked.push({url:input,reason});partial=true;};
 async function get(input:string,postBody?:string){
  if(signal.aborted)throw new Error('Browser deadline or cancellation');
  if(++requestCount>maxRequests)throw new AppError('BROWSER_REQUEST_BUDGET','浏览器请求预算用尽');
  await validate(input);
  const cacheable=!postBody&&/\/(?:_next\/static\/|assets\/).+\.(js|css)(?:\?|$)/.test(new URL(input).pathname),cached=cacheable?staticCache.get(input):null;
  if(cached&&cached.expires>Date.now()){const decoded=decodedBytes(cached.response,maxBytes-byteCount);byteCount+=Math.max(cached.response.bytes.length,decoded.length);cacheHits++;captured.push(cached.response);return cached.response;}
  const wait=Math.max(0,lastRequest+(options.delayMs??2000)-Date.now());
  if(wait)await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(t);reject(new Error('Cancelled'));},t=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},wait);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
  lastRequest=Date.now();const r=await fetcher(input,signal,0,input,{maxBytes:Math.min(5*1024*1024,Math.max(1,maxBytes-byteCount)),...postBody?{method:'POST' as const,body:postBody,origin:new URL(url).origin}:{},validateRedirect:async next=>{if(!permitted(next))throw new AppError('BROWSER_REDIRECT_SCOPE','浏览器重定向超出已声明来源');await validate(next);}});
  if(postBody)r.acquisition={...r.acquisition,request_method:'POST',request_body:JSON.parse(postBody),policy:'public_graphql_query_only'};
  const decoded=decodedBytes(r,maxBytes-byteCount);byteCount+=Math.max(r.bytes.length,decoded.length);if(byteCount>maxBytes)throw new AppError('BROWSER_BYTE_BUDGET','浏览器字节预算用尽');
  if(cacheable&&r.statusCode===200&&!/no-store|private/i.test(r.headers['cache-control']||'')){
   while(staticCacheBytes+r.bytes.length>16*1024*1024||staticCache.size>=100){const key=staticCache.keys().next().value;if(!key)break;staticCacheBytes-=staticCache.get(key)!.response.bytes.length;staticCache.delete(key);}
   if(r.bytes.length<=5*1024*1024){staticCache.set(input,{response:r,expires:Date.now()+6*3600000});staticCacheBytes+=r.bytes.length;}
  }
  captured.push(r);return r;
 }
 function permitted(input:string){try{const u=new URL(input);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&(!u.port||['80','443'].includes(u.port))&&(allowed.has(u.hostname)||!!options.allowURL?.(input));}catch{return false;}}
 function addStaticOrigins(r:FetchResult){const doc=parseDocument(decodedBytes(r).toString('utf8'));for(const n of find(doc,n=>tag(n)==='script'&&!!attr(n,'src')||tag(n)==='link'&&attr(n,'rel')==='stylesheet'))try{const u=new URL(attr(n,'src')||attr(n,'href'),url);if(['http:','https:'].includes(u.protocol))allowed.add(u.hostname);}catch{}}
 if(main)addStaticOrigins(main);
 try{
  await validate(url);
  browser=await chromium.launch({executablePath:await browserExecutable(),headless:true,proxy:{server:proxy.url},args:['--proxy-bypass-list=<-loopback>','--disable-background-networking','--disable-component-update','--disable-domain-reliability','--disable-sync','--disable-quic','--dns-prefetch-disable','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--disable-features=WebTransport,MediaRouter,OptimizationHints,DnsOverHttps']});
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,permissions:[],userAgent});
  await context.addInitScript(()=>{for(const name of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport','SharedWorker'])try{Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false});}catch{}});
  await context.routeWebSocket('**/*',socket=>{deny(socket.url(),'websocket_disabled');socket.close();});
  await context.route('**/*',async route=>{
   const request=route.request(),input=request.url();
   const readPost=request.method()==='POST'&&readOnlyGraphQL(request.postData());
   if(!permitted(input)||request.method()!=='GET'&&!readPost||['image','font','media','eventsource','manifest'].includes(request.resourceType())||/\/cdn-cgi\/challenge-platform\//.test(new URL(input).pathname)){
    deny(input,request.method()!=='GET'?'mutation_or_post_disabled':'scope_or_resource_disabled');await route.abort().catch(()=>{});return;
   }
   const operation=queue.then(async()=>{
    try{
     await validate(input);const origin=new URL(input).origin;
     if(!robots.has(origin)){const r=await get(origin+'/robots.txt');robots.set(origin,{status:r.statusCode,rules:r.statusCode===200&&['readable','empty'].includes(r.classification)?decodedBytes(r).toString('utf8'):null});}
     const rules=robots.get(origin)!;if(rules.status!==404&&(rules.rules===null||!robotsAllowed(rules.rules,input)))throw new AppError('BROWSER_ROBOTS_BLOCKED','浏览器依赖被 robots 限制或规则不可用');
     const r=main&&input===url&&request.method()==='GET'?main:await get(input,readPost?request.postData()!:undefined);
     if(input===url){main=r;addStaticOrigins(r);}
     if(['challenge','access_restricted','rate_limited'].includes(r.classification))throw new AppError('BROWSER_SOURCE_BLOCKED','来源要求授权、限流或验证，不进行浏览器绕过');
     const body=decodedBytes(r,maxBytes);await route.fulfill({status:r.statusCode,headers:{'content-type':r.contentType||'text/plain',...r.headers['access-control-allow-origin']?{'access-control-allow-origin':r.headers['access-control-allow-origin']}:{}},body});
    }catch(e){deny(input,(e as any).code||'request_failed');await route.abort().catch(()=>{});}
   });queue=operation.catch(()=>{});await operation;
  });
  const page=await context.newPage();context.on('page',p=>{if(p!==page)void p.close();});page.on('dialog',dialog=>void dialog.dismiss());
  const close=()=>void context.close().catch(()=>{});signal.addEventListener('abort',close,{once:true});
  try{
   await page.goto(url,{waitUntil:'commit',timeout});
   try{await page.locator(options.readySelector||'main,article,h1').first().waitFor({state:'attached',timeout:Math.max(1,remaining()-12000)});}catch{partial=true;}
   try{await page.waitForLoadState('networkidle',{timeout:Math.max(1,Math.min(5000,remaining()-6000))});}catch{partial=true;}
   const paginationStates=[];for(let step=0;step<(options.maxSteps??3);step++){
    if(signal.aborted||remaining()<6000)break;
    const before=await page.locator('a[href]').count();await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    let increased=true;try{await page.waitForFunction(previous=>document.querySelectorAll('a[href]').length>previous,before,{timeout:Math.min(3000,remaining()-3000)});}catch{increased=false;}
    paginationStates.push({step,before,after:await page.locator('a[href]').count(),increased});if(!increased)break;
   }
   const dom=Buffer.from(await page.content());if(dom.length+byteCount>maxBytes)throw new AppError('BROWSER_BYTE_BUDGET','DOM 与依赖总量超过预算');
   if(!main)throw new AppError('BROWSER_MAIN_MISSING','浏览器未获取到可验证的主响应');
   const {'content-encoding':_encoding,'content-length':_length,...headers}=main.headers;
   return {...main,bytes:dom,headers:{...headers,'content-type':'text/html; charset=utf-8'},contentType:'text/html; charset=utf-8',classification:classify(main.statusCode,'text/html',dom.toString('utf8')),backend:'browser-http-replay',capturedAt:new Date().toISOString(),dependencies:[main,...captured],acquisition:{transport:'deny_proxy_with_pinned_http_replay',request_count:requestCount,dependency_bytes:byteCount,static_cache_hits:cacheHits,blocked,partial,lazy_steps:paginationStates,pagination_complete:false,proxy_denials:proxy.denied(),cookies_forwarded:false,post_policy:'observed_public_graphql_query_only'}};
  }finally{signal.removeEventListener('abort',close);}
 }catch(e){
  if(options.signal?.aborted)throw e;
  if(!main)throw e;
  return {...main,backend:'browser-failed-http-snapshot',dependencies:[main,...captured],acquisition:{transport:'deny_proxy_with_pinned_http_replay',partial:true,error:{code:signal.aborted?'BROWSER_DEADLINE':(e as any).code||'BROWSER_FAILED',message:String((e as Error).message).slice(0,300)},request_count:requestCount,dependency_bytes:byteCount,blocked,proxy_denials:proxy.denied()}};
 }finally{clearTimeout(timer);abort.abort();await browser?.close().catch(()=>{});await queue.catch(()=>{});await proxy.close();}
}
