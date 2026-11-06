import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseTwitter,twitterSeed} from '../../crawl/sources/twitter.ts';
import {parseSource} from '../../crawl/sources/index.ts';
import {sourceURL} from '../../crawl/sources/registry.ts';
import {runSchema} from '../../crawl/core/config.ts';
import {collectTwitterCards,TwitterBrowser,type TwitterPage} from '../../crawl/fetch/twitter.ts';
import {CrawlWorker} from '../../crawl/core/worker.ts';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Snapshots} from '../../data/crawl/snapshots.ts';
import {Store} from '../../data/database/store.ts';
import {exportCrawl} from '../../data/crawl/export.ts';
import {attachProject} from '../../data/RAG/crawl-bridge.ts';
import type {FetchResult} from '../../crawl/types.ts';
import {CrawlAPI} from '../backend/crawl.ts';

const id='1850000000000000001';
const card=(postId=id,body='TEST_ONLY original <img alt="🚀"> text',extra='')=>`<article data-testid="tweet"><div data-testid="User-Name">Test Author @tester</div><a href="/tester/status/${postId}"><time datetime="2024-11-01T12:00:00Z">Nov 1</time></a><div data-testid="tweetText">${body}</div><button data-testid="like" aria-label="1.2K Likes">1.2K</button>${extra}</article>`;
const response=(url:string,body:string):FetchResult=>({requestedUrl:url,finalUrl:url,statusCode:200,headers:{},contentType:'text/html',classification:'readable',bytes:Buffer.from(body),capturedAt:new Date().toISOString(),backend:'TEST_ONLY'});

test('X inputs enforce scope, account semantics and encoded search; no default homepage crawl',()=>{
 assert.equal(twitterSeed('account','@tester'),'https://x.com/tester');
 assert.equal(sourceURL('twitter','https://twitter.com/tester/status/'+id+'?s=20'),'https://x.com/tester/status/'+id);
 const query='AI & robotics #demo';assert.equal(new URL(twitterSeed('search',query)).searchParams.get('q'),query);
 for(const url of ['http://x.com/tester','https://x.com.evil.test/tester','https://x.com/settings','https://x.com/i/flow/login','https://x.com/tester/followers','https://x.com/search','https://user:pass@x.com/tester'])assert.throws(()=>sourceURL('twitter',url));
 assert.throws(()=>runSchema.parse({sources:['twitter']}));
 assert.throws(()=>runSchema.parse({sources:['twitter'],twitter:{mode:'account',value:'tester/status/'+id}}));
 assert.throws(()=>runSchema.parse({sources:['twitter'],twitter:{mode:'account',value:'https://x.com/search?q=test'}}));
 assert.throws(()=>runSchema.parse({sources:['twitter'],rendering:'http',twitter:{mode:'account',value:'tester'}}));
 const c=runSchema.parse({sources:['twitter'],twitter:{mode:'search',value:query}});assert.equal(c.rendering,'browser');assert.equal(c.twitter?.maxPosts,50);assert.equal(c.seeds?.length,1);
});

test('X parser isolates quote/reply identities, preserves opaque IDs, emoji and raw metrics',()=>{
 const quote=`<div role="link"><a href="/other/status/1850000000000000002"><time datetime="2026-01-01">date</time></a><div data-testid="tweetText">QUOTED_CONTENT</div><button data-testid="reply">9</button></div>`;
 const html=card(id,undefined,quote)+card('1850000000000000003','A reply')+card();
 const parsed=parseSource('twitter','https://x.com/tester/status/'+id,html,{years:[2025,2026]});
 assert.equal(parsed.projects.length,1);const p=parsed.projects[0],metrics=p.meta.metrics as Record<string,any>;assert.equal(p.nativeId,id);assert.equal(p.year,2024);assert.equal(p.meta.source_nature,'SOCIAL_POST');assert.ok(p.content.includes('🚀'));assert.ok(!p.content.includes('QUOTED_CONTENT'));assert.ok(!p.content.includes('A reply'));assert.equal(metrics.like.display,'1.2K');assert.equal(metrics.reply,null);assert.equal(p.awards.length,0);assert.equal(p.event,undefined);assert.equal(parsed.complete,false);
 const media=parseTwitter('https://x.com/tester',card(id,'','<div data-testid="tweetPhoto"><img alt="Photo description"></div>')).projects[0];assert.equal(media.meta.body_status,'not_provided');assert.ok(media.content.includes('Photo description'));
 assert.equal(parseTwitter('https://x.com/tester','<h1>Log in</h1>').projects.length,0);
});

const options={maxPosts:50,maxScrolls:5,maxBytes:100000,maxRequests:80,timeoutMs:10000,delayMs:0};
function fakePage(frames:string[][],signal:Record<string,boolean>={}):TwitterPage{
 let i=0;return {url:()=> 'https://x.com/tester',locator:undefined as any,waitForTimeout:async()=>{},evaluate:async(fn:any)=>{
  if(String(fn).includes('window.scrollBy')){i++;return;}
  return {cards:frames[Math.min(i,frames.length-1)],challenge:false,login:false,rate:false,empty:false,unavailable:false,...signal};
 }} as TwitterPage;
}
test('scroll collection retains cards removed by virtualization, deduplicates, honors limits and control',async()=>{
 const a=card(),b=card('1850000000000000002','second'),c=card('1850000000000000003','third');
 const result=await collectTwitterCards(fakePage([[a],[b],[b,c]]),options);assert.equal(result.count,3);assert.equal(parseTwitter('https://x.com/tester',result.html).projects.length,3);
 assert.equal((await collectTwitterCards(fakePage([[a,b,c]]),{...options,maxPosts:2})).count,2);
 assert.equal((await collectTwitterCards(fakePage([[a]]),{...options,maxBytes:1})).reason,'byte_budget');
 assert.equal((await collectTwitterCards(fakePage([[a]]),{...options,shouldContinue:async()=>false})).reason,'run_paused_or_cancelled');
 assert.equal((await collectTwitterCards(fakePage([[]],{login:true}),options)).error?.code,'TWITTER_LOGIN_REQUIRED');
 assert.equal((await collectTwitterCards(fakePage([[]],{empty:true}),options)).reason,'visible_empty_result');
 await assert.rejects(collectTwitterCards(fakePage([[a]]),{...options,signal:AbortSignal.abort()}));
});

