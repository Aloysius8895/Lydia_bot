import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {GitHub,quoteFinder,repoLinks} from '../backend/project-sources.ts';
import {DeepDiveWorker,collect,reviewSupport,verifyQuotes,type Doc} from '../backend/project-deep-dive.ts';
import {KnowledgeAPI} from '../backend/knowledge.ts';
import {seedKnowledge} from './knowledge-fixture.ts';

async function open(){const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-deep-'));const store=await Store.open(path.join(dir,'pg'));await new CrawlStore(store).init();return store;}
const fakeGitHub=(files:Record<string,string>,seen:string[]=[])=>new GitHub((async(url:string)=>{seen.push(url);const body=files[url];return {ok:body!=null,status:body!=null?200:404,headers:{get:()=>null},json:async()=>JSON.parse(body!),text:async()=>body!};}) as any);

test('repo links: real repositories only, without duplicates, in order',()=>{
 assert.deepEqual(repoLinks(['https://github.com/features/copilot','https://github.com/Acme/App.git','https://github.com/acme/app/tree/main','https://ethglobal.com/x','https://github.com/ethglobal/showcase','https://github.com/b/c?tab=readme-ov-file','https://github.com/solo']),['Acme/App','b/c']);
});

test('quote finder ignores width, case, markdown and line breaks, and prefers the cited text',()=>{
 const find=quoteFinder(['The **relayer** pays\n gas.','the relayer pays gas','ＡＢＣ　テスト']);
 assert.equal(find('the relayer pays gas',1),1);assert.equal(find('The relayer pays gas'),0);
 assert.equal(find('…the relayer pays gas…'),0,'leading/trailing ellipses are not part of the quote');
 assert.equal(find('abc テスト'),2);assert.equal(find('invented line'),-1);assert.equal(find('..'),-1);
});

test('collect: project page, then the repo it links: info, README, filtered file tree and manifests; login pages skipped',async()=>{
 const seen:string[]=[];
 const gh=fakeGitHub({
  'https://api.github.com/repos/acme/demo':JSON.stringify({default_branch:'main',description:'TEST_ONLY demo',topics:[],language:'TypeScript'}),
  'https://raw.githubusercontent.com/acme/demo/main/README.md':'TEST_ONLY README: the card signs a challenge.',
  'https://api.github.com/repos/acme/demo/git/trees/main?recursive=1':JSON.stringify({tree:[{type:'blob',path:'contracts/package.json'},{type:'blob',path:'node_modules/x/index.js'},{type:'blob',path:'app/logo.png'},{type:'tree',path:'contracts'},{type:'blob',path:'contracts/Wallet.sol'}]}),
  'https://raw.githubusercontent.com/acme/demo/main/contracts/package.json':'{"name":"TEST_ONLY"}',
 },seen);
 const page=(async(url:string)=>({url,title:'TEST_ONLY',content:'TEST_ONLY project page. Tap your card.',status:'FETCHED',links:['https://github.com/login','https://github.com/acme/demo']})) as any;
 const steps:string[]=[];
 const {docs,log}=await collect({title:'Demo',url:'https://ethglobal.com/showcase/demo',meta:{source_urls:['https://x.com/a/status/1']}},{page,github:gh,step:s=>{steps.push(s);}});
 assert.deepEqual(docs.map(d=>d.kind),['page','repo','readme','tree','manifest']);
 assert.equal(docs.find(d=>d.kind==='tree')!.text,'contracts/package.json\ncontracts/Wallet.sol','no node_modules, images or folders');
 assert.equal(log.find(l=>l.url.includes('x.com'))!.status,'skipped');
 assert.deepEqual(steps,['正在读取 ethglobal.com 项目页','正在读取 GitHub acme/demo']);
 assert.ok(seen.every(u=>u.startsWith('https://api.github.com/')||u.startsWith('https://raw.githubusercontent.com/')));
});

const docs:Doc[]=[
 {index:1,kind:'page',url:'https://a.example/p',label:'项目页 · a.example',text:'Tap your card on the terminal. Approve with your fingerprint.'},
 {index:2,kind:'readme',url:'https://github.com/t/r',label:'README · t/r',text:'127 tests; the Uniswap ones fork Sepolia.'},
];
const draft={overview:'TEST_ONLY',unknowns:[],sections:[
 {id:'usage' as const,points:[
  {text:'刷卡后用指纹确认',quotes:[{source:1,quote:'Tap your card on the terminal'},{source:1,quote:'Approve with your fingerprint'},{source:2,quote:'an invented second line'}]},
  {text:'编造的一条',quotes:[{source:1,quote:'a line that is in no document'}]}]},
 {id:'evidence' as const,points:[{text:'有 127 个测试，主网已审计',quotes:[{source:1,quote:'127 tests'}]}]},
]};

test('quote check: keeps only quotes found in the material, re-points quotes found in another document, drops points left without any',()=>{
 const q=verifyQuotes(draft,docs);
 assert.equal(q.check.kept,2);assert.equal(q.check.dropped,1);assert.equal(q.check.moved,1);assert.equal(q.check.droppedQuotes,2);
 assert.deepEqual(q.sections[0].points[0].quotes.map(x=>x.quote),['Tap your card on the terminal','Approve with your fingerprint']);
 assert.equal(q.sections[1].points[0].quotes[0].source,2);assert.equal(q.check.droppedPoints[0].text,'编造的一条');
});

test('support review: none removes, partial is kept and marked, a failed review keeps points as unreviewed',async()=>{
 const q=verifyQuotes(draft,docs);
 const reviewed=await reviewSupport({run:async(_p:string,schema:any,_s:any,hooks:any)=>{assert.equal(hooks.tier,'helper');assert.equal(schema.$schema,undefined);
  return {data:{verdicts:[{n:1,support:'full',note:''},{n:2,support:'partial',note:'「主网已审计」没有原文'}]}};}} as any,q.sections);
 assert.equal(reviewed.review.partial,1);assert.equal(reviewed.sections[1].points[0].support,'partial');assert.equal(reviewed.sections[0].points[0].support,'full');
 const removed=await reviewSupport({run:async()=>({data:{verdicts:[{n:1,support:'none',note:'无关'},{n:2,support:'full',note:''}]}})} as any,q.sections);
 assert.equal(removed.review.removed,1);assert.deepEqual(removed.sections.map(s=>s.id),['evidence'],'a section left empty disappears');
 const failed=await reviewSupport({run:async()=>{throw new Error('TEST_ONLY bad answer');}} as any,q.sections);
 assert.equal(failed.review.status,'failed');assert.ok(failed.sections.every(s=>s.points.every(p=>p.support==='unreviewed')));
});

test('deep dive: requested through the API, run once in the background, stored with steps and what was read',async()=>{
 const store=await open();
 try{
  const [p]=await seedKnowledge(store,1);
  const prompts:string[]=[];
  const cli={run:async(prompt:string,schema:any,_s:any,hooks:any)=>{prompts.push(prompt);assert.equal(schema.$schema,undefined);
   if(prompts.length===1){assert.equal(hooks.model.model,'claude-sonnet-5-5');assert.equal(hooks.model.effort,'medium');
    return {data:{overview:'TEST_ONLY 概述',unknowns:['是否上线不清楚'],sections:[{id:'problem',points:[{text:'协调共享容量',quotes:[{source:1,quote:'project coordinates shared capacity'}]}]}]}};}
   return {data:{verdicts:[{n:1,support:'full',note:''}]}};}} as any;
  const page=(async(url:string)=>({url,title:'TEST_ONLY',content:'TEST_ONLY project coordinates shared capacity.',status:'FETCHED',links:[]})) as any;
  const worker=new DeepDiveWorker(store,cli,page,fakeGitHub({}));
  const api=new KnowledgeAPI(store,null as any,null as any,undefined,worker),route='/api/knowledge/projects/'+p.id+'/deep-dive',call=(m:string)=>api.handle(route,m,async()=>({}));
  assert.equal((await call('GET'))!.data.status,'none');
  const started=(await call('POST'))!;assert.equal(started.status,202);assert.equal(started.data.status,'queued');
  await worker.run((await worker.next())!);
  const d=(await call('GET'))!.data;
  assert.equal(d.status,'ready');assert.equal(d.result.check.kept,1);assert.equal(d.result.check.review.status,'done');
  assert.equal(d.result.sections[0].points[0].support,'full');assert.equal(d.result.sources[0].kind,'page');
  assert.deepEqual(d.steps,['正在读取 example.com 项目页','Claude 正在阅读 1 份资料','正在逐条核对原文']);
  assert.equal(d.log[0].status,'read');assert.match(prompts[0],/UNTRUSTED_INPUT_JSON=/);assert.match(prompts[1],/POINTS=/);
  assert.ok(!(await worker.next()),'runs once');
  await assert.rejects(api.handle('/api/knowledge/projects/missing/deep-dive','POST',async()=>({})),/项目不存在/);
 }finally{await store.close();}
});

test('deep dive: nothing readable fails without calling Claude and keeps the reasons',async()=>{
 const store=await open();
 try{
  const [p]=await seedKnowledge(store,1);let called=false;
  const worker=new DeepDiveWorker(store,{run:async()=>{called=true;return {data:{}};}} as any,(async()=>{throw new Error('来源返回 HTTP 404');}) as any,fakeGitHub({}));
  await worker.request(p.id);await worker.run((await worker.next())!);
  const d=await worker.get(p.id);
  assert.equal(d.status,'failed');assert.equal(d.error.code,'DEEP_DIVE_NO_MATERIAL');assert.equal(d.log[0].reason,'来源返回 HTTP 404');assert.equal(called,false);
 }finally{await store.close();}
});

test('library search: only ids from the catalog, brief text in the catalog, pending projects hidden, keyword fallback',async()=>{
 const store=await open();
 try{
  const [a,b]=await seedKnowledge(store,2);
  await store.db.query("UPDATE crawl_projects SET created_at=now()-interval '2 days'");
  await store.db.query("INSERT INTO project_briefs(project_id,status,problem,solution) VALUES($1,'ready','TEST_ONLY 现金换成链上美元','TEST_ONLY 验钞机')",[a.id]);
  await store.setSetting('brief_intake_since',{at:new Date(Date.now()-3600000).toISOString()});
  const [fresh]=await seedKnowledge(store,1);   // new, brief not attempted yet: hidden from the library and from search
  let prompt='';
  const cli={run:async(p:string,_schema:any,_s:any,hooks:any)=>{prompt=p;assert.equal(hooks.tier,'helper');
   return {data:{matches:[{id:a.id,reason:'用验钞机把现金换成链上美元'},{id:'invented-id',reason:'模型编出来的条目'},{id:fresh.id,reason:'还没有简介的新项目'}],note:'找到 1 条'}};}} as any;
  const api=new KnowledgeAPI(store,null as any,null as any,undefined,undefined,cli);
  const r=(await api.handle('/api/knowledge/search','POST',async()=>({query:'现金 上链'})))!.data;
  assert.equal(r.mode,'claude');assert.deepEqual(r.matches.map((m:any)=>m.id),[a.id]);
  assert.match(prompt,/现金换成链上美元/,'the catalog includes the project brief');assert.ok(!prompt.includes(fresh.id),'pending project not offered');
  assert.equal(r.matches[0].item.title,a.title);assert.equal(r.matches[0].item.brief_problem,undefined);assert.equal(r.matches[0].item.kind,'hackathon');
  const fallback=(await new KnowledgeAPI(store,null as any,null as any).handle('/api/knowledge/search','POST',async()=>({query:'QueueLens'})))!.data;
  assert.equal(fallback.mode,'keyword');assert.deepEqual(fallback.matches.map((m:any)=>m.id),[b.id]);assert.match(fallback.note,/结果可能不全/);
  await assert.rejects(api.handle('/api/knowledge/search','POST',async()=>({query:''})));
 }finally{await store.close();}
});
