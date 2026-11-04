import {randomUUID} from 'node:crypto';
import {CrawlStore} from '../crawl/store.ts';
import {hash,type Row} from '../database/store.ts';
import {Embedding} from './providers/embedding.ts';
import {ingest} from './retrieval.ts';
import {stableJSON} from '../../crawl/core/config.ts';
import {assert} from '../../business/shared/config.ts';

export async function attachProject(repo:CrawlStore,embedding:Embedding|null,caseId:string,projectId:string){
  await repo.store.getCase(caseId);const p=await repo.project(projectId);
  assert(p.current_version_id&&p.content,'PROJECT_CONTENT_MISSING','项目尚无可导入正文');
  const inputs=[{content:p.content as string,key:'detail',url:p.url,snapshot:p.snapshot_id,hash:p.current_version_id,basis:'cleaned_project_content'},...(p.resources as Row[]).filter(r=>r.fetched_content).map(r=>({content:r.fetched_content as string,key:'resource:'+hash(r.url),url:r.url,snapshot:r.fetched_snapshot_id,hash:r.fetched_hash,basis:'resource_text; '+stableJSON(r.version_basis)}))];
  const parts=inputs.flatMap(input=>Array.from({length:Math.ceil(input.content.length/120000)},(_,i)=>({...input,content:input.content.slice(i*120000,(i+1)*120000),part:i,offset:i*120000,partCount:Math.ceil(input.content.length/120000)})));
  const originKeys:string[]=[];
  const bindings:Row[]=[];
  for(let i=0;i<parts.length;i++){
    const part=parts[i],originKey=`crawl:${projectId}:${part.key}:part:${part.part}`;originKeys.push(originKey);
    const meta={project_id:projectId,project_version_id:p.current_version_id,content_version_id:part.hash,snapshot_id:part.snapshot,source_url:part.url,source_nature:'HACKATHON_PROJECT',synthetic:false,projection_revision:p.revision,parser_version:p.parser_version,chunker_version:'crew-text-v1',year:p.meta.year,year_basis:p.meta.year_basis,award_status:p.meta.award_status,quality:p.quality,event_ids:p.submissions.map((s:Row)=>s.event_id),submission_ids:p.submissions.map((s:Row)=>s.id),evidence_ids:p.evidence.map((e:Row)=>e.id),awards:p.awards,part_index:part.part,part_count:part.partCount,original_content_start:part.offset,offset_basis:part.basis,limitations:'项目作者声明与官方参赛信息；不是市场需求或代码验证证据'};
    const fingerprint=hash(stableJSON({content:part.content,meta})),documentKey=hash(`${originKey}:${part.hash}:crew-text-v1:${fingerprint}`);
    const doc=await ingest(repo.store,embedding,{caseId,collection:'PROJECT',title:p.title+(parts.length>1?` (${i+1}/${parts.length})`:''),content:part.content,url:part.url,originKey,projectionFingerprint:fingerprint,activate:false,meta:{...meta,crawl_document_key:documentKey}});
    const binding=await repo.store.db.transaction(async tx=>{
      const current=(await tx.query<Row>('SELECT revision FROM crawl_projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
      if(current.revision!==p.revision){await tx.query('UPDATE documents SET active=false WHERE id=$1',[doc.id]);return null;}
      const existing=(await tx.query<Row>('SELECT * FROM crawl_rag_bindings WHERE case_id=$1 AND origin_key=$2',[caseId,originKey])).rows[0],id=existing?.id||randomUUID();
      await tx.query("INSERT INTO crawl_rag_bindings(id,case_id,project_id,version_id,document_id,origin_key,document_key,revision,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') ON CONFLICT(case_id,origin_key) DO UPDATE SET version_id=excluded.version_id,document_id=excluded.document_id,document_key=excluded.document_key,revision=excluded.revision,status='active'",[id,caseId,projectId,p.current_version_id,doc.id,originKey,documentKey,p.revision]);
      await tx.query("UPDATE crawl_rag_bindings SET status='staging' WHERE id=$1",[id]);
      const chunks=(await tx.query<Row>('SELECT id,position,content FROM chunks WHERE document_id=$1',[doc.id])).rows;
      for(const c of chunks){const position={...c.position,start:part.offset+c.position.start,end:part.offset+c.position.end,basis:part.basis};await tx.query('INSERT INTO crawl_chunk_bindings(chunk_key,binding_id,chunk_id,source_position,document_key,version_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(chunk_key) DO NOTHING',[hash(`${caseId}:${documentKey}:${position.start}:${position.end}:${hash(c.content)}`),id,c.id,position,documentKey,p.current_version_id]);}
      return {id,document_id:doc.id,document_key:documentKey,part_index:i};
    });
    assert(binding,'PROJECTION_STALE','采集版本已更新，请重试导入',409);bindings.push(binding);
  }
  await repo.store.db.transaction(async tx=>{
    const current=(await tx.query<Row>('SELECT revision FROM crawl_projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
    assert(current.revision===p.revision,'PROJECTION_STALE','Project changed during projection',409);
    await tx.query("UPDATE documents SET active=false WHERE case_id=$1 AND meta->>'project_id'=$2 AND meta->>'origin_key' IS NOT NULL",[caseId,projectId]);
    await tx.query("UPDATE documents SET active=true,meta=jsonb_set(meta,'{projection_staged}','false') WHERE id=ANY($1::text[])",[bindings.map(b=>b.document_id)]);
    await tx.query("UPDATE crawl_rag_bindings SET status=CASE WHEN origin_key=ANY($3::text[]) THEN 'active' ELSE 'stale' END WHERE case_id=$1 AND project_id=$2",[caseId,projectId,originKeys]);
  });
  return {project_id:projectId,case_id:caseId,bindings,mode:embedding?'EMBEDDING_OR_KEYWORD':'KEYWORD_ONLY'};
}
export async function syncProjections(repo:CrawlStore,embedding:Embedding|null){
  const events=await repo.store.rows("SELECT * FROM crawl_projection_outbox WHERE status IN ('pending','failed') AND attempt<5 AND next_retry<=now() ORDER BY created_at LIMIT 5");
  for(const event of events)try{
    const current=await repo.store.one('SELECT revision FROM crawl_projects WHERE id=$1',[event.project_id]);
    if(current?.revision===event.revision){
      const cases=await repo.store.rows('SELECT DISTINCT case_id FROM crawl_rag_bindings WHERE project_id=$1',[event.project_id]);
      for(const c of cases)await attachProject(repo,embedding,c.case_id,event.project_id);
    }
    await repo.store.db.query("UPDATE crawl_projection_outbox SET status='succeeded',attempt=attempt+1,error=NULL WHERE id=$1",[event.id]);
  }catch(e){await repo.store.db.query("UPDATE crawl_projection_outbox SET status='failed',attempt=attempt+1,error=$2,next_retry=now()+interval '1 minute' WHERE id=$1",[event.id,{code:(e as any).code||'PROJECTION_FAILED',message:'索引同步失败，可重试'}]);}
}
