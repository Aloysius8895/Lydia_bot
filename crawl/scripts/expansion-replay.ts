import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {Store} from '../../data/database/store.ts';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Snapshots,crawlStorageRoot} from '../../data/crawl/snapshots.ts';
import {exportCrawl} from '../../data/crawl/export.ts';
import {runSchema} from '../core/config.ts';
import {parseSource} from '../sources/index.ts';

// Replay saved public responses; no network and no production database access.
const auditDir=process.argv[2];if(!auditDir)throw Error('Pass the expansion-audit directory containing audit.json');
const records=JSON.parse(await readFile(path.join(auditDir,'audit.json'),'utf8'));
const temporary=await mkdtemp(path.join(os.tmpdir(),'crawl-real-replay-')),store=await Store.open(path.join(temporary,'pg')),repo=new CrawlStore(store);
const directory=path.join(crawlStorageRoot,'reports',`expansion-replay-${Date.now()}`),snapshots=new Snapshots(directory);await mkdir(directory,{recursive:true});await repo.init();
try{
 const samples=[];
 for(const [source,host,expected] of [['nasa','www.nasa.gov',10],['imaginecup','techcommunity.microsoft.com',3]] as const){
  const record=records.find((r:any)=>new URL(r.url).hostname===host&&r.response?.relative);assert.ok(record,`Missing saved official ${source} sample`);
  const bytes=await readFile(path.join(auditDir,record.response.relative)),url=record.response.final_url||record.url,parsed=parseSource(source,url,bytes.toString('utf8'));
  assert.equal(parsed.outcomes?.length,expected);assert.equal(parsed.projects.length,expected);
  const run=await repo.createRun(runSchema.parse({sources:[source],seeds:[{source,url}],discovery:false,rendering:'http',maxPages:1}),`real-replay-${source}`);const task=await repo.claim();assert.ok(task);
  const response={requestedUrl:url,finalUrl:url,statusCode:record.response.status,headers:{},contentType:record.response.type,classification:'readable',bytes,capturedAt:record.checked_at,backend:'saved-official-response-replay'};
  await repo.finish(task,response,await snapshots.save(response),parsed);await repo.control(run.id,'cancel');
  const candidates=await store.rows('SELECT outcome_kind,status FROM crawl_result_candidates WHERE source_id=$1',[source]);assert.equal(candidates.filter(c=>c.status==='matched').length,expected);
  samples.push({source,url,captured_at:record.checked_at,projects:parsed.projects.length,outcomes:parsed.outcomes?.length,matched:candidates.length,page_scope_complete:parsed.complete});
 }
 assert.equal((await store.rows("SELECT * FROM crawl_awards WHERE verification='official_verified'")).length,10);
 assert.equal((await store.rows("SELECT * FROM crawl_submissions WHERE stage='finalist'")).length,3);
 const exports=[];for(const format of ['json','csv','markdown'] as const)exports.push(await exportCrawl(repo,snapshots,format));
 const report={created_at:new Date().toISOString(),production_database_touched:false,network_calls:0,temporary_database:temporary,samples,exports,scope:'Saved official 2025 result articles only; not complete source/year coverage'};
 await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.join(directory,'report.json'),samples},null,2));
}finally{await store.close();}
