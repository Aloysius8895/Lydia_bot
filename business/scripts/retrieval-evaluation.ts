import { writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../../data/data_preprocessing/database/store.ts';
import { Embedding } from '../../data/data_preprocessing/RAG/providers/embedding.ts';
import { ingest,retrieve } from '../../data/data_preprocessing/RAG/retrieval.ts';
import { config,businessRoot } from '../shared/config.ts';
const fixtures=[
  ['hiring','TEST_ONLY Hiring','Synthetic fixture: Human resource staff spend hours screening job applications and matching candidate experience to job requirements.'],
  ['inventory','TEST_ONLY Inventory','Synthetic fixture: Retail workers need to count stock and receive alerts before inventory runs out.'],
  ['hiring-zh','TEST_ONLY 招聘','合成测试资料：人力资源人员筛选求职申请非常耗时，需要核对候选人的工作经历与职位要求。'],
  ['inventory-zh','TEST_ONLY 库存','合成测试资料：零售员工需要清点库存，并在商品缺货之前收到补货提醒。'],
  ['hiring-ms','TEST_ONLY Pengambilan pekerja','Data ujian sintetik: Kakitangan sumber manusia mengambil masa yang lama untuk menyaring permohonan kerja dan menyemak pengalaman calon.'],
  ['inventory-ms','TEST_ONLY Inventori','Data ujian sintetik: Pekerja kedai perlu mengira stok dan menerima amaran untuk menambah inventori sebelum barang habis.'],
];
const queries=[
  {language:'en',query:'How can recruiters screen candidate applications?',relevant:['hiring','hiring-zh','hiring-ms']},
  {language:'zh',query:'企业招聘人员怎样减少筛选简历的时间？',relevant:['hiring','hiring-zh','hiring-ms']},
  {language:'ms',query:'Bagaimana menyaring permohonan kerja dan pengalaman calon?',relevant:['hiring','hiring-zh','hiring-ms']},
  {language:'en',query:'When should store workers replenish stock?',relevant:['inventory','inventory-zh','inventory-ms']},
  {language:'zh',query:'商店如何在商品缺货前补充库存？',relevant:['inventory','inventory-zh','inventory-ms']},
  {language:'ms',query:'Bagaimana mengelakkan stok kedai kehabisan?',relevant:['inventory','inventory-zh','inventory-ms']},
];
const store=await Store.open(),embedding=new Embedding(config.ollamaUrl,config.embeddingModel),results:any[]=[];
try{
  const c=await store.createCase('TEST_ONLY multilingual retrieval','合成评估，无真实市场证据');const keys=new Map<string,string>();
  for(const [key,title,content]of fixtures){const d=await ingest(store,embedding,{caseId:c!.id,collection:'MARKET',title,content,meta:{synthetic:true}});keys.set(d.source_id,key);}
  for(const q of queries){const r=await retrieve(store,embedding,c!.id,q.query,'MARKET',3),retrieved=r.matches.map(x=>keys.get(x.source_id)!);const rank=retrieved.findIndex(x=>q.relevant.includes(x));results.push({...q,mode:r.mode,retrieved,recallAt3:retrieved.filter(x=>q.relevant.includes(x)).length/q.relevant.length,reciprocalRank:rank<0?0:1/(rank+1)});}
  const recall=results.reduce((a,r)=>a+r.recallAt3,0)/results.length,mrr=results.reduce((a,r)=>a+r.reciprocalRank,0)/results.length;
  const report={timestamp:new Date().toISOString(),fixture:'TEST_ONLY',model:embedding.fingerprint,sampleSize:queries.length,metrics:{recallAt3:recall,mrr},predeclaredThresholds:{recallAt3:0.8,mrr:0.8},status:recall>=0.8&&mrr>=0.8&&results.every(r=>r.mode==='HYBRID_RRF')?'TEST_PASSED':'PARTIAL',limitations:['Small synthetic dataset, not market evidence','No independent expert/baseline comparison: canonical skills missing','No broad multilingual quality guarantee from these six queries'],results};
  await mkdir(path.join(businessRoot,'test-results'),{recursive:true});await writeFile(path.join(businessRoot,'test-results','retrieval-evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await store.close();}
