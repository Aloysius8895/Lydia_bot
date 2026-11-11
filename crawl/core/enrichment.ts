import {hash,type Row} from '../../data/data_preprocessing/database/store.ts';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {randomUUID} from 'node:crypto';

export function resourceTarget(resource:Row){
  const u=new URL(resource.url);
  if(resource.kind==='github'&&u.hostname==='github.com'){
    const [owner,repo]=u.pathname.split('/').filter(Boolean);if(!owner||!repo||!/^[-\w.]+$/.test(owner)||!/^[-\w.]+$/.test(repo))return null;
    return {url:`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.replace(/\.git$/,''))}/readme`,mode:'github_readme'};
  }
  if(['demo','pdf','video'].includes(resource.kind))return {url:u.href,mode:'public_resource'};
  return null;
}
export async function scheduleResources(repo:CrawlStore,projectId:string,runId:string){
  const p=await repo.project(projectId),resources=p.resources as Row[];
  return repo.store.db.transaction(async tx=>{
    if(p.meta.record_kind==='listing'&&p.meta.identity_basis!=='document_section'){
      const key=hash(`${runId}:${p.source_id}:${p.url}`);
      await tx.query('INSERT INTO crawl_tasks(id,run_id,source_id,kind,url,input,idempotency_key,priority) VALUES($1,$2,$3,$4,$5,$6,$7,100) ON CONFLICT(idempotency_key) DO UPDATE SET priority=GREATEST(crawl_tasks.priority,100)',[randomUUID(),runId,p.source_id,'detail',p.url,{selected_project_id:projectId},key]);
      return {queued:1,total:resources.length,deferred:0,awaiting_details:true,limitation:'已选项目详情尚未取得；保留完整队列，不将 L1 档案标作深采完成'};
    }
    let queued=0;
    // Every linked resource receives a record; first five are fetched in this bounded pass.
    for(const [index,resource] of resources.entries()){
      const target=resourceTarget(resource);
      if(!target||index>=5){await tx.query('UPDATE crawl_resources SET status=$2,meta=meta||$3::jsonb WHERE id=$1',[resource.id,!target?'unsupported':'budget_deferred',JSON.stringify({reason:!target?'resource type has no supported reader':'per-project resource fetch budget is 5'})]);continue;}
      const key=hash(`${runId}:resource:${resource.id}`);
      await tx.query('INSERT INTO crawl_tasks(id,run_id,source_id,kind,url,input,idempotency_key,priority) VALUES($1,$2,$3,$4,$5,$6,$7,50) ON CONFLICT DO NOTHING',[randomUUID(),runId,p.source_id,'resource',target.url,{resource_id:resource.id,project_id:projectId,project_version_id:p.current_version_id,mode:target.mode,linked_url:resource.url},key]);queued++;
    }
    await tx.query("UPDATE crawl_projects SET depth='L2' WHERE id=$1",[projectId]);
    return {queued,total:resources.length,deferred:Math.max(0,resources.length-5),limitation:'README/公开资源检查；不执行代码，不声称完整代码审计'};
  });
}
