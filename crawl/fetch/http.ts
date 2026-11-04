import http from 'node:http';
import https from 'node:https';
import {validatePublicURL} from '../../data/RAG/sources.ts';
import {AppError} from '../../business/shared/config.ts';
import type {FetchResult} from '../types.ts';
import {gunzipSync,brotliDecompressSync,inflateSync} from 'node:zlib';

export const userAgent='LydiaResearchCrawler/0.1';
export function classify(status:number,type:string,text:string){
  if(/<title[^>]*>\s*(just a moment|attention required)|<title[^>]*>[^<]*captcha|id=["'](?:cf-challenge|challenge-form|captcha-form)["']/i.test(text))return 'challenge';
  if(status===429)return 'rate_limited';
  if(status===401||status===403)return 'access_restricted';
  if(status>=500)return 'temporary_error';
  if(status<200||status>=300)return 'http_error';
  if(!/^(text\/(html|plain)|application\/(json|xml)|text\/xml)/i.test(type))return 'unsupported_format';
  return text.trim()?'readable':'empty';
}
export type FetchOptions={maxBytes?:number;validateRedirect?:(url:string)=>Promise<void>;method?:'GET'|'POST';body?:string;origin?:string};
export function decodedBytes(result:FetchResult,maxBytes=5*1024*1024){
 const encoding=result.headers['content-encoding'],options={maxOutputLength:Math.max(1,maxBytes)};
 const out=encoding==='gzip'?gunzipSync(result.bytes,options):encoding==='br'?brotliDecompressSync(result.bytes,options):encoding==='deflate'?inflateSync(result.bytes,options):result.bytes;
 if(out.length>maxBytes)throw new AppError('SOURCE_SIZE','解压内容超过字节预算');return out;
}
export async function fetchPage(input:string,signal?:AbortSignal,redirects=0,requestedUrl=input,options:FetchOptions={}):Promise<FetchResult>{
  if(redirects>3)throw new AppError('REDIRECT_LIMIT','来源重定向超过上限');
  const {u,address}=await validatePublicURL(input),timeout=AbortSignal.timeout(30000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const r=await new Promise<{code:number;headers:http.IncomingHttpHeaders;bytes:Buffer}>((resolve,reject)=>{
    const transport=u.protocol==='https:'?https:http;
    const req=transport.request(u,{signal:combined,method:options.method||'GET',headers:{'user-agent':userAgent,accept:'*/*','accept-encoding':'identity',...options.method==='POST'?{'content-type':'application/json','content-length':Buffer.byteLength(options.body||'')}: {},...options.origin?{origin:options.origin}:{}},
      lookup:((_host:any,opts:any,cb:any)=>opts?.all?cb(null,[address]):cb(null,address.address,address.family)) as any},res=>{
      if([301,302,303,307,308].includes(res.statusCode||0)){res.resume();resolve({code:res.statusCode!,headers:res.headers,bytes:Buffer.alloc(0)});return;}
      const chunks:Buffer[]=[];let size=0;
      res.on('data',(b:Buffer)=>{size+=b.length;if(size>(options.maxBytes??5*1024*1024))req.destroy(new AppError('SOURCE_SIZE','来源超过本次字节预算'));else chunks.push(b);});
      res.on('end',()=>resolve({code:res.statusCode||0,headers:res.headers,bytes:Buffer.concat(chunks)}));res.on('error',reject);
    });req.on('error',reject);req.end(options.method==='POST'?options.body:undefined);
  });
  if([301,302,303,307,308].includes(r.code)){
    if(!r.headers.location)throw new AppError('REDIRECT_INVALID','重定向缺少地址');
    if(options.method==='POST')throw new AppError('READ_POST_REDIRECT','只读 POST 不自动跟随重定向');
    const next=new URL(r.headers.location,u).href;await options.validateRedirect?.(next);return fetchPage(next,combined,redirects+1,requestedUrl,options);
  }
  const headers:Record<string,string>={};
  for(const key of ['content-type','content-encoding','etag','last-modified','retry-after','cache-control','content-length','access-control-allow-origin','x-ratelimit-remaining','x-ratelimit-reset'])if(r.headers[key])headers[key]=String(r.headers[key]);
  const contentType=headers['content-type']||'';
  const result:FetchResult={requestedUrl,finalUrl:u.href,statusCode:r.code,headers,contentType,bytes:r.bytes,classification:'unclassified',capturedAt:new Date().toISOString(),backend:'http'};
  result.classification=classify(r.code,contentType,decodedBytes(result,options.maxBytes).toString('utf8'));return result;
}

/** RFC 9309 core matching: combine equally-specific groups; longest rule wins, Allow wins ties. */
export function robotsAllowed(text:string,url:string,agent=userAgent){
  const groups:{agents:string[];rules:{allow:boolean;pattern:string}[]}[]=[];let group:{agents:string[];rules:{allow:boolean;pattern:string}[]}|null=null,hasRules=false;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.replace(/#.*$/,'').trim(),colon=line.indexOf(':');if(colon<0)continue;
    const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
    if(key==='user-agent'){
      if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}group.agents.push(value.toLowerCase());
    }else if(group&&['allow','disallow'].includes(key)){hasRules=true;if(value)group.rules.push({allow:key==='allow',pattern:value});}
  }
  const name=agent.split('/')[0].toLowerCase(),score=(g:typeof groups[number])=>Math.max(-1,...g.agents.map(a=>a==='*'?0:a.split('/')[0]===name?name.length:-1)),best=Math.max(-1,...groups.map(score));
  if(best<0)return true;
  const normalize=(s:string)=>s.replace(/%([0-9a-f]{2})/gi,(_,hex)=>{const ch=String.fromCharCode(parseInt(hex,16));return /[\w.~\-]/.test(ch)?ch:'%'+hex.toUpperCase();}).replace(/[^\x00-\x7f]/gu,ch=>encodeURIComponent(ch));
  const path=normalize(new URL(url).pathname+new URL(url).search);let winner={length:-1,allow:true};
  for(const g of groups.filter(g=>score(g)===best))for(const rule of g.rules){
    const end=rule.pattern.endsWith('$'),p=normalize(end?rule.pattern.slice(0,-1):rule.pattern);
    const rx=new RegExp('^'+p.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':''));
    const length=p.replaceAll('*','').length;
    if(rx.test(path)&&(length>winner.length||length===winner.length&&rule.allow))winner={length,allow:rule.allow};
  }
  return winner.allow;
}
export function retryDelay(value:string|undefined,attempt:number){const seconds=value&&/^\d+$/.test(value)?Number(value)*1000:value?Date.parse(value)-Date.now():0;return Math.max(1000,Number.isFinite(seconds)?seconds:0,Math.min(60000,1000*2**attempt));}
