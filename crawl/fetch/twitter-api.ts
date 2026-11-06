import type {FetchResult} from '../types.ts';
import {twitterURL} from '../sources/twitter.ts';
import {apiObject} from '../sources/twitter-api.ts';
import {AppError} from '../../business/shared/config.ts';

export class TwitterAPIError extends AppError {
 retryAt?:string;
 constructor(code:string,message:string,retryAt?:string){super(code,message,503);this.retryAt=retryAt;}
}
export type TwitterAPIOptions={maxPosts:number;maxBytes:number;timeoutMs:number;delayMs:number;signal?:AbortSignal;accountUser?:Record<string,any>};
export class TwitterAPI {
 fetcher:typeof fetch;token:()=>string|undefined;
 constructor(options:{fetcher?:typeof fetch;token?:()=>string|undefined}={}){this.fetcher=options.fetcher||fetch;this.token=options.token||(()=>process.env.X_BEARER_TOKEN?.trim());}
 status(){return {configured:!!this.token(),authentication:'app_only_bearer',search_scope:'recent_7_days'};}
 async acquire(input:string,options:TwitterAPIOptions){
  const token=this.token();if(!token)throw new TwitterAPIError('TWITTER_API_TOKEN_REQUIRED','请在后端环境文件配置 X_BEARER_TOKEN，然后重启后端');
  const origin=new URL(twitterURL(input)),cursor=origin.searchParams.get('_lydia_cursor'),already=Number(origin.searchParams.get('_lydia_count')||0),remaining=options.maxPosts-already;
  const status=/^\/([^/]+)\/status\/(\d+)$/.exec(origin.pathname),search=origin.pathname==='/search';
  if(!status&&remaining<10)throw new TwitterAPIError('TWITTER_API_POST_BUDGET','剩余推文预算小于 API 最小页大小 10，请增加采集条数');
  let bytes=0,lastRequest=0;const dependencies:FetchResult[]=[];
  const deadline=Date.now()+options.timeoutMs,signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(options.timeoutMs)]):AbortSignal.timeout(options.timeoutMs);
  const get=async(path:string,params:Record<string,string>={})=>{
   const url=new URL('https://api.x.com'+path);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
   if(!/^\/2\/(?:tweets(?:\/\d+|\/search\/recent)?|users\/(?:by\/username\/[A-Za-z0-9_]+|\d+\/tweets))$/.test(url.pathname))throw new TwitterAPIError('TWITTER_API_SCOPE','不支持的 X API 路径');
   const wait=Math.max(0,lastRequest+options.delayMs-Date.now());if(wait)await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(new TwitterAPIError('TWITTER_API_CANCELLED','X API 请求已停止'));},timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},wait);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
   signal.throwIfAborted();if(Date.now()>=deadline)throw new TwitterAPIError('TWITTER_API_TIMEOUT','X API 时间预算已用尽');lastRequest=Date.now();
   let response:Response;
   try{response=await this.fetcher(url,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error',signal});}catch{throw new TwitterAPIError(signal.aborted?'TWITTER_API_CANCELLED':'TWITTER_API_NETWORK','X API 请求失败；请检查网络或稍后重试');}
   if(!response.ok){await response.body?.cancel().catch(()=>{});
    if(response.status===401)throw new TwitterAPIError('TWITTER_API_UNAUTHORIZED','Bearer Token 无效或已失效，请检查本机配置');
    if(response.status===402)throw new TwitterAPIError('TWITTER_API_CREDITS','X API 额度不足，请查看开发者控制台');
    if(response.status===403)throw new TwitterAPIError('TWITTER_API_FORBIDDEN','当前 App 无权读取此接口，请检查 X API 权限及额度');
    if(response.status===429){const raw=response.headers.get('retry-after'),reset=Number(response.headers.get('x-rate-limit-reset'));const delay=raw&&/^\d+$/.test(raw)?Number(raw)*1000:raw?Math.max(0,Date.parse(raw)-Date.now()):0;throw new TwitterAPIError('TWITTER_API_RATE_LIMITED','X API 限流，等待官方重置时间后重试',new Date(Math.max(Date.now()+60000,Number.isFinite(reset)?reset*1000:0,Date.now()+(Number.isFinite(delay)?delay:0))).toISOString());}
    throw new TwitterAPIError(response.status>=500?'TWITTER_API_TEMPORARY':'TWITTER_API_HTTP',`X API 返回 HTTP ${response.status}`);
   }
   const reader=response.body?.getReader();if(!reader)throw new TwitterAPIError('TWITTER_API_INVALID_RESPONSE','X API 未返回响应正文');
   const chunks:Uint8Array[]=[];try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>options.maxBytes){await reader.cancel();throw new TwitterAPIError('TWITTER_API_BYTE_BUDGET','X API 响应超过本批字节预算');}chunks.push(chunk.value);}}finally{reader.releaseLock();}
   const body=Buffer.concat(chunks);let payload:unknown;try{payload=JSON.parse(body.toString('utf8'));}catch{throw new TwitterAPIError('TWITTER_API_INVALID_RESPONSE','X API 返回了非 JSON 数据');}
   if(!apiObject(payload))throw new TwitterAPIError('TWITTER_API_INVALID_RESPONSE','X API 返回格式不受支持');
   const headers:Record<string,string>={};for(const key of ['content-type','x-rate-limit-limit','x-rate-limit-remaining','x-rate-limit-reset','retry-after']){const value=response.headers.get(key);if(value)headers[key]=value;}
   const result:FetchResult={requestedUrl:url.href,finalUrl:url.href,statusCode:response.status,headers,contentType:'application/json',classification:'readable',bytes:body,capturedAt:new Date().toISOString(),backend:'twitter_official_api'};
   return {result,payload};
  };
  let user=options.accountUser;
  if(!status&&!search&&!user){const lookup=await get('/2/users/by/username/'+encodeURIComponent(origin.pathname.slice(1)),{'user.fields':'username,name'});dependencies.push(lookup.result);user=lookup.payload.data;if(!apiObject(user)||typeof user.id!=='string'||!/^\d+$/.test(user.id)||typeof user.username!=='string')throw new TwitterAPIError('TWITTER_API_USER_NOT_FOUND','X API 未返回有效账号，请检查用户名和访问权限');}
  const params:Record<string,string>={'tweet.fields':'created_at,author_id,public_metrics,entities,attachments,referenced_tweets,note_tweet','expansions':'author_id,attachments.media_keys','user.fields':'username,name','media.fields':'type,url,preview_image_url,alt_text'};
  if(!status)params.max_results=String(Math.min(100,remaining));
  if(search){params.query=origin.searchParams.get('q')!;if(cursor)params.next_token=cursor;}
  else if(cursor)params.pagination_token=cursor;
  const page=await get(status?'/2/tweets/'+status[2]:search?'/2/tweets/search/recent':'/2/users/'+user!.id+'/tweets',params);
  const payload=page.payload,rows=Array.isArray(payload.data)?payload.data:apiObject(payload.data)?[payload.data]:[];
  if(!rows.length&&!apiObject(payload.meta)&&!Array.isArray(payload.errors))throw new TwitterAPIError('TWITTER_API_INVALID_RESPONSE','X API 未返回推文或结果元数据');
  const nextToken=typeof payload.meta?.next_token==='string'?payload.meta.next_token:null,total=already+rows.length;
  const base=new URL(origin);base.searchParams.delete('_lydia_cursor');base.searchParams.delete('_lydia_count');
  let next:string|null=null;const partial=Array.isArray(payload.errors)&&payload.errors.length>0;
  if(!status&&!partial&&nextToken&&nextToken!==cursor&&options.maxPosts-total>=10){const n=new URL(base);n.searchParams.set('_lydia_cursor',nextToken);n.searchParams.set('_lydia_count',String(total));next=twitterURL(n.href);}
  page.result.dependencies=dependencies;page.result.acquisition={transport:'official_api',account_user:user||null,request_count:dependencies.length+1,partial:partial||!!nextToken,reason:partial?'api_partial_errors':nextToken===cursor&&cursor?'repeated_cursor':next?'more_pages':nextToken?'post_budget':'endpoint_window_exhausted',observed_posts:rows.length,returned_posts_total:total,search_scope:search?'recent_7_days':'user_timeline_or_single_post'};
  return {result:page.result,payload,user,next,collectionKey:base.href,cursor:cursor||'first',terminal:!nextToken&&!partial&&!status,partialErrors:partial};
 }
}
