import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {TwitterAPI,TwitterAPIError} from '../../crawl/fetch/twitter-api.ts';
import {parseTwitterAPI} from '../../crawl/sources/twitter-api.ts';
import {runSchema} from '../../crawl/core/config.ts';
import {CrawlWorker} from '../../crawl/core/worker.ts';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Store} from '../../data/database/store.ts';
import {Snapshots} from '../../data/crawl/snapshots.ts';
import {CrawlAPI} from '../backend/crawl.ts';

const secret='TEST_ONLY_BEARER_SECRET';
const user={id:'123456789012345678',username:'tester',name:'Test Author'};
const post=(id='1850000000000000001')=>({id,text:'TEST_ONLY post',author_id:user.id,created_at:'2024-11-01T12:00:00Z',public_metrics:{like_count:1234,retweet_count:0}});
const json=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
const options={maxPosts:30,maxBytes:100000,timeoutMs:10000,delayMs:0};

test('official API requires environment credential and exposes only configured state',async()=>{
 let calls=0;const api=new TwitterAPI({token:()=>undefined,fetcher:async()=>{calls++;throw Error('must not send');}});
 await assert.rejects(api.acquire('https://x.com/tester',options),e=>(e as TwitterAPIError).code==='TWITTER_API_TOKEN_REQUIRED');assert.equal(calls,0);assert.equal(api.status().configured,false);
 const enabled=new TwitterAPI({token:()=>secret});assert.equal(enabled.status().configured,true);assert.ok(!JSON.stringify(enabled.status()).includes(secret));
 assert.throws(()=>runSchema.parse({sources:['twitter'],twitter:{mode:'account',value:'tester',transport:'api',maxPosts:1}}));
 assert.equal(runSchema.parse({sources:['twitter'],twitter:{mode:'search',value:'AI',transport:'api'},rendering:'http'}).rendering,'http');
});

test('official API account lookup, pagination, author evidence and precise metrics stay credential-free',async()=>{
 const urls:string[]=[];const api=new TwitterAPI({token:()=>secret,fetcher:async(input,init)=>{
  const url=new URL(String(input));urls.push(url.href);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+secret);assert.equal(init?.redirect,'error');
  return url.pathname.includes('/by/username/')?json({data:user}):json({data:[post()],includes:{users:[user]},meta:{result_count:1,next_token:'opaque_next'}},200,{'set-cookie':'DO_NOT_SAVE','x-rate-limit-remaining':'99'});
 }});
 const page=await api.acquire('https://x.com/tester',options);assert.equal(urls.length,2);assert.ok(urls[0].includes('/2/users/by/username/tester'));assert.ok(urls[1].includes('/2/users/'+user.id+'/tweets'));assert.ok(page.next?.includes('_lydia_cursor=opaque_next'));assert.ok(page.next?.includes('_lydia_count=1'));
 assert.ok(!JSON.stringify(page.result).includes(secret));assert.equal(page.result.headers['set-cookie'],undefined);assert.equal(page.result.dependencies?.length,1);
 const p=parseTwitterAPI('https://x.com/tester',page.payload,page.user).projects[0];assert.equal(p.nativeId,post().id);assert.equal(p.year,2024);assert.equal((p.meta.metrics as any).like_count,1234);assert.equal((p.meta.metrics as any).retweet_count,0);assert.equal((p.meta.metrics as any).reply_count,null);assert.equal(p.meta.author_handle,'tester');
 const next=await api.acquire(page.next!,{...options,accountUser:page.user});assert.equal(urls.length,3);assert.equal(new URL(urls[2]).searchParams.get('pagination_token'),'opaque_next');assert.equal(next.next,null);assert.equal(next.result.acquisition?.reason,'repeated_cursor');
});

test('search uses recent endpoint and next_token; missing authors and partial errors stay explicit',async()=>{
 let requested:URL|undefined;const api=new TwitterAPI({token:()=>secret,fetcher:async input=>{requested=new URL(String(input));return json({data:[post()],meta:{result_count:1}});}});
 const page=await api.acquire('https://x.com/search?q=AI%20%23demo&f=live&_lydia_cursor=cursor&_lydia_count=2',options);
 assert.equal(requested?.pathname,'/2/tweets/search/recent');assert.equal(requested?.searchParams.get('query'),'AI #demo');assert.equal(requested?.searchParams.get('next_token'),'cursor');assert.equal(requested?.searchParams.get('max_results'),'28');assert.equal(page.terminal,true);
 const p=parseTwitterAPI('https://x.com/search?q=AI',page.payload).projects[0];assert.equal(p.meta.author_handle,null);assert.equal(p.url,'https://x.com/i/web/status/'+post().id);assert.equal(p.quality,'review');
 assert.throws(()=>parseTwitterAPI('https://x.com/tester',{data:[{...post(),id:1850000000000000001}]}));
 const partial=new TwitterAPI({token:()=>secret,fetcher:async()=>json({data:[post()],errors:[{detail:secret}],meta:{next_token:'more'}})});
 assert.equal((await partial.acquire('https://x.com/search?q=AI',options)).partialErrors,true);
});

