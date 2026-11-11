import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fetchPage,robotsAllowed} from '../fetch/http.ts';
import {Snapshots,crawlStorageRoot} from '../../data/data_preprocessing/crawl/snapshots.ts';
import {links,plain} from '../sources/ethglobal.ts';

const directory=path.join(crawlStorageRoot,'reports',`expansion-audit-${Date.now()}`),snapshots=new Snapshots(directory);await mkdir(directory,{recursive:true});
const targets=process.argv.slice(2).length?process.argv.slice(2):[
 'https://ethglobal.com/events','https://ethglobal.com/events/tokyo2026',
 'https://www.hackquest.io/projects?view=hackathons','https://www.hackquest.io/projects/prize-leaderboard',
 'https://devfolio.co/','https://taikai.network/en/eclipse-foundation/hackathons/veles-hack-2026/',
 'https://www.hackster.io/contests','https://www.hackjunction.com/',
 'https://developers.google.com/community/gdsc-solution-challenge',
];
const robots=new Map<string,{status:number;rules:string|null;file:unknown}>(),reports:any[]=[];
for(const url of targets){
 const row:any={url,checked_at:new Date().toISOString()};
 try{
  const origin=new URL(url).origin;
  if(!robots.has(origin)){const r=await fetchPage(origin+'/robots.txt');robots.set(origin,{status:r.statusCode,rules:r.statusCode===200&&['readable','empty'].includes(r.classification)?r.bytes.toString('utf8'):null,file:await snapshots.save(r)});}
  row.robots=robots.get(origin);if(row.robots.status!==404&&(row.robots.rules===null||!robotsAllowed(row.robots.rules,url))){row.status='robots_unavailable_or_disallowed';}
  else{await new Promise(r=>setTimeout(r,2000));const r=await fetchPage(url),html=r.bytes.toString('utf8');row.response={status:r.statusCode,type:r.contentType,classification:r.classification,final_url:r.finalUrl,...await snapshots.save(r)};
   row.title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');row.summary=plain(html).slice(0,14000);
   row.links=links(html,r.finalUrl).filter(a=>/2025|2026|hackathon|projects|showcase|winner|prize|result|finalist|archive|next|past/i.test(a.url+' '+a.text)).slice(0,100);
   row.scripts=[...html.matchAll(/<script\b[^>]*(?:src=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/script>/gi)].slice(-6).map(m=>({src:m[1],sample:m[2].slice(0,900)}));row.status=r.classification;
  }
 }catch(e){row.status='failed';row.error={code:(e as any).code,message:(e as Error).message};}
 reports.push(row);await writeFile(path.join(directory,'audit.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({url,status:row.status,title:row.title,links:row.links?.slice(0,8),error:row.error}));
}
console.log('Report: '+path.join(directory,'audit.json'));
