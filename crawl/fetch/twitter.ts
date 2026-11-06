import {mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import {chromium,type BrowserContext,type Page} from '../../business/shared/browser.ts';
import {browserExecutable} from './browser.ts';
import {twitterURL,parseTwitter} from '../sources/twitter.ts';
import {AppError} from '../../business/shared/config.ts';
import type {FetchResult} from '../types.ts';

export type TwitterOptions={maxPosts:number;maxScrolls:number;maxBytes:number;maxRequests:number;timeoutMs:number;delayMs:number;signal?:AbortSignal;shouldContinue?:()=>Promise<boolean>;visible?:boolean};
export type TwitterPage=Pick<Page,'evaluate'|'locator'|'url'|'waitForTimeout'>;
export async function collectTwitterCards(page:TwitterPage,options:TwitterOptions){
 const cards=new Map<string,string>();let bytes=0,stale=0,reason='scroll_budget',error:{code:string;message:string}|undefined;
 const deadline=Date.now()+options.timeoutMs;
 for(let step=0;step<=options.maxScrolls;step++){
  options.signal?.throwIfAborted();
  if(options.shouldContinue&&!await options.shouldContinue()){reason='run_paused_or_cancelled';break;}
  if(Date.now()>=deadline){reason='time_budget';break;}
  const state=await page.evaluate(()=>{
   const articles=[...document.querySelectorAll('article')];
   const root=document.querySelector('main')||document.body,clone=root.cloneNode(true) as HTMLElement;
   clone.querySelectorAll('article').forEach(n=>n.remove());const chrome=clone.textContent||'';
   const challenge=!!document.querySelector('iframe[src*="arkoselabs"],iframe[src*="captcha"],#challenge-form')||/verify you are human|unusual activity|complete the challenge|验证你是真人|验证您的身份/i.test(chrome);
   const login=/\/i\/flow\/login|\/login(?:\?|$)/.test(location.href)||!articles.length&&!!document.querySelector('input[autocomplete="username"],input[name="password"],a[href*="/i/flow/login"]');
   const rate=/rate limit exceeded|too many requests|已达到.*上限|请求过多/i.test(chrome);
   const empty=/no results for|no posts yet|hasn.t posted|没有找到结果|暂无帖子|尚未发布/i.test(chrome);
   const unavailable=/account suspended|this account doesn.t exist|post isn.t available|此账号不存在|账号已被冻结/i.test(chrome);
   const allowedAttrs=new Set(['href','datetime','data-testid','aria-label','alt','role']);
   return {challenge,login,rate,empty,unavailable,cards:articles.map(article=>{
    const card=article.cloneNode(true) as HTMLElement;
    card.querySelectorAll('script,style,iframe,input,textarea,form,button[data-testid="UserCell"]').forEach(n=>n.remove());
    for(const n of [card,...card.querySelectorAll('*')])for(const a of [...n.attributes])if(!allowedAttrs.has(a.name))n.removeAttribute(a.name);
    return card.outerHTML;
   })};
  });
  if(state.challenge||state.login||state.rate||state.unavailable){
   error=state.challenge?{code:'TWITTER_CHALLENGE',message:'X 要求验证，请在本机登录窗口处理后重试'}:state.login?{code:'TWITTER_LOGIN_REQUIRED',message:'X 登录已失效，请在本机重新登录'}:state.rate?{code:'TWITTER_RATE_LIMITED',message:'X 暂时限流，请稍后重试'}:{code:'TWITTER_UNAVAILABLE',message:'账号或推文当前不可见'};reason=error.code;break;
  }
  let added=0;
  for(const card of state.cards){
   const parsed=parseTwitter(page.url(),card),id=parsed.projects[0]?.nativeId;if(!id||cards.has(id))continue;
   const size=Buffer.byteLength(card);if(bytes+size>options.maxBytes){reason='byte_budget';break;}
   cards.set(id,card);bytes+=size;added++;if(cards.size>=options.maxPosts){reason='post_budget';break;}
  }
  if(reason==='byte_budget'||cards.size>=options.maxPosts)break;
  if(state.empty&&!cards.size){reason='visible_empty_result';break;}
  stale=added?0:stale+1;if(stale>=3){reason='no_new_posts';break;}
  if(step<options.maxScrolls){await page.evaluate(()=>window.scrollBy(0,Math.max(600,window.innerHeight*.85)));await page.waitForTimeout(Math.min(options.delayMs,Math.max(0,deadline-Date.now())));}
 }
 if(!cards.size&&!error&&reason!=='visible_empty_result'&&reason!=='run_paused_or_cancelled')error={code:'TWITTER_UNKNOWN_TEMPLATE',message:'未发现支持的推文结构；可能仍在加载、不可访问或模板已变化'};
 return {html:'<!doctype html><html><body><main>'+[...cards.values()].join('\n')+'</main></body></html>',count:cards.size,ids:[...cards.keys()],reason,error};
}

export class TwitterBrowser {
 profile:string;context?:BrowserContext;busy=false;loginOpen=false;loggedIn=false;
 constructor(storageRoot:string){this.profile=path.join(storageRoot,'twitter-profile');}
 async status(){return {login_open:this.loginOpen,busy:this.busy,logged_in:this.loggedIn,profile_saved:await access(this.profile).then(()=>true).catch(()=>false)};}
 async launch(headless:boolean){
  await mkdir(this.profile,{recursive:true});
  return chromium.launchPersistentContext(this.profile,{executablePath:await browserExecutable(),headless,acceptDownloads:false,serviceWorkers:'block',permissions:[],viewport:{width:1280,height:900}});
 }
 async login(){
  if(this.busy||this.context)throw new AppError('TWITTER_BROWSER_BUSY','X 浏览器正在使用，请先关闭登录窗口或等待采集结束',409);
  this.busy=true;
  try{this.context=await this.launch(false);this.loginOpen=true;const context=this.context;
   context.on('close',()=>{if(this.context===context){this.context=undefined;this.loginOpen=false;this.loggedIn=false;}});
   const page=context.pages()[0]||await context.newPage();await page.goto('https://x.com/i/flow/login',{waitUntil:'domcontentloaded',timeout:30000});
   return this.status();
  }catch(e){await this.context?.close().catch(()=>{});this.context=undefined;this.loginOpen=false;throw new AppError('TWITTER_LOGIN_WINDOW_FAILED','无法打开 X 登录窗口，请检查浏览器及网络',503);}
  finally{this.busy=false;}
 }
 async close(){if(this.busy)throw new AppError('TWITTER_BROWSER_BUSY','X 浏览器正在采集，请先暂停任务',409);const context=this.context;this.context=undefined;this.loginOpen=false;await context?.close();return this.status();}
 async acquire(input:string,options:TwitterOptions):Promise<FetchResult>{
  const url=twitterURL(input);if(this.busy||this.context)throw new AppError('TWITTER_BROWSER_BUSY','请先关闭 X 登录窗口，再开始采集',409);
  this.busy=true;let context:BrowserContext|undefined;const started=Date.now();let requests=0,networkBytes=0,budgetError:AppError|undefined,loginRedirect=false;
  const abort=()=>void context?.close().catch(()=>{});options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{budgetError=new AppError('TWITTER_TIME_BUDGET','X 浏览器时间预算已用尽');abort();},options.timeoutMs);
  try{
   options.signal?.throwIfAborted();context=await this.launch(!options.visible);this.context=context;options.signal?.throwIfAborted();if(budgetError)throw budgetError;
   const cookies=await context.cookies('https://x.com');this.loggedIn=cookies.some(c=>c.name==='auth_token'&&!!c.value);
   if(!this.loggedIn)throw new AppError('TWITTER_LOGIN_REQUIRED','请先在本机打开 X 登录窗口并登录，再关闭窗口开始采集',409);
   await context.route('**/*',async route=>{
    const request=route.request();let u:URL;try{u=new URL(request.url());}catch{await route.abort();return;}
    const hostOK=['x.com','twitter.com','twimg.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));
    const read=request.method()==='GET'&&(!u.pathname.includes('/graphql/')||/\/(UserTweets|UserTweetsAndReplies|UserByScreenName|UserByRestId|SearchTimeline|TweetDetail|TweetResultByRestId|Viewer)$/.test(u.pathname));
    const navigationOK=!request.isNavigationRequest()||(()=>{try{return !!twitterURL(u.href);}catch{return false;}})();
    if(request.isNavigationRequest()&&u.hostname==='x.com'&&/^\/(?:i\/flow\/login|login)/.test(u.pathname))loginRedirect=true;
    if(!hostOK||u.protocol!=='https:'||!read||!navigationOK||['image','media','font'].includes(request.resourceType())){await route.abort();return;}
    if(++requests>options.maxRequests){budgetError=new AppError('TWITTER_REQUEST_BUDGET','X 浏览器请求预算已用尽');await route.abort();abort();return;}
    await route.continue();
   });
   const page=context.pages()[0]||await context.newPage();
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
   cdp.on('Network.loadingFinished',e=>{networkBytes+=e.encodedDataLength;if(networkBytes>options.maxBytes){budgetError=new AppError('TWITTER_BYTE_BUDGET','X 浏览器网络字节预算已用尽');abort();}});
   let rateLimited=false;page.on('response',r=>{if(r.status()===429&&new URL(r.url()).hostname==='x.com')rateLimited=true;});
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:Math.max(1,options.timeoutMs-(Date.now()-started))});
   if(response&&response.status()>=400)throw new AppError(response.status()===429?'TWITTER_RATE_LIMITED':'TWITTER_ACCESS_RESTRICTED',`X 返回 HTTP ${response.status()}`);
   try{await page.locator('article, input[autocomplete="username"], [data-testid="emptyState"]').first().waitFor({state:'attached',timeout:Math.max(1,Math.min(15000,options.timeoutMs-(Date.now()-started)))});}catch{}
   const result=await collectTwitterCards(page,{...options,timeoutMs:Math.max(1,options.timeoutMs-(Date.now()-started))});
   if(rateLimited)throw new AppError('TWITTER_RATE_LIMITED','X 暂时限流，请稍后重试');
   const bytes=Buffer.from(result.html);if(bytes.length+networkBytes>options.maxBytes)throw new AppError('TWITTER_BYTE_BUDGET','X 快照超过剩余字节预算');
   return {requestedUrl:url,finalUrl:twitterURL(page.url()),statusCode:200,headers:{},contentType:'text/html; charset=utf-8',classification:'readable',bytes,capturedAt:new Date().toISOString(),backend:'twitter_authenticated_browser',acquisition:{partial:true,reason:result.reason,observed_posts:result.count,observed_ids:result.ids,last_observed_id:result.ids.at(-1)||null,empty_result:result.reason==='visible_empty_result',network_bytes:networkBytes,request_count:requests,...result.error?{error:result.error}:{}}};
  }catch(e){if(budgetError)throw budgetError;if(options.signal?.aborted)throw new AppError('TWITTER_CANCELLED','X 采集已停止');if(loginRedirect)throw new AppError('TWITTER_LOGIN_REQUIRED','X 登录已失效，请在本机重新登录');throw e;}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(this.context===context)this.context=undefined;await context?.close().catch(()=>{});this.busy=false;}
 }
 async stop(){if(this.busy){await this.context?.close().catch(()=>{});return;}await this.close();}
}
