import type {Store,Row} from '../database/store.ts';
import {dropNullOptionals,stable} from './parse.ts';
import {KnowledgeAPI} from '../../../business/backend/knowledge.ts';
const tables=['cases','documents','chunks','gaps','claims','requirements','decisions','tasks','expert_runs','artifacts','knowledge_runs','knowledge_ideas','crawl_projects','knowledge_news','crawl_project_versions','crawl_snapshots','crawl_awards','crawl_sources','hackathon_events'];
export async function businessSnapshot(store:Store){
 const result:Record<string,{count:number;rows:Record<string,string>}>={};
 for(const table of tables){
  // Tables added by later migrations (e.g. hackathon_events) count as empty on older databases.
  const present=(await store.one('SELECT to_regclass($1) IS NOT NULL AS ok',[table]))?.ok;
  const rows=present?await store.rows(`SELECT md5(row_to_json(t)::text) AS fingerprint FROM ${table} t`):[];
  const counts:Record<string,string>={};for(const row of rows)counts[row.fingerprint]=String(Number(counts[row.fingerprint]||0)+1);
  result[table]={count:rows.length,rows:counts};
 }
 return result;
}
export function preserved(before:Awaited<ReturnType<typeof businessSnapshot>>,after:Awaited<ReturnType<typeof businessSnapshot>>){
 return Object.fromEntries(Object.keys(before).map(table=>[table,Object.entries(before[table].rows).every(([hash,count])=>Number(after[table]?.rows[hash]||0)>=Number(count))]));
}
export async function verifyImported(store:Store,batchIds:string[]){
 const api=new KnowledgeAPI(store,null as any,null as any);
 const identities=await store.rows("SELECT DISTINCT target_type,target_id FROM file_import_items WHERE batch_id=ANY($1::text[]) AND status IN ('imported','duplicate') AND target_id IS NOT NULL ORDER BY target_type,target_id",[batchIds]);
 const records:Row[]=[];
 for(const identity of identities){
  const table=({project:'crawl_projects',news:'knowledge_news',event:'hackathon_events'} as Record<string,string>)[identity.target_type];
  const row=await store.one(`SELECT * FROM ${table} WHERE id=$1`,[identity.target_id]);
  if(!row)throw new Error('READBACK_RECORD_MISSING');
  if(identity.target_type==='event'){
   // Events are read back through the tracker endpoint instead of title search.
   const response=await api.handle('/api/knowledge/hackathons','GET',async()=>{throw new Error('Read-only verification');});
   if(!(response?.data as {events:Row[]})?.events.some(e=>e.id===row.id)&&row.tracking)throw new Error('TRACKER_RECORD_MISSING');
   const item=await store.one("SELECT input FROM file_import_items WHERE target_id=$1 AND status='imported' ORDER BY created_at LIMIT 1",[row.id]);
   if(item&&stable(row.meta.imported_record)!==stable(dropNullOptionals(item.input)))throw new Error('RAW_FIELDS_CHANGED');
   records.push({kind:'event',id:row.id,title:row.name,url:row.url,submission_deadline:row.submission_deadline,deadline_note:row.deadline_note,tracker_verified:true});
   continue;
  }
  const searchURL=new URL(`http://offline/api/knowledge/${identity.target_type==='project'?'projects':'news'}`);
  searchURL.searchParams.set('query',row.title);
  const response=await api.handle(searchURL.pathname,'GET',async()=>{throw new Error('Read-only verification');},searchURL);
  const search=(response?.data as {items:Row[]})?.items||[];
  if(!search.some(r=>r.id===row.id))throw new Error('SEARCH_RECORD_MISSING');
  const item=await store.one("SELECT input FROM file_import_items WHERE target_id=$1 AND status='imported' ORDER BY created_at LIMIT 1",[row.id]);
  if(item){
   if(stable(row.meta.imported_record)!==stable(dropNullOptionals(item.input)))throw new Error('RAW_FIELDS_CHANGED');
   if(row.meta.content_kind!=='summary_only'||(identity.target_type==='project'?row.current_version_id!==null:row.content!==''))throw new Error('SUMMARY_ORIGINAL_BOUNDARY_FAILED');
  }
  records.push({kind:identity.target_type,id:row.id,title:row.title,url:row.url,summary:row.meta?.imported_summary??null,
   original_date:row.meta?.original_date??null,collected_date:row.meta?.collected_date??null,source_urls:row.meta?.source_urls??null,
   tags:row.meta?.tags??null,verification_notes:row.meta?.verification_notes??null,verification_status:row.meta?.verification_status??null,
   content_kind:row.meta?.content_kind??null,search_verified:true,search_endpoint:searchURL.pathname,raw_fields_verified:!!item});
 }
 return records;
}