test('X worker retains robots decision; accepted fixture stores deduplicated social provenance and exports',async()=>{
 const store=await Store.open(),repo=new CrawlStore(store),snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'twitter-test-')));await repo.init();
 let allow=false,acquired=0;const worker=new CrawlWorker(repo,snapshots,async url=>response(url,allow?'User-agent: *\nAllow: /':'User-agent: *\nDisallow: /'));
 worker.twitter.acquire=async url=>{acquired++;return {...response(url,card()),acquisition:{partial:true,network_bytes:10,reason:'post_budget'}};};
 try{
  const config=runSchema.parse({sources:['twitter'],twitter:{mode:'account',value:'tester'}}),run=await repo.createRun(config,'TEST_ONLY-twitter-denied');
  await worker.tick();const blocked=(await repo.run(run.id)).tasks[0];assert.equal(blocked.status,'blocked');assert.equal(blocked.error.code,'ROBOTS_RESTRICTED_OR_UNAVAILABLE');assert.equal(acquired,0);
  allow=true;await store.db.query("UPDATE crawl_sources SET audit=audit-'robots' WHERE id='twitter'");await repo.retryTask(blocked.id,'TEST_ONLY changed robots fixture');
  await worker.tick();assert.equal((await repo.run(run.id)).tasks[0].status,'succeeded');assert.equal(acquired,1);
  const rows=await repo.projects();assert.equal(rows.length,1);assert.equal(rows[0].meta.year,2024);assert.equal(rows[0].native_id,id);
  await repo.createRun(config,'TEST_ONLY-twitter-repeat');await worker.tick();assert.equal((await repo.projects()).length,1);
  const c=await store.createCase('TEST_ONLY X import','test');await attachProject(repo,null,c!.id,rows[0].id);
  const docs=await store.rows('SELECT meta FROM documents WHERE case_id=$1',[c!.id]);assert.equal(docs[0].meta.source_nature,'SOCIAL_POST');
  const exported=await exportCrawl(repo,snapshots,'json'),data=JSON.parse(await readFile(path.join(exported.directory,'crawl.json'),'utf8'));assert.equal(data.data.projects[0].meta.source_nature,'SOCIAL_POST');assert.equal(data.data.events.length,0);
  const markdown=await exportCrawl(repo,snapshots,'markdown'),md=await readFile(path.join(markdown.directory,rows[0].id+'.md'),'utf8');assert.ok(md.includes('SOCIAL_POST'));assert.ok(!md.includes('赛事时实现未知'));
  const api=new CrawlAPI(repo,snapshots,worker);await assert.rejects(api.handle('/api/crawl/twitter/login','POST',new URL('http://localhost'),async()=>({})),/电脑/);
  const session=await api.handle('/api/crawl/twitter/session','GET',new URL('http://localhost'),async()=>({}));assert.ok(session?.data);assert.ok(!JSON.stringify(session?.data).includes('auth_token'));
  const pausedRun=await repo.createRun(config,'TEST_ONLY-twitter-pause');let pauseOnce=true;
  worker.twitter.acquire=async url=>{if(pauseOnce){pauseOnce=false;await repo.control(pausedRun.id,'pause');return {...response(url,card()),acquisition:{reason:'run_paused_or_cancelled'}};}return response(url,card());};
  await worker.tick();let paused=await repo.run(pausedRun.id);assert.equal(paused.status,'paused');assert.equal(paused.tasks[0].status,'retry_wait');
  await repo.control(pausedRun.id,'resume');await worker.tick();paused=await repo.run(pausedRun.id);assert.equal(paused.tasks[0].status,'succeeded');assert.equal((await repo.projects()).length,1);
  const cancelledRun=await repo.createRun(config,'TEST_ONLY-twitter-cancel'),before=(await store.rows('SELECT * FROM crawl_snapshots')).length;
  worker.twitter.acquire=async url=>{await repo.control(cancelledRun.id,'cancel');return response(url,card());};
  await worker.tick();assert.equal((await repo.run(cancelledRun.id)).tasks[0].status,'cancelled');assert.equal((await store.rows('SELECT * FROM crawl_snapshots')).length,before);
 }finally{await worker.stop();await store.close();}
});

test('login session lock prevents concurrent profile use without returning credentials',async()=>{
 const browser=new TwitterBrowser(await mkdtemp(path.join(os.tmpdir(),'twitter-session-')));browser.busy=true;
 await assert.rejects(browser.login(),/正在使用/);await assert.rejects(browser.close(),/正在采集/);await assert.rejects(browser.acquire('https://x.com/tester',options),/关闭/);
 assert.deepEqual(Object.keys(await browser.status()).sort(),['busy','logged_in','login_open','profile_saved']);
 browser.busy=false;let closed=false;browser.launch=async()=>({cookies:async()=>[],close:async()=>{closed=true;}} as any);
 await assert.rejects(browser.acquire('https://x.com/tester',options),e=>(e as any).code==='TWITTER_LOGIN_REQUIRED');assert.equal(closed,true);assert.equal(browser.busy,false);assert.equal(browser.context,undefined);
});
