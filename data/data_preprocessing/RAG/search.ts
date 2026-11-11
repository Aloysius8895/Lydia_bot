import { randomUUID } from 'node:crypto';
import { Store } from '../database/store.ts';
import { assert, AppError } from '../../../business/shared/config.ts';

export class Search {
  store:Store; env:NodeJS.ProcessEnv;
  constructor(store:Store,env=process.env){this.store=store;this.env=env;}
  async reserve(caseId:string,taskId:string|null=null) {
    await this.store.getCase(caseId);const e=this.env;
    assert(e.TAVILY_FREE_ONLY_CONFIRMED==='true'&&e.TAVILY_API_KEY&&e.TAVILY_ACCOUNT_ID,'SEARCH_DISABLED','未配置已确认无超额扣费的免费搜索',503);
    const period=new Date().toISOString().slice(0,7),checked=e.TAVILY_BALANCE_CHECKED_AT||'';
    assert(e.TAVILY_CREDIT_PERIOD===period&&Date.now()-Date.parse(checked)>=0&&Date.now()-Date.parse(checked)<24*3600000,'SEARCH_BALANCE_UNKNOWN','免费额度未在最近24小时确认，自动搜索暂停',503);
    const remaining=Number(e.TAVILY_CREDITS_REMAINING);assert(Number.isInteger(remaining)&&remaining>0,'SEARCH_EXHAUSTED','免费搜索额度已用尽',503);
    const id=randomUUID();
    await this.store.db.transaction(async tx=>{
      await tx.query('INSERT INTO search_budgets VALUES($1,$2,$3,$4) ON CONFLICT(account_id,period) DO NOTHING',[e.TAVILY_ACCOUNT_ID,period,remaining,checked]);
      // Only lower the local estimate. Increasing credits requires a new explicit account/period audit.
      await tx.query('UPDATE search_budgets SET remaining=LEAST(remaining,$3) WHERE account_id=$1 AND period=$2',[e.TAVILY_ACCOUNT_ID,period,remaining]);
      const r=await tx.query('UPDATE search_budgets SET remaining=remaining-1 WHERE account_id=$1 AND period=$2 AND remaining>=1 RETURNING remaining',[e.TAVILY_ACCOUNT_ID,period]);
      assert(r.rows.length,'SEARCH_EXHAUSTED','免费搜索额度已用尽',503);
      await tx.query('INSERT INTO search_requests(id,case_id,task_id,account_id,period,credits,status) VALUES($1,$2,$3,$4,$5,1,$6)',[id,caseId,taskId,e.TAVILY_ACCOUNT_ID,period,'RESERVED']);
    });return id;
  }
  async search(caseId:string,query:string,signal?:AbortSignal,taskId:string|null=null) {
    const id=await this.reserve(caseId,taskId);
    try{
      const r=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.env.TAVILY_API_KEY}`},body:JSON.stringify({query,search_depth:'basic',max_results:5,include_answer:false,include_raw_content:false}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
      assert(r.ok,'SEARCH_FAILED','免费搜索请求未成功，预留额度不自动退回以避免超额',503);
      const j=await r.json() as any;
      await this.store.db.query("UPDATE search_requests SET status='SETTLED' WHERE id=$1",[id]);
      return (j.results||[]).map((x:any)=>({title:String(x.title),url:String(x.url),snippet:String(x.content||''),evidence:false}));
    }catch(e){await this.store.db.query("UPDATE search_requests SET status='UNKNOWN_CHARGED' WHERE id=$1",[id]);throw e;}
  }
}
