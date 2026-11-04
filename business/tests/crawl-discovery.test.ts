import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../../data/database/store.ts';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Snapshots} from '../../data/crawl/snapshots.ts';
import {runSchema} from '../../crawl/core/config.ts';
import {parseSource} from '../../crawl/sources/index.ts';
import {blank,makeEvent,outcome,listing} from '../../crawl/sources/discovery.ts';
import {readOnlyGraphQL} from '../../data/crawl/graphql.ts';
import type {ParsedPage} from '../../crawl/types.ts';
async function fixture(){const store=await Store.open(),repo=new CrawlStore(store);await repo.init();const snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'crawl-discovery-')));return {store,repo,snapshots};}
async function capture(env:Awaited<ReturnType<typeof fixture>>,key:string,page:ParsedPage,url='https://ethglobal.com/showcase',source='ethglobal'){
 const config=runSchema.parse({sources:[source],seeds:[{source,url}],discovery:false,rendering:'http'});await env.repo.createRun(config,key);const task=await env.repo.claim();assert.ok(task);const r={requestedUrl:url,finalUrl:url,statusCode:200,headers:{},contentType:'text/html',classification:'readable',bytes:Buffer.from('TEST_ONLY raw response '+key),capturedAt:new Date().toISOString(),backend:'TEST_ONLY'};return env.repo.finish(task,r,await env.snapshots.save(r),page);
}
test('official results arriving first stay pending, match exact project URLs later, never names alone',async()=>{
 const env=await fixture();try{
  const event=makeEvent('test2025','TEST_ONLY Event 2025','https://ethglobal.com/events/test2025',2025,'explicit_edition'),page=blank('TEST_ONLY');page.events=[event];page.outcomes=[outcome(event,{url:'https://ethglobal.com/showcase/team-a',name:'Same name'},'award','Grand Prize','Same name won Grand Prize','TEST_ONLY official result')];
  await capture(env,'TEST_ONLY-results-first',page);let candidates=await env.store.rows('SELECT * FROM crawl_result_candidates');assert.equal(candidates[0].status,'pending');assert.equal((await env.store.rows('SELECT * FROM crawl_awards')).length,0);
  const other=blank('TEST_ONLY');other.projects=[listing('team-b','Same name','https://ethglobal.com/showcase/team-b','TEST_ONLY other project',event)];await capture(env,'TEST_ONLY-other-first',other);assert.equal((await env.store.rows('SELECT * FROM crawl_awards')).length,0);
  const match=blank('TEST_ONLY');match.projects=[listing('team-a','Same name','https://ethglobal.com/showcase/team-a','TEST_ONLY real project',event)];const saved=await capture(env,'TEST_ONLY-exact-target',match);assert.equal(saved.outcomeProjectIds.length,1);candidates=await env.store.rows('SELECT * FROM crawl_result_candidates');assert.equal(candidates[0].status,'matched');assert.equal((await env.store.rows('SELECT * FROM crawl_awards')).length,1);
  const c=await env.store.createCase('TEST_ONLY result projection','test');const p=await env.repo.project(saved.projectIds[0]);assert.ok(p.evidence.some((e:any)=>e.field==='award'&&e.snapshot_id!==p.snapshot_id));
  await env.repo.reviewOutcome(candidates[0].id,candidates[0].revision,'reject','TEST_ONLY erroneous identity revoked');assert.equal((await env.store.one('SELECT verification FROM crawl_awards'))!.verification,'revoked');assert.ok(c!.id);
 }finally{await env.store.close();}
});
test('nomination, grant, regional finalist and Top 100 are not promoted to winners/global finalists',async()=>{
 const env=await fixture();try{
  const event=makeEvent('test2026','TEST_ONLY Event 2026',undefined,2026,'explicit_edition'),page=blank('TEST_ONLY'),p=listing('identity','TEST_ONLY','https://ethglobal.com/showcase/identity','original',event);page.events=[event];page.projects=[p];
  page.outcomes=[outcome(event,{id:p.nativeId},'grant','Grant','grant','g'),outcome(event,{id:p.nativeId},'nomination','Global Nominee','nominee','n'),outcome(event,{id:p.nativeId},'finalist','Regional Finalist','regional','r','regional'),outcome(event,{name:p.title},'finalist','Top 100','top100','t','unknown')];
  await capture(env,'TEST_ONLY-stage-negatives',page);assert.equal((await env.store.rows('SELECT * FROM crawl_awards')).length,0);assert.equal((await env.store.one('SELECT stage FROM crawl_submissions'))!.stage,'unknown');
  const finalists=blank('TEST_ONLY');finalists.events=[event];finalists.outcomes=[outcome(event,{id:p.nativeId},'finalist','Global Finalist','explicit global finalist','official-gf','global_finalist')];await capture(env,'TEST_ONLY-positive-finalist',finalists);assert.equal((await env.store.one('SELECT stage FROM crawl_submissions'))!.stage,'finalist');assert.ok((await env.store.one('SELECT stage_evidence_id FROM crawl_submissions'))!.stage_evidence_id);
 }finally{await env.store.close();}
});
test('pagination records an explicit terminal control and stalls a repeated next cursor',async()=>{
 const env=await fixture();try{
  const config=runSchema.parse({sources:['ethglobal'],seeds:[{source:'ethglobal',url:'https://ethglobal.com/showcase?page=1'}],discovery:false,rendering:'http'}),run=await env.repo.createRun(config,'TEST_ONLY-pagination');
  for(let i=1;i<=2;i++){const task=await env.repo.claim();assert.ok(task);const page=blank('TEST_ONLY');page.projects=[listing('item-'+i,'TEST_ONLY '+i,`https://ethglobal.com/showcase/item-${i}`,'original')];page.next=i===1?'https://ethglobal.com/showcase?page=2':null;page.complete=i===2;page.pagination={collectionKey:'TEST_ONLY-projects',cursor:String(i),...i===2?{terminalEvidence:'disabled Next control'}:{}};const r={requestedUrl:task.url,finalUrl:task.url,statusCode:200,headers:{},contentType:'text/html',classification:'readable',bytes:Buffer.from('TEST_ONLY page '+i),capturedAt:new Date().toISOString(),backend:'TEST_ONLY'};await env.repo.finish(task,r,await env.snapshots.save(r),page);}
  const cov=await env.repo.coverage(run.id);assert.equal(cov[0].terminal_seen,true);assert.equal(cov[0].pages,2);assert.equal(cov[0].stalled,false);
  const p=blank('TEST_ONLY');p.next='https://ethglobal.com/showcase';p.pagination={collectionKey:'TEST_ONLY-loop',cursor:'1'};await capture(env,'TEST_ONLY-loop',p);assert.equal((await env.store.one("SELECT state FROM crawl_discovery_pages WHERE collection_key='TEST_ONLY-loop'"))!.state,'stalled');
 }finally{await env.store.close();}
});
test('official NASA article and Imagine Cup finalist sections produce scoped evidence, not unrelated past wins',()=>{
 const nasa='<article><h1>NASA Announces 2025 Space Apps Challenge Global Winners</h1><p>NASA announced Thursday 2 winners.</p><p><strong>Best Use of Science Award: TEST_ONLY Alpha</strong></p><p>Published science project.</p><p><a href="https://www.spaceappschallenge.org/2025/find-a-team/alpha/?tab=project">Learn more</a></p><p><strong>Local Impact Award: TEST_ONLY Beta</strong></p><p>Published impact project.</p><p><a href="https://www.spaceappschallenge.org/2025/find-a-team/beta/?tab=project">Learn more</a></p></article>';
 const np=parseSource('nasa','https://www.nasa.gov/learning-resources/nasa-2025-global-winners/',nasa);assert.equal(np.projects.length,2);assert.equal(np.outcomes?.length,2);assert.equal(np.complete,true);
 const ms='<h1>Introducing the 2025 Imagine Cup Finalists</h1><div><p>Three teams advancing to the World Championship.</p><h3>Alpha: device</h3><p>Won a different national contest in 2024.</p><h3>Beta: app</h3><p>Original description.</p><h3>Gamma: tool</h3><p>Original description.</p></div>';
 const mp=parseSource('imaginecup','https://techcommunity.microsoft.com/blog/studentdeveloperblog/introducing-the-2025-imagine-cup-finalists/4400243',ms);assert.equal(mp.projects.length,3);assert.equal(mp.outcomes?.filter(o=>o.kind==='award').length,0);assert.ok(mp.outcomes?.every(o=>o.qualification==='global_finalist'));assert.equal(mp.complete,true);
 const prize='<h1>Hackathon prizes</h1><h2>Available Prizes</h2><p>First prize $10000; finalists get hoodies.</p>';const ep=parseSource('ethglobal','https://ethglobal.com/events/test2025/prizes',prize);assert.equal(ep.outcomes?.length,0);
});
test('read-only GraphQL guard parses operations; comments, strings and aliases do not enable mutations',()=>{
 assert.equal(readOnlyGraphQL(JSON.stringify({query:'query Public { projects { name } }'})),true);
 assert.equal(readOnlyGraphQL(JSON.stringify({query:'mutation Change { deleteProject(id:"x") { id } }'})),false);
 assert.equal(readOnlyGraphQL(JSON.stringify({query:'# query harmless\n mutation M { x: deleteProject { id } }'})),false);
 assert.equal(readOnlyGraphQL(JSON.stringify({query:'query Public { project(id:"mutation is just text") { name } }'})),true);
 assert.equal(readOnlyGraphQL(JSON.stringify({query:'query Public { projects { name } }',variables:{apiKey:'TEST_ONLY'}})),false);
 assert.equal(readOnlyGraphQL(JSON.stringify({query:'query { projects(token:"TEST_ONLY") { name } }'})),false);
 assert.equal(readOnlyGraphQL(JSON.stringify({query:'query { projects(filter:{password:"TEST_ONLY"}) { name } }'})),false);
 assert.equal(readOnlyGraphQL('form=value'),false);assert.equal(readOnlyGraphQL(JSON.stringify([{query:'query {x}'}])),false);
});
