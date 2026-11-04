import {randomUUID} from 'node:crypto';
import {CrawlStore} from './store.ts';
import {Snapshots} from './snapshots.ts';
import {exportCrawl} from './export.ts';
import {attachProject,syncProjections} from '../RAG/crawl-bridge.ts';
import type {Embedding} from '../RAG/providers/embedding.ts';
import {selectProjects,type Candidate} from '../../crawl/core/selection.ts';
import {stableJSON} from '../../crawl/core/config.ts';
import {assert} from '../../business/shared/config.ts';
import type {Row} from '../database/store.ts';
import {scheduleResources} from '../../crawl/core/enrichment.ts';
import {runSchema} from '../../crawl/core/config.ts';

export async function enqueueOperation(repo:CrawlStore,kind:string,input:Row,key:string){
  const old=await repo.store.one('SELECT * FROM crawl_operations WHERE request_key=$1',[key]);
  if(old){assert(old.kind===kind&&stableJSON(old.input)===stableJSON(input),'REQUEST_KEY_CONFLICT','请求键冲突',409);return old;}
  return repo.store.one('INSERT INTO crawl_operations(id,kind,input,request_key) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),kind,input,key]);
}
export async function tickOperation(repo:CrawlStore,snapshots:Snapshots,embedding:Embedding|null){
  const op:Row|null=await repo.store.db.transaction(async tx=>{
    await tx.query("UPDATE crawl_operations SET status='pending',lease_token=NULL WHERE status='running' AND lease_expires_at<=now()");
    const op=(await tx.query<Row>("SELECT * FROM crawl_operations WHERE status='pending' ORDER BY created_at,id LIMIT 1 FOR UPDATE")).rows[0];
    if(!op)return null;const token=randomUUID();await tx.query("UPDATE crawl_operations SET status='running',lease_token=$2,lease_expires_at=now()+interval '10 minutes',updated_at=now() WHERE id=$1",[op.id,token]);return {...op,lease_token:token};
  });
  if(!op){await syncProjections(repo,embedding);return false;}
  try{
    let result:unknown;
    if(op.kind==='export')result=await exportCrawl(repo,snapshots,op.input.format);
    else if(op.kind==='enrich'){
      const p=await repo.project(op.input.project_id),config=runSchema.parse({sources:[p.source_id],maxPages:10,seeds:[]});
      const run=await repo.createRun(config,`enrich-${op.id}`);
      await repo.store.db.query("DELETE FROM crawl_tasks WHERE run_id=$1 AND status='pending'",[run.id]);
      result={run_id:run.id,...await scheduleResources(repo,p.id,run.id)};
    }else if(op.kind==='import'){
      const imports=[];for(const id of op.input.project_ids)imports.push(await attachProject(repo,embedding,op.input.case_id,id));result={imports};
    }else{
      const run=await repo.run(op.input.run_id),rows=await repo.store.rows(`SELECT p.id,s.event_id,s.stage,e.source_id,e.year,
        EXISTS(SELECT 1 FROM crawl_awards a JOIN crawl_submissions sa ON sa.id=a.submission_id JOIN crawl_events ea ON ea.id=sa.event_id WHERE sa.project_id=p.id AND a.verification='official_verified' AND ea.year=ANY($1::integer[]) AND ea.source_id=ANY($2::text[])) AS winner
        FROM crawl_projects p JOIN crawl_submissions s ON s.project_id=p.id JOIN crawl_events e ON e.id=s.event_id
        WHERE e.year=ANY($1::integer[]) AND e.source_id=ANY($2::text[])`,[run.config.years,run.config.sources]);
      const map=new Map<string,Candidate>();for(const r of rows){const c:Candidate=map.get(r.id)||{id:r.id,winner:r.winner,events:[]};if(r.stage==='finalist')c.events.push({id:r.event_id,source:r.source_id,year:r.year});c.winner||=r.winner;map.set(r.id,c);}
      const decisions=selectProjects([...map.values()].filter(c=>c.winner||c.events.length),run.config);
      await repo.store.db.transaction(async tx=>{const version=Number((await tx.query<Row>('SELECT COALESCE(max(selection_version),0)+1 AS version FROM crawl_selection_decisions WHERE run_id=$1',[run.id])).rows[0].version);for(const d of decisions)await tx.query('INSERT INTO crawl_selection_decisions(id,run_id,project_id,selected,reason,primary_event_id,config,selection_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),run.id,d.projectId,d.selected,d.reason,d.eventId,{...run.config,policy_version:'stratified-v1'},version]);});
      for(const d of decisions.filter(d=>d.selected))await scheduleResources(repo,d.projectId,run.id);
      if(decisions.some(d=>d.selected))await repo.store.db.query("UPDATE crawl_runs SET status='running' WHERE id=$1 AND status='completed'",[run.id]);
      result={decisions,winners:decisions.filter(d=>d.reason==='verified_winner').length,finalists:decisions.filter(d=>d.selected&&d.reason!=='verified_winner').length,limitation:'资源检查已排队；预算/不支持资源会单独记录，README 检查不等于完整代码审计'};
    }
    await repo.store.db.query("UPDATE crawl_operations SET status='succeeded',result=$3,error=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",[op.id,op.lease_token,result]);
  }catch(e){await repo.store.db.query("UPDATE crawl_operations SET status='failed',error=$3,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",[op.id,op.lease_token,{code:(e as any).code||'OPERATION_FAILED',message:String((e as Error).message).slice(0,200)}]);}
  return true;
}
