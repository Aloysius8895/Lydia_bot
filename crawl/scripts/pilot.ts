import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../../data/database/store.ts';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Snapshots,crawlStorageRoot} from '../../data/crawl/snapshots.ts';
import {CrawlWorker} from '../core/worker.ts';
import {runSchema} from '../core/config.ts';
import {exportCrawl} from '../../data/crawl/export.ts';
import {attachProject} from '../../data/RAG/crawl-bridge.ts';
import {retrieve} from '../../data/RAG/retrieval.ts';
import {enqueueOperation} from '../../data/crawl/operations.ts';

const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-live-pilot-')),reportDir=path.join(crawlStorageRoot,'reports',`pilot-${Date.now()}`);await mkdir(reportDir,{recursive:true});
const store=await Store.open(path.join(temp,'pg')),repo=new CrawlStore(store),snapshots=new Snapshots(path.join(reportDir,'storage')),worker=new CrawlWorker(repo,snapshots);await repo.init();
try{
 const config=runSchema.parse({sources:['ethglobal','hackquest'],maxPages:4,seeds:[{source:'ethglobal',url:'https://ethglobal.com/showcase/scalpless-15fnr'},{source:'hackquest',url:'https://www.hackquest.io/projects/LinkWorld-TssqVY'}]});
 const run=await repo.createRun(config,`live-pilot-${Date.now()}`);
 for(let i=0;i<5;i++){await worker.tick();const status=await repo.run(run.id);if(status.status!=='running')break;}
 const projects=await repo.projects();const technical=projects.find(p=>p.source_id==='ethglobal');
 if(technical){await enqueueOperation(repo,'enrich',{project_id:technical.id},`pilot-resource-${Date.now()}`);for(let i=0;i<3;i++)await worker.tick();}
 let rag:unknown=null;if(projects.length){const c=await store.createCase('LIVE_PILOT_ONLY Hackathon retrieval','Isolated technical project retrieval validation');const imported=await attachProject(repo,null,c!.id,projects[0].id);const result=await retrieve(store,null,c!.id,projects[0].title,'PROJECT');rag={case_id:c!.id,imported,matches:result.matches.map(m=>({chunk_id:m.id,url:m.url,source_id:m.source_id})),mode:result.mode};}
 const exports=[];for(const format of ['json','csv','markdown'] as const)exports.push(await exportCrawl(repo,snapshots,format));
 const report={generated_at:new Date().toISOString(),operating_system:process.platform,node:process.version,temporary_database:path.join(temp,'pg'),production_database_touched:false,run:await repo.run(run.id),project_count:projects.length,projects:projects.map(p=>({id:p.id,title:p.title,url:p.url,year:p.meta.year,quality:p.quality})),resource_checks:await store.rows('SELECT id,resource_id,status,content_hash,version_basis FROM crawl_resource_checks'),sources:await store.rows('SELECT * FROM crawl_sources ORDER BY id'),rag,exports,limitations:['Bounded sample only; pagination completeness unknown','No winner/finalist coverage claim','Browser/cloud/Neo4j disabled','README check is not a complete repository audit; no AI analysis performed']};
 await writeFile(path.join(reportDir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.join(reportDir,'report.json'),project_count:projects.length,run_status:report.run.status,rag,export_directories:exports.map(e=>e.directory)},null,2));
 if(!projects.length||!(rag as any)?.matches?.length)process.exitCode=1;
}finally{await worker.stop();await store.close();}
