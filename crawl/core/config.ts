import {z} from '../../data/data_preprocessing/crawl/validation.ts';
import {sources} from '../sources/registry.ts';
import {twitterSeed,twitterURL} from '../sources/twitter.ts';

export const runSchema=z.object({
 sources:z.array(z.enum(sources.map(s=>s.id) as [string,...string[]])).min(1).max(sources.length).default(['ethglobal']),
 twitter:z.object({mode:z.enum(['account','search']),value:z.string().trim().min(1).max(512),maxPosts:z.number().int().min(1).max(1000).default(50),maxScrolls:z.number().int().min(0).max(100).default(10),transport:z.enum(['browser','api','interactive']).default('browser')}).optional(),
 years:z.array(z.union([z.literal(2025),z.literal(2026)])).min(1).max(2).default([2025,2026]),
 seeds:z.array(z.object({source:z.string(),url:z.string().url().max(2000)})).max(100).optional(),
 maxPages:z.number().int().min(1).max(100000).default(50),maxBytes:z.number().int().min(1024).max(10*1024**3).default(200*1024**2),
 maxMinutes:z.number().min(1).max(1440).default(20),delayMs:z.number().int().min(2000).max(600000).default(2000),maxAttempts:z.number().int().min(1).max(5).default(3),
 finalistLimitPerEvent:z.number().int().min(0).max(10000).default(20),finalistLimitTotal:z.number().int().min(0).max(100000).default(200),selectionSeed:z.string().min(1).max(100).default('lydia-v1'),
 discovery:z.boolean().default(true),rendering:z.enum(['http','auto','browser']).default('auto'),browserMaxRequests:z.number().int().min(1).max(100).default(80),browserMaxBytes:z.number().int().min(1024).max(50*1024*1024).default(20*1024*1024),browserMaxSteps:z.number().int().min(0).max(10).default(3),browserTimeoutMs:z.number().int().min(5000).max(120000).default(120000),
}).superRefine((config,ctx)=>{
 if(!config.sources.includes('twitter')){if(config.twitter)ctx.addIssue({code:'custom',path:['twitter'],message:'Select Twitter source'});return;}
 try{
  const seeds=config.seeds?.filter(s=>s.source==='twitter')||[];
  if(config.twitter){const seed=twitterSeed(config.twitter.mode,config.twitter.value);if(config.twitter.mode==='account'&&(new URL(seed).pathname==='/search'||new URL(seed).pathname.split('/').filter(Boolean).length!==1))throw Error('Account mode requires a profile');}
  else if(!seeds.length)throw Error('X requires an account, query or seed');
  for(const seed of seeds)twitterURL(seed.url);
 }catch(e){ctx.addIssue({code:'custom',path:['twitter'],message:(e as Error).message});}
 const explicit=config.seeds?.filter(s=>s.source==='twitter')||[];
 if(config.twitter?.transport==='api'&&config.twitter.maxPosts<10&&!(explicit.length>0&&explicit.every(s=>/\/status\/\d+(?:[?#]|$)/.test(s.url))))ctx.addIssue({code:'custom',path:['twitter','maxPosts'],message:'API account/search requires at least 10 posts'});
 if(config.rendering==='http'&&config.twitter?.transport!=='api')ctx.addIssue({code:'custom',path:['rendering'],message:'X requires browser acquisition'});
}).transform(config=>config.sources.includes('twitter')?{...config,rendering:config.twitter?.transport==='api'?config.rendering:'browser' as const,seeds:[...(config.seeds?.filter(s=>s.source!=='twitter')||[]),...(config.seeds?.some(s=>s.source==='twitter')?config.seeds.filter(s=>s.source==='twitter').map(s=>({...s,url:twitterURL(s.url)})):config.twitter?[{source:'twitter',url:twitterSeed(config.twitter.mode,config.twitter.value)}]:[])]}:config);
export function stableJSON(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stableJSON(v)).join(',')+'}';
  return JSON.stringify(value)??'null';
}
