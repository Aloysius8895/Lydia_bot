import { randomUUID } from 'node:crypto';
import { Store, type Row } from '../../data/data_preprocessing/database/store.ts';
import { Skills } from './skills.ts';
import { ClaudeCLI } from './providers/claude.ts';
import { plan, runStep } from './research.ts';
import { AppError, assert } from '../shared/config.ts';
import { Embedding } from '../../data/data_preprocessing/RAG/providers/embedding.ts';
import { Search } from '../../data/data_preprocessing/RAG/search.ts';
import { ingestURL } from '../../data/data_preprocessing/RAG/sources.ts';
import { isSmallTalk } from './small-talk.ts';
import { converse } from './converse.ts';

/** Whole-task limit; single Claude calls are limited separately (config.cliTimeout, 5 minutes). */
export const TASK_LIMIT_MS=30*60*1000;

export class Worker {
  store:Store;skills:Skills;cli:ClaudeCLI;embedding:Embedding|null;active:{id:string;abort:AbortController}|null=null;checking=false;stopped=false;timer:NodeJS.Timeout|null=null;
  constructor(store:Store,skills:Skills,cli:ClaudeCLI,embedding:Embedding|null=null){this.store=store;this.skills=skills;this.cli=cli;this.embedding=embedding;}
  async start(){await this.store.recover();this.timer=setInterval(()=>void this.tick().catch(()=>{}),1000);}
  async cancel(id:string){await this.store.task(id);
    const changed=await this.store.rows("UPDATE tasks SET status='CANCELLED',error=$2,updated_at=now() WHERE id=$1 AND status IN ('QUEUED','RUNNING','PAUSED') RETURNING id",[id,{code:'CANCELLED',message:'用户已取消'}]);
    if(changed.length&&this.active?.id===id)this.active.abort.abort();return this.store.task(id);}
  async tick(){
    if(this.active||this.stopped||this.checking)return;this.checking=true;
    let t:Row|undefined;try{t=await this.store.one("SELECT * FROM tasks WHERE status='QUEUED' ORDER BY created_at LIMIT 1");}finally{this.checking=false;}if(!t||this.stopped)return;
    const abort=new AbortController();this.active={id:t.id,abort};
    let timedOut=false;const deadline=setTimeout(()=>{timedOut=true;abort.abort();},TASK_LIMIT_MS);
    try{
      await this.store.updateTask(t.id,'RUNNING',t.checkpoint);
      await this.skills.load('controller');await this.cli.auth();if(abort.signal.aborted)throw new AppError('CANCELLED','已取消');
      // The message box decides: 'chat' is a direct Claude answer; only 'research' / 'model' (toggled on by the user)
      // run the expert pipeline. A bare greeting is answered directly even with research on.
      const smallTalk=t.kind!=='model'&&isSmallTalk(t.input.message);
      if(t.kind==='chat'||smallTalk){const turn=await converse(this.store,this.cli,t,abort.signal);if(abort.signal.aborted)throw new AppError('CANCELLED','已取消');await this.reply(t,turn.reply,turn.usage,smallTalk?'SMALL_TALK':'CHAT');return;}
      if(t.kind==='model')assert((await this.store.getCase(t.case_id)).selected_gap_id,'SELECTION_REQUIRED','请先选择 Gap');
      if(t.kind==='research')await this.store.db.query("UPDATE cases SET phase='RESEARCHING' WHERE id=$1",[t.case_id]);
      if(t.kind==='research')await this.collect(t,abort.signal);
      const steps=plan(t.kind,t.input.message);
      for(const step of steps){
        if(abort.signal.aborted)throw new AppError('CANCELLED','已取消');
        const old=await this.store.one('SELECT step FROM expert_runs WHERE task_id=$1 AND step=$2',[t.id,step]);
        if(old)continue;
        await this.store.updateTask(t.id,'RUNNING',{...t.checkpoint,current:step,steps});
        const result=await runStep(this.store,this.skills,this.cli,t,step,abort.signal,this.embedding);
        if(abort.signal.aborted)throw new AppError('CANCELLED','已取消');
        await this.store.db.query('INSERT INTO expert_runs(task_id,step,role,output,provenance) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[t.id,step,step==='steve_review'?'steve':step,result.output,result.provenance]);
      }
      await this.finalize(t,steps);
    }catch(e){
      const current=await this.store.task(t.id);if(current.status!=='CANCELLED'){
        const code=timedOut?'TASK_TIMEOUT':(e as any).code||'RESEARCH_FAILED',message=timedOut?'本轮达到30分钟上限，已暂停并保存进度':e instanceof AppError?e.message:'结构化输出或运行验证未通过；保留已完成步骤，请检查日志/资料后恢复';
        const status=!timedOut&&abort.signal.aborted?'CANCELLED':'PAUSED';await this.store.updateTask(t.id,status,current.checkpoint,{code,message});
        if(status==='PAUSED')await this.partial(t,message).catch(()=>{});
      }
    }finally{clearTimeout(deadline);this.active=null;}
  }
  async collect(t:Row,signal:AbortSignal){
    const collection=t.checkpoint.collection;
    if(collection)return; // A recorded uncertain request is never silently repeated on recovery.
    t.checkpoint={...t.checkpoint,collection:{status:'IN_FLIGHT',note:'若此步骤中断，恢复时不自动重复外部搜索'}};
    await this.store.updateTask(t.id,'RUNNING',t.checkpoint);
    try{
      const c=await this.store.getCase(t.case_id);
      const results=await new Search(this.store).search(t.case_id,`${c.title} ${t.input.message}`.slice(0,500),signal,t.id);
      t.checkpoint.collection={status:'DISCOVERED',results,attempts:[]};await this.store.updateTask(t.id,'RUNNING',t.checkpoint);
      for(const source of results.slice(0,3)){
        if(signal.aborted)throw new AppError('CANCELLED','已取消');
        try{const doc=await ingestURL(this.store,this.embedding,t.case_id,source.url,signal);t.checkpoint.collection.attempts.push({url:source.url,status:'FETCHED',evidence_id:doc.source_id});}
        catch(e){if(signal.aborted)throw e;t.checkpoint.collection.attempts.push({url:source.url,status:'FAILED',code:(e as any).code||'UNAVAILABLE'});}
        await this.store.updateTask(t.id,'RUNNING',t.checkpoint);
      }
      t.checkpoint.collection.status='COLLECTION_FINISHED';
    }catch(e){if(signal.aborted)throw e;t.checkpoint.collection={status:'NOT_RUN_OR_FAILED',code:(e as any).code||'UNAVAILABLE',note:'自动搜索未完成；仅分析已读资料，不能宣称实时全网调查'};}
    await this.store.updateTask(t.id,'RUNNING',t.checkpoint);
  }
  /** A direct conversational answer: shown as the advisor's reply; it is not research output or evidence. */
  async reply(t:Row,reply:string,usage:unknown,mode:'SMALL_TALK'|'CHAT'){
    const c=await this.store.getCase(t.case_id);
    await this.store.db.transaction(async tx=>{
      const state=(await tx.query<Row>('SELECT status FROM tasks WHERE id=$1 FOR UPDATE',[t.id])).rows[0];
      assert(state.status!=='CANCELLED','CANCELLED','已取消');if(state.status==='COMPLETED')return;
      await tx.query('INSERT INTO artifacts(id,case_id,task_id,kind,selection_version,content,meta) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),t.case_id,t.id,'summary',c.selection_version,reply,{mode,research:false,usage}]);
      await tx.query("UPDATE tasks SET status='COMPLETED',checkpoint=$2,error=null,updated_at=now() WHERE id=$1",[t.id,{completed:[mode.toLowerCase()],mode}]);
    });
  }
  /** When research pauses, post what the finished experts already concluded so the chat is never left empty.
   *  Stored as kind 'partial' (not 'summary'), so exports and Obsidian keep using only completed research. */
  async partial(t:Row,reason:string){
    const runs=await this.store.rows('SELECT role,step,output FROM expert_runs WHERE task_id=$1 ORDER BY created_at',[t.id]);
    const done=runs.filter((r:Row)=>String(r.output?.summary||'').trim());if(!done.length)return;
    const c=await this.store.getCase(t.case_id);
    const content=[`⚠️ 研究暂停了（${reason}），还没有经过最终复核。下面是已完成的 ${done.length} 位专家的阶段性结论，可以先参考；点「恢复此任务」会接着跑完剩下的步骤。`,...done.map((r:Row)=>`**${r.role[0].toUpperCase()+r.role.slice(1)}**\n${String(r.output.summary).trim()}`)].join('\n\n');
    await this.store.db.query("DELETE FROM artifacts WHERE task_id=$1 AND kind='partial'",[t.id]);
    await this.store.db.query('INSERT INTO artifacts(id,case_id,task_id,kind,selection_version,content,meta) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),t.case_id,t.id,'partial',c.selection_version,content,{mode:'PARTIAL',research:'INCOMPLETE',semantic_review:'REQUIRED',steps:done.map((r:Row)=>r.step)}]);
  }
  async finalize(t:Row,steps:string[]){
    const runs=await this.store.rows('SELECT * FROM expert_runs WHERE task_id=$1 ORDER BY created_at',[t.id]);
    const c=await this.store.getCase(t.case_id);assert(c.selection_version===t.selection_version,'STALE_SELECTION','案件选择已改变');
    const summary=runs.find(r=>r.step===steps.at(-1))?.output;
    await this.store.db.transaction(async tx=>{
      const state=(await tx.query<Row>('SELECT status FROM tasks WHERE id=$1 FOR UPDATE',[t.id])).rows[0];
      assert(state.status!=='CANCELLED','CANCELLED','已取消');if(state.status==='COMPLETED')return;
      const next=async(prefix:string,kind:string)=>{const r=await tx.query<Row>('INSERT INTO counters VALUES($1,1) ON CONFLICT(scope) DO UPDATE SET value=counters.value+1 RETURNING value',[`${t.case_id}:${kind}`]);return prefix+String(r.rows[0].value).padStart(3,'0');};
      for(const run of runs){
        for(const f of run.output.findings){const id=await next('C','claim');await tx.query('INSERT INTO claims(case_id,id,data) VALUES($1,$2,$3)',[t.case_id,id,{...f,id,task_id:t.id,role:run.role,semantic_review:'REQUIRED'}]);}
        for(const r of run.output.requirements){const id=await next('R','requirement');await tx.query('INSERT INTO requirements(case_id,id,gap_id,data) VALUES($1,$2,$3,$4)',[t.case_id,id,t.kind==='model'?c.selected_gap_id:null,{...r,id,task_id:t.id,gap_id:t.kind==='model'?c.selected_gap_id:null,verification_status:'NOT_VERIFIED',semantic_review:'REQUIRED',proposed_mvp_treatment:'待选定后评估'}]);}
      }
      if(t.kind!=='model')for(const g of summary.gaps){const id=await next('G','gap');await tx.query('INSERT INTO gaps(case_id,id,data) VALUES($1,$2,$3)',[t.case_id,id,{...g,id,task_id:t.id,semantic_review:'REQUIRED'}]);}
      for(const [kind,content] of [['summary',summary.summary],...(t.kind==='model'?[['model',runs.find(r=>r.step==='ash')!.output.model],['validation',runs.find(r=>r.step==='ash')!.output.validation]]:[])] as [string,string][]){
        await tx.query('INSERT INTO artifacts(id,case_id,task_id,kind,selection_version,content,meta) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),t.case_id,t.id,kind,c.selection_version,content,{semantic_review:'REQUIRED'}]);
      }
      await tx.query("UPDATE tasks SET status='COMPLETED',checkpoint=$2,error=null,updated_at=now() WHERE id=$1",[t.id,{completed:steps}]);
      await tx.query("UPDATE cases SET phase=$2,updated_at=now() WHERE id=$1",[t.case_id,c.selected_gap_id?'MODELING':'AWAITING_SELECTION']);
    });
  }
  async stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);this.active?.abort.abort();}
}
