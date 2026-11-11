// Data retention (user decision, 2026-11-11): externally collected data stays in the database for
// RETENTION_DAYS (365), counted from when it entered the database or was last refreshed (a re-crawl
// or a newer delivery bumps updated_at). Deletion is permanent by the user's choice: no archive.
// The daily automatic backups (backups/database/daily) still hold a copy for up to 30 days.
//
// Expires: crawler / Grok projects together with their briefs, deep dives and crawl records,
// Grok-imported news, Grok hackathon events, their file-import records, and crawl history that
// nothing kept refers to any more (old snapshots and their blob files, finished runs, operations,
// unmatched result candidates, crawl events).
// Never touched: the user's research projects, uploads, outputs, conversations, calls, saved ideas,
// Idea Lab runs, and news the user added by hand.
// Kept while still in use: projects bound to a research project, projects and news behind a saved
// idea, in the current Idea draft or in a running Idea run, projects whose brief or deep dive is
// being written right now, and events whose submission deadline is still ahead.
import path from 'node:path';
import {mkdir,readdir,readFile,rename,rm,unlink,writeFile} from 'node:fs/promises';
import type {Store} from './store.ts';

export const RETENTION_DAYS=365;
const DAY=86_400_000;
type Tx={query:(sql:string,params?:unknown[])=>Promise<{rows:any[];affectedRows?:number}>};
export type Policy='cascade'|'nullify'|'protect';

/** Every foreign key that points at a table this sweep deletes from, and what happens to the
 *  referencing rows. retention.test.ts compares this list with the live schema, so a new foreign
 *  key fails the test until its policy is decided here. Format: child.column>parent */
export const FK_POLICY:Record<string,Policy>={
 // A project and everything recorded only about it.
 'crawl_project_versions.project_id>crawl_projects':'cascade',
 'crawl_submissions.project_id>crawl_projects':'cascade',
 'crawl_evidence.project_id>crawl_projects':'cascade',
 'crawl_resources.project_id>crawl_projects':'cascade',
 'crawl_quality_issues.project_id>crawl_projects':'cascade',
 'crawl_selection_decisions.project_id>crawl_projects':'cascade',
 'crawl_relations.project_id>crawl_projects':'cascade',
 'crawl_projection_outbox.project_id>crawl_projects':'cascade',
 'crawl_result_candidates.project_id>crawl_projects':'cascade',
 'project_briefs.project_id>crawl_projects':'cascade',
 'project_deep_dives.project_id>crawl_projects':'cascade',
 'project_matches.project_id>crawl_projects':'cascade',
 'news_sources.news_id>knowledge_news':'cascade',
 'crawl_rag_bindings.project_id>crawl_projects':'protect',        // a research project uses it
 'crawl_projects.current_version_id>crawl_project_versions':'nullify',
 'crawl_submissions.version_id>crawl_project_versions':'nullify',
 'crawl_evidence.version_id>crawl_project_versions':'cascade',
 'crawl_resources.version_id>crawl_project_versions':'cascade',
 'crawl_relations.version_id>crawl_project_versions':'cascade',
 'crawl_rag_bindings.version_id>crawl_project_versions':'protect',
 'crawl_chunk_bindings.version_id>crawl_project_versions':'protect',
 'crawl_awards.submission_id>crawl_submissions':'cascade',
 'crawl_awards.evidence_id>crawl_evidence':'cascade',
 'crawl_relations.evidence_id>crawl_evidence':'cascade',
 'crawl_submissions.stage_evidence_id>crawl_evidence':'nullify',
 'crawl_resource_checks.resource_id>crawl_resources':'cascade',
 'crawl_result_observations.candidate_id>crawl_result_candidates':'cascade',
 'crawl_awards.candidate_id>crawl_result_candidates':'nullify',
 'crawl_submissions.stage_candidate_id>crawl_result_candidates':'nullify',
 // Crawl history: only removed once nothing that is kept refers to it.
 'crawl_project_versions.snapshot_id>crawl_snapshots':'protect',
 'crawl_evidence.snapshot_id>crawl_snapshots':'protect',
 'crawl_resource_checks.snapshot_id>crawl_snapshots':'protect',
 'crawl_event_observations.snapshot_id>crawl_snapshots':'protect',
 'crawl_result_candidates.snapshot_id>crawl_snapshots':'protect',
 'crawl_result_observations.snapshot_id>crawl_snapshots':'protect',
 'crawl_discovery_pages.snapshot_id>crawl_snapshots':'protect',
 'crawl_submissions.event_id>crawl_events':'protect',
 'crawl_result_candidates.event_id>crawl_events':'protect',
 'crawl_selection_decisions.primary_event_id>crawl_events':'protect',
 'crawl_event_observations.event_id>crawl_events':'cascade',
 'crawl_event_aliases.event_id>crawl_events':'cascade',
 'crawl_snapshots.task_id>crawl_tasks':'protect',
 'crawl_quality_issues.task_id>crawl_tasks':'cascade',
 'crawl_discovery_pages.task_id>crawl_tasks':'cascade',
 'crawl_tasks.run_id>crawl_runs':'cascade',
 'crawl_discovery_pages.run_id>crawl_runs':'cascade',
 'crawl_selection_decisions.run_id>crawl_runs':'cascade',
 'file_import_items.batch_id>file_import_batches':'protect',
 'file_import_identities.first_batch_id>file_import_batches':'protect',
};
/** Tables the sweep deletes from directly (the cascade reaches the rest). */
export const SWEPT_TABLES=['crawl_projects','knowledge_news','hackathon_events','crawl_result_candidates','crawl_discovery_pages','crawl_events','crawl_snapshots','crawl_runs','crawl_operations','file_import_items','file_import_identities','file_import_batches'];
const fks=Object.entries(FK_POLICY).map(([key,policy])=>{const [,child,column,parent]=/^(\w+)\.(\w+)>(\w+)$/.exec(key)!;return {child,column,parent,policy};});
const isParent=(table:string)=>fks.some(f=>f.parent===table);

