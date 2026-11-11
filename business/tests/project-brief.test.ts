import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {AppError} from '../shared/config.ts';
import {BriefWorker,briefPrompt,generateBrief,readSources} from '../backend/project-brief.ts';
import {GitHub} from '../backend/project-sources.ts';
import {KnowledgeAPI} from '../backend/knowledge.ts';
import {seedKnowledge} from './knowledge-fixture.ts';

const reply={problem:'TEST_ONLY 问题。',solution:'TEST_ONLY 方案。',implementation:'来源未说明',missing:['implementation'],
 evidence:[{section:'problem',source:1,quote:'TEST_ONLY'},{section:'solution',source:1,quote:'TEST_ONLY'}]};
const page=(url:string)=>({url,title:'TEST_ONLY page',content:'TEST_ONLY project page for '+url,status:'FETCHED'});
const cliReturning=(data:unknown,calls:string[]=[])=>({run:async(prompt:string,schema:any)=>{calls.push(prompt);assert.equal(schema.$schema,undefined,'the CLI rejects the draft-2020-12 $schema header');return {data,usage:null,session_id:null};}}) as any;
async function open(){const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-briefs-'));const store=await Store.open(path.join(dir,'pg'));await new CrawlStore(store).init();return store;}

test('sources: login-only pages are skipped, failures recorded, at most three pages read',async()=>{
 const fetched:string[]=[];
 const {sources,pages}=await readSources(['https://x.com/a/status/1','https://a.example/1','https://b.example/2','https://c.example/3','https://d.example/4','https://bad.example/'],undefined,
  (async(url:string)=>{if(url.includes('bad'))throw new AppError('SOURCE_TIMEOUT','来源读取超时');fetched.push(url);return page(url);}) as any);
 assert.deepEqual(sources.map(s=>s.status),['skipped','read','read','read','skipped','skipped']);
 assert.equal(pages.length,3);assert.deepEqual(fetched,['https://a.example/1','https://b.example/2','https://c.example/3']);
 const prompt=briefPrompt({title:'TEST_ONLY Demo',source_id:'ethglobal',meta:{imported_summary:'TEST_ONLY summary'}},pages);
 assert.match(prompt,/UNTRUSTED_INPUT_JSON=/);assert.match(prompt,/只使用和「TEST_ONLY Demo」有关的部分/);
});

test('worker writes briefs to their own table without touching the imported project row',async()=>{
 const store=await open();
 try{
  const [a,b,c]=await seedKnowledge(store,3);
  await store.db.query("UPDATE crawl_projects SET meta=meta||$2::jsonb WHERE id=$1",[a.id,JSON.stringify({source_urls:['https://x.com/s/1','https://ethglobal.com/showcase/a']})]);
  await store.db.query("UPDATE crawl_projects SET meta=meta||$2::jsonb WHERE id=$1",[b.id,JSON.stringify({imported_summary:'TEST_ONLY one-line summary'})]);
  const before=await store.one('SELECT * FROM crawl_projects WHERE id=$1',[a.id]);
  const calls:string[]=[];
  const worker=new BriefWorker(store,cliReturning(reply,calls),(async(url:string)=>{if(url.startsWith('https://example.com/'))throw new AppError('SOURCE_HTTP','来源返回 HTTP 404',502);return page(url);}) as any);
  for(let p=await worker.next();p;p=await worker.next())await worker.run(p);
  const ra=await worker.get(a.id),rb=await worker.get(b.id),rc=await worker.get(c.id);
  assert.equal(ra.status,'ready');assert.equal(ra.basis,'source_pages');assert.deepEqual(ra.missing,['implementation']);
  assert.deepEqual(ra.sources.map((s:any)=>s.status),['skipped','read','failed']);
  assert.equal(rb.status,'ready');assert.equal(rb.basis,'summary_only','no readable page: falls back to the package summary');
  assert.equal(rc.status,'failed');assert.equal(rc.error.code,'BRIEF_NO_MATERIAL','nothing to read and no summary: fails without calling Claude');
  assert.equal(calls.length,2);
  assert.deepEqual(await store.one('SELECT * FROM crawl_projects WHERE id=$1',[a.id]),before);
  assert.deepEqual(await worker.status(),{total:3,ready:2,failed:1,running:0,upgrading:0,pending:0,paused:false});
  assert.equal(ra.format,2);assert.deepEqual(ra.evidence.unsupported,[]);assert.equal(ra.evidence.items.length,2);
  assert.equal(rb.evidence.items[0].label,'资料包摘要（第三方整理，可能不准确）','summary-only briefs quote the package summary, marked as third-party');
 }finally{await store.close();}
});

test('Claude being unavailable puts the project back in the queue and pauses the worker',async()=>{
 const store=await open();
 try{
  const [a]=await seedKnowledge(store,1);
  const worker=new BriefWorker(store,{run:async()=>{throw new AppError('CLI_QUOTA_EXHAUSTED','Claude 订阅额度受限',503);}} as any,(async(u:string)=>page(u)) as any);
  await worker.run((await worker.next())!);
  const r=await worker.get(a.id);assert.equal(r.status,'queued');assert.equal(r.paused,true);assert.equal(r.error.code,'CLI_QUOTA_EXHAUSTED');
  await worker.tick();assert.equal((await worker.get(a.id)).attempts,1,'paused: no retry yet');
  await assert.rejects(worker.request('missing'),/项目不存在/);
 }finally{await store.close();}
});

test('new projects stay out of the library until their brief is attempted; older ones are unaffected',async()=>{
 const store=await open();
 try{
  const [old]=await seedKnowledge(store,1);
  await store.db.query("UPDATE crawl_projects SET created_at=now()-interval '2 days' WHERE id=$1",[old.id]);
  await store.setSetting('brief_intake_since',{at:new Date(Date.now()-3600000).toISOString()});
  const [fresh]=await seedKnowledge(store,1);
  const api=new KnowledgeAPI(store,null as any,null as any),list=async()=>(await api.handle('/api/knowledge/projects','GET',async()=>({}),new URL('http://localhost/api/knowledge/projects')))!.data;
  let l=await list();assert.deepEqual(l.items.map((p:any)=>p.id),[old.id]);assert.equal(l.total,1);assert.equal(l.sources[0].count,1);
  const worker=new BriefWorker(store,cliReturning(reply),(async(u:string)=>page(u)) as any);await worker.run((await worker.next())!);
  l=await list();assert.equal(l.total,2,'shown once the brief exists');
  await store.db.query("UPDATE crawl_projects SET created_at=now()-interval '25 hours' WHERE id=$1",[fresh.id]);
  await store.db.query('DELETE FROM project_briefs');assert.equal((await list()).total,2,'never hidden for more than 24 hours');
 }finally{await store.close();}
});

const fakeGitHub=(files:Record<string,string>)=>new GitHub((async(url:string)=>{const body=files[url];return {ok:body!=null,status:body!=null?200:404,headers:{get:()=>null},json:async()=>JSON.parse(body!),text:async()=>body!};}) as any);

test('brief: reads the README of a repo linked from the project page and keeps only quotes found in the material',async()=>{
 const gh=fakeGitHub({'https://raw.githubusercontent.com/acme/demo/HEAD/README.md':'# Demo\nTEST_ONLY readme: the relayer pays gas.'});
 const fetcher=(async(url:string)=>({...page(url),links:['https://github.com/features','https://github.com/acme/demo']})) as any;
 const first={...reply,implementation:'用 relayer 代付 gas。',missing:[],evidence:[{section:'problem',source:1,quote:'TEST_ONLY project page'},{section:'solution',source:1,quote:'invented line not in any page'},{section:'implementation',source:1,quote:'the relayer pays gas'}]};
 const second={...first,solution:'来源未说明',missing:['solution'],evidence:[first.evidence[0],first.evidence[2]]};
 const calls:string[]=[];let n=0;const cli={run:async(prompt:string)=>{calls.push(prompt);return {data:n++?second:first};}} as any;
 const b=await generateBrief(cli,{title:'TEST_ONLY Demo',source_id:'ethglobal',url:'https://ethglobal.com/showcase/demo'},undefined,fetcher,gh);
 assert.deepEqual(b.sources.map(s=>[s.kind,s.status]),[['page','read'],['readme','read']]);
 assert.match(calls[0],/TEST_ONLY readme/,'the README text is given to Claude');
 assert.equal(calls.length,2,'a written section without a findable quote gets one retry');assert.match(calls[1],/solution 段的原文在资料里找不到/);
 assert.deepEqual(b.evidence.unsupported,[]);assert.deepEqual(b.missing,['solution']);assert.equal(b.evidence.dropped,0);
 const impl=b.evidence.items.find(e=>e.section==='implementation')!;
 assert.equal(impl.source,2,'quote found in the README rather than the cited page: re-pointed');assert.equal(impl.kind,'readme');
});

test('upgrading an older brief keeps its text visible, and keeps it when the upgrade fails',async()=>{
 const store=await open();
 try{
  const projects=await seedKnowledge(store,2);
  for(const p of projects)await store.db.query("INSERT INTO project_briefs(project_id,status,basis,problem,solution,implementation,format) VALUES($1,'ready','source_pages','OLD 问题','OLD 方案','OLD 实现',1)",[p.id]);
  let fail=false;const during:string[]=[];
  const cli={run:async(prompt:string)=>{const id=projects.find(p=>prompt.includes(p.title))!.id;during.push((await store.one('SELECT status FROM project_briefs WHERE project_id=$1',[id]))!.status);
   if(fail)throw new AppError('BRIEF_BAD','TEST_ONLY bad answer',502);return {data:reply};}} as any;
  const worker=new BriefWorker(store,cli,(async(u:string)=>page(u)) as any,fakeGitHub({}));
  assert.equal((await worker.status()).upgrading,2);
  const first=(await worker.next())!;await worker.run(first);
  const up=await worker.get(first.id);assert.equal(up.format,2);assert.equal(up.problem,'TEST_ONLY 问题。');assert.ok(up.evidence.items.length);
  fail=true;const second=(await worker.next())!;assert.notEqual(second.id,first.id);await worker.run(second);
  const kept=await worker.get(second.id);assert.equal(kept.status,'ready');assert.equal(kept.problem,'OLD 问题');assert.equal(kept.format,2);assert.equal(kept.upgrade_error.code,'BRIEF_BAD');assert.equal(kept.evidence,null);
  assert.deepEqual(during,['ready','ready'],'never shown as "running" while upgrading');
  assert.ok(!(await worker.next()));assert.equal((await worker.status()).upgrading,0);
 }finally{await store.close();}
});
