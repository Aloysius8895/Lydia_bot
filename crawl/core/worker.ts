import {randomUUID} from 'node:crypto';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {Snapshots} from '../../data/data_preprocessing/crawl/snapshots.ts';
import {fetchPage,decodedBytes,robotsAllowed,retryDelay} from '../fetch/http.ts';
import {parseSource} from '../sources/index.ts';
import {renderPage,browserReadySelector} from '../fetch/browser.ts';
import {resourceContent} from './resource-content.ts';
import {sourceFor,sourceURL} from '../sources/registry.ts';
import type {FetchResult,ParsedPage} from '../types.ts';
import type {Row} from '../../data/data_preprocessing/database/store.ts';
import {tickOperation} from '../../data/data_preprocessing/crawl/operations.ts';
import type {Embedding} from '../../data/data_preprocessing/RAG/providers/embedding.ts';
import {AppError} from '../../business/shared/config.ts';
import {enqueueOperation} from '../../data/data_preprocessing/crawl/operations.ts';
import {TwitterBrowser} from '../fetch/twitter.ts';
import {TwitterAPI,TwitterAPIError} from '../fetch/twitter-api.ts';
import {parseTwitterAPI} from '../sources/twitter-api.ts';

export class CrawlWorker {
  repo:CrawlStore;snapshots:Snapshots;fetcher:typeof fetchPage;embedding:Embedding|null=null;timer?:NodeJS.Timeout;active=false;stopping=false;abort?:AbortController;pending?:Promise<void>;lastRequest=new Map<string,number>();
  twitter:TwitterBrowser;twitterAPI=new TwitterAPI();
  constructor(repo:CrawlStore,snapshots:Snapshots,fetcher=fetchPage){this.repo=repo;this.snapshots=snapshots;this.fetcher=fetcher;this.twitter=new TwitterBrowser(snapshots.root);}
  start(){this.stopping=false;this.timer=setInterval(()=>{if(!this.pending&&!this.stopping)this.pending=this.tick().catch(()=>{}).finally(()=>{this.pending=undefined;});},1000);this.timer.unref();}
  async stop(){this.stopping=true;clearInterval(this.timer);this.abort?.abort();await this.pending;while(this.active)await new Promise(r=>setTimeout(r,20));await this.twitter.stop();}
  async twitterTask(task:Row){
    try{
      const remaining=await this.repo.store.one('SELECT bytes,config FROM crawl_runs WHERE id=$1',[task.run_id]);
      const r=await this.twitter.acquire(task.url,{visible:task.config.twitter?.transport==='interactive',maxPosts:task.config.twitter?.maxPosts??50,maxScrolls:task.config.twitter?.maxScrolls??10,maxBytes:Math.min(task.config.browserMaxBytes,remaining.config.maxBytes-Number(remaining.bytes)),maxRequests:task.config.browserMaxRequests,timeoutMs:Math.min(task.config.browserTimeoutMs,Math.max(1,task.config.maxMinutes*60000-(Date.now()-Date.parse(task.run_started)))),delayMs:task.config.delayMs,signal:this.abort?.signal,
        shouldContinue:async()=>!!await this.repo.store.one("SELECT t.id FROM crawl_tasks t JOIN crawl_runs r ON r.id=t.run_id WHERE t.id=$1 AND t.lease_token=$2 AND t.status='running' AND r.status='running'",[task.id,task.lease_token])});
      const file=await this.snapshots.save(r),parsed=parseSource('twitter',r.finalUrl,r.bytes.toString('utf8'),{years:task.config.years});
      const error=r.acquisition?.error as {code:string;message:string}|undefined,paused=r.acquisition?.reason==='run_paused_or_cancelled';
      await this.repo.finish(task,r,{...file,chargedBytes:file.byteLength+Number(r.acquisition?.network_bytes||0)},parsed,error?{status:'blocked',...error}:paused?{status:'retry_wait',code:'TWITTER_PAUSED',message:'任务已暂停；继续后重扫并按推文 ID 去重',retryAt:new Date().toISOString()}:undefined);
      await this.repo.store.db.query("UPDATE crawl_sources SET status=$2,audit=jsonb_set(audit,'{last_fetch}',$3::jsonb) WHERE id=$1",[task.source_id,error?'blocked':parsed.projects.length?'social_posts_observed':'empty_result_observed',JSON.stringify({checked_at:r.capturedAt,observed_posts:parsed.projects.length,coverage:'incomplete',reason:r.acquisition?.reason})]);
    }catch(e){
      const code=(e as any).code||'TWITTER_FETCH_FAILED';
      if(code==='TWITTER_RATE_LIMITED'||code==='TWITTER_BROWSER_BUSY'){await this.repo.fail(task,code,(e as Error).message,task.attempt<task.config.maxAttempts?new Date(Date.now()+60000).toISOString():undefined);return;}
      if(code.startsWith('TWITTER_')&&code!=='TWITTER_CANCELLED'){
        await this.repo.store.db.query("UPDATE crawl_tasks SET status='blocked',error=$3,lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2",[task.id,task.lease_token,{code,message:(e as Error).message}]);return;
      }
      throw e;
    }
  }
  async twitterAPITask(task:Row){
    try{
      const remaining=await this.repo.store.one("SELECT bytes,config,status FROM crawl_runs WHERE id=$1",[task.run_id]);
      if(remaining.status!=='running'){
        await this.repo.fail(task,'TWITTER_API_PAUSED','任务已暂停；继续后读取当前 API 页',new Date().toISOString());return;
      }
      const page=await this.twitterAPI.acquire(task.url,{maxPosts:task.config.twitter?.maxPosts??50,maxBytes:Math.min(task.config.browserMaxBytes??20*1024*1024,remaining.config.maxBytes-Number(remaining.bytes)),timeoutMs:Math.min(60000,Math.max(1,task.config.maxMinutes*60000-(Date.now()-Date.parse(task.run_started)))),delayMs:task.config.delayMs,signal:this.abort?.signal,accountUser:task.input?.twitter_api_user});
      const r=page.result,file=await this.snapshots.save(r),dependencies=[];let charged=file.byteLength;
      for(const dep of r.dependencies||[]){const saved=await this.snapshots.save(dep);charged+=saved.byteLength;dependencies.push({url:dep.finalUrl,...saved});}
      r.acquisition={...r.acquisition,dependencies};
      let parsed:ParsedPage;try{parsed=parseTwitterAPI(task.url,page.payload,page.user);}catch{throw new TwitterAPIError('TWITTER_API_INVALID_RESPONSE','X API 推文结构不受支持，未保存猜测字段');}
      parsed.next=page.next;parsed.complete=page.terminal;parsed.reason=String(r.acquisition.reason);parsed.pagination=parsed.pageType==='detail'?undefined:{collectionKey:page.collectionKey,cursor:page.cursor,...page.terminal?{terminalEvidence:'X API returned no next_token for this endpoint/query window'}:{}};
      task.input={...task.input,...page.user?{twitter_api_user:page.user}:{}};
      await this.repo.finish(task,r,{...file,chargedBytes:charged},parsed,page.partialErrors?{status:'blocked',code:'TWITTER_API_PARTIAL_ERRORS',message:'X API 返回部分错误；已保存可用推文，请查看 App 权限或稍后重试'}:undefined);
      await this.repo.store.db.query("UPDATE crawl_sources SET status=$2,audit=jsonb_set(audit,'{last_fetch}',$3::jsonb) WHERE id=$1",[task.source_id,page.partialErrors?'blocked':'api_posts_observed',JSON.stringify({checked_at:r.capturedAt,observed_posts:parsed.projects.length,transport:'official_api',coverage:parsed.reason})]);
    }catch(e){
      if(e instanceof TwitterAPIError){
        if(['TWITTER_API_RATE_LIMITED','TWITTER_API_TEMPORARY','TWITTER_API_NETWORK','TWITTER_API_CANCELLED'].includes(e.code)){
          await this.repo.fail(task,e.code,e.message,this.stopping||task.attempt<task.config.maxAttempts?e.retryAt||new Date(Date.now()+retryDelay(undefined,task.attempt)).toISOString():undefined);return;
        }
        await this.repo.store.db.query("UPDATE crawl_tasks SET status='blocked',error=$3,lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now()",[task.id,task.lease_token,{code:e.code,message:e.message}]);return;
      }
      throw e;
    }
  }
  async limitedFetch(url:string,task:Row){
    const host=new URL(url).host,wait=Math.max(0,(this.lastRequest.get(host)||0)+task.config.delayMs-Date.now());
    if(wait)await new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(timer);this.abort?.signal.removeEventListener('abort',cancel);resolve();},cancel=()=>{clearTimeout(timer);reject(new Error('Stopped'));},timer=setTimeout(done,wait);this.abort?.signal.addEventListener('abort',cancel,{once:true});});
    this.lastRequest.set(host,Date.now());const budget=await this.repo.store.one('SELECT bytes,config FROM crawl_runs WHERE id=$1',[task.run_id]);const available=budget.config.maxBytes-Number(budget.bytes);if(available<=0)throw new AppError('BUDGET_EXHAUSTED','Snapshot byte budget exhausted');return this.fetcher(url,this.abort?.signal,0,url,{maxBytes:Math.min(5*1024*1024,available)});
  }
  async robots(task:Row){
    const url=new URL('/robots.txt',task.url).href,key=new URL(task.url).origin;
    const stored=await this.repo.store.one('SELECT audit FROM crawl_sources WHERE id=$1',[task.source_id]);
    const cached=task.kind==='resource'?stored?.audit?.last_resource_robots:stored?.audit?.robots;
    if(cached?.origin===key&&Date.now()-Date.parse(cached.checked_at)<3600000)return cached;
    const r=await this.limitedFetch(url,task),file=await this.snapshots.save(r);
    const rules=r.statusCode===200&&['readable','empty'].includes(r.classification)?decodedBytes(r).toString('utf8'):null;
    const data={origin:key,status:r.statusCode,classification:r.classification,rules,checked_at:r.capturedAt,blob_path:file.relative,sha256:file.sha256,policy:r.statusCode===404?'not_found; not an authorization grant':rules!==null?'rules_observed':'unavailable; stop acquisition'};
    const field=task.kind==='resource'?'last_resource_robots':'robots';
    await this.repo.store.db.query('UPDATE crawl_sources SET audit=jsonb_set(audit,$2::text[],$3::jsonb),status=CASE WHEN $4 THEN status ELSE $5 END WHERE id=$1',[task.source_id,[field],JSON.stringify(data),task.kind==='resource',rules!==null||r.statusCode===404?'audited_entry_only':'blocked']);
    await this.repo.store.db.query('UPDATE crawl_runs SET bytes=bytes+$2 WHERE id=$1',[task.run_id,file.byteLength]);
    task.bytes=Number(task.bytes)+file.byteLength;return data;
  }
  async tick(){
    if(this.active||this.stopping)return;this.active=true;this.abort=new AbortController();let task:Row|null=null,heartbeat:NodeJS.Timeout|undefined;
    try{
      if(await tickOperation(this.repo,this.snapshots,this.embedding))return;
      task=await this.repo.claim();if(!task){await this.repo.settle();return;}
      const held=task;heartbeat=setInterval(()=>void this.repo.store.db.query("UPDATE crawl_tasks SET lease_expires_at=now()+interval '2 minutes' WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>now()",[held.id,held.lease_token]).catch(()=>{}),30000);heartbeat.unref();
      const source=sourceFor(task.source_id);
      if(task.source_id==='twitter'&&task.kind!=='resource'&&task.config.twitter?.transport==='api'){await this.twitterAPITask(task);return;}
      // Explicit user-initiated browsing uses the user's logged-in local browser.
      // Legacy robot crawling still takes the robots branch below.
      if(task.source_id==='twitter'&&task.kind!=='resource'&&task.config.twitter?.transport==='interactive'){await this.twitterTask(task);return;}
      // Audit robots for every source even when its parser is not implemented.
      const robots=await this.robots(task);
      if(robots.status!==404&&(robots.rules===null||!robotsAllowed(robots.rules,task.url))){await this.repo.store.db.query("UPDATE crawl_tasks SET status='blocked',error=$3,lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2",[task.id,task.lease_token,{code:'ROBOTS_RESTRICTED_OR_UNAVAILABLE',message:task.source_id==='twitter'?'X 的 robots 规则拒绝访问或暂不可读取；当前项目访问策略已停止采集':robots.policy}]);return;}
      if(task.source_id==='twitter'&&task.kind!=='resource'){await this.twitterTask(task);return;}
      if(!source.adapter&&task.kind!=='resource'){await this.repo.store.db.query("UPDATE crawl_tasks SET status='blocked',error=$3,lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2",[task.id,task.lease_token,{code:'ADAPTER_NOT_IMPLEMENTED',message:'来源适配器未实现；仅完成 robots 核查，不会猜测解析规则'}]);return;}
      let r=await this.limitedFetch(task.url,task);let file:{sha256:string;relative:string;byteLength:number;chargedBytes?:number}=await this.snapshots.save(r);
      if(task.kind!=='resource')sourceURL(task.source_id,r.finalUrl);
      if(r.classification!=='readable'){
        const retry=['rate_limited','temporary_error'].includes(r.classification)&&task.attempt<task.config.maxAttempts;
        await this.repo.finish(task,r,file,null,{status:retry?'retry_wait':['challenge','access_restricted'].includes(r.classification)?'blocked':'failed',code:r.classification,message:`HTTP ${r.statusCode}: ${r.classification}`,retryAt:retry?new Date(Date.now()+retryDelay(r.headers['retry-after'],task.attempt)).toISOString():undefined});return;
      }
      if(task.kind==='resource'){await this.repo.finish(task,r,file,null,undefined,resourceContent(task,r));return;}
      let parsed=parseSource(task.source_id,r.finalUrl,decodedBytes(r).toString('utf8'),{years:task.config.years,input:task.input});
      if(task.config.rendering==='browser'||task.config.rendering==='auto'&&parsed.needsBrowser){
        const remaining=await this.repo.store.one('SELECT bytes,config FROM crawl_runs WHERE id=$1',[task.run_id]);
        const originalFile=file;
        try{r=await renderPage(r.finalUrl,{initial:r,signal:this.abort.signal,readySelector:browserReadySelector(task.source_id,r.finalUrl),maxRequests:task.config.browserMaxRequests,maxBytes:Math.min(task.config.browserMaxBytes||20*1024*1024,remaining.config.maxBytes-Number(remaining.bytes)),maxSteps:task.config.browserMaxSteps,timeoutMs:task.config.browserTimeoutMs,delayMs:task.config.delayMs,allowURL:url=>{try{return !!sourceURL(task!.source_id,url);}catch{return false;}}});}
        catch(e){await this.repo.finish(task,r,file,parsed,{status:'blocked',code:(e as any).code||'BROWSER_ACQUISITION_FAILED',message:String((e as Error).message).slice(0,300)});return;}
        const dependencies=[],charges=new Map([[originalFile.sha256,originalFile.byteLength]]);
        for(const dependency of r.dependencies||[]){const saved=await this.snapshots.save(dependency);dependencies.push({url:dependency.finalUrl,status:dependency.statusCode,...saved,acquisition:dependency.acquisition||{}});charges.set(saved.sha256,saved.byteLength);}
        r.acquisition={...r.acquisition,dependencies};file=await this.snapshots.save(r);charges.set(file.sha256,file.byteLength);file.chargedBytes=[...charges.values()].reduce((sum,n)=>sum+n,0);
        if(r.acquisition.error){const e=r.acquisition.error as {code:string;message:string};await this.repo.finish(task,r,file,parsed,{status:'blocked',code:e.code,message:e.message});return;}
        if(r.classification!=='readable'){await this.repo.finish(task,r,file,null,{status:'blocked',code:r.classification,message:'Rendered response is not a verified readable content page'});return;}
        parsed=parseSource(task.source_id,r.finalUrl,r.bytes.toString('utf8'),{years:task.config.years,input:task.input});
        if(r.acquisition.partial){parsed.complete=false;if(parsed.pagination)delete parsed.pagination.terminalEvidence;parsed.reason+='; browser acquisition reports dependency gaps';}
      }
      if(!parsed.projects.length&&!parsed.events?.length&&!parsed.outcomes?.length&&!parsed.links.length&&!parsed.next&&!parsed.pagination?.terminalEvidence){
        await this.repo.finish(task,r,file,parsed,{status:'blocked',code:'UNKNOWN_TEMPLATE_OR_OUT_OF_SCOPE',message:parsed.reason});return;
      }
      const saved=await this.repo.finish(task,r,file,parsed);
      if(saved.outcomeProjectIds.length||saved.projectIds.length&&await this.repo.store.one("SELECT id FROM crawl_selection_decisions WHERE project_id=ANY($1::text[]) AND selected=true LIMIT 1",[saved.projectIds]))await enqueueOperation(this.repo,'selection',{run_id:task.run_id},`auto-select:${saved.snapshotId}`);
      await this.repo.store.db.query("UPDATE crawl_sources SET status=$3,audit=jsonb_set(audit,'{last_fetch}',$2::jsonb) WHERE id=$1",[task.source_id,JSON.stringify({checked_at:r.capturedAt,url:r.finalUrl,parser:parsed.parserVersion,page_type:parsed.pageType,projects:parsed.projects.length,events:parsed.events?.length||0,outcomes:parsed.outcomes?.length||0,coverage:parsed.complete?'verified_page_scope':'incomplete'}),parsed.outcomes?.length?'official_results_observed':parsed.projects.length?'project_sample_parsed':'event_navigation_observed']);
    }catch(e){if(task){const exhausted=['BUDGET_EXHAUSTED','SOURCE_SIZE'].includes((e as any).code);if(exhausted)await this.repo.store.db.query("UPDATE crawl_runs SET status='paused',reason='budget_exhausted' WHERE id=$1",[task.run_id]);const retry=exhausted||this.stopping||task.attempt<task.config.maxAttempts;await this.repo.fail(task,(e as any).code||'FETCH_FAILED',this.stopping?'worker stopped; resumable':String((e as Error).message).slice(0,300),retry?new Date(Date.now()+(this.stopping?0:retryDelay(undefined,task.attempt))).toISOString():undefined).catch(()=>{});}}
    finally{clearInterval(heartbeat);this.active=false;this.abort=undefined;await this.repo.settle().catch(()=>{});}
  }
}
