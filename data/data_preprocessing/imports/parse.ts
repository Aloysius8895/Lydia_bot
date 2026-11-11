import {z} from 'zod';
import {createHash} from 'node:crypto';
export const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function stable(value:any):string {
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const normalizeName=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function canonical(value:string) {
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('SOURCE_URL_INVALID');
 url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key))url.searchParams.delete(key);
 url.searchParams.sort();return url.href.replace(/\/$/,'');
}
const platforms:Record<string,string>={'ETHGlobal':'ethglobal','Microsoft Imagine Cup':'imaginecup','Devfolio':'devfolio','TAIKAI':'taikai','Hackster.io':'hackster','HackQuest':'hackquest','Junction':'junction','NASA Space Apps':'nasa','Google Solution Challenge':'google'};
const text=z.string().max(150000),short=z.string().max(500),link=z.string().max(3000).refine(v=>{try{canonical(v);return true;}catch{return false;}},'SOURCE_URL_INVALID');
const common={type:z.enum(['ai_news','hackathon_project','hackathon_event']),source_urls:z.array(link).max(50).optional(),id:short.optional(),original_date:short.optional(),collected_date:short.optional(),collected_via:text.optional(),tags:z.array(short).max(100).optional(),verification_notes:text.optional(),claims_note:text.optional(),status:text.optional()};
const project=z.object({...common,type:z.literal('hackathon_project'),platform:short,name:z.string().trim().min(1).max(200),idea:text.min(1),implementation:text.optional(),event_and_date_evidence:text.optional(),url:link.optional()}).passthrough();
// A tracked hackathon. Results never come from this record: finalists and
// winners are separate project records linked by event_id or match_names.
const event=z.object({...common,type:z.literal('hackathon_event'),platform:short,name:z.string().trim().min(1).max(200),url:link.optional(),
 submission_deadline:z.string().datetime({offset:true}).optional(),deadline_note:short.optional(),event_dates:short.optional(),
 match_names:z.array(z.string().trim().min(4).max(200)).max(20).optional()}).passthrough();
const news=z.object({...common,type:z.literal('ai_news'),title:z.string().trim().min(1).max(200),summary:text.min(1),source:short.optional(),url:link.optional(),date_display:text.optional()}).passthrough();
export type Prepared={kind:'project'|'news'|'event';title:string;url:string;urls:string[];source:string;summary:string;fingerprint:string;aliases:string[];raw:Record<string,any>;nativeId?:string};
export type InputItem={fileName:string;jsonPath:string;raw:unknown;record?:Prepared;error?:string};
export type InputFile={name:string;sha256:string;items:InputItem[];provenance?:Record<string,unknown>};
export const eventSource=(platform:string)=>platforms[platform]||platform.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'other';
const schemas:Record<string,z.ZodObject<any>>={hackathon_project:project,ai_news:news,hackathon_event:event};
/** Producers write null for "unknown"; read it as an absent optional field. Only declared keys that reject null
 *  are dropped, so no previously accepted record changes and their fingerprints stay the same. */
export function dropNullOptionals(raw:unknown):unknown {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
 const shape=schemas[(raw as any).type]?.shape;if(!shape)return raw;
 const out:Record<string,unknown>={...raw as Record<string,unknown>};
 for(const [key,value] of Object.entries(out))if(value===null&&shape[key]&&!shape[key].safeParse(null).success&&shape[key].safeParse(undefined).success)delete out[key];
 return out;
}
export function prepare(raw:unknown):Prepared {
 const parsed=z.discriminatedUnion('type',[project,news,event]).parse(dropNullOptionals(raw));
 const urls=[...new Set([...(parsed.url?[parsed.url]:[]),...(parsed.source_urls||[])])];
 if(!urls.length)throw new Error('SOURCE_URL_REQUIRED');
 const url=urls[0],fingerprint=digest(stable(parsed));
 if(parsed.type==='ai_news')return {kind:'news',title:parsed.title,url,urls,source:parsed.source||'',summary:parsed.summary,fingerprint,raw:parsed,
  aliases:[...(parsed.id?['id:'+parsed.id]:[]),...urls.map(v=>'url:'+canonical(v))]};
 if(parsed.type==='hackathon_event'){
  // Events may come from platforms Lydia does not crawl yet; keep a readable slug.
  const source=eventSource(parsed.platform);
  return {kind:'event',title:parsed.name,url,urls,source,summary:parsed.deadline_note||'',fingerprint,raw:parsed,
   aliases:[...(parsed.id?['id:event:'+parsed.id]:[]),'name:'+source+':'+normalizeName(parsed.name),...urls.slice(0,1).map(v=>'url:'+canonical(v))]};
 }
 const source=platforms[parsed.platform];if(!source)throw new Error('PROJECT_PLATFORM_UNKNOWN');
 const specific=urls.map(canonical).filter(v=>{
  const u=new URL(v);
  return (source==='ethglobal'&&u.hostname==='ethglobal.com'&&/^\/showcase\/[^/]+$/.test(u.pathname))||
   (source==='devfolio'&&u.hostname.endsWith('devfolio.co')&&/^\/projects\/[^/]+$/.test(u.pathname))||
   (source==='taikai'&&u.hostname==='taikai.network'&&/\/projects\/[^/]+\/idea$/.test(u.pathname))||
   (source==='hackster'&&['hackster.io','www.hackster.io'].includes(u.hostname)&&/^\/[^/]+\/[^/]+-[a-f0-9]{6}$/i.test(u.pathname))||
   (source==='hackquest'&&u.hostname.endsWith('.hackquest.io')&&/^\/projects\/[^/]+$/.test(u.pathname));
 });
 const composite='section:'+source+':'+normalizeName(parsed.name)+':'+canonical(url);
 return {kind:'project',title:parsed.name,url,urls,source,summary:parsed.idea,fingerprint,raw:parsed,
  aliases:[composite,...specific.map(v=>'url:'+source+':'+v),...(parsed.id?['id:'+source+':'+parsed.id]:[])],
  nativeId:'external-grok:'+digest(composite)};
}
export function parseFile(name:string,bytes:Buffer):InputFile {
 if(bytes.length>10*1024*1024)throw new Error('FILE_TOO_LARGE');
 const root=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 const entries:{raw:unknown;jsonPath:string}[]=[];
 if(Array.isArray(root))root.forEach((raw,i)=>entries.push({raw,jsonPath:`$[${i}]`}));
 else if(root&&typeof root==='object'&&(Array.isArray(root.projects)||Array.isArray(root.news)||Array.isArray(root.events))){
  for(const key of ['projects','news','events']){
   if(root[key]!==undefined&&!Array.isArray(root[key]))throw new Error('PACKAGE_ARRAY_REQUIRED');
   (root[key]||[]).forEach((raw:unknown,i:number)=>entries.push({raw,jsonPath:`$.${key}[${i}]`}));
  }
 }else throw new Error('UNSUPPORTED_FILE_STRUCTURE');
 if(entries.length>10000)throw new Error('TOO_MANY_ITEMS');
 return {name,sha256:digest(bytes),items:entries.map(({raw,jsonPath})=>{
  try{return {fileName:name,jsonPath,raw,record:prepare(raw)};}
  catch(error){return {fileName:name,jsonPath,raw,error:error instanceof z.ZodError?'INVALID_FIELDS: '+error.issues.map(i=>i.path.join('.')+':'+i.code).join(', '):(error as Error).message};}
 })};
}
