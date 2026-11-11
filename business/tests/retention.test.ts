import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {Snapshots} from '../../data/data_preprocessing/crawl/snapshots.ts';
import {FK_POLICY,SWEPT_TABLES,RetentionWorker,expire} from '../../data/data_preprocessing/database/retention.ts';

const DAY=86_400_000,now=new Date(),old=new Date(now.getTime()-400*DAY),recent=new Date(now.getTime()-30*DAY);
async function open(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-retention-'));
 const store=await Store.open(path.join(dir,'db'));await new CrawlStore(store).init();
 return {dir,store};
}
function inserter(store:Store){
 return async(table:string,row:Record<string,unknown>)=>{
  const id=(row.id as string)??randomUUID(),full=table==='crawl_event_aliases'||table==='file_import_identities'||table.startsWith('project_')?row:{id,...row},keys=Object.keys(full);
  await store.db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(full));
  return id;
 };
}
const has=async(store:Store,table:string,id:string)=>!!(await store.one(`SELECT 1 AS ok FROM ${table} WHERE id=$1`,[id]));

test('every foreign key into a swept table has a retention policy, and every policy matches the schema',async()=>{
 const {store}=await open();
 try{
  const schema=(await store.rows(`SELECT c.conrelid::regclass::text AS child,a.attname AS col,c.confrelid::regclass::text AS parent
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f'`)).map(r=>`${r.child}.${r.col}>${r.parent}`);
  assert.ok(schema.length>=Object.keys(FK_POLICY).length,'foreign keys were not read from the schema');
  const swept=new Set([...SWEPT_TABLES,...Object.entries(FK_POLICY).filter(([,p])=>p==='cascade').map(([k])=>k.split('.')[0])]);
  for(const key of schema)if(swept.has(key.split('>')[1]))assert.ok(FK_POLICY[key],'retention policy missing for '+key);
  for(const key of Object.keys(FK_POLICY))assert.ok(schema.includes(key),'retention policy names a foreign key that does not exist: '+key);
 }finally{await store.close();}
});

