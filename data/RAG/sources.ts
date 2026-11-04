import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { Store } from '../database/store.ts';
import { Embedding } from './providers/embedding.ts';
import { ingest } from './retrieval.ts';
import { assert, AppError } from '../../business/shared/config.ts';

const blocked4=new BlockList(),blocked6=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as [string,number][])blocked4.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32],['::ffff:0:0',96],['64:ff9b::',96],['2002::',16]] as [string,number][])blocked6.addSubnet(ip,bits,'ipv6');
export function publicIP(ip:string){const family=isIP(ip);return !!family&&!(family===4?blocked4:blocked6).check(ip,family===4?'ipv4':'ipv6');}
export async function validatePublicURL(input:string,resolver=lookup){
  const u=new URL(input);assert(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password,'URL_UNSAFE','仅接受无凭据的公开 HTTP(S) URL');
  assert(!u.port||['80','443'].includes(u.port),'URL_PORT','仅接受公开网页标准端口');
  const host=u.hostname.replace(/^\[|\]$/g,'');assert(host!=='localhost'&&!host.endsWith('.localhost')&&!host.endsWith('.local'),'URL_PRIVATE','禁止访问本地网络');
  let timer:NodeJS.Timeout|undefined;
  const addresses=await Promise.race([resolver(host,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AppError('DNS_TIMEOUT','来源 DNS 查询超时')),5000);})]).finally(()=>clearTimeout(timer));
  assert(addresses.length>0&&addresses.every(a=>publicIP(a.address)),'URL_PRIVATE','来源解析到私有/保留网络');
  return {u,address:addresses[0]};
}
export async function fetchPublic(input:string,signal?:AbortSignal,redirects=0):Promise<{url:string;content:string;title:string;status:string}>{
  assert(redirects<=3,'REDIRECT_LIMIT','重定向次数过多');
  const {u,address}=await validatePublicURL(input);
  const result=await new Promise<{status:number;headers:http.IncomingHttpHeaders;body:string}>((resolve,reject)=>{
    const transport=u.protocol==='https:'?https:http;let size=0;
    const req=transport.get(u,{headers:{'user-agent':'CrewPersonalResearch/0.1','accept':'text/html,text/plain,application/json'},
      lookup:((_host:any,options:any,cb:any)=>options?.all?cb(null,[address]):cb(null,address.address,address.family)) as any,
      signal,timeout:15000},res=>{
      if(res.statusCode&&[301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({status:res.statusCode,headers:res.headers,body:''});return;}
      if(!/^(text\/(html|plain)|application\/json)/i.test(String(res.headers['content-type']||''))){res.resume();reject(new AppError('SOURCE_FORMAT','仅支持可读 HTML、文本或 JSON；PDF 请先转为文本'));return;}
      const chunks:Buffer[]=[];res.on('data',(b:Buffer)=>{size+=b.length;if(size>1024*1024)req.destroy(new AppError('SOURCE_SIZE','页面超过 1 MiB'));else chunks.push(b);});
      res.on('end',()=>resolve({status:res.statusCode||0,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
      res.on('error',reject);
    });req.on('timeout',()=>req.destroy(new AppError('SOURCE_TIMEOUT','来源读取超时')));req.on('error',reject);
  });
  if([301,302,303,307,308].includes(result.status)){assert(result.headers.location,'REDIRECT_INVALID','重定向缺少地址');return fetchPublic(new URL(result.headers.location,u).href,signal,redirects+1);}
  assert(result.status>=200&&result.status<300,'SOURCE_HTTP',`来源返回 HTTP ${result.status}`,502);
  const title=result.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,'').trim()||u.hostname;
  const content=result.body.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<\/(p|div|section|h[1-6]|li|tr)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
  assert(content.length>30,'SOURCE_EMPTY','未读取到足够正文，可能需要登录或动态渲染');
  return {url:u.href,content:content.slice(0,150000),title,status:content.length>150000?'PARTIAL':'FETCHED'};
}
export async function ingestURL(store:Store,embedding:Embedding|null,caseId:string,url:string,signal?:AbortSignal,collection:'MARKET'|'PROJECT'='MARKET'){
  await store.getCase(caseId);const id=randomUUID();
  await store.db.query('INSERT INTO fetch_attempts(id,case_id,url,status,details) VALUES($1,$2,$3,$4,$5)',[id,caseId,url,'NOT_ATTEMPTED',{}]);
  try{
    const result=await fetchPublic(url,signal);
    const doc=await ingest(store,embedding,{caseId,collection,...result,meta:{fetch_status:result.status,published_at:null,speaker:null,region:null,limitations:'公开网页抽取；发布日期/说话者/独立性仍需核实',synthetic:false,source_nature:'PUBLIC_PAGE_UNVERIFIED'}},signal);
    await store.db.query('UPDATE fetch_attempts SET status=$2,details=$3 WHERE id=$1',[id,result.status,{document_id:doc.id}]);return doc;
  }catch(e){await store.db.query('UPDATE fetch_attempts SET status=$2,details=$3 WHERE id=$1',[id,'FAILED',{code:(e as any).code||'FETCH_FAILED',message:'未读取正文；不作为市场证据'}]);throw e;}
}
