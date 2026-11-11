import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {MatchWorker,excerpt,place,titlesForRefs} from '../backend/project-match.ts';
import {KnowledgeAPI} from '../backend/knowledge.ts';
import {IdeaLab} from '../agents/idea-lab.ts';
import {seedKnowledge} from './knowledge-fixture.ts';

async function open(){const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-match-'));const store=await Store.open(path.join(dir,'pg'));await new CrawlStore(store).init();return store;}
async function brief(store:Store,id:string,quotes:string[]){
 await store.db.query(`INSERT INTO project_briefs(project_id,status,basis,problem,solution,implementation,format,evidence,generated_at)
  VALUES($1,'ready','source_pages','TEST_ONLY 问题','TEST_ONLY 方案','TEST_ONLY 实现',2,$2,now())`,
  [id,JSON.stringify({items:quotes.map(q=>({section:'problem',quote:q,label:'TEST_ONLY page',url:'https://example.com/p'}))})]);
}
async function news(store:Store,title:string,summary:string,urls:string[]){
 const id=randomUUID();
 await store.db.query(`INSERT INTO knowledge_news(id,origin_key,title,content,url,publisher,published_at,content_hash,meta) VALUES($1,$2,$3,'',$4,'TEST_ONLY Wire','2026-11-10',$5,$6)`,
  [id,'test:'+id,title,urls[0],id,JSON.stringify({content_kind:'summary_only',imported_summary:summary,source_urls:urls,first_import_batch_id:'TEST_ONLY'})]);
 return id;
}
const ARTICLE='TEST_ONLY Wire reports a supply chain breach at a cloud vendor. Attackers reached the build systems of several developer teams through a compromised dependency. Security teams are now auditing every package they install before it runs in production. The vendor said the intruders kept access for nine days and that customer workloads were not touched, but it asked every team to rotate keys. Analysts expect more teams to add automated package review to their release checklists this quarter.';

test('zones and positions come from the scores only; prompt numbers become titles',()=>{
 assert.deepEqual(place('project',{problem:4,users:3,scene:4,approach:4,tech:5,form:3}).zone,'duplicate');
 assert.deepEqual(place('project',{problem:4,users:3,scene:3,approach:2,tech:2,form:4}).zone,'merge');
 assert.deepEqual(place('project',{problem:0,users:0,scene:0,approach:3,tech:5,form:5}).zone,'transfer');
 assert.deepEqual(place('project',{problem:1,users:1,scene:1,approach:1,tech:1,form:1}).zone,'loose');
 assert.deepEqual(place('news',{problem:3,users:3,scene:3,timing:4,fit:2}),{x:.8,y:.55,zone:'timely'});
 const refs=new Map([['P94','Xpack'],['N36','Fireworks AI 入侵']]);
 assert.equal(titlesForRefs('最值得先看 P94 Xpack：和 T 一样；其次 N36。GPT-6 和 NFT 不变',refs,'router402'),'最值得先看 「Xpack」：和 「router402」 一样；其次 「Fireworks AI 入侵」。GPT-6 和 NFT 不变');
 assert.equal(titlesForRefs('P999 不在库里',refs,'x'),'P999 不在库里','unknown numbers are left alone');
 assert.match(excerpt('Home\nNews\n'+ARTICLE),/^TEST_ONLY Wire reports/,'short navigation lines are dropped');
});

test('作品 × 作品: queued through the API, one Sonnet call, citations checked, later arrivals counted',async()=>{
 const store=await open();
 try{
  const [t,x,y]=await seedKnowledge(store,3);
  const [a,b]=[x,y].sort((p,q)=>p.title<q.title?-1:1);   // prompt numbers follow title order: a=P1, b=P2
  await brief(store,t.id,['target reads bank cards']);await brief(store,a.id,['also reads bank cards']);await brief(store,b.id,['a hardware wallet']);
  const prompts:string[]=[];
  const cli={run:async(prompt:string,schema:any,_s:any,hooks:any)=>{prompts.push(prompt);assert.equal(schema.$schema,undefined);
   assert.equal(hooks.model.model,'claude-sonnet-5-5');assert.equal(hooks.model.effort,'medium');
   return {data:{summary:'最值得先看 P1，和 T 做法一样',matches:[
    {ref:'P1',axes:{problem:4,users:4,scene:4,approach:5,tech:5,form:4},reason:'P1 和 T 都读银行卡',combo:'',evidence:['T.1','P1.1']},
    {ref:'P2',axes:{problem:4,users:3,scene:3,approach:1,tech:2,form:3},reason:'同一群人，做法不同',combo:'把硬件屏幕加到刷卡流程',evidence:['T.1','P2.1']},
    {ref:'P2',axes:{problem:1,users:1,scene:1,approach:1,tech:1,form:1},reason:'重复',combo:'',evidence:['T.1','P2.1']},
    {ref:'P1',axes:{problem:1,users:1,scene:1,approach:1,tech:1,form:1},reason:'重复',combo:'',evidence:['T.1','P1.1']},
    {ref:'P77',axes:{problem:1,users:1,scene:1,approach:1,tech:1,form:1},reason:'不存在',combo:'',evidence:['T.1','P77.1']},
   ]},usage:{output_tokens:10}};}} as any;
  const worker=new MatchWorker(store,cli,(async()=>{throw new Error('project mode reads no pages');}) as any);
  const api=new KnowledgeAPI(store,null as any,null as any,undefined,undefined,undefined,worker);
  const route='/api/knowledge/projects/'+t.id+'/match',call=(m:string,mode='project')=>api.handle(route,m,async()=>({}),new URL('http://x'+route+'?mode='+mode));
  const none=(await call('GET'))!.data;assert.equal(none.status,'none');assert.equal(none.candidates,2);assert.equal(prompts.length,0,'GET never calls Claude');
  const queued=(await call('POST'))!;assert.equal(queued.status,202);assert.equal(queued.data.status,'queued');
  await worker.run((await worker.next())!);
  assert.ok(!(await worker.next()),'runs once');
  const d=(await call('GET'))!.data;
  assert.equal(d.status,'ready',JSON.stringify(d.error));assert.equal(prompts.length,1);
  assert.match(prompts[0],/P1 TEST_ONLY .*\n  问题：TEST_ONLY 问题/);assert.match(prompts[0],/P1\.1 \[problem\] "also reads bank cards"/);
  assert.deepEqual(d.result.check,{returned:5,kept:2,dropped:3},'a repeated candidate and an unknown number are dropped');
  const [dup,merge]=d.result.matches;
  assert.equal(dup.id,a.id);assert.equal(dup.zone,'duplicate');assert.equal(merge.zone,'merge');
  assert.equal(dup.evidence.target[0].quote,'target reads bank cards');assert.equal(dup.evidence.match[0].quote,'also reads bank cards');
  assert.equal(d.result.summary,`最值得先看 「${a.title}」，和 「${t.title}」 做法一样`);
  assert.equal(d.result.library_ids,undefined,'the compared ids stay on the server');assert.equal(d.added,0);
  assert.deepEqual(d.steps,[`Claude 正在把 ${t.title} 和 2 个作品逐一对照`,'正在核对原文']);
  const [c]=await seedKnowledge(store,1);await brief(store,c.id,['new arrival']);
  assert.equal((await call('GET'))!.data.added,1,'a project that arrived later is counted, not compared');
  assert.equal(prompts.length,1,'and nothing ran again by itself');
  await assert.rejects(api.handle('/api/knowledge/projects/missing/match','POST',async()=>({}),new URL('http://x/?mode=project')),/项目不存在/);
  const [bare]=await seedKnowledge(store,1);
  await assert.rejects(api.handle('/api/knowledge/projects/'+bare.id+'/match','POST',async()=>({}),new URL('http://x/?mode=project')),/还没有简介/);
  await assert.rejects(call('GET','other'),/Invalid option|invalid/i);
 }finally{await store.close();}
});

test('作品 × 新闻: originals are read first and cached; news quotes must come from the original',async()=>{
 const store=await open();
 try{
  const [t]=await seedKnowledge(store,1);await brief(store,t.id,['audits npm packages in a sandbox']);
  const breach=await news(store,'TEST_ONLY A 供应链入侵','云厂商被入侵，开发团队的构建系统受影响。',['https://x.com/someone/status/1','https://wire.example/breach']);
  const paywall=await news(store,'TEST_ONLY B 付费墙','一家公司发布安全模型，仅限获批客户使用。',['https://paywall.example/a']);
  const pages:string[]=[];
  const page=(async(url:string)=>{pages.push(url);if(url.includes('paywall'))throw new Error('HTTP 403');return {url,title:'TEST_ONLY',content:'Menu\n'+ARTICLE,status:'FETCHED',links:[]};}) as any;
  let prompt='';
  const cli={run:async(p:string)=>{prompt=p;return {data:{summary:'先看 N1',matches:[
   {ref:'N1',axes:{problem:4,users:3,scene:3,timing:4,fit:3},reason:'N1 讲依赖被攻破',combo:'借这次事件推广审计',evidence:['T.1'],quotes:['Attackers reached the build systems of several developer teams','这句不在原文里']},
   {ref:'N1',axes:{problem:1,users:1,scene:1,timing:1,fit:1},reason:'重复',combo:'',evidence:['T.1'],quotes:['Attackers reached the build systems']},
   {ref:'N2',axes:{problem:2,users:2,scene:2,timing:3,fit:2},reason:'安全模型',combo:'',evidence:['T.1'],quotes:['一家公司发布安全模型']},
  ]}};}} as any;
  const worker=new MatchWorker(store,cli,page);
  const api=new KnowledgeAPI(store,null as any,null as any,undefined,undefined,undefined,worker);
  const route='/api/knowledge/projects/'+t.id+'/match',url=new URL('http://x'+route+'?mode=news');
  await api.handle(route,'POST',async()=>({}),url);await worker.run((await worker.next())!);
  const d=(await api.handle(route,'GET',async()=>({}),url))!.data;
  assert.equal(d.status,'ready');
  assert.deepEqual(pages.sort(),['https://paywall.example/a','https://wire.example/breach'],'login pages are skipped');
  assert.match(prompt,/原文（wire\.example）：\nTEST_ONLY Wire reports a supply chain breach/);assert.match(prompt,/TEST_ONLY B 付费墙[\s\S]*原文：读不到，只能看摘要/);
  assert.ok(!prompt.includes('Menu\n'),'navigation lines are not sent');
  assert.deepEqual(d.result.check,{returned:3,kept:2,dropped:1},'the repeated news item is dropped');
  const [hit,weak]=d.result.matches;
  assert.equal(hit.id,breach);assert.equal(hit.basis,'original');assert.equal(hit.zone,'timely');
  assert.deepEqual(hit.evidence.match.map((q:any)=>q.quote),['Attackers reached the build systems of several developer teams'],'a sentence not in the original is not shown');
  assert.equal(hit.evidence.match[0].label,'新闻原文 · wire.example');
  assert.equal(weak.id,paywall);assert.equal(weak.basis,'summary');assert.equal(weak.evidence.match[0].label,'Grok 摘要（原文读不到）');
  assert.deepEqual(d.result.news_read,{original:1,summary:1});
  assert.deepEqual(d.steps,['正在读取新闻原文 2/2','Claude 正在读 2 条新闻','正在核对原文'],'reading progress replaces itself');
  const stored=await store.rows('SELECT news_id,status,url,log FROM news_sources ORDER BY status DESC');
  assert.deepEqual(stored.map(r=>r.status),['read','failed']);assert.equal(stored[0].log[0].status,'skipped');assert.match(stored[1].log[0].reason,/403/);
  pages.length=0;await api.handle(route,'POST',async()=>({}),url);await worker.run((await worker.next())!);
  assert.deepEqual(pages,[],'read originals are cached and a failed one is retried only after a day');

  // Idea Lab now uses the original article of a summary-only news item once it has been read.
  const lab=new IdeaLab(store,new CrawlStore(store),cli);
  const run=await lab.create([t.id],{audience:'',region:'',skills:'',time:'',budget:'',theme:''},randomUUID(),[breach]);
  assert.match(run.sources.find((s:any)=>s.kind==='news').content,/supply chain breach/);
  await assert.rejects(lab.create([t.id],{audience:'',region:'',skills:'',time:'',budget:'',theme:''},randomUUID(),[paywall]),/原文还没读到/);
 }finally{await store.close();}
});
