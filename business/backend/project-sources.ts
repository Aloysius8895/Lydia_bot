// Reading helpers shared by project briefs and deep dives:
// - GitHub repos linked from a project (its meta URLs or links on its own page),
// - a repo's README / file tree / manifest files from GitHub,
// - the exact-quote check that ties every AI statement to a line of what was actually read.
import {fetchPublicPage} from '../../data/data_preprocessing/RAG/sources.ts';
import {AppError} from '../shared/config.ts';

export type PageFetcher=(url:string,signal?:AbortSignal)=>Promise<{url:string;content:string;title:string;status:string;links?:string[]}>;
export type HttpGet=(url:string,init:{signal?:AbortSignal;headers:Record<string,string>})=>Promise<{ok:boolean;status:number;headers?:{get(name:string):string|null};json():Promise<any>;text():Promise<string>}>;
export const defaultPage:PageFetcher=fetchPublicPage;
export const defaultHttp:HttpGet=(url,init)=>{
 const timeout=AbortSignal.timeout(15000);
 return fetch(url,{headers:init.headers,signal:init.signal?AbortSignal.any([init.signal,timeout]):timeout});
};
const UA={'user-agent':'CrewPersonalResearch/0.1'};

/** Pages that need a login: don't try, say so. */
export const needsLogin=(url:string)=>/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(url);
const NOT_REPO=new Set(['features','about','login','join','orgs','topics','sponsors','marketplace','pricing','enterprise','security','site','contact','apps','collections','explore','settings','notifications','customer-stories','readme','resources','solutions','team','trending','events','codespaces','copilot','github','ethglobal','devpost','devfolio','hackquest','taikai']);

/** owner/repo for every github.com repository link, in order, without duplicates. */
export function repoLinks(urls:string[]){
 const out:string[]=[];
 for(const url of urls){
  const m=/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:[/?#]|$)/.exec(url);
  if(!m||NOT_REPO.has(m[1].toLowerCase()))continue;
  const repo=m[2].replace(/\.git$/i,'').replace(/\.+$/,'');if(!repo)continue;
  const key=`${m[1]}/${repo}`;if(!out.some(k=>k.toLowerCase()===key.toLowerCase()))out.push(key);
 }
 return out;
}

export const MANIFEST=/(^|\/)(package\.json|foundry\.toml|hardhat\.config\.(js|ts)|Cargo\.toml|Anchor\.toml|Move\.toml|pyproject\.toml|requirements\.txt|go\.mod|app\.json|Scarb\.toml)$/;
export const NOISE=/(^|\/)(node_modules|\.git|dist|build|out|target|vendor|lib\/forge-std|\.next|coverage|artifacts|cache)\/|\.(png|jpe?g|gif|svg|ico|webp|mp4|lock|woff2?|ttf)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;
const README_NAMES=['README.md','readme.md','Readme.md','README.MD','README','README.rst','README.txt'];

/** Public GitHub reads. README and files come from raw.githubusercontent.com (no API quota); repo info and the tree use the API (60 per hour without login). */
export class GitHub {
 http:HttpGet;
 constructor(http:HttpGet=defaultHttp){this.http=http;}
 async api(path:string,signal?:AbortSignal){
  const r=await this.http('https://api.github.com'+path,{signal,headers:{...UA,accept:'application/vnd.github+json'}});
  if(r.status===403||r.status===429){
   const reset=Number(r.headers?.get('x-ratelimit-reset'))||0;
   throw Object.assign(new AppError('GITHUB_RATE_LIMIT','GitHub 访问次数已达上限（每小时 60 次），稍后再试',503),{resetAt:reset?reset*1000:Date.now()+30*60000});
  }
  assert2(r.ok,r.status===404?'仓库不存在或不公开':`GitHub 返回 HTTP ${r.status}`);
  return r.json();
 }
 async raw(key:string,ref:string,path:string,signal?:AbortSignal){
  const r=await this.http(`https://raw.githubusercontent.com/${key}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`,{signal,headers:UA});
  if(!r.ok)return null;
  return r.text();
 }
 /** README text and its page URL, or null when the repo has none (or isn't public). */
 async readme(key:string,signal?:AbortSignal,ref='HEAD'){
  for(const name of README_NAMES){const text=await this.raw(key,ref,name,signal);if(text!=null&&text.trim())return {text,url:`https://github.com/${key}/blob/${ref}/${name}`};}
  return null;
 }
 async repo(key:string,signal?:AbortSignal){return this.api(`/repos/${key}`,signal);}
 async tree(key:string,branch:string,signal?:AbortSignal):Promise<string[]>{
  const t=await this.api(`/repos/${key}/git/trees/${encodeURIComponent(branch)}?recursive=1`,signal);
  return (t.tree||[]).filter((x:any)=>x.type==='blob'&&!NOISE.test(x.path)).map((x:any)=>String(x.path));
 }
}
function assert2(ok:boolean,message:string):asserts ok{if(!ok)throw new AppError('GITHUB_READ_FAILED',message,502);}

/** Text normalised for quote matching: width, case, whitespace, markdown punctuation and quote marks. */
export const normQuote=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[`*_#>|~\[\]()!\\]/g,' ').replace(/[“”"「」『』]/g,'"').replace(/[‘’']/g,"'").replace(/\s+/g,' ').trim();
/** Returns find(quote, prefer): index (0-based) of the text containing the quote verbatim after normalisation, preferring `prefer`; -1 if none. */
export function quoteFinder(texts:string[]){
 const norm=texts.map(normQuote);
 return (quote:string,prefer=-1)=>{
  const q=normQuote(quote.replace(/^[.…\s]+|[.…\s]+$/g,''));
  if(q.length<3)return -1;
  if(prefer>=0&&norm[prefer]?.includes(q))return prefer;
  return norm.findIndex(t=>t.includes(q));
 };
}