test('API errors never echo server messages or credentials and rate limits honor reset',async()=>{
 for(const [status,code] of [[401,'TWITTER_API_UNAUTHORIZED'],[402,'TWITTER_API_CREDITS'],[403,'TWITTER_API_FORBIDDEN'],[429,'TWITTER_API_RATE_LIMITED'],[503,'TWITTER_API_TEMPORARY']] as const){
  const reset=Math.floor(Date.now()/1000)+120,api=new TwitterAPI({token:()=>secret,fetcher:async()=>json({detail:secret},status,{'x-rate-limit-reset':String(reset)})});
  await assert.rejects(api.acquire('https://x.com/search?q=AI',options),e=>{const err=e as TwitterAPIError;assert.equal(err.code,code);assert.ok(!err.message.includes(secret));if(status===429)assert.ok(Date.parse(err.retryAt!)>=reset*1000);return true;});
 }
 const huge=new TwitterAPI({token:()=>secret,fetcher:async()=>json({data:[post()]})});await assert.rejects(huge.acquire('https://x.com/search?q=AI',{...options,maxBytes:5}),e=>(e as TwitterAPIError).code==='TWITTER_API_BYTE_BUDGET');
 const invalid=new TwitterAPI({token:()=>secret,fetcher:async()=>new Response('<html>bad</html>')});await assert.rejects(invalid.acquire('https://x.com/search?q=AI',options),e=>(e as TwitterAPIError).code==='TWITTER_API_INVALID_RESPONSE');
});

test('worker official API persists cursor tasks without webpage robots, resumes and strips token from exports',async()=>{
 const store=await Store.open(),repo=new CrawlStore(store),snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'x-api-test-')));await repo.init();
 let calls=0;const worker=new CrawlWorker(repo,snapshots,async()=>{throw Error('official API must not fetch webpages');});
 worker.twitterAPI=new TwitterAPI({token:()=>secret,fetcher:async input=>{calls++;const url=new URL(String(input));if(url.pathname.includes('/by/username/'))return json({data:user});return json({data:[post(url.searchParams.has('pagination_token')?'1850000000000000002':undefined)],includes:{users:[user]},meta:{result_count:1,...url.searchParams.has('pagination_token')?{}:{next_token:'page2'}}});}});
 try{
  const config=runSchema.parse({sources:['twitter'],twitter:{mode:'account',value:'tester',transport:'api'}}),run=await repo.createRun(config,'TEST_ONLY-official-api');
  await worker.tick();let state=await repo.run(run.id);assert.equal(state.tasks.length,2);assert.equal((await repo.projects()).length,1);
  await repo.control(run.id,'pause');await worker.tick();assert.equal(calls,2);await repo.control(run.id,'resume');await worker.tick();state=await repo.run(run.id);assert.equal(calls,3);assert.ok(state.tasks.every((t:any)=>t.status==='succeeded'));assert.equal((await repo.projects()).length,2);
  const stored=await store.rows('SELECT headers,acquisition FROM crawl_snapshots');assert.ok(!JSON.stringify(stored).includes(secret));
  const api=new CrawlAPI(repo,snapshots,worker),status=await api.handle('/api/crawl/twitter/api-status','GET',new URL('http://localhost'),async()=>({}));assert.ok(!JSON.stringify(status).includes(secret));
 }finally{await worker.stop();await store.close();}
});

test('explicit interactive browsing uses a visible local browser and avoids legacy robot prefetch',async()=>{
 const store=await Store.open(),repo=new CrawlStore(store),snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'x-interactive-test-')));await repo.init();
 const worker=new CrawlWorker(repo,snapshots,async()=>{throw Error('interactive browsing must not run anonymous prefetch');});let called=false;
 worker.twitter.acquire=async(url,options)=>{called=true;assert.equal(options.visible,true);return {requestedUrl:url,finalUrl:url,statusCode:200,headers:{},contentType:'text/html',classification:'readable',bytes:Buffer.from(`<article data-testid="tweet"><a href="/tester/status/${post().id}"><time datetime="2026-11-01">date</time></a><div data-testid="tweetText">TEST_ONLY interactive post</div></article>`),capturedAt:new Date().toISOString(),backend:'TEST_ONLY'};};
 try{const config=runSchema.parse({sources:['twitter'],twitter:{mode:'account',value:'tester',transport:'interactive'}}),run=await repo.createRun(config,'TEST_ONLY-interactive');await worker.tick();assert.equal(called,true);assert.equal((await repo.run(run.id)).tasks[0].status,'succeeded');assert.equal((await repo.projects()).length,1);}finally{await worker.stop();await store.close();}
});
