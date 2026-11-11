import {randomUUID} from 'node:crypto';
import type {Store,Row} from '../database/store.ts';
import {sources} from '../../../crawl/sources/registry.ts';
import {canonical,digest,normalizeName,stable,type InputFile,type InputItem,type Prepared} from './parse.ts';
export const importerVersion='grok-json-v1';
type Outcome={status:'imported'|'duplicate'|'conflict'|'failed';target_id:string|null;reason:string};
export class FileImports {
 store:Store;
 constructor(store:Store){this.store=store;}
 async execute(files:InputFile[],backupManifest:string|null=null){
  const id=randomUUID(),counts={imported:0,duplicate:0,conflict:0,failed:0};
  await this.store.db.query("INSERT INTO file_import_batches(id,importer_version,files,backup_manifest,status) VALUES($1,$2,$3,$4,'running')",[id,importerVersion,files.map(f=>({name:f.name,sha256:f.sha256,count:f.items.length,...f.provenance?{provenance:f.provenance}:{}})),backupManifest]);
  let ordinal=0;
  for(const file of files)for(const item of file.items){
   ordinal++;let result:Outcome;
   try{result=await this.store.db.transaction(async tx=>{
    let outcome:Outcome;
    if(!item.record)outcome={status:'failed',target_id:null,reason:item.error||'INVALID_INPUT'};
    else outcome=await this.save(tx,id,item.record);
    await this.audit(tx,id,ordinal,item,outcome);return outcome;
   });}catch{
    result={status:'failed',target_id:null,reason:'DATABASE_ITEM_TRANSACTION_FAILED'};
    await this.audit(this.store.db,id,ordinal,item,result);
   }
   counts[result.status]++;
  }
  await this.store.db.query("UPDATE file_import_batches SET status='completed',counts=$2,completed_at=now() WHERE id=$1",[id,counts]);
  return {id,counts,items:await this.store.rows('SELECT ordinal,file_name,json_path,kind,status,target_id,reason FROM file_import_items WHERE batch_id=$1 ORDER BY ordinal',[id])};
 }
 private async audit(tx:any,batch:string,ordinal:number,item:InputItem,result:Outcome){
  await tx.query('INSERT INTO file_import_items(id,batch_id,ordinal,file_name,json_path,kind,input_hash,input,status,target_type,target_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)',
   [randomUUID(),batch,ordinal,item.fileName,item.jsonPath,item.record?.kind||null,digest(stable(item.raw)),JSON.stringify(item.raw),result.status,item.record?.kind||null,result.target_id,result.reason]);
 }
 private async save(tx:any,batch:string,r:Prepared):Promise<Outcome>{
  const matches=(await tx.query("SELECT DISTINCT target_id FROM file_import_identities WHERE kind=$1 AND namespace='grok' AND identity_key=ANY($2::text[])",[r.kind,r.aliases])).rows as Row[];
  const table=({project:'crawl_projects',news:'knowledge_news',event:'hackathon_events'} as const)[r.kind];
  const existing=new Map<string,Row>();
  for(const match of matches){const row=(await tx.query(`SELECT * FROM ${table} WHERE id=$1`,[match.target_id])).rows[0];
   if(!row)return {status:'conflict',target_id:null,reason:'IDENTITY_TARGET_MISSING'};existing.set(row.id,row);}
  // Compare existing source records as well as aliases from previous file imports.
  const candidates=(await tx.query(r.kind==='news'?'SELECT * FROM knowledge_news':`SELECT * FROM ${table} WHERE source_id=$1`,r.kind==='news'?[]:[r.source])).rows as Row[];
  const canonURLs=new Set(r.urls.map(canonical));
  for(const old of candidates){
   let sameURL=false;try{sameURL=!!old.url&&canonURLs.has(canonical(old.url));}catch{}
   const sameName=normalizeName(old.title??old.name)===normalizeName(r.title);
   let dedicated=false;try{dedicated=!!old.url&&r.aliases.includes('url:'+r.source+':'+canonical(old.url));}catch{}
   if(sameURL&&(r.kind!=='project'||sameName||dedicated)||r.kind==='event'&&sameName)existing.set(old.id,old);
  }
  if(existing.size>1)return {status:'conflict',target_id:null,reason:'IDENTITIES_RESOLVE_TO_DIFFERENT_RECORDS'};
  const old=[...existing.values()][0];
  if(old){
   if(old.meta?.imported_fingerprint&&old.meta.imported_fingerprint!==r.fingerprint)return {status:'conflict',target_id:old.id,reason:'EXISTING_CONTENT_DIFFERS_PRESERVED'};
   if(normalizeName(old.title??old.name)!==normalizeName(r.title))return {status:'conflict',target_id:old.id,reason:'EXISTING_TITLE_DIFFERS_PRESERVED'};
   await this.aliases(tx,batch,r,old.id);return {status:'duplicate',target_id:old.id,reason:'EXISTING_RECORD_PRESERVED'};
  }
  const target=randomUUID();
  const meta={source_nature:r.kind==='project'?'EXTERNAL_PROJECT_SUMMARY_NOT_VERIFIED':'NEWS_SUMMARY_NOT_VERIFIED',content_kind:'summary_only',imported_summary:r.summary,
   imported_implementation:r.raw.implementation??null,original_date:r.raw.original_date??null,date_display:r.raw.date_display??null,
   collected_date:r.raw.collected_date??null,collected_via:r.raw.collected_via??null,tags:r.raw.tags??null,
   source_urls:r.urls,verification_notes:r.raw.verification_notes??null,claims_note:r.raw.claims_note??null,
   verification_status:'NOT_INDEPENDENTLY_VERIFIED',fetch_status:'NOT_ATTEMPTED',external_record_type:r.raw.type,
   external_id:r.raw.id??null,source_claimed_status:r.raw.status??null,event_and_date_evidence:r.raw.event_and_date_evidence??null,
   event_external_id:typeof r.raw.event_id==='string'?r.raw.event_id:null,
   imported_fingerprint:r.fingerprint,imported_record:r.raw,first_import_batch_id:batch};
  if(r.kind==='project'){
   const source=sources.find(s=>s.id===r.source)!;
   await tx.query('INSERT INTO crawl_sources(id,name,entry_url) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[source.id,source.name,source.url]);
   await tx.query("INSERT INTO crawl_projects(id,source_id,native_id,title,url,quality,meta) VALUES($1,$2,$3,$4,$5,'external_summary_unverified',$6)",[target,r.source,r.nativeId,r.title,r.url,meta]);
  }else if(r.kind==='event'){
   await tx.query('INSERT INTO hackathon_events(id,external_id,source_id,platform,name,url,submission_deadline,deadline_note,event_dates,match_names,meta) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [target,r.raw.id??null,r.source,r.raw.platform,r.title,r.url,r.raw.submission_deadline??null,r.raw.deadline_note??null,r.raw.event_dates??null,JSON.stringify(r.raw.match_names||[]),{...meta,source_nature:'EXTERNAL_EVENT_LISTING_NOT_VERIFIED'}]);
  }else{
   await tx.query("INSERT INTO knowledge_news(id,origin_key,title,content,url,publisher,published_at,content_hash,meta) VALUES($1,$2,$3,'',$4,$5,$6,$7,$8)",[target,digest('url:'+canonical(r.url)),r.title,r.url,r.source,r.raw.original_date??null,r.fingerprint,meta]);
  }
  await this.aliases(tx,batch,r,target);return {status:'imported',target_id:target,reason:r.kind==='event'?'EXTERNAL_EVENT_TRACKED':'EXTERNAL_SUMMARY_SAVED_WITHOUT_ORIGINAL_TEXT'};
 }
 private async aliases(tx:any,batch:string,r:Prepared,target:string){
  for(const alias of r.aliases){
   const result=await tx.query("INSERT INTO file_import_identities(kind,namespace,identity_key,target_id,first_batch_id) VALUES($1,'grok',$2,$3,$4) ON CONFLICT(kind,namespace,identity_key) DO UPDATE SET identity_key=file_import_identities.identity_key RETURNING target_id",[r.kind,alias,target,batch]);
   if(result.rows[0].target_id!==target)throw new Error('IDENTITY_CONFLICT');
  }
 }
}
