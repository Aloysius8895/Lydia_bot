import {randomUUID} from 'node:crypto';
import {hash,type Row} from '../database/store.ts';
import type {ParsedEvent,ParsedPage,Outcome} from '../../../crawl/types.ts';
import {canonicalUrl} from '../RAG/retrieval.ts';
import {stableJSON} from '../../../crawl/core/config.ts';
import {assert} from '../../../business/shared/config.ts';

type SQL={query:<T extends Row=Row>(sql:string,params?:any[])=>Promise<{rows:T[]}>};
export async function invalidateProject(tx:SQL,id:string){
 const p=(await tx.query<Row>('UPDATE crawl_projects SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',[id])).rows[0];
 await tx.query("UPDATE crawl_rag_bindings SET status='stale' WHERE project_id=$1",[id]);
 await tx.query("UPDATE documents SET active=false WHERE meta->>'project_id'=$1 AND meta->>'origin_key' IS NOT NULL",[id]);
 await tx.query('INSERT INTO crawl_projection_outbox(id,project_id,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[randomUUID(),id,p.revision]);
}
export async function upsertEvent(tx:SQL,source:string,e:ParsedEvent,snapshot:string){
 const url=e.url?canonicalUrl(e.url):null,aliases=[`id:${e.id}`,...url?[`url:${url}`]:[]];
 const matches=(await tx.query<Row>(`SELECT DISTINCT ev.* FROM crawl_events ev LEFT JOIN crawl_event_aliases a ON a.event_id=ev.id WHERE ev.source_id=$1 AND (ev.native_id=$2 OR ev.url=$3 OR a.alias=ANY($4::text[]))`,[source,e.id,url,aliases])).rows;
 assert(matches.length<=1,'EVENT_ALIAS_CONFLICT','赛事标识关联冲突，需人工复核',409);
 const old=matches[0],id=old?.id||hash(`${source}:${e.id}`),conflict=old?.year!==null&&old?.year!==undefined&&e.year!==null&&old.year!==e.year;
 await tx.query(`INSERT INTO crawl_events(id,source_id,native_id,name,year,url,meta) VALUES($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,year=CASE WHEN $8 THEN NULL ELSE COALESCE(excluded.year,crawl_events.year) END,url=COALESCE(excluded.url,crawl_events.url),meta=crawl_events.meta||excluded.meta`,[id,source,e.id,e.name,e.year,url,{...e.meta,kind:e.kind,year_basis:conflict?'conflicting':e.yearBasis,...conflict?{year_conflict:[old.year,e.year]}:{}},conflict]);
 for(const alias of aliases)await tx.query('INSERT INTO crawl_event_aliases(source_id,alias,event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[source,alias,id]);
 await tx.query('INSERT INTO crawl_event_observations(id,event_id,snapshot_id,year_basis,evidence,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[hash(`${id}:${snapshot}`),id,snapshot,e.yearBasis,e.evidence,e.meta||{}]);
 return id;
}
export async function saveOutcomes(tx:SQL,source:string,items:Outcome[],eventMap:Map<string,string>,snapshot:string){
 for(const o of items){
  let eventId=eventMap.get(o.eventId);
  if(!eventId)eventId=(await tx.query<Row>('SELECT id FROM crawl_events WHERE source_id=$1 AND native_id=$2 UNION SELECT event_id AS id FROM crawl_event_aliases WHERE source_id=$1 AND alias=$3',[source,o.eventId,`id:${o.eventId}`])).rows[0]?.id;
  if(!eventId)eventId=await upsertEvent(tx,source,{id:o.eventId,name:o.eventId,year:null,yearBasis:'unknown',kind:'unknown',evidence:o.evidence,meta:{unresolved_event_identity:true}},snapshot);
  const url=o.projectUrl?canonicalUrl(o.projectUrl):null,id=hash(stableJSON({source,eventId,kind:o.kind,label:o.label,native:o.projectNativeId||null,url,name:o.projectName||null}));
  await tx.query(`INSERT INTO crawl_result_candidates(id,source_id,event_id,project_native_id,project_url,project_name,outcome_kind,label,qualification,verification,snapshot_id,evidence)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET snapshot_id=excluded.snapshot_id,evidence=excluded.evidence,revision=crawl_result_candidates.revision+1,updated_at=now()`,[id,source,eventId,o.projectNativeId||null,url,o.projectName||null,o.kind,o.label,o.qualification,o.verification,snapshot,o.evidence]);
  await tx.query('INSERT INTO crawl_result_observations(id,candidate_id,snapshot_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[hash(`${id}:${snapshot}`),id,snapshot,o]);
 }
}
export async function reconcileOutcomes(tx:SQL,source:string){
 const candidates=(await tx.query<Row>("SELECT * FROM crawl_result_candidates WHERE source_id=$1 AND status<>'rejected' ORDER BY created_at,id",[source])).rows,matched=new Set<string>();
 for(const c of candidates){
  if(c.verification!=='official'||!['award','finalist'].includes(c.outcome_kind)||c.outcome_kind==='finalist'&&!['global_finalist','event_finalist'].includes(c.qualification))continue;
  const projects=(await tx.query<Row>('SELECT * FROM crawl_projects WHERE source_id=$1 AND current_version_id IS NOT NULL AND (CASE WHEN $4::text IS NOT NULL THEN id=$4 ELSE native_id=$2 OR url=$3 END)',[source,c.project_native_id,c.project_url,c.review?.matched_project_id||null])).rows;
  if(projects.length!==1){if(projects.length>1)await tx.query("UPDATE crawl_result_candidates SET status='conflicting' WHERE id=$1",[c.id]);continue;}
  const p=projects[0],evidenceId=hash(`${c.id}:${c.snapshot_id}:${p.current_version_id}`),previous=(await tx.query<Row>('SELECT id FROM crawl_evidence WHERE id=$1',[evidenceId])).rows[0];
  // Names alone are never sufficient; the query only accepts native IDs, canonical URLs or an explicit identity review.
  await tx.query("INSERT INTO crawl_evidence(id,project_id,version_id,snapshot_id,field,value,quote,locator,nature) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'official_fact') ON CONFLICT DO NOTHING",[evidenceId,p.id,p.current_version_id,c.snapshot_id,c.outcome_kind,{candidate_id:c.id,event_id:c.event_id,label:c.label,qualification:c.qualification},c.evidence.quote,c.evidence.locator+` / outcome ${c.id}`]);
  const submissionId=hash(`${p.id}:${c.event_id}`);
  await tx.query('INSERT INTO crawl_submissions(id,project_id,event_id,version_id) VALUES($1,$2,$3,NULL) ON CONFLICT DO NOTHING',[submissionId,p.id,c.event_id]);
  if(c.outcome_kind==='award')await tx.query(`INSERT INTO crawl_awards(id,submission_id,name,evidence_id,verification,candidate_id) VALUES($1,$2,$3,$4,'official_verified',$5)
    ON CONFLICT(submission_id,name) DO UPDATE SET evidence_id=excluded.evidence_id,verification='official_verified',candidate_id=excluded.candidate_id`,[hash(`${submissionId}:${c.label}`),submissionId,c.label,evidenceId,c.id]);
  else await tx.query("UPDATE crawl_submissions SET stage='finalist',stage_evidence_id=$2,stage_candidate_id=$3 WHERE id=$1",[submissionId,evidenceId,c.id]);
  await tx.query("UPDATE crawl_result_candidates SET status='matched',project_id=$2 WHERE id=$1",[c.id,p.id]);
  await tx.query('INSERT INTO crawl_relations(id,project_id,target_type,target_id,relation_type,nature,evidence_id,version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET evidence_id=excluded.evidence_id,version_id=excluded.version_id,active=true',[hash(`outcome:${c.id}`),p.id,'event',c.event_id,c.outcome_kind==='award'?'AWARDED_AT':'FINALIST_AT','official_fact',evidenceId,p.current_version_id]);
  if(!previous){await invalidateProject(tx,p.id);matched.add(p.id);}
 }
 return [...matched];
}
export async function saveDiscovery(tx:SQL,task:Row,parsed:ParsedPage,snapshot:string){
 if(!parsed.pagination)return {followNext:true,state:null};
 const ids=[...parsed.projects.map(p=>'project:'+canonicalUrl(p.url)+(p.meta.identity_basis==='document_section'?':'+p.nativeId:'')),...parsed.events?.map(e=>'event:'+e.id)||[],...parsed.outcomes?.map(o=>'outcome:'+stableJSON({event:o.eventId,target:o.projectNativeId||canonicalUrl(o.projectUrl)||o.projectName,kind:o.kind,label:o.label}))||[]].sort();
 const previous=(await tx.query<Row>('SELECT * FROM crawl_discovery_pages WHERE run_id=$1 AND source_id=$2 AND collection_key=$3 ORDER BY captured_at',[task.run_id,task.source_id,parsed.pagination.collectionKey])).rows;
 const seen=new Set(previous.flatMap(p=>p.identities)),newCount=ids.filter(i=>!seen.has(i)).length,fingerprint=hash(stableJSON(ids));
 const repeatedCursor=!!parsed.next&&(canonicalUrl(parsed.next)===canonicalUrl(task.url)||previous.some(p=>canonicalUrl(p.page_url)===canonicalUrl(parsed.next)));
 const repeatedPage=ids.length>0&&previous.some(p=>p.fingerprint===fingerprint)&&newCount===0;
 const state=repeatedCursor||repeatedPage?'stalled':parsed.pagination.terminalEvidence&&parsed.complete?'complete':parsed.next?'more':'incomplete';
 const reason=state==='stalled'?repeatedCursor?'repeated_cursor':'repeated_identity_page':parsed.reason;
 await tx.query('INSERT INTO crawl_discovery_pages(id,run_id,source_id,task_id,snapshot_id,collection_key,page_url,cursor,fingerprint,identities,new_count,next_url,terminal_evidence,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[randomUUID(),task.run_id,task.source_id,task.id,snapshot,parsed.pagination.collectionKey,task.url,parsed.pagination.cursor,fingerprint,ids,newCount,parsed.next,parsed.pagination.terminalEvidence||null,state,reason]);
 return {followNext:state!=='stalled',state};
}
