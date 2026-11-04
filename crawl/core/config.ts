import {z} from '../../data/crawl/validation.ts';
import {sources} from '../sources/registry.ts';

export const runSchema=z.object({
 sources:z.array(z.enum(sources.map(s=>s.id) as [string,...string[]])).min(1).max(10).default(['ethglobal']),
 years:z.array(z.union([z.literal(2025),z.literal(2026)])).min(1).max(2).default([2025,2026]),
 seeds:z.array(z.object({source:z.string(),url:z.string().url().max(2000)})).max(100).optional(),
 maxPages:z.number().int().min(1).max(100000).default(50),maxBytes:z.number().int().min(1024).max(10*1024**3).default(200*1024**2),
 maxMinutes:z.number().min(1).max(1440).default(20),delayMs:z.number().int().min(2000).max(600000).default(2000),maxAttempts:z.number().int().min(1).max(5).default(3),
 finalistLimitPerEvent:z.number().int().min(0).max(10000).default(20),finalistLimitTotal:z.number().int().min(0).max(100000).default(200),selectionSeed:z.string().min(1).max(100).default('lydia-v1'),
 discovery:z.boolean().default(true),rendering:z.enum(['http','auto','browser']).default('auto'),browserMaxRequests:z.number().int().min(1).max(100).default(80),browserMaxBytes:z.number().int().min(1024).max(50*1024*1024).default(20*1024*1024),browserMaxSteps:z.number().int().min(0).max(10).default(3),browserTimeoutMs:z.number().int().min(5000).max(120000).default(120000),
});
export function stableJSON(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stableJSON(v)).join(',')+'}';
  return JSON.stringify(value)??'null';
}