/** Deletes rows `ids` of `table` and, following FK_POLICY, the rows that exist only because of them. */
async function remove(tx:Tx,table:string,ids:string[],counts:Record<string,number>){
 if(!ids.length)return;
 for(const fk of fks.filter(f=>f.parent===table)){
  if(fk.policy==='nullify'){await tx.query(`UPDATE ${fk.child} SET ${fk.column}=NULL WHERE ${fk.column}=ANY($1::text[])`,[ids]);continue;}
  if(fk.policy==='protect'){
   // Callers only pass rows nothing protected refers to; reaching this is a bug, so roll back.
   const held=(await tx.query(`SELECT count(*)::int AS n FROM ${fk.child} WHERE ${fk.column}=ANY($1::text[])`,[ids])).rows[0].n;
   if(held)throw new Error(`RETENTION_PROTECTED_ROW ${fk.child}.${fk.column}`);continue;
  }
  if(isParent(fk.child))await remove(tx,fk.child,(await tx.query(`SELECT id FROM ${fk.child} WHERE ${fk.column}=ANY($1::text[])`,[ids])).rows.map(r=>r.id),counts);
  else{const r=await tx.query(`DELETE FROM ${fk.child} WHERE ${fk.column}=ANY($1::text[])`,[ids]);counts[fk.child]=(counts[fk.child]||0)+(r.affectedRows||0);}
 }
 const r=await tx.query(`DELETE FROM ${table} WHERE id=ANY($1::text[])`,[ids]);counts[table]=(counts[table]||0)+(r.affectedRows||0);
}
/** SQL condition: no protected row refers to `alias`.id of `table`. */
const unreferenced=(table:string,alias:string)=>fks.filter(f=>f.parent===table&&f.policy==='protect')
 .map(f=>`NOT EXISTS (SELECT 1 FROM ${f.child} x WHERE x.${f.column}=${alias}.id)`).join(' AND ')||'true';

