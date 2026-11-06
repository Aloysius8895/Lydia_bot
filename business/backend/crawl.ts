import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Snapshots} from '../../data/crawl/snapshots.ts';
import {CrawlWorker} from '../../crawl/core/worker.ts';
import {runSchema} from '../../crawl/core/config.ts';
import {enqueueOperation} from '../../data/crawl/operations.ts';
import {assert} from '../shared/config.ts';
import {relations} from '../../data/crawl/relations.ts';
import {browserExecutable} from '../../crawl/fetch/browser.ts';

export class CrawlAPI {
  repo:CrawlStore;snapshots:Snapshots;worker:CrawlWorker;
  constructor(repo:CrawlStore,snapshots:Snapshots,worker:CrawlWorker){this.repo=repo;this.snapshots=snapshots;this.worker=worker;}
  async download(id:string,name:string){
    z.string().uuid().parse(id);assert(/^[\w.-]+\.(json|csv|md)$/.test(name),'EXPORT_FILE_NOT_FOUND','导出文件不存在',404);
    const op=await this.repo.store.one("SELECT * FROM crawl_operations WHERE id=$1 AND kind='export' AND status='succeeded'",[id]);
    assert(op?.result&&(name==='manifest.json'||Object.hasOwn(op.result.files,name)),'EXPORT_FILE_NOT_FOUND','导出文件不存在',404);
    const exportId=z.string().uuid().parse(op.result.id);
    return {path:this.snapshots.resolve(`exports/${exportId}/${name}`),name,type:name.endsWith('.csv')?'text/csv; charset=utf-8':name.endsWith('.md')?'text/markdown; charset=utf-8':'application/json; charset=utf-8'};
  }
  async handle(p:string,method:string,url:URL,body:()=>Promise<any>,context:{loopback?:boolean}={}):Promise<{data:unknown;status?:number}|null>{
    const store=this.repo.store;
    if(p==='/api/crawl/twitter/session'&&method==='GET')return {data:await this.worker.twitter.status()};
    if(p==='/api/crawl/twitter/api-status'&&method==='GET')return {data:this.worker.twitterAPI.status()};
    if(['/api/crawl/twitter/login','/api/crawl/twitter/close'].includes(p)&&method==='POST'){
      assert(context.loopback,'TWITTER_LOCAL_ONLY','请在运行后端的电脑上打开或关闭 X 登录窗口',403);
      return {data:p.endsWith('/login')?await this.worker.twitter.login():await this.worker.twitter.close()};
    }
    if(p==='/api/crawl/sources'&&method==='GET')return {data:await store.rows('SELECT * FROM crawl_sources ORDER BY id')};
    if(p==='/api/crawl/runs'&&method==='GET')return {data:await store.rows("SELECT r.*,(SELECT count(*)::integer FROM crawl_tasks t WHERE t.run_id=r.id AND t.status='blocked') AS blocked_tasks,(SELECT error FROM crawl_tasks t WHERE t.run_id=r.id AND error IS NOT NULL ORDER BY updated_at DESC LIMIT 1) AS last_error FROM crawl_runs r ORDER BY r.created_at DESC LIMIT 100")};
    if(p==='/api/crawl/operations'&&method==='GET')return {data:await store.rows('SELECT id,kind,status,result,error,created_at FROM crawl_operations ORDER BY created_at DESC LIMIT 20')};
    if(p==='/api/crawl/events'&&method==='GET')return {data:await store.rows('SELECT * FROM crawl_events ORDER BY year DESC NULLS LAST,name LIMIT 200')};
    if(p==='/api/crawl/coverage'&&method==='GET')return {data:await this.repo.coverage(url.searchParams.get('run_id')||undefined)};
    if(p==='/api/crawl/results'&&method==='GET'){const filters=z.object({status:z.enum(['pending','matched','conflicting','rejected']).optional(),source:z.string().optional()}).parse(Object.fromEntries(url.searchParams));return {data:await store.rows('SELECT c.*,e.name AS event_name,e.year FROM crawl_result_candidates c JOIN crawl_events e ON e.id=c.event_id WHERE ($1::text IS NULL OR c.status=$1) AND ($2::text IS NULL OR c.source_id=$2) ORDER BY c.updated_at DESC,c.id LIMIT 200',[filters.status||null,filters.source||null])};}
    const resultReview=/^\/api\/crawl\/results\/([^/]+)\/review$/.exec(p);
    if(resultReview&&method==='POST'){const b=z.object({expected_revision:z.number().int().positive(),action:z.enum(['match','reject']),note:z.string().min(1).max(2000),project_id:z.string().uuid().optional()}).parse(await body());return {data:await this.repo.reviewOutcome(z.string().regex(/^[a-f0-9]{64}$/).parse(resultReview[1]),b.expected_revision,b.action,b.note,b.project_id)};}
    if(p==='/api/crawl/runs'&&method==='POST'){
      const b=z.object({config:runSchema,request_key:z.string().min(8).max(100)}).parse(await body());return {data:await this.repo.createRun(b.config,b.request_key),status:202};
    }
    const run=/^\/api\/crawl\/runs\/([^/]+)(?:\/(pause|resume|cancel|selection))?$/.exec(p);
    if(run){const id=z.string().uuid().parse(run[1]);if(!run[2]&&method==='GET')return {data:await this.repo.run(id)};
      if(run[2]&&method==='POST'){
        if(run[2]==='selection'){await this.repo.run(id);return {data:await enqueueOperation(this.repo,'selection',{run_id:id},randomUUID()),status:202};}
        const b=run[2]==='resume'?z.object({extend_budget:z.boolean().default(false)}).parse(await body()):{extend_budget:false};
        return {data:await this.repo.control(id,run[2] as 'pause'|'resume'|'cancel',b.extend_budget)};
      }
    }
    if(p==='/api/crawl/projects'&&method==='GET')return {data:await this.repo.projects(z.object({source:z.string().optional(),year:z.coerce.number().int().min(2006).max(2100).optional(),query:z.string().max(200).optional(),limit:z.coerce.number().int().min(1).max(100).optional(),offset:z.coerce.number().int().min(0).max(1000000).optional()}).parse(Object.fromEntries(url.searchParams)))};
    const project=/^\/api\/crawl\/projects\/([^/]+)(?:\/(relations))?$/.exec(p);
    if(project&&method==='GET'){
      const id=z.string().uuid().parse(project[1]),p=await this.repo.project(id);
      if(!project[2])return {data:p};
      const limits=z.object({depth:z.coerce.number().int().min(1).max(2).default(1),nodes:z.coerce.number().int().min(1).max(100).default(100),edges:z.coerce.number().int().min(1).max(200).default(200)}).parse(Object.fromEntries(url.searchParams));
      return {data:await relations(this.repo,id,limits)};
    }
    const enrich=/^\/api\/crawl\/projects\/([^/]+)\/enrich$/.exec(p);
    if(enrich&&method==='POST'){const id=z.string().uuid().parse(enrich[1]);await this.repo.project(id);return {data:await enqueueOperation(this.repo,'enrich',{project_id:id},randomUUID()),status:202};}
    const evidence=/^\/api\/crawl\/evidence\/([^/]+)$/.exec(p);
    if(evidence&&method==='GET'){const e=await store.one('SELECT e.*,s.final_url,s.sha256,s.captured_at FROM crawl_evidence e JOIN crawl_snapshots s ON s.id=e.snapshot_id WHERE e.id=$1',[z.string().regex(/^[a-f0-9]{64}$/).parse(evidence[1])]);assert(e,'EVIDENCE_NOT_FOUND','证据不存在',404);return {data:e};}
    if(p==='/api/crawl/quality'&&method==='GET')return {data:await store.rows('SELECT * FROM crawl_quality_issues ORDER BY id LIMIT 100')};
    const retry=/^\/api\/crawl\/tasks\/([^/]+)\/retry$/.exec(p);
    if(retry&&method==='POST'){const b=z.object({note:z.string().min(1).max(1000)}).parse(await body());return {data:await this.repo.retryTask(z.string().uuid().parse(retry[1]),b.note)};}
    const review=/^\/api\/crawl\/reviews\/([^/]+)\/resolve$/.exec(p);
    if(review&&method==='POST'){const id=z.string().uuid().parse(review[1]),b=z.object({note:z.string().min(1).max(2000)}).parse(await body());const row=await store.one("UPDATE crawl_quality_issues SET status='reviewed',resolution=$2 WHERE id=$1 AND status='open' RETURNING *",[id,{note:b.note,at:new Date().toISOString(),effect:'acknowledged only; underlying fact unchanged'}]);assert(row,'REVIEW_CONFLICT','复核项不存在或已处理',409);return {data:row};}
    if(p==='/api/crawl/projections'&&method==='GET')return {data:{outbox:await store.rows('SELECT status,count(*)::integer AS count FROM crawl_projection_outbox GROUP BY status'),bindings:await store.rows('SELECT status,count(*)::integer AS count FROM crawl_rag_bindings GROUP BY status')}};
    if(p==='/api/crawl/projections/retry'&&method==='POST'){await store.db.query("UPDATE crawl_projection_outbox SET status='pending',attempt=0,error=NULL,next_retry=now() WHERE status='failed'");return {data:{status:'queued'}};}
    if(p==='/api/crawl/exports'&&method==='POST'){const b=z.object({format:z.enum(['csv','json','markdown']),request_key:z.string().min(8).max(100)}).parse(await body());return {data:await enqueueOperation(this.repo,'export',{format:b.format},b.request_key),status:202};}
    const imports=/^\/api\/cases\/([^/]+)\/crawl-imports$/.exec(p);
    if(imports&&method==='POST'){const caseId=z.string().uuid().parse(imports[1]),b=z.object({project_ids:z.array(z.string().uuid()).min(1).max(20),request_key:z.string().min(8).max(100)}).parse(await body());await store.getCase(caseId);for(const id of b.project_ids)await this.repo.project(id);return {data:await enqueueOperation(this.repo,'import',{case_id:caseId,project_ids:b.project_ids},b.request_key),status:202};}
    const op=/^\/api\/crawl\/operations\/([^/]+)$/.exec(p);
    if(op&&method==='GET'){const row=await store.one('SELECT * FROM crawl_operations WHERE id=$1',[z.string().uuid().parse(op[1])]);assert(row,'OPERATION_NOT_FOUND','后台操作不存在',404);return {data:row};}
    if(p==='/api/crawl/health'&&method==='GET')return {data:{database:'shared_pglite',worker:{active:this.worker.active,stopping:this.worker.stopping},browser:'constrained_http_replay',browser_available:await browserExecutable().then(()=>true).catch(()=>false),cloud:'not_configured',neo4j:'disabled',coverage:'partial',storage:this.snapshots.root}};
    return null;
  }
}
