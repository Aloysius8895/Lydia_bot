import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fetchPage,robotsAllowed} from '../fetch/http.ts';
import {sources} from '../sources/registry.ts';
import {Snapshots,crawlStorageRoot} from '../../data/crawl/snapshots.ts';
import {links,plain} from '../sources/ethglobal.ts';
const directory=path.join(crawlStorageRoot,'reports',`source-audit-${Date.now()}`),snapshots=new Snapshots(directory);await mkdir(directory,{recursive:true});
const results:unknown[]=[];
for(const source of sources){
 const audit:any={source:source.id,name:source.name,entry:source.url,checked_at:new Date().toISOString(),adapter_implemented:source.adapter,years:{2025:'not_verified',2026:'not_verified'},coverage:'unknown',pagination:'not_verified'};
 try{
   const robots=await fetchPage(new URL('/robots.txt',source.url).href),file=await snapshots.save(robots);audit.robots={status:robots.statusCode,classification:robots.classification,...file};
   const permitted=robots.statusCode===404||robots.statusCode===200&&robots.classification==='readable'&&robotsAllowed(robots.bytes.toString('utf8'),source.url);
   audit.robots.entry_allowed=permitted;
   if(!permitted)audit.status='blocked_by_robots_or_unavailable';
   else{await new Promise(r=>setTimeout(r,2000));const entry=await fetchPage(source.url),entryFile=await snapshots.save(entry);audit.response={status:entry.statusCode,classification:entry.classification,final_url:entry.finalUrl,...entryFile};audit.title=entry.bytes.toString('utf8').match(/<title[^>]*>([^]*?)<\/title>/i)?.[1]||null;audit.page_summary=plain(entry.bytes.toString('utf8')).slice(0,500);audit.official_links=links(entry.bytes.toString('utf8'),entry.finalUrl).filter(a=>/2025|2026|project|showcase|result|winner|finalist|archive|terms|rules/i.test(a.text+' '+a.url)).slice(0,30);audit.status=entry.classification==='readable'?'entry_observed_no_coverage_claim':'blocked_'+entry.classification;}
 }catch(e){audit.status='network_or_validation_failure';audit.error={code:(e as any).code||'FETCH_FAILED',message:(e as Error).message};}
 results.push(audit);console.log(JSON.stringify({source:source.id,status:audit.status,response:audit.response?.status,title:audit.title}));
 await writeFile(path.join(directory,'audit.json'),JSON.stringify({checked_at:new Date().toISOString(),environment:{os:process.platform,node:process.version},sources:results},null,2));
}
console.log(JSON.stringify({report:path.join(directory,'audit.json')}));