/** Project and news ids the user is still working with. */
async function inUse(tx:Tx){
 const ids=new Set<string>();
 const draft=(await tx.query("SELECT data FROM settings WHERE key='knowledge_draft'")).rows[0]?.data||{};
 for(const id of [...draft.project_ids||[],...draft.news_ids||[]])ids.add(String(id));
 const runs=(await tx.query("SELECT project_ids,news_ids FROM knowledge_runs r WHERE r.status IN ('queued','running') OR EXISTS (SELECT 1 FROM knowledge_ideas i WHERE i.run_id=r.id)")).rows;
 for(const r of runs)for(const id of [...r.project_ids||[],...r.news_ids||[]])ids.add(String(id));
 return [...ids];
}

export type RetentionResult={at:string;days:number;cutoff:string;dry_run:boolean;
 deleted:{projects:{id:string;title:string;source:string}[];news:{id:string;title:string}[];events:{id:string;name:string}[]};
 kept_in_use:{projects:number;news:number;events:number};counts:Record<string,number>;blob_files:number};

/** One sweep. Everything happens in one transaction; dryRun rolls it back and only reports. */
export async function expire(store:Store,options:{now?:Date;days?:number;dryRun?:boolean;blobPath?:(relative:string)=>string}={}):Promise<RetentionResult>{
 const now=options.now||new Date(),days=options.days??RETENTION_DAYS,cutoff=new Date(now.getTime()-days*DAY);
 const result:RetentionResult={at:now.toISOString(),days,cutoff:cutoff.toISOString(),dry_run:!!options.dryRun,
  deleted:{projects:[],news:[],events:[]},kept_in_use:{projects:0,news:0,events:0},counts:{},blob_files:0};
 const blobs=new Set<string>(),ROLLBACK=new Error('RETENTION_DRY_RUN');
 try{
  await store.db.transaction(async(tx:Tx)=>{
   const c=result.counts,used=await inUse(tx);
   // 1. Projects, news and events past the limit.
   const projects=(await tx.query(`SELECT p.id,p.title,p.source_id FROM crawl_projects p WHERE p.created_at<$1 AND p.updated_at<$1
     AND NOT (p.id=ANY($2::text[])) AND NOT EXISTS (SELECT 1 FROM crawl_rag_bindings b WHERE b.project_id=p.id)
     AND NOT EXISTS (SELECT 1 FROM project_briefs b WHERE b.project_id=p.id AND b.status='running')
     AND NOT EXISTS (SELECT 1 FROM project_deep_dives d WHERE d.project_id=p.id AND d.status IN ('queued','running'))
     AND NOT EXISTS (SELECT 1 FROM project_matches m WHERE m.project_id=p.id AND m.status IN ('queued','running'))
     ORDER BY p.created_at`,[cutoff,used])).rows;
   const news=(await tx.query(`SELECT id,title FROM knowledge_news WHERE meta->>'first_import_batch_id' IS NOT NULL
     AND created_at<$1 AND updated_at<$1 AND NOT (id=ANY($2::text[])) ORDER BY created_at`,[cutoff,used])).rows;
   const events=(await tx.query(`SELECT id,name FROM hackathon_events WHERE discovered_at<$1 AND updated_at<$1
     AND (submission_deadline IS NULL OR submission_deadline<$2) ORDER BY discovered_at`,[cutoff,now])).rows;
   const old=(await tx.query(`SELECT (SELECT count(*)::int FROM crawl_projects WHERE created_at<$1 AND updated_at<$1) AS projects,
     (SELECT count(*)::int FROM knowledge_news WHERE meta->>'first_import_batch_id' IS NOT NULL AND created_at<$1 AND updated_at<$1) AS news,
     (SELECT count(*)::int FROM hackathon_events WHERE discovered_at<$1 AND updated_at<$1) AS events`,[cutoff])).rows[0];
   result.kept_in_use={projects:old.projects-projects.length,news:old.news-news.length,events:old.events-events.length};
   result.deleted={projects:projects.map(p=>({id:p.id,title:p.title,source:p.source_id})),news:news.map(n=>({id:n.id,title:n.title})),events:events.map(e=>({id:e.id,name:e.name}))};
   await remove(tx,'crawl_projects',projects.map(p=>p.id),c);
   await remove(tx,'knowledge_news',news.map(n=>n.id),c);
   await remove(tx,'hackathon_events',events.map(e=>e.id),c);
   // 2. Their file-import records. Identities must go too: a later delivery of the same item is then
   //    imported as new (its clock restarts) instead of being flagged as pointing at a missing record.
   const targets=[...projects,...news,...events].map(r=>r.id);
   c.file_import_identities=(await tx.query('DELETE FROM file_import_identities WHERE target_id=ANY($1::text[])',[targets])).affectedRows||0;
   c.file_import_items=(await tx.query('DELETE FROM file_import_items WHERE target_id=ANY($1::text[]) OR (target_id IS NULL AND created_at<$2)',[targets,cutoff])).affectedRows||0;
   await remove(tx,'file_import_batches',(await tx.query(`SELECT id FROM file_import_batches b WHERE b.created_at<$1 AND b.status<>'running' AND ${unreferenced('file_import_batches','b')}`,[cutoff])).rows.map(r=>r.id),c);
   // 3. Crawl history nothing kept refers to any more.
   await remove(tx,'crawl_result_candidates',(await tx.query('SELECT id FROM crawl_result_candidates WHERE project_id IS NULL AND updated_at<$1',[cutoff])).rows.map(r=>r.id),c);
   c.crawl_discovery_pages=(c.crawl_discovery_pages||0)+((await tx.query(`DELETE FROM crawl_discovery_pages d USING crawl_runs r
     WHERE d.run_id=r.id AND r.status IN ('completed','cancelled') AND r.updated_at<$1 AND d.captured_at<$1`,[cutoff])).affectedRows||0);
   // A crawl event has no timestamp of its own: it goes when nothing refers to it (relations point at
   // events by id without a foreign key) and every page it was seen on is past the limit. Events
   // never observed are left alone.
   await remove(tx,'crawl_events',(await tx.query(`SELECT e.id FROM crawl_events e WHERE ${unreferenced('crawl_events','e')}
     AND NOT EXISTS (SELECT 1 FROM crawl_relations r WHERE r.target_type='event' AND r.target_id=e.id)
     AND EXISTS (SELECT 1 FROM crawl_event_observations o WHERE o.event_id=e.id)
     AND NOT EXISTS (SELECT 1 FROM crawl_event_observations o JOIN crawl_snapshots s ON s.id=o.snapshot_id WHERE o.event_id=e.id AND s.captured_at>=$1)`,[cutoff])).rows.map(r=>r.id),c);
   const snapshots=(await tx.query(`SELECT s.id,s.blob_path FROM crawl_snapshots s WHERE s.captured_at<$1 AND ${unreferenced('crawl_snapshots','s')}`,[cutoff])).rows;
   await remove(tx,'crawl_snapshots',snapshots.map(s=>s.id),c);
   for(const s of snapshots)if(!(await tx.query('SELECT 1 FROM crawl_snapshots WHERE blob_path=$1 LIMIT 1',[s.blob_path])).rows.length)blobs.add(s.blob_path);
   await remove(tx,'crawl_runs',(await tx.query(`SELECT r.id FROM crawl_runs r WHERE r.status IN ('completed','cancelled') AND r.updated_at<$1
     AND NOT EXISTS (SELECT 1 FROM crawl_tasks t JOIN crawl_snapshots s ON s.task_id=t.id WHERE t.run_id=r.id)
     AND NOT EXISTS (SELECT 1 FROM crawl_tasks t WHERE t.run_id=r.id AND t.status IN ('pending','running','retry_wait'))`,[cutoff])).rows.map(r=>r.id),c);
   c.crawl_operations=(await tx.query("DELETE FROM crawl_operations WHERE status IN ('succeeded','failed') AND updated_at<$1",[cutoff])).affectedRows||0;
   for(const k of Object.keys(c))if(!c[k])delete c[k];
   if(options.dryRun)throw ROLLBACK;
  });
 }catch(e){if(e!==ROLLBACK)throw e;}
 // Snapshot bodies are content-addressed files shared by identical pages; only unreferenced ones go,
 // and only after the database change has committed.
 if(!options.dryRun&&options.blobPath)for(const blob of blobs){
  try{await unlink(options.blobPath(blob));result.blob_files++;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&!/Invalid storage path/.test(String(e)))throw e;}
 }
 return result;
}