test('collected data expires after 365 days unless it is still in use; the rest of the database is untouched',async()=>{
 const {dir,store}=await open(),ins=inserter(store),blobs=new Snapshots(path.join(dir,'crawl'));
 try{
  // Crawl history: an old finished run whose page was only seen by the expiring project, and a recent run.
  const r1=await ins('crawl_runs',{request_key:'TEST_ONLY-r1',config:{},status:'completed',created_at:old,updated_at:old});
  const t1=await ins('crawl_tasks',{run_id:r1,source_id:'ethglobal',kind:'page',url:'https://example.com/a',idempotency_key:'TEST_ONLY-t1',status:'succeeded',created_at:old,updated_at:old});
  const r2=await ins('crawl_runs',{request_key:'TEST_ONLY-r2',config:{},status:'completed'});
  const t2=await ins('crawl_tasks',{run_id:r2,source_id:'ethglobal',kind:'page',url:'https://example.com/b',idempotency_key:'TEST_ONLY-t2',status:'succeeded'});
  const snap=async(task:string,name:string,at:Date)=>{const rel=`snapshots/${name.slice(0,2)}/${name}.bin`;await mkdir(path.dirname(blobs.resolve(rel)),{recursive:true});await writeFile(blobs.resolve(rel),'TEST_ONLY');
   return {rel,id:await ins('crawl_snapshots',{task_id:task,requested_url:'https://example.com/'+name,final_url:'https://example.com/'+name,status_code:200,headers:{},content_type:'text/html',classification:'readable',sha256:name,blob_path:rel,byte_length:9,backend:'TEST_ONLY',captured_at:at})};};
  const sa=await snap(t1,'aa'+'0'.repeat(62),old),sb=await snap(t2,'bb'+'0'.repeat(62),now);
  const e1=await ins('crawl_events',{source_id:'ethglobal',native_id:'TEST_ONLY-e1',name:'TEST_ONLY Old Event',year:2025});
  await ins('crawl_event_observations',{event_id:e1,snapshot_id:sa.id,year_basis:'TEST_ONLY',evidence:{}});
  await ins('crawl_event_aliases',{source_id:'ethglobal',alias:'TEST_ONLY-alias-e1',event_id:e1});
  const e2=await ins('crawl_events',{source_id:'ethglobal',native_id:'TEST_ONLY-e2',name:'TEST_ONLY Recent Event',year:2026});
  await ins('crawl_event_observations',{event_id:e2,snapshot_id:sb.id,year_basis:'TEST_ONLY',evidence:{}});
  await ins('crawl_discovery_pages',{run_id:r1,source_id:'ethglobal',task_id:t1,snapshot_id:sa.id,collection_key:'TEST_ONLY',page_url:'https://example.com/a',cursor:'1',fingerprint:'f',identities:[],new_count:1,state:'complete',reason:'TEST_ONLY',captured_at:old});

  const project=async(name:string,created:Date,updated=created,snapshot=sb.id)=>{
   const id=await ins('crawl_projects',{source_id:'ethglobal',native_id:'TEST_ONLY-'+name,title:'TEST_ONLY '+name,url:'https://example.com/p/'+name,meta:{},created_at:created,updated_at:updated});
   const version=await ins('crawl_project_versions',{project_id:id,snapshot_id:snapshot,content:'TEST_ONLY '+name,content_hash:name,parser_version:'TEST_ONLY'});
   await store.db.query('UPDATE crawl_projects SET current_version_id=$2 WHERE id=$1',[id,version]);return {id,version};
  };
  // The expiring project, with every kind of record the crawler keeps about a project.
  const gone=await project('Expired',old,old,sa.id);
  const ev=await ins('crawl_evidence',{project_id:gone.id,version_id:gone.version,snapshot_id:sa.id,field:'award',value:{},quote:'q',locator:'l',nature:'TEST_ONLY'});
  const sub=await ins('crawl_submissions',{project_id:gone.id,event_id:e1,version_id:gone.version,stage_evidence_id:ev});
  const cand=await ins('crawl_result_candidates',{source_id:'ethglobal',event_id:e1,outcome_kind:'winner',label:'TEST_ONLY',qualification:'q',verification:'v',status:'matched',project_id:gone.id,snapshot_id:sa.id,evidence:{}});
  await ins('crawl_result_observations',{candidate_id:cand,snapshot_id:sa.id,payload:{}});
  await ins('crawl_awards',{submission_id:sub,name:'TEST_ONLY Prize',evidence_id:ev,verification:'v',candidate_id:cand});
  const res=await ins('crawl_resources',{project_id:gone.id,version_id:gone.version,url:'https://github.com/x/y',kind:'repo'});
  await ins('crawl_resource_checks',{resource_id:res,snapshot_id:sa.id,status:'ok'});
  await ins('crawl_relations',{project_id:gone.id,target_type:'event',target_id:e1,relation_type:'submitted_to',nature:'TEST_ONLY',evidence_id:ev,version_id:gone.version});
  await ins('crawl_quality_issues',{project_id:gone.id,task_id:t1,rule:'TEST_ONLY',severity:'low',details:{}});
  await ins('crawl_selection_decisions',{run_id:r1,project_id:gone.id,selected:true,reason:'TEST_ONLY',primary_event_id:e1,config:{}});
  await ins('crawl_projection_outbox',{project_id:gone.id,revision:1});
  await ins('project_briefs',{project_id:gone.id,status:'ready'});
  await ins('project_deep_dives',{project_id:gone.id,status:'ready'});
  const unmatched=await ins('crawl_result_candidates',{source_id:'ethglobal',event_id:e2,outcome_kind:'winner',label:'TEST_ONLY',qualification:'q',verification:'v',status:'pending',snapshot_id:sb.id,evidence:{},created_at:old,updated_at:old});

  // Old projects that are still in use, or were refreshed, are kept.
  const used=await project('UsedByResearch',old),idea=await project('InSavedIdea',old),draft=await project('InDraft',old);
  const refreshed=await project('Refreshed',old,recent),writing=await project('BriefRunning',old),fresh=await project('New',recent);
  await ins('project_briefs',{project_id:writing.id,status:'running'});
  const caseId=await ins('cases',{title:'TEST_ONLY research',brief:'TEST_ONLY'});
  const doc=await ins('documents',{case_id:caseId,collection:'MARKET',source_id:'E001',title:'TEST_ONLY',content:'TEST_ONLY',content_hash:'h',meta:{origin_key:'TEST_ONLY-o',project_id:used.id}});
  await ins('crawl_rag_bindings',{case_id:caseId,project_id:used.id,version_id:used.version,document_id:doc,origin_key:'TEST_ONLY-o',document_key:'k',revision:1,status:'active'});

  // News: Grok-imported (expires), added by hand (never), behind a saved idea (kept).
  const news=async(name:string,grok:boolean)=>ins('knowledge_news',{origin_key:'TEST_ONLY-'+name,title:'TEST_ONLY '+name,content:'',content_hash:name,meta:grok?{first_import_batch_id:'b'}:{fetch_status:'USER_PROVIDED'},created_at:old,updated_at:old});
  const newsGone=await news('GrokOld',true),newsManual=await news('Manual',false),newsIdea=await news('GrokInIdea',true);
  const run=await ins('knowledge_runs',{request_key:'TEST_ONLY-run',input_hash:'h',project_ids:[idea.id],news_ids:[newsIdea],sources:[],status:'completed'});
  await ins('knowledge_ideas',{run_id:run,candidate_index:0,title:'TEST_ONLY idea',snapshot:{}});
  await ins('knowledge_runs',{request_key:'TEST_ONLY-unsaved',input_hash:'h2',project_ids:[gone.id],news_ids:[newsGone],sources:[],status:'completed'});
  await store.setSetting('knowledge_draft',{project_ids:[draft.id],news_ids:[],constraints:{},run_id:null});

  // Hackathon events: past (expires), deadline still ahead (kept), recent (kept).
  const event=(name:string,at:Date,deadline:Date|null)=>ins('hackathon_events',{source_id:'devpost',platform:'Devpost',name:'TEST_ONLY '+name,url:'https://example.com/e/'+name,submission_deadline:deadline,discovered_at:at,updated_at:at});
  const eventGone=await event('Past',old,old),eventAhead=await event('Ahead',old,new Date(now.getTime()+10*DAY)),eventNew=await event('New',recent,null);

  // File-import records: a batch that only brought expiring items goes; one that brought a kept item stays.
  const batchGone=await ins('file_import_batches',{importer_version:'TEST_ONLY',files:[],status:'completed',created_at:old});
  const batchKept=await ins('file_import_batches',{importer_version:'TEST_ONLY',files:[],status:'completed',created_at:old});
  let n=0;const item=(batch:string,kind:string,target:string|null,status='imported')=>ins('file_import_items',{batch_id:batch,ordinal:n++,file_name:'TEST_ONLY.json',json_path:'$',kind,input_hash:'h'+n,input:{},status,target_type:target?kind:null,target_id:target,reason:'TEST_ONLY',created_at:old});
  for(const [kind,target] of [['project',gone.id],['news',newsGone],['event',eventGone]] as const){await item(batchGone,kind,target);await ins('file_import_identities',{kind,namespace:'grok',identity_key:'TEST_ONLY-'+target,target_id:target,first_batch_id:batchGone});}
  await item(batchKept,'project',used.id);await ins('file_import_identities',{kind:'project',namespace:'grok',identity_key:'TEST_ONLY-used',target_id:used.id,first_batch_id:batchKept});
  await item(batchKept,'project',null,'conflict');
  const opGone=await ins('crawl_operations',{kind:'export',input:{},request_key:'TEST_ONLY-op1',status:'succeeded',created_at:old,updated_at:old});
  const opNew=await ins('crawl_operations',{kind:'export',input:{},request_key:'TEST_ONLY-op2',status:'succeeded'});

  // A dry run reports and changes nothing.
  const preview=await expire(store,{now,dryRun:true,blobPath:r=>blobs.resolve(r)});
  assert.deepEqual(preview.deleted.projects.map(p=>p.title),['TEST_ONLY Expired']);
  assert.ok(await has(store,'crawl_projects',gone.id));await stat(blobs.resolve(sa.rel));

  const r=await expire(store,{now,blobPath:r=>blobs.resolve(r)});
  assert.deepEqual(r.deleted.projects.map(p=>p.title),['TEST_ONLY Expired']);
  assert.deepEqual(r.deleted.news.map(x=>x.id),[newsGone]);
  assert.deepEqual(r.deleted.events.map(x=>x.id),[eventGone]);
  // Projects: research, saved idea, draft, brief being written (the refreshed one is not old). News: the
  // one behind the saved idea (news added by hand never expires). Events: the deadline still ahead.
  assert.deepEqual(r.kept_in_use,{projects:4,news:1,events:1});
  assert.equal(r.blob_files,1);
  await assert.rejects(stat(blobs.resolve(sa.rel)));await stat(blobs.resolve(sb.rel));

  for(const p of [used,idea,draft,refreshed,writing,fresh])assert.ok(await has(store,'crawl_projects',p.id));
  for(const [table,id] of [['crawl_projects',gone.id],['crawl_project_versions',gone.version],['crawl_evidence',ev],['crawl_submissions',sub],['crawl_result_candidates',cand],['crawl_resources',res],
   ['crawl_result_candidates',unmatched],['crawl_events',e1],['crawl_snapshots',sa.id],['crawl_runs',r1],['crawl_tasks',t1],['knowledge_news',newsGone],['hackathon_events',eventGone],
   ['file_import_batches',batchGone],['crawl_operations',opGone]] as const)assert.ok(!await has(store,table,id),table+' row should be deleted');
  for(const [table,id] of [['crawl_events',e2],['crawl_snapshots',sb.id],['crawl_runs',r2],['knowledge_news',newsManual],['knowledge_news',newsIdea],['hackathon_events',eventAhead],
   ['hackathon_events',eventNew],['file_import_batches',batchKept],['crawl_operations',opNew],['cases',caseId],['documents',doc]] as const)assert.ok(await has(store,table,id),table+' row should be kept');
  assert.equal((await store.one("SELECT count(*)::int AS n FROM project_briefs WHERE project_id=$1",[gone.id])).n,0);
  assert.equal((await store.one("SELECT count(*)::int AS n FROM crawl_event_aliases WHERE event_id=$1",[e1])).n,0);
  assert.equal((await store.one('SELECT count(*)::int AS n FROM file_import_identities WHERE target_id=ANY($1::text[])',[[gone.id,newsGone,eventGone]])).n,0);
  assert.deepEqual((await store.rows('SELECT target_id FROM file_import_items ORDER BY ordinal')).map(x=>x.target_id),[used.id]);
  // Saved ideas, Idea runs and research projects are the user's own and stay as they were.
  assert.equal((await store.one('SELECT count(*)::int AS n FROM knowledge_runs')).n,2);
  assert.equal((await store.one('SELECT count(*)::int AS n FROM knowledge_ideas')).n,1);

  const again=await expire(store,{now,blobPath:r=>blobs.resolve(r)});
  assert.deepEqual(again.deleted,{projects:[],news:[],events:[]});assert.deepEqual(again.counts,{});
 }finally{await store.close();}
});

test('the worker writes a report with a short history and a detail file only when something was deleted',async()=>{
 const {dir,store}=await open(),ins=inserter(store),reportDir=path.join(dir,'reports');
 try{
  await ins('hackathon_events',{source_id:'devpost',platform:'Devpost',name:'TEST_ONLY Past',url:'https://example.com/e/past',submission_deadline:old,discovered_at:old,updated_at:old});
  const worker=new RetentionWorker(store,{reportDir});
  await worker.sweep(now);await worker.sweep(now);
  const latest=JSON.parse(await readFile(path.join(reportDir,'latest.json'),'utf8'));
  assert.equal(latest.status,'OK');assert.equal(latest.deleted.events.length,0);
  assert.deepEqual(latest.history.map((h:any)=>h.events),[0,1]);
  assert.equal((await readdir(path.join(reportDir,'runs'))).length,1);
  await worker.stop();
 }finally{await store.close();}
});
