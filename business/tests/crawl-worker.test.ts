import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../../data/database/store.ts';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Snapshots} from '../../data/crawl/snapshots.ts';
import {CrawlWorker} from '../../crawl/core/worker.ts';
import {parseHackQuest} from '../../crawl/sources/hackquest.ts';
import {parseETHGlobal} from '../../crawl/sources/ethglobal.ts';
import {runSchema} from '../../crawl/core/config.ts';
import {scheduleResources} from '../../crawl/core/enrichment.ts';
import {attachProject} from '../../data/RAG/crawl-bridge.ts';
import type {FetchResult} from '../../crawl/types.ts';
const response=(url:string,status:number,body:string,classification='readable',headers:Record<string,string>={}):FetchResult=>({requestedUrl:url,finalUrl:url,statusCode:status,headers,contentType:'text/html',classification,bytes:Buffer.from(body),capturedAt:new Date().toISOString(),backend:'TEST_ONLY'});

test('worker isolates 200 challenge and obeys Retry-After, budget pause and explicit extension',async()=>{
 const store=await Store.open(),repo=new CrawlStore(store),snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'worker-test-')));await repo.init();let attempts=0;
 const fetcher=async(url:string)=>url.endsWith('/robots.txt')?response(url,200,'User-agent: *\nAllow: /'):++attempts===1?response(url,429,'Too many requests','rate_limited',{'retry-after':'120'}):response(url,200,'<title>Just a moment...</title>','challenge');
 const worker=new CrawlWorker(repo,snapshots,fetcher);try{
  const config={...runSchema.parse({maxPages:1,maxAttempts:2,discovery:false,rendering:'http'}),delayMs:0},run=await repo.createRun(config,'TEST_ONLY-worker-limits');await worker.tick();let r=await repo.run(run.id);assert.equal(r.tasks[0].status,'retry_wait');assert.ok(Date.parse(r.tasks[0].retry_at)>Date.now()+110000);
  await store.db.query('UPDATE crawl_tasks SET retry_at=now() WHERE run_id=$1',[run.id]);await worker.tick();r=await repo.run(run.id);assert.equal(r.status,'paused');assert.equal(r.reason,'budget_exhausted');
  await assert.rejects(repo.control(run.id,'resume'),/扩展/);await repo.control(run.id,'resume',true);await worker.tick();r=await repo.run(run.id);assert.equal(r.tasks[0].status,'blocked');assert.equal((await repo.projects()).length,0);assert.equal((await store.rows('SELECT * FROM crawl_snapshots')).length,2);
 }finally{await worker.stop();await store.close();}
});
test('HackQuest reads public JSON without evaluating scripts and never substitutes creation year for event year',()=>{
 const project={id:'TEST_ONLY-hq',alias:'test-hq',name:'TEST_ONLY HQ',description:'<p>Original project 研究内容 with explicit description.</p>',hackathonId:'event-id',hackathonName:'Event without known year',createdAt:'2026-01-01T12:00:00Z',teachStack:['Java','JavaScript'],winner:[],prizeTrack:['Grants']};
 const html=`<h1>TEST_ONLY HQ</h1><script>self.__next_f.push(${JSON.stringify([1,'a:'+JSON.stringify({project})])})</script>`;
 const parsed=parseHackQuest('https://www.hackquest.io/projects/test-hq',html),p=parsed.projects[0];assert.equal(p.year,null);assert.equal(p.quality,'review');assert.equal(p.awards.length,0);assert.equal(p.evidence.find(e=>e.field==='technology_claim')?.nature,'author_claim');assert.ok(p.content.includes('Java, JavaScript'));
});
test('listing records survive budgets and are upgraded by exact source URL without duplicate identity',async()=>{
 const store=await Store.open(),repo=new CrawlStore(store),snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'listing-test-')));await repo.init();
 try{
  const config={...runSchema.parse({sources:['hackquest'],discovery:false,rendering:'http'}),delayMs:0},run=await repo.createRun(config,'TEST_ONLY-listing-run'),task=await repo.claim();assert.ok(task);
  const list='<a href="/projects/test-alias"><h3>TEST_ONLY List Project</h3><p>Listing description</p></a>',r=response(task.url,200,list),parsed=parseHackQuest(task.url,list);assert.equal(parsed.projects.length,1);
  await repo.finish(task,r,await snapshots.save(r),parsed);const initial=(await repo.projects())[0];assert.ok(initial);assert.equal(initial.meta.record_kind,'listing');
  const detail=await repo.claim();assert.ok(detail);const project={id:'TEST_ONLY-stable-id',alias:'test-alias',name:'TEST_ONLY List Project',description:'<p>Full explicit original project details in a stable public JSON record.</p>',hackathonName:'Event 2026',hackathonId:'event2026'};
  const html=`<script>self.__next_f.push(${JSON.stringify([1,'a:'+JSON.stringify({project})])})</script>`,dr=response(detail.url,200,html);await repo.finish(detail,dr,await snapshots.save(dr),parseHackQuest(detail.url,html));
  const rows=await repo.projects();assert.equal(rows.length,1);assert.equal(rows[0].id,initial.id);assert.equal(rows[0].native_id,project.id);assert.equal(rows[0].meta.record_kind,undefined);
  await repo.createRun(config,'TEST_ONLY-listing-again');const again=await repo.claim();assert.ok(again);await repo.finish(again,response(again.url,200,list),await snapshots.save(r),parsed);assert.ok((await repo.project(initial.id)).content.includes('Full explicit original'));
 }finally{await store.close();}
});
test('bounded README check preserves GitHub blob identity, updates RAG and never executes code',async()=>{
 const store=await Store.open(),repo=new CrawlStore(store),snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'resource-test-')));await repo.init();
 const html='<h1>TEST_ONLY Resource</h1><a href="/events/test2026">TEST_ONLY 2026</a><a href="https://github.com/test-only/repo">Source Code</a><h3>Project Description</h3><p>Original project description with sufficient text to pass the expected detail template.</p><h3>How it is Made</h3><p>Code evidence.</p>';
 try{
  const config={...runSchema.parse({seeds:[{source:'ethglobal',url:'https://ethglobal.com/showcase/resource-test'}]}),delayMs:0},run=await repo.createRun(config,'TEST_ONLY-resource-run'),task=await repo.claim();assert.ok(task);const r=response(task.url,200,html),saved=await repo.finish(task,r,await snapshots.save(r),parseETHGlobal(task.url,html)),id=saved.projectIds[0];
  await scheduleResources(repo,id,run.id);const fetcher=async(url:string)=>url.endsWith('/robots.txt')?response(url,404,'missing','http_error'):response(url,200,JSON.stringify({encoding:'base64',content:Buffer.from('# TEST_ONLY README\n\nUniqueReadmeToken\n```sh\necho NEVER_EXECUTED\n```').toString('base64'),sha:'a'.repeat(40),path:'README.md'}));
  const worker=new CrawlWorker(repo,snapshots,fetcher);await worker.tick();await worker.stop();const p=await repo.project(id);assert.equal(p.resources[0].status,'readme_checked');assert.equal(p.resources[0].version_basis.blob_sha,'a'.repeat(40));assert.equal(p.resources[0].version_basis.code_executed,false);
  const c=await store.createCase('TEST_ONLY resource import','test');const imported=await attachProject(repo,null,c!.id,id);assert.equal(imported.bindings.length,2);assert.ok((await store.rows('SELECT content FROM documents WHERE case_id=$1',[c!.id])).some(d=>d.content.includes('UniqueReadmeToken')));
 }finally{await store.close();}
});
