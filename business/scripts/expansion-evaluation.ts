import { mkdir,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../../data/data_preprocessing/database/store.ts';
import { Embedding } from '../../data/data_preprocessing/RAG/providers/embedding.ts';
import { ClaudeCLI } from '../agents/providers/claude.ts';
import { expandQueryBatch } from '../../data/data_preprocessing/RAG/query-expansion.ts';
import { ingest,retrieve } from '../../data/data_preprocessing/RAG/retrieval.ts';
import { config,businessRoot } from '../shared/config.ts';

// Frozen before the first expanded evaluation. Relevance labels are never sent to the translator.
const topics=[
  {key:'hiring',texts:['Human resource staff spend hours screening job applications and matching candidate experience to job requirements.','人力资源人员筛选求职申请非常耗时，需要核对候选人的工作经历与职位要求。','Kakitangan sumber manusia mengambil masa yang lama untuk menyaring permohonan kerja dan menyemak pengalaman calon.'],queries:['How can recruiters screen candidate applications?','企业招聘人员怎样减少筛选简历的时间？','Bagaimana menyaring permohonan kerja dan pengalaman calon?'],set:'regression'},
  {key:'inventory',texts:['Retail workers need to count stock and receive alerts before inventory runs out.','零售员工需要清点库存，并在商品缺货之前收到补货提醒。','Pekerja kedai perlu mengira stok dan menerima amaran untuk menambah inventori sebelum barang habis.'],queries:['When should store workers replenish stock?','商店如何在商品缺货前补充库存？','Bagaimana mengelakkan stok kedai kehabisan?'],set:'regression'},
  {key:'invoice',texts:['Finance staff track unpaid invoices, contact customers whose payments are overdue, and reconcile incoming payments.','财务人员跟踪尚未付款的发票，联系逾期客户，并核对收到的款项。','Kakitangan kewangan menjejak invois belum dibayar, menghubungi pelanggan yang lewat membayar, dan memadankan bayaran yang diterima.'],queries:['How do finance staff follow up overdue invoices?','财务部门如何跟进客户逾期付款并对账？','Bagaimana jabatan kewangan menjejak invois tertunggak?'],set:'held_out'},
  {key:'support',texts:['Customer service staff assign incoming complaints to the right team and track whether each support ticket is resolved.','客服人员把收到的投诉分配给合适的团队，并跟踪每个服务工单是否已经解决。','Kakitangan perkhidmatan pelanggan mengagihkan aduan kepada pasukan yang sesuai dan menjejak penyelesaian tiket sokongan.'],queries:['How can support agents route and resolve customer complaints?','客服团队如何分配投诉并跟踪工单解决进度？','Bagaimana mengagihkan aduan pelanggan dan menjejak tiket sokongan?'],set:'held_out'},
];
const langs=['en','zh','ms'];
const store=await Store.open(),embedding=new Embedding(config.ollamaUrl,config.embeddingModel);
const cli=new ClaudeCLI({executable:config.cli,workspace:config.cliWorkspace,timeout:180000,noOverageConfirmed:true});
const dir=path.join(businessRoot,'test-results');await mkdir(dir,{recursive:true});
const frozen={topics,thresholds:{recallAt3:0.8,mrr:0.8},limit:3,corpusDocuments:12,translatorSees:'queries only; no corpus, labels or examples',scope:'TEST_ONLY',frozenAt:new Date().toISOString()};
await writeFile(path.join(dir,'expansion-evaluation-fixtures.json'),JSON.stringify(frozen,null,2));
try{
  const c=await store.createCase('TEST_ONLY expansion evaluation','Synthetic retrieval test, not market research');const keys=new Map<string,string>();
  for(const topic of topics)for(let i=0;i<3;i++){const d=await ingest(store,embedding,{caseId:c!.id,collection:'MARKET',title:`TEST_ONLY ${topic.key}-${langs[i]}`,content:topic.texts[i],meta:{synthetic:true,language:langs[i]}});keys.set(d.source_id,`${topic.key}-${langs[i]}`);}
  const queries=topics.flatMap(t=>t.queries.map((query,i)=>({query,language:langs[i],set:t.set,relevant:langs.map(l=>`${t.key}-${l}`)})));
  console.log('Translating 12 synthetic queries in ONE Claude subscription request; corpus and labels are not sent.');
  const expanded=await expandQueryBatch(store,cli,c!.id,queries.map(q=>q.query));const results:any[]=[];
  for(let i=0;i<queries.length;i++){
    const q=queries[i];const baseline=await retrieve(store,embedding,c!.id,q.query,'MARKET',3),result=await retrieve(store,embedding,c!.id,q.query,'MARKET',3,null,expanded[i].variants);
    const metric=(matches:any[])=>{const retrieved=matches.map(m=>keys.get(m.source_id)!);const rank=retrieved.findIndex(k=>q.relevant.includes(k));return {retrieved,recallAt3:retrieved.filter(k=>q.relevant.includes(k)).length/3,reciprocalRank:rank<0?0:1/(rank+1)};};
    results.push({...q,expansion:expanded[i],baseline:metric(baseline.matches),expanded:metric(result.matches)});
  }
  const stats=(set:string,mode:'baseline'|'expanded')=>{const rows=results.filter(r=>set==='all'||r.set===set);return {sampleSize:rows.length,recallAt3:rows.reduce((a,r)=>a+r[mode].recallAt3,0)/rows.length,mrr:rows.reduce((a,r)=>a+r[mode].reciprocalRank,0)/rows.length};};
  const metrics={baseline:{all:stats('all','baseline'),regression:stats('regression','baseline'),heldOut:stats('held_out','baseline')},expanded:{all:stats('all','expanded'),regression:stats('regression','expanded'),heldOut:stats('held_out','expanded')}};
  const passed=expanded.every(r=>r.status==='EXPANDED')&&metrics.expanded.regression.recallAt3>=0.8&&metrics.expanded.heldOut.recallAt3>=0.8&&metrics.expanded.heldOut.mrr>=0.8;
  const report={timestamp:new Date().toISOString(),status:passed?'TEST_PASSED':'PARTIAL',fixture:'TEST_ONLY',model:embedding.fingerprint,cliCalls:1,thresholds:frozen.thresholds,metrics,limitations:['Synthetic small corpus only; not representative production evidence','Held-out queries are new to the previous six-query evaluation; no model training or tuning performed on them','Query translation uses cloud Claude subscription and may fail or drift','This is retrieval comparison, not five-expert versus single-advisor evaluation'],results};
  const name=`expansion-evaluation-${Date.now()}.json`;await writeFile(path.join(dir,name),JSON.stringify(report,null,2));await writeFile(path.join(dir,'expansion-evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,metrics,report:name},null,2));
}finally{await store.close();}
