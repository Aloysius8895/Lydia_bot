import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {Embedding} from '../../data/data_preprocessing/RAG/providers/embedding.ts';
import {ClaudeCLI} from '../agents/providers/claude.ts';
import {ingest,retrieve} from '../../data/data_preprocessing/RAG/retrieval.ts';
import {expandQueryBatch} from '../../data/data_preprocessing/RAG/query-expansion.ts';
import {rerankBatch} from '../../data/data_preprocessing/RAG/rerank.ts';
import {config,businessRoot} from '../shared/config.ts';
const dir=path.join(businessRoot,'test-results');
const previous=JSON.parse(await readFile(path.join(dir,'expansion-evaluation-fixtures.json'),'utf8'));
const topics=[...previous.topics.map((t:any)=>({...t,set:t.set==='held_out'?'development':t.set})),
  {key:'appointment',set:'new_holdout',texts:['Clinic reception staff schedule patient appointments, send reminders before visits, and help patients reschedule to reduce missed appointments.','诊所前台安排患者预约，在就诊前发送提醒，并帮助患者改期以减少爽约。','Kakitangan kaunter klinik menjadualkan temu janji pesakit, menghantar peringatan sebelum lawatan dan membantu penjadualan semula untuk mengurangkan ketidakhadiran.'],queries:['How can clinic staff remind patients and reschedule appointments?','诊所怎样提醒患者按时就诊并安排预约改期？','Bagaimana mengingatkan pesakit tentang temu janji dan menjadualkannya semula?']}];
const languages=['en','zh','ms'];
const frozen={fixture:'TEST_ONLY',topics,thresholds:{recallAt3:0.8,mrr:0.8},note:'Prior held-out set now development; new appointment queries not previously evaluated. Labels/corpus never sent to translator; reranker receives corpus but not relevance labels.',frozenAt:new Date().toISOString()};
await writeFile(path.join(dir,'rerank-evaluation-fixtures.json'),JSON.stringify(frozen,null,2));
const store=await Store.open(),embed=new Embedding(config.ollamaUrl,config.embeddingModel),cli=new ClaudeCLI({executable:config.cli,workspace:config.cliWorkspace,timeout:180000,noOverageConfirmed:true});
try{
  const c=await store.createCase('TEST_ONLY Rerank evaluation','Not market evidence'),keys=new Map<string,string>();
  for(const topic of topics)for(let i=0;i<3;i++){const d=await ingest(store,embed,{caseId:c!.id,collection:'MARKET',title:`TEST_ONLY ${topic.key}-${languages[i]}`,content:topic.texts[i],meta:{synthetic:true}});keys.set(d.source_id,`${topic.key}-${languages[i]}`);}
  const queries=topics.flatMap((t:any)=>t.queries.map((query:string,i:number)=>({query,language:languages[i],set:t.set,relevant:languages.map(l=>`${t.key}-${l}`)})));
  console.log('Frozen 15-query evaluation: 2 CLI translation batches, then 1 relevance reranking batch.');
  const expanded=[...await expandQueryBatch(store,cli,c!.id,queries.slice(0,12).map((q:any)=>q.query)),...await expandQueryBatch(store,cli,c!.id,queries.slice(12).map((q:any)=>q.query))];
  const base:any[]=[],pools:any[]=[];
  for(let i=0;i<queries.length;i++){base.push(await retrieve(store,embed,c!.id,queries[i].query,'MARKET',3));pools.push(await retrieve(store,embed,c!.id,queries[i].query,'MARKET',20,null,expanded[i].variants));}
  console.log('Candidate collection complete; running relevance judge without gold labels.');
  const ranked=await rerankBatch(store,cli,c!.id,queries.map((q:any,i:number)=>({query:q.query,matches:pools[i].matches,limit:3})));
  const metric=(matches:any[],relevant:string[])=>{const retrieved=matches.map(m=>keys.get(m.source_id)!);const pos=retrieved.findIndex(k=>relevant.includes(k));return {retrieved,recallAt3:retrieved.filter(k=>relevant.includes(k)).length/3,mrr:pos<0?0:1/(pos+1)};};
  const results=queries.map((q:any,i:number)=>({...q,translation:expanded[i],reranking:{status:ranked[i].status,reason:ranked[i].reason},candidateRecall:pools[i].matches.filter((m:any)=>q.relevant.includes(keys.get(m.source_id))).length/3,baseline:metric(base[i].matches,q.relevant),expanded:metric(pools[i].matches.slice(0,3),q.relevant),reranked:metric(ranked[i].matches,q.relevant)}));
  const summary=(set:string,mode:'baseline'|'expanded'|'reranked')=>{const rows=results.filter((r:any)=>set==='all'||r.set===set);return {sampleSize:rows.length,recallAt3:rows.reduce((a:number,r:any)=>a+r[mode].recallAt3,0)/rows.length,mrr:rows.reduce((a:number,r:any)=>a+r[mode].mrr,0)/rows.length};};
  const metrics=Object.fromEntries(['all','regression','development','new_holdout'].map(set=>[set,{baseline:summary(set,'baseline'),expanded:summary(set,'expanded'),reranked:summary(set,'reranked')}]));
  const passed=results.every((r:any)=>r.translation.status==='EXPANDED'&&r.reranking.status==='RERANKED')&&metrics.new_holdout.reranked.recallAt3>=0.8&&metrics.new_holdout.reranked.mrr>=0.8&&metrics.regression.reranked.recallAt3>=0.8;
  const report={timestamp:new Date().toISOString(),status:passed?'TEST_PASSED':'PARTIAL',fixture:'TEST_ONLY',model:embed.fingerprint,cliCallsPlanned:3,wallDurationMs:Date.now()-Date.parse(frozen.frozenAt),usage:{translations:expanded.filter(r=>r.usage).map(r=>r.usage),reranking:ranked.find(r=>r.usage)?.usage||null,billing:'Existing subscription; token counts are not charges or remaining quota'},thresholds:frozen.thresholds,metrics,limitations:['15 small synthetic queries; final holdout only 3; no production quality guarantee','Earlier held-out queries used for diagnosis are now development','Query translation/relevance ranking consumes existing Claude subscription','Retrieval benchmark is separate from blocked real expert/baseline evaluation'],results};
  await writeFile(path.join(dir,`rerank-evaluation-${Date.now()}.json`),JSON.stringify(report,null,2));await writeFile(path.join(dir,'rerank-evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,metrics},null,2));
}finally{await store.close();}