const HISTORY=30,DETAIL_FILES=24;
/** latest.json: the last sweep (with titles) plus a short history; runs/: one file per sweep that deleted something. */
export async function writeReport(dir:string,report:Record<string,unknown>&{at:string}){
 await mkdir(path.join(dir,'runs'),{recursive:true});
 const latest=path.join(dir,'latest.json');
 const previous=await readFile(latest,'utf8').then(JSON.parse).catch(()=>null);
 const summary=(r:any)=>({at:r.at,status:r.status,projects:r.deleted?.projects?.length||0,news:r.deleted?.news?.length||0,events:r.deleted?.events?.length||0,error:r.error});
 const history=[summary(report),...(previous?.history||[])].slice(0,HISTORY);
 await writeFile(latest+'.tmp',JSON.stringify({...report,history},null,1));await rename(latest+'.tmp',latest);
 const d=(report as any).deleted;
 if(d&&(d.projects.length||d.news.length||d.events.length)){
  await writeFile(path.join(dir,'runs',report.at.replace(/[:.]/g,'-')+'.json'),JSON.stringify(report,null,1));
  const files=(await readdir(path.join(dir,'runs'))).filter(f=>f.endsWith('.json')).sort().reverse();
  for(const f of files.slice(DETAIL_FILES))await rm(path.join(dir,'runs',f),{force:true});
 }
}

