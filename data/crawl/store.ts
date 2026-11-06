import {randomUUID} from 'node:crypto';
import {Store,hash,type Row} from '../database/store.ts';
import {assert} from '../../business/shared/config.ts';
import {sources,sourceFor,sourceURL} from '../../crawl/sources/registry.ts';
import type {RunConfig,ParsedPage,FetchResult} from '../../crawl/types.ts';
import {stableJSON,runSchema} from '../../crawl/core/config.ts';
import {upsertEvent,saveOutcomes,reconcileOutcomes,saveDiscovery,invalidateProject} from './discovery.ts';

export class CrawlStore {
  store:Store;
  constructor(store:Store){this.store=store;}
  async init(){for(const s of sources)await this.store.db.query("INSERT INTO crawl_sources(id,name,entry_url,audit) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET audit=jsonb_set(crawl_sources.audit,'{capabilities}',$5::jsonb)",[s.id,s.name,s.url,{capabilities:s.capabilities},JSON.stringify(s.capabilities)]);}
  async createRun(config:RunConfig,requestKey:string){
    if(config.sources.includes('twitter'))config=runSchema.parse(config);
    for(const id of config.sources)sourceFor(id);
    for(const s of config.seeds||[])assert(config.sources.includes(s.source)&&!!sourceURL(s.source,s.url),'SOURCE_SCOPE','种子 URL 不属于已选来源');
    return this.store.db.transaction(async tx=>{
      const existing=(await tx.query<Row>('SELECT * FROM crawl_runs WHERE request_key=$1',[requestKey])).rows[0];
      if(existing){assert(stableJSON(existing.config)===stableJSON(config),'RUN_KEY_CONFLICT','请求键已用于不同配置',409);return existing;}
      const id=randomUUID();await tx.query('INSERT INTO crawl_runs(id,request_key,config,status) VALUES($1,$2,$3,$4)',[id,requestKey,config,'running']);
      for(const source of config.sources){
        const seeds=config.seeds?.filter(s=>s.source===source)||[],urls=seeds.length?seeds.map(s=>s.url):(config.discovery===true?(sourceFor(source).bootstrap||[sourceFor(source).url]):[sourceFor(source).url]);
        for(const url of urls)await tx.query('INSERT INTO crawl_tasks(id,run_id,source_id,kind,url,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[randomUUID(),id,source,'page',url,hash(`${id}:${source}:${url}`)]);
      }
      return (await tx.query<Row>('SELECT * FROM crawl_runs WHERE id=$1',[id])).rows[0];
    });
  }
  async run(id:string):Promise<Row>{const run=await this.store.one('SELECT * FROM crawl_runs WHERE id=$1',[id]);assert(run,'RUN_NOT_FOUND','采集批次不存在',404);return {...run,tasks:await this.store.rows('SELECT id,source_id,kind,url,status,attempt,retry_at,checkpoint,error FROM crawl_tasks WHERE run_id=$1 ORDER BY created_at,id',[id])};}
  async control(id:string,action:'pause'|'resume'|'cancel',extendBudget=false){
    await this.run(id);
    await this.store.db.transaction(async tx=>{
      const r=(await tx.query<Row>('SELECT * FROM crawl_runs WHERE id=$1 FOR UPDATE',[id])).rows[0];
      assert(r.status!=='cancelled','RUN_CANCELLED','已取消的批次不可恢复',409);
      if(action==='resume'&&r.reason==='budget_exhausted'){
        assert(extendBudget,'BUDGET_EXTENSION_REQUIRED','预算已用尽；继续前需显式扩展一批预算',409);
        const next={...r.config,maxPages:r.pages+r.config.maxPages,maxBytes:Number(r.bytes)+r.config.maxBytes};
        await tx.query("UPDATE crawl_runs SET config=$2,budget_epoch=now(),budget_history=budget_history||$3::jsonb WHERE id=$1",[id,next,JSON.stringify([{at:new Date().toISOString(),previous:r.config,next}])]);
      }
      if(action==='cancel')await tx.query("UPDATE crawl_tasks SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE run_id=$1 AND status IN ('pending','retry_wait','running')",[id]);
      await tx.query('UPDATE crawl_runs SET status=$2,reason=$3,updated_at=now() WHERE id=$1',[id,action==='pause'?'paused':action==='resume'?'running':'cancelled',action==='resume'?'resumed; budget counters retained':`user_${action}`]);
    });return this.run(id);
  }
  async claim(leaseMs=120000):Promise<Row|null>{
    return this.store.db.transaction(async tx=>{
      await tx.query("UPDATE crawl_tasks SET status='retry_wait',retry_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE status='running' AND lease_expires_at<=now()");
      const task=(await tx.query<Row>(`SELECT t.*,r.config,r.pages,r.bytes,r.budget_epoch AS run_started FROM crawl_tasks t JOIN crawl_runs r ON r.id=t.run_id
        WHERE r.status='running' AND (t.status='pending' OR t.status='retry_wait' AND t.retry_at<=now()) ORDER BY t.priority DESC,t.created_at,t.id LIMIT 1 FOR UPDATE OF t`)).rows[0];
      if(!task)return null;
      const c=task.config as RunConfig;
      if(task.pages>=c.maxPages||Number(task.bytes)>=c.maxBytes||Date.now()-Date.parse(task.run_started)>c.maxMinutes*60000){await tx.query("UPDATE crawl_runs SET status='paused',reason='budget_exhausted',updated_at=now() WHERE id=$1",[task.run_id]);return null;}
      const token=randomUUID();await tx.query("UPDATE crawl_tasks SET status='running',attempt=attempt+1,lease_token=$2,lease_expires_at=$3,updated_at=now() WHERE id=$1",[task.id,token,new Date(Date.now()+leaseMs).toISOString()]);
      return {...task,status:'running',attempt:task.attempt+1,lease_token:token};
    });
  }
  async finish(task:Row,result:FetchResult,file:{sha256:string;relative:string;byteLength:number;chargedBytes?:number},parsed:ParsedPage|null,error?:{status:string;code:string;message:string;retryAt?:string},resourceCheck?:{status:string;content:string|null;basis:Row}){
    return this.store.db.transaction(async tx=>{
      const held=(await tx.query<Row>("SELECT * FROM crawl_tasks WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now() FOR UPDATE",[task.id,task.lease_token])).rows[0];
      assert(held,'LEASE_LOST','任务领取已失效，拒绝旧 worker 提交',409);
      const snapshotId=randomUUID();await tx.query('INSERT INTO crawl_snapshots(id,task_id,requested_url,final_url,status_code,headers,content_type,classification,sha256,blob_path,byte_length,backend,captured_at,acquisition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[snapshotId,task.id,result.requestedUrl,result.finalUrl,result.statusCode,result.headers,result.contentType,result.classification,file.sha256,file.relative,file.byteLength,result.backend,result.capturedAt,result.acquisition||{}]);
      const projectIds:string[]=[],eventMap=new Map<string,string>();
      for(const e of parsed?.events||[])eventMap.set(e.id,await upsertEvent(tx,task.source_id,e,snapshotId));
      if(task.kind==='resource'){
        const status=resourceCheck?.status||error?.status||'failed',content=resourceCheck?.content||null;
        await tx.query('INSERT INTO crawl_resource_checks(id,resource_id,snapshot_id,status,content,content_hash,version_basis) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),task.input.resource_id,snapshotId,status,content,content?hash(content):null,resourceCheck?.basis||{classification:result.classification,event_time_implementation:'unknown'}]);
        await tx.query('UPDATE crawl_resources SET status=$2,meta=meta||$3::jsonb WHERE id=$1',[task.input.resource_id,status,JSON.stringify({last_checked_at:result.capturedAt,last_snapshot_id:snapshotId})]);
        const current=(await tx.query<Row>('SELECT * FROM crawl_projects WHERE id=$1 AND current_version_id=$2 FOR UPDATE',[task.input.project_id,task.input.project_version_id])).rows[0];
        if(current&&content){
          const revision=current.revision+1;await tx.query('UPDATE crawl_projects SET revision=$2 WHERE id=$1',[current.id,revision]);
          await tx.query("UPDATE crawl_rag_bindings SET status='stale' WHERE project_id=$1",[current.id]);
          await tx.query("UPDATE documents SET active=false WHERE meta->>'project_id'=$1 AND meta->>'origin_key' IS NOT NULL",[current.id]);
          await tx.query('INSERT INTO crawl_projection_outbox(id,project_id,revision) VALUES($1,$2,$3)',[randomUUID(),current.id,revision]);
        }
      }
      for(const p of parsed?.projects||[]){
        const previous=(await tx.query<Row>('SELECT * FROM crawl_projects WHERE source_id=$1 AND (native_id=$2 OR ($4::boolean AND url=$3 AND meta->>\'identity_basis\' IS DISTINCT FROM \'document_section\')) ORDER BY created_at LIMIT 1',[task.source_id,p.nativeId,p.url,p.meta.identity_basis!=='document_section'])).rows[0];
        if(p.meta.record_kind==='listing'&&previous?.current_version_id&&previous.meta.record_kind!=='listing'){projectIds.push(previous.id);continue;}
        const projectId=previous?.id||randomUUID(),contentHash=hash(stableJSON({title:p.title,content:p.content,meta:p.meta,evidence:p.evidence,awards:p.awards,event:p.event,year:p.year,stage:p.stage,resources:p.resources,parser:parsed!.parserVersion}));
        if(!previous)await tx.query('INSERT INTO crawl_projects(id,source_id,native_id,title,url,quality,meta) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_id,native_id) DO NOTHING',[projectId,task.source_id,p.nativeId,p.title,p.url,p.quality,{...p.meta,year:p.year,stage:p.stage}]);
        if(previous&&p.meta.record_kind!=='listing')await tx.query('UPDATE crawl_projects SET native_id=$2 WHERE id=$1',[projectId,p.nativeId]);
        let version=(await tx.query<Row>('SELECT * FROM crawl_project_versions WHERE project_id=$1 AND content_hash=$2',[projectId,contentHash])).rows[0];
        if(!version){version={id:randomUUID()};await tx.query('INSERT INTO crawl_project_versions(id,project_id,snapshot_id,content,content_hash,parser_version,meta) VALUES($1,$2,$3,$4,$5,$6,$7)',[version.id,projectId,snapshotId,p.content,contentHash,parsed!.parserVersion,{...p.meta,year:p.year}]);}
        const changed=previous?.current_version_id!==version.id,revision=previous?previous.revision+(changed?1:0):1;
        await tx.query('UPDATE crawl_projects SET title=$2,url=$3,current_version_id=$4,revision=$5,depth=$6,quality=$7,meta=$8,updated_at=now() WHERE id=$1',[projectId,p.title,p.url,version.id,revision,previous?.depth||'L1',p.quality,{...p.meta,year:p.year,stage:p.stage}]);
        if(changed){
          await tx.query("UPDATE crawl_rag_bindings SET status='stale' WHERE project_id=$1",[projectId]);
          await tx.query("UPDATE documents SET active=false WHERE id IN (SELECT document_id FROM crawl_rag_bindings WHERE project_id=$1)",[projectId]);
          await tx.query('UPDATE crawl_relations SET active=false WHERE project_id=$1',[projectId]);
          await tx.query('INSERT INTO crawl_projection_outbox(id,project_id,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[randomUUID(),projectId,revision]);
        }
        const evIds=new Map<string,string>();
        for(const e of [...p.evidence,...p.awards.map(a=>a.evidence)]){
          const id=hash(`${version.id}:${e.field}:${e.locator}`),key=`${e.field}:${JSON.stringify(e.value)}`;evIds.set(key,id);
          await tx.query('INSERT INTO crawl_evidence(id,project_id,version_id,snapshot_id,field,value,quote,locator,nature) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(version_id,field,locator) DO NOTHING',[id,projectId,version.id,snapshotId,e.field,JSON.stringify(e.value),e.quote,e.locator,e.nature]);
          if(e.field==='technology_claim'&&Array.isArray(e.value))for(const tech of e.value.filter(t=>typeof t==='string'))await tx.query('INSERT INTO crawl_relations(id,project_id,target_type,target_id,relation_type,nature,evidence_id,version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET active=true',[hash(`${version.id}:tech:${tech}`),projectId,'technology',`technology:${tech}`,'CLAIMS_USES','author_claim',id,version.id]);
        }
        if(p.event){const eventId=await upsertEvent(tx,task.source_id,{...p.event,year:p.year,yearBasis:String(p.meta.year_basis||'project_event_evidence'),kind:'hackathon',evidence:p.evidence.find(e=>e.field==='event')||{field:'event',value:p.event.name,quote:p.event.name,locator:'project.event',nature:'official_fact'}},snapshotId),submissionId=hash(`${projectId}:${eventId}`);eventMap.set(p.event.id,eventId);
          await tx.query('INSERT INTO crawl_submissions(id,project_id,event_id,version_id,stage) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,event_id) DO UPDATE SET version_id=excluded.version_id,stage=CASE WHEN crawl_submissions.stage_evidence_id IS NOT NULL THEN crawl_submissions.stage ELSE excluded.stage END',[submissionId,projectId,eventId,version.id,p.stage]);
          for(const award of p.awards){const evidenceId=evIds.get(`award:${JSON.stringify(award.name)}`)!;await tx.query('INSERT INTO crawl_awards(id,submission_id,name,evidence_id,verification) VALUES($1,$2,$3,$4,$5) ON CONFLICT(submission_id,name) DO UPDATE SET evidence_id=excluded.evidence_id,verification=excluded.verification',[hash(`${submissionId}:${award.name}`),submissionId,award.name,evidenceId,'official_verified']);}
          const evidenceId=evIds.get(`event:${JSON.stringify(p.event.name)}`)||null;
          await tx.query('INSERT INTO crawl_relations(id,project_id,target_type,target_id,relation_type,nature,evidence_id,version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET active=true,evidence_id=excluded.evidence_id,version_id=excluded.version_id',[hash(`${version.id}:event`),projectId,'event',eventId,'SUBMITTED_TO','official_fact',evidenceId,version.id]);
        }
        for(const resource of p.resources)await tx.query('INSERT INTO crawl_resources(id,project_id,version_id,url,kind) VALUES($1,$2,$3,$4,$5) ON CONFLICT(version_id,url) DO NOTHING',[hash(`${version.id}:${resource.url}`),projectId,version.id,resource.url,resource.kind]);
        if(p.quality!=='accepted'&&changed)await tx.query('INSERT INTO crawl_quality_issues(id,project_id,task_id,rule,severity,details) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),projectId,task.id,'SCOPE_OR_CONTENT_INCOMPLETE','review',{year:p.year,quality:p.quality}]);
        projectIds.push(projectId);
      }
      await saveOutcomes(tx,task.source_id,parsed?.outcomes||[],eventMap,snapshotId);
      const outcomeProjectIds=await reconcileOutcomes(tx,task.source_id),discovery=parsed?await saveDiscovery(tx,task,parsed,snapshotId):{followNext:true,state:null};
      for(const link of [...parsed?.links||[],...parsed?.next&&discovery.followNext?[{url:parsed.next,kind:'page',input:task.input}]:[]]){
        let url:string;try{url=sourceURL(task.source_id,link.url);}catch{continue;}
        await tx.query('INSERT INTO crawl_tasks(id,run_id,source_id,kind,url,idempotency_key,input,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[randomUUID(),task.run_id,task.source_id,link.kind,url,hash(`${task.run_id}:${task.source_id}:${url}`),{...link.input,event_evidence_snapshot_id:snapshotId},link.kind==='results'?100:link.kind==='event'?50:0]);
      }
      await tx.query('UPDATE crawl_tasks SET status=$3,checkpoint=$4,error=$5,retry_at=$6,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2',[task.id,task.lease_token,error?.status||'succeeded',{snapshot_id:snapshotId,project_ids:projectIds,next:parsed?.next||null,complete:parsed?.complete||false,reason:parsed?.reason||error?.message},error||null,error?.retryAt||null]);
      await tx.query('UPDATE crawl_runs SET pages=pages+1,bytes=bytes+$2,updated_at=now() WHERE id=$1',[task.run_id,file.chargedBytes??file.byteLength]);
      return {snapshotId,projectIds,outcomeProjectIds,discovery};
    });
  }
  async fail(task:Row,code:string,message:string,retryAt?:string){
    await this.store.db.query("UPDATE crawl_tasks SET status=$3,error=$4,retry_at=$5,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now()",[task.id,task.lease_token,retryAt?'retry_wait':'failed',{code,message},retryAt||null]);
  }
  async reviewOutcome(id:string,revision:number,action:'match'|'reject',note:string,projectId?:string){
    return this.store.db.transaction(async tx=>{
      const c=(await tx.query<Row>('SELECT * FROM crawl_result_candidates WHERE id=$1 FOR UPDATE',[id])).rows[0];assert(c,'RESULT_NOT_FOUND','结果候选不存在',404);assert(c.revision===revision,'RESULT_REVIEW_CONFLICT','候选已更新，请刷新后复核',409);
      if(action==='match'){
        const p=(await tx.query<Row>('SELECT * FROM crawl_projects WHERE id=$1 AND source_id=$2',[projectId,c.source_id])).rows[0];assert(p,'RESULT_PROJECT_SCOPE','请选择同来源的项目');
        assert(c.verification==='official'&&['award','finalist'].includes(c.outcome_kind),'RESULT_NOT_OFFICIAL','不能把资助、提名或未核验结果提升为获奖/最终阶段');
        await tx.query("UPDATE crawl_result_candidates SET status='pending',revision=revision+1,review=$2 WHERE id=$1",[id,{note,matched_project_id:projectId,at:new Date().toISOString()}]);
        await reconcileOutcomes(tx,c.source_id);
      }else{
        await tx.query("UPDATE crawl_result_candidates SET status='rejected',revision=revision+1,review=$2 WHERE id=$1",[id,{note,at:new Date().toISOString()}]);
        await tx.query("UPDATE crawl_awards SET verification='revoked' WHERE candidate_id=$1",[id]);
        await tx.query("UPDATE crawl_submissions SET stage='unknown',stage_evidence_id=NULL,stage_candidate_id=NULL WHERE stage_candidate_id=$1",[id]);
        await tx.query("UPDATE crawl_relations SET active=false WHERE id=$1",[hash(`outcome:${id}`)]);
        if(c.project_id)await invalidateProject(tx,c.project_id);await reconcileOutcomes(tx,c.source_id);
      }
      return (await tx.query<Row>('SELECT * FROM crawl_result_candidates WHERE id=$1',[id])).rows[0];
    });
  }
  async coverage(runId?:string){return this.store.rows(`SELECT run_id,source_id,collection_key,count(*)::integer AS pages,sum(new_count)::integer AS new_id_count,
    bool_or(state='complete') AS terminal_seen,bool_or(state='complete') AND bool_and(state IN ('more','complete')) AS complete,bool_or(state='stalled') AS stalled,
    array_agg(DISTINCT state) AS page_states FROM crawl_discovery_pages WHERE ($1::text IS NULL OR run_id=$1) GROUP BY run_id,source_id,collection_key ORDER BY run_id,source_id,collection_key LIMIT 200`,[runId||null]);}
  async retryTask(id:string,note:string){
    return this.store.db.transaction(async tx=>{
      const t=(await tx.query<Row>('SELECT t.*,r.status AS run_status FROM crawl_tasks t JOIN crawl_runs r ON r.id=t.run_id WHERE t.id=$1 FOR UPDATE OF t',[id])).rows[0];
      assert(t&&['failed','blocked'].includes(t.status),'TASK_RETRY_CONFLICT','仅可重试失败或受阻任务',409);
      assert(t.run_status!=='cancelled','RUN_CANCELLED','批次已取消',409);
      assert(sourceFor(t.source_id).adapter||t.kind==='resource','ADAPTER_NOT_IMPLEMENTED','此来源尚无适配器，重试不能解决',409);
      await tx.query("UPDATE crawl_tasks SET status='pending',attempt=0,error=NULL,retry_at=NULL,checkpoint=checkpoint||$2::jsonb,updated_at=now() WHERE id=$1",[id,JSON.stringify({manual_retry:{at:new Date().toISOString(),note}})]);
      await tx.query("UPDATE crawl_runs SET status=CASE WHEN status='completed' THEN 'running' ELSE status END WHERE id=$1",[t.run_id]);
      return {id,status:'pending'};
    });
  }
  async settle(){await this.store.db.query(`UPDATE crawl_runs r SET status='completed',completeness='incomplete',reason='batch_finished; consult task coverage and source audits',updated_at=now()
    WHERE status='running' AND NOT EXISTS(SELECT 1 FROM crawl_tasks t WHERE t.run_id=r.id AND t.status IN ('pending','running','retry_wait'))`);}
  async project(id:string):Promise<Row>{const p=await this.store.one('SELECT p.*,v.content,v.snapshot_id,v.parser_version,v.content_hash FROM crawl_projects p LEFT JOIN crawl_project_versions v ON v.id=p.current_version_id WHERE p.id=$1',[id]);assert(p,'PROJECT_NOT_FOUND','采集项目不存在',404);return {...p,evidence:await this.store.rows('SELECT * FROM crawl_evidence WHERE project_id=$1 AND version_id=$2',[id,p.current_version_id]),submissions:await this.store.rows('SELECT s.*,e.name AS event_name,e.year FROM crawl_submissions s JOIN crawl_events e ON e.id=s.event_id WHERE s.project_id=$1',[id]),resources:await this.store.rows('SELECT r.*,c.content AS fetched_content,c.content_hash AS fetched_hash,c.snapshot_id AS fetched_snapshot_id,c.version_basis FROM crawl_resources r LEFT JOIN LATERAL (SELECT * FROM crawl_resource_checks WHERE resource_id=r.id ORDER BY checked_at DESC LIMIT 1) c ON true WHERE r.project_id=$1 AND r.version_id=$2',[id,p.current_version_id]),awards:await this.store.rows('SELECT a.*,s.event_id,s.version_id AS award_project_version FROM crawl_awards a JOIN crawl_submissions s ON s.id=a.submission_id WHERE s.project_id=$1',[id])};}
  async projects(filters:{source?:string;year?:number;query?:string;limit?:number;offset?:number}={}){
    return this.store.rows(`SELECT p.* FROM crawl_projects p WHERE ($1::text IS NULL OR source_id=$1) AND ($2::integer IS NULL OR (meta->>'year')::integer=$2) AND ($3::text IS NULL OR title ILIKE $3) ORDER BY updated_at DESC,id LIMIT $4 OFFSET $5`,[filters.source||null,filters.year||null,filters.query?`%${filters.query}%`:null,Math.min(100,filters.limit||50),filters.offset||0]);
  }
}
