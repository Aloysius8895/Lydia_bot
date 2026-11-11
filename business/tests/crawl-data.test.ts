import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {Snapshots} from '../../data/data_preprocessing/crawl/snapshots.ts';
import {parseETHGlobal} from '../../crawl/sources/ethglobal.ts';
import {classify} from '../../crawl/fetch/http.ts';
import {selectProjects} from '../../crawl/core/selection.ts';
import {attachProject,syncProjections} from '../../data/data_preprocessing/RAG/crawl-bridge.ts';
import {ingest,retrieve} from '../../data/data_preprocessing/RAG/retrieval.ts';
import {exportCrawl,csvCell} from '../../data/data_preprocessing/crawl/export.ts';
import type {RunConfig,FetchResult} from '../../crawl/types.ts';
import type {Embedding} from '../../data/data_preprocessing/RAG/providers/embedding.ts';

let store:Store,repo:CrawlStore,snapshots:Snapshots,projectId:string,caseId:string,otherCase:string;
const config:RunConfig={sources:['ethglobal'],years:[2025,2026],seeds:[{source:'ethglobal',url:'https://ethglobal.com/showcase/test-project'}],maxPages:10,maxBytes:10000000,maxMinutes:20,delayMs:0,maxAttempts:3,finalistLimitPerEvent:2,finalistLimitTotal:3,selectionSeed:'TEST_ONLY'};
const fixture=(extra='')=>`<!doctype html><title>TEST_ONLY FairDrop | ETHGlobal</title><h1>TEST_ONLY FairDrop</h1><a href="/events/test2026">ETHGlobal TEST_ONLY 2026</a><a href="https://github.com/test-only/fairdrop">Source Code</a><h3>Project Description</h3><p>TEST_ONLY FairDrop verifies participants and discusses why CAPTCHAs are insufficient. A Unicode 测试项目. ${extra}</p><h3>How it's Made</h3><p>Uses TypeScript, evidence retrieval and onchain validation.</p><h2>Join the mailing list</h2><p>NOISE_SHOULD_BE_REMOVED</p>`;
before(async()=>{store=await Store.open();repo=new CrawlStore(store);await repo.init();snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'crawl-data-')));caseId=(await store.createCase('TEST_ONLY primary','test'))!.id;otherCase=(await store.createCase('TEST_ONLY other','test'))!.id;});
after(async()=>store.close());
async function capture(key:string,html:string){await repo.createRun(config,key);const task=await repo.claim();assert.ok(task);const result:FetchResult={requestedUrl:task.url,finalUrl:task.url,statusCode:200,headers:{},contentType:'text/html',classification:classify(200,'text/html',html),bytes:Buffer.from(html),capturedAt:new Date().toISOString(),backend:'test'};const parsed=parseETHGlobal(task.url,html);return repo.finish(task,result,await snapshots.save(result),parsed);}
test('parser preserves implementation sections, Unicode, event evidence and removes footer noise',()=>{
 const html=fixture();assert.equal(classify(200,'text/html',html),'readable');const p=parseETHGlobal(config.seeds![0].url,html).projects[0];assert.equal(p.year,2026);assert.ok(p.content.includes("How it's Made"));assert.ok(p.content.includes('测试项目'));assert.ok(!p.content.includes('NOISE_SHOULD_BE_REMOVED'));assert.equal(p.resources[0].kind,'github');assert.equal(p.awards.length,0);assert.equal(p.stage,'unknown');
 const page=parseETHGlobal('https://ethglobal.com/showcase','<a href="/showcase/x">X</a><a href="/showcase/x">X</a>');assert.equal(page.links.length,1);assert.equal(page.complete,false);
});
test('same capture is idempotent and stable evidence maps to immutable snapshot',async()=>{
 const a=await capture('TEST_ONLY-capture-1',fixture());projectId=a.projectIds[0];await capture('TEST_ONLY-capture-2',fixture());assert.equal((await store.rows('SELECT * FROM crawl_projects')).length,1);assert.equal((await store.rows('SELECT * FROM crawl_project_versions')).length,1);const p=await repo.project(projectId);assert.equal(p.revision,1);assert.ok(p.evidence.every((e:any)=>e.snapshot_id===a.snapshotId));
});
test('origin-specific ingestion handles identical content and metadata-only change without changing ordinary uploads',async()=>{
 const base={caseId,collection:'PROJECT' as const,title:'TEST_ONLY',content:'TEST_ONLY common body with multilingual 证据检索',url:'https://example.com/shared'};
 const a=await ingest(store,null,{...base,originKey:'TEST_ONLY-origin-a',projectionFingerprint:'v1',meta:{year:2025}}),b=await ingest(store,null,{...base,originKey:'TEST_ONLY-origin-b',projectionFingerprint:'v1'});assert.notEqual(a.id,b.id);
 assert.equal((await ingest(store,null,{...base,originKey:'TEST_ONLY-origin-a',projectionFingerprint:'v1'})).id,a.id);
 const updated=await ingest(store,null,{...base,originKey:'TEST_ONLY-origin-a',projectionFingerprint:'v2',meta:{year:2026}});assert.notEqual(updated.id,a.id);assert.equal(updated.meta.year,2026);assert.equal((await store.one('SELECT active FROM documents WHERE id=$1',[b.id]))!.active,true);
 const plain=await ingest(store,null,base);assert.notEqual(plain.id,b.id);assert.equal((await ingest(store,null,base)).id,plain.id);
});
test('PROJECT case import, content change invalidation, and outbox refresh preserve case boundaries',async()=>{
 const first=await attachProject(repo,null,caseId,projectId),repeat=await attachProject(repo,null,caseId,projectId);assert.equal(first.bindings[0].document_id,repeat.bindings[0].document_id);
 assert.equal((await retrieve(store,null,otherCase,'FairDrop','PROJECT')).matches.length,0);assert.equal((await store.evidence(caseId)).length,0);
 await attachProject(repo,null,otherCase,projectId);const oldId=first.bindings[0].document_id;
 await capture('TEST_ONLY-capture-3',fixture('Updated resource revision.'));assert.equal((await store.one('SELECT active FROM documents WHERE id=$1',[oldId]))!.active,false);
 assert.equal((await store.one('SELECT status FROM crawl_rag_bindings WHERE document_id=$1',[oldId]))!.status,'stale');
 await syncProjections(repo,null);const bindings=await store.rows('SELECT * FROM crawl_rag_bindings WHERE project_id=$1',[projectId]);assert.equal(bindings.length,2);assert.ok(bindings.every(b=>b.status==='active'&&b.revision===2));assert.ok((await retrieve(store,null,caseId,'FairDrop','PROJECT')).matches.length);assert.ok((await store.rows('SELECT * FROM crawl_chunk_bindings')).every(c=>c.source_position.basis==='cleaned_project_content'));
});
test('winner selection is unlimited, reproducible and finalist-only quotas hold',()=>{
 const candidates=Array.from({length:10},(_,i)=>({id:'p'+i,winner:i<4,events:[{id:'event'+i%2,source:'TEST_ONLY',year:2026}]}));
 const a=selectProjects(candidates,config),b=selectProjects([...candidates].reverse(),config);assert.deepEqual(a.filter(x=>x.selected).map(x=>x.projectId).sort(),b.filter(x=>x.selected).map(x=>x.projectId).sort());assert.equal(a.filter(x=>x.reason==='verified_winner').length,4);assert.equal(a.filter(x=>x.selected&&x.reason!=='verified_winner').length,3);for(const event of ['event0','event1'])assert.ok(a.filter(x=>x.selected&&x.eventId===event).length<=2);
});
test('CSV formula defense and actual JSON/CSV/Markdown exports retain referenced entities',async()=>{
 assert.equal(csvCell('=SUM(A1)'),`"'=SUM(A1)"`);assert.equal(csvCell('safe'),'"safe"');
 for(const format of ['json','csv','markdown'] as const){const result=await exportCrawl(repo,snapshots,format);assert.ok(result.files);assert.ok(result.counts.projects);const manifest=JSON.parse(await readFile(path.join(result.directory,'manifest.json'),'utf8'));assert.equal(manifest.id,result.id);if(format==='json'){const j=JSON.parse(await readFile(path.join(result.directory,'crawl.json'),'utf8'));assert.equal(j.data.projects[0].id,projectId);}}
});
test('multipart PROJECT import stays invisible until every part is ready',async()=>{
 await capture('TEST_ONLY-large-project',fixture('UniqueMultipartToken '+('bounded text segment. '.repeat(6000))));
 const c=await store.createCase('TEST_ONLY staged projection','test');let calls=0,ready!:()=>void,release!:()=>void;
 const secondPart=new Promise<void>(r=>{ready=r;}),gate=new Promise<void>(r=>{release=r;});
 const embedding={embed:async(texts:string[])=>{if(++calls===2){ready();await gate;}return {vectors:texts.map(()=>[1,0,0]),model:'TEST_ONLY_STAGED',dimension:3};}} as Embedding;
 const pending=attachProject(repo,embedding,c!.id,projectId);await secondPart;
 try{assert.equal((await retrieve(store,null,c!.id,'UniqueMultipartToken','PROJECT')).matches.length,0);}finally{release();}
 const imported=await pending;assert.ok(imported.bindings.length>=2);assert.ok((await retrieve(store,null,c!.id,'UniqueMultipartToken','PROJECT')).matches.length);
});