/** Runs the sweep inside the server (the database has a single owner): first 10 minutes after
 *  start, then once a day. A failed sweep changes nothing (the transaction rolls back) and is reported. */
export class RetentionWorker{
 store:Store;options:{reportDir:string;blobPath?:(relative:string)=>string;days?:number;delayMs?:number;everyMs?:number};
 first:NodeJS.Timeout|null=null;timer:NodeJS.Timeout|null=null;running:Promise<RetentionResult|null>|null=null;
 constructor(store:Store,options:RetentionWorker['options']){this.store=store;this.options=options;}
 start(){
  this.first=setTimeout(()=>void this.sweep(),this.options.delayMs??10*60_000);this.first.unref?.();
  this.timer=setInterval(()=>void this.sweep(),this.options.everyMs??DAY);this.timer.unref?.();
 }
 sweep(now=new Date()){
  if(this.running)return this.running;
  this.running=(async()=>{
   try{const r=await expire(this.store,{now,days:this.options.days,blobPath:this.options.blobPath});await writeReport(this.options.reportDir,{...r,status:'OK'}).catch(()=>{});return r;}
   catch(e){await writeReport(this.options.reportDir,{at:now.toISOString(),status:'ERROR',error:String((e as Error)?.message||e).slice(0,300)}).catch(()=>{});return null;}
   finally{this.running=null;}
  })();
  return this.running;
 }
 async stop(){if(this.first)clearTimeout(this.first);if(this.timer)clearInterval(this.timer);await this.running?.catch(()=>{});}
}
