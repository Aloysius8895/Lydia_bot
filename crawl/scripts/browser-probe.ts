import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {renderPage,browserReadySelector} from '../fetch/browser.ts';
import {fetchPage,decodedBytes,robotsAllowed} from '../fetch/http.ts';
import {Snapshots,crawlStorageRoot} from '../../data/crawl/snapshots.ts';
import {sources,sourceURL} from '../sources/registry.ts';
import {links,plain} from '../sources/ethglobal.ts';
const root=path.join(crawlStorageRoot,'reports',`browser-probe-${Date.now()}`),snapshots=new Snapshots(root);await mkdir(root,{recursive:true});
for(const url of process.argv.slice(2))try{
 const rules=await fetchPage(new URL('/robots.txt',url).href);await snapshots.save(rules);if(rules.statusCode!==404&&(rules.statusCode!==200||!robotsAllowed(decodedBytes(rules).toString('utf8'),url)))throw Error('Robots unavailable or restricted');
 const initial=await fetchPage(url),r=await renderPage(url,{initial,readySelector:browserReadySelector(url.includes('devfolio')?'devfolio':url.includes('taikai')?'taikai':url.includes('hackquest')?'hackquest':'junction',url),allowURL:input=>sources.some(s=>{try{return !!sourceURL(s.id,url)&&!!sourceURL(s.id,input);}catch{return false;}}),maxRequests:80,maxBytes:20*1024*1024,maxSteps:2,timeoutMs:120000,delayMs:2000});const dependencies=[];for(const d of r.dependencies||[])dependencies.push({url:d.finalUrl,status:d.statusCode,...await snapshots.save(d)});const data={url,main:await snapshots.save(r),acquisition:r.acquisition,dependencies,summary:plain(r.bytes.toString('utf8')).slice(0,15000),links:links(r.bytes.toString('utf8'),url).slice(0,100)};await writeFile(path.join(root,'report-'+new URL(url).hostname+'.json'),JSON.stringify(data,null,2));console.log(JSON.stringify({url,root,summary:data.summary.slice(0,3000),links:data.links.slice(0,12),acquisition:r.acquisition}));
}catch(e){await writeFile(path.join(root,'error-'+new URL(url).hostname+'.json'),JSON.stringify({url,error:(e as Error).message},null,2));console.log(JSON.stringify({url,root,error:(e as Error).message}));}
