import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {TwitterBrowser} from '../fetch/twitter.ts';
import {twitterURL,parseTwitter} from '../sources/twitter.ts';
import {Snapshots,crawlStorageRoot} from '../../data/data_preprocessing/crawl/snapshots.ts';

const input=process.argv[2]||'https://x.com/search?q=hackathon&f=live';
const session=new TwitterBrowser(crawlStorageRoot),snapshots=new Snapshots(),out=path.join(crawlStorageRoot,'twitter-live-check');
await mkdir(out,{recursive:true});
try{
 const result=await session.acquire(twitterURL(input),{visible:true,maxPosts:3,maxScrolls:2,maxBytes:30*1024*1024,maxRequests:100,timeoutMs:90000,delayMs:2500});
 const parsed=parseTwitter(input,result.bytes.toString('utf8')),snapshot=await snapshots.save(result);
 const report={synthetic:false,checked_at:result.capturedAt,transport:'interactive_browser',status:result.acquisition?.error?'blocked':parsed.projects.length?'posts_observed':'empty',posts:parsed.projects.length,ids:parsed.projects.map(p=>p.nativeId),source:input,acquisition:result.acquisition,snapshot};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await writeFile(path.join(out,'posts.json'),JSON.stringify(parsed.projects,null,2));console.log(JSON.stringify(report));
 if(report.status!=='posts_observed')process.exitCode=1;
}catch(e){const report={synthetic:false,checked_at:new Date().toISOString(),transport:'interactive_browser',status:'blocked',code:(e as any).code||'BROWSER_FAILED',message:(e as any).code?(e as Error).message:'Browser request failed; no verified posts captured'};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exitCode=1;}
finally{await session.stop();}
