import {randomUUID} from 'node:crypto';
import {Store,hash,type Row} from './store.ts';
import {assert} from '../../business/shared/config.ts';

export const callRoles=['steve','teresa','april','bob','ash'] as const;
export type CallRole=typeof callRoles[number];
const ACTIVE_TURN="('QUEUED','THINKING')";

/** Persistence for one-to-one expert calls. Every lookup is scoped by case and call. */
export class CallStore {
  store:Store;
  constructor(store:Store){this.store=store;}
  async createCall(caseId:string,role:CallRole,key:string,meta:Row={}){
    await this.store.getCase(caseId);
    const existing=await this.store.one('SELECT * FROM call_sessions WHERE case_id=$1 AND request_key=$2',[caseId,key]);
    if(existing){assert(existing.role===role,'IDEMPOTENCY_CONFLICT','相同请求标识不能用于不同专家',409);return existing;}
    const created=await this.store.one("INSERT INTO call_sessions(id,case_id,role,status,request_key,meta) VALUES($1,$2,$3,'ACTIVE',$4,$5) ON CONFLICT(case_id,request_key) DO NOTHING RETURNING *",[randomUUID(),caseId,role,key,meta]);
    if(created)return created;
    const concurrent=await this.store.one('SELECT * FROM call_sessions WHERE case_id=$1 AND request_key=$2',[caseId,key]);
    assert(concurrent&&concurrent.role===role,'IDEMPOTENCY_CONFLICT','相同请求标识不能用于不同专家',409);return concurrent;
  }
  async call(caseId:string,callId:string){
    const c=await this.store.one('SELECT * FROM call_sessions WHERE id=$1 AND case_id=$2',[callId,caseId]);
    assert(c,'CALL_NOT_FOUND','通话不存在或不属于当前项目',404);return c;
  }
  async listCalls(caseId:string){
    await this.store.getCase(caseId);
    return this.store.rows(`SELECT s.*,count(t.id)::int AS turn_count,max(t.updated_at) AS last_turn_at
      FROM call_sessions s LEFT JOIN call_turns t ON t.call_id=s.id WHERE s.case_id=$1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 100`,[caseId]);
  }
  async detail(caseId:string,callId:string){
    const call=await this.call(caseId,callId);
    return {call,turns:await this.store.rows('SELECT * FROM call_turns WHERE call_id=$1 ORDER BY seq',[callId])};
  }
  async turn(caseId:string,callId:string,turnId:string){
    const t=await this.store.one('SELECT * FROM call_turns WHERE id=$1 AND call_id=$2 AND case_id=$3',[turnId,callId,caseId]);
    assert(t,'TURN_NOT_FOUND','轮次不存在或不属于该通话',404);return t;
  }
  async turnById(turnId:string){return this.store.one('SELECT * FROM call_turns WHERE id=$1',[turnId]);}
  async addTurn(caseId:string,callId:string,input:{request_key:string;text:string;input_source:'TEXT'|'BROWSER_STT';stt:Row}){
    return this.store.db.transaction(async tx=>{
      const call=(await tx.query<Row>('SELECT * FROM call_sessions WHERE id=$1 AND case_id=$2 FOR UPDATE',[callId,caseId])).rows[0];
      assert(call,'CALL_NOT_FOUND','通话不存在或不属于当前项目',404);
      const existing=(await tx.query<Row>('SELECT * FROM call_turns WHERE call_id=$1 AND request_key=$2',[callId,input.request_key])).rows[0];
      if(existing){assert(hash(existing.user_text)===hash(input.text)&&existing.input_source===input.input_source,'IDEMPOTENCY_CONFLICT','相同轮次标识不能用于不同内容',409);return {turn:existing,duplicate:true};}
      assert(call.status==='ACTIVE','CALL_ENDED','通话已结束，请重新拨打',409);
      const active=(await tx.query<Row>(`SELECT id FROM call_turns WHERE call_id=$1 AND status IN ${ACTIVE_TURN}`,[callId])).rows[0];
      assert(!active,'TURN_ACTIVE','上一轮仍在排队或生成，请等待或取消后再发送',409);
      const seq=Number((await tx.query<Row>('SELECT coalesce(max(seq),0)+1 AS next FROM call_turns WHERE call_id=$1',[callId])).rows[0].next);
      const turn=(await tx.query<Row>("INSERT INTO call_turns(id,call_id,case_id,role,seq,status,request_key,input_source,user_text,stt,timings) VALUES($1,$2,$3,$4,$5,'QUEUED',$6,$7,$8,$9,$10) RETURNING *",
        [randomUUID(),callId,caseId,call.role,seq,input.request_key,input.input_source,input.text,input.stt,{submitted_at:new Date().toISOString()}])).rows[0];
      await tx.query('UPDATE call_sessions SET updated_at=now() WHERE id=$1',[callId]);
      return {turn,duplicate:false};
    });
  }
  /** Conditional transitions: a cancelled or ended turn is never resurrected by a late result. */
  async markThinking(turnId:string,timing:Row){
    return (await this.store.rows(`UPDATE call_turns SET status='THINKING',timings=timings||$2::jsonb,updated_at=now() WHERE id=$1 AND status='QUEUED' RETURNING id`,[turnId,JSON.stringify(timing)])).length>0;
  }
  async complete(turnId:string,reply:Row,provenance:Row,timing:Row){
    return (await this.store.rows(`UPDATE call_turns SET status='COMPLETED',reply=$2,provenance=$3,timings=timings||$4::jsonb,error=null,updated_at=now() WHERE id=$1 AND status IN ${ACTIVE_TURN} RETURNING id`,[turnId,reply,provenance,JSON.stringify(timing)])).length>0;
  }
  async fail(turnId:string,error:Row,timing:Row={}){
    return (await this.store.rows(`UPDATE call_turns SET status='FAILED',error=$2,timings=timings||$3::jsonb,updated_at=now() WHERE id=$1 AND status IN ${ACTIVE_TURN} RETURNING id`,[turnId,error,JSON.stringify(timing)])).length>0;
  }
  async cancelTurn(turnId:string,reason:string){
    return (await this.store.rows(`UPDATE call_turns SET status='CANCELLED',error=$2,timings=timings||$3::jsonb,updated_at=now() WHERE id=$1 AND status IN ${ACTIVE_TURN} RETURNING id`,[turnId,{code:'CANCELLED',message:reason},JSON.stringify({cancelled_at:new Date().toISOString()})])).length>0;
  }
  async recentTurns(callId:string,beforeSeq:number,limit=8){
    const rows=await this.store.rows("SELECT seq,user_text,corrections,reply,input_source,playback FROM call_turns WHERE call_id=$1 AND seq<$2 AND status='COMPLETED' ORDER BY seq DESC",[callId,beforeSeq]);
    // Deterministic compact context: no extra model call, and never represented as evidence.
    let budget=6000;
    const earlier:Row[]=[];
    for(const row of rows.slice(limit)){
      const item={seq:row.seq,user:String(row.corrections?.at(-1)?.text||row.user_text).slice(0,240),expert:String(row.reply?.spoken_text||'').slice(0,240),playback:row.playback||{status:'NOT_REPORTED',progress:'UNKNOWN'}};
      const size=JSON.stringify(item).length;if(size>budget)break;
      budget-=size;earlier.push(item);
    }
    return {included:rows.slice(0,limit).reverse(),omitted:Math.max(0,rows.length-limit),earlier:earlier.reverse(),earlier_omitted:Math.max(0,rows.length-limit-earlier.length)};
  }
  async recordPlayback(caseId:string,callId:string,turnId:string,playback:Row){
    const t=await this.turn(caseId,callId,turnId);assert(t.status==='COMPLETED','TURN_NOT_COMPLETED','只有已完成的回答可以记录播放',409);
    await this.store.db.query('UPDATE call_turns SET playback=$2,updated_at=now() WHERE id=$1',[turnId,{...playback,reported_at:new Date().toISOString()}]);
    return this.turn(caseId,callId,turnId);
  }
  /** Corrections are appended; the originally submitted text stays as the record of what the expert received. */
  async correct(caseId:string,callId:string,turnId:string,text:string){
    const t=await this.turn(caseId,callId,turnId);assert(!['QUEUED','THINKING'].includes(t.status),'TURN_ACTIVE','生成中的轮次不能更正',409);
    await this.store.db.query('UPDATE call_turns SET corrections=corrections||$2::jsonb,updated_at=now() WHERE id=$1',[turnId,JSON.stringify([{text,at:new Date().toISOString(),applies_to:'TRANSCRIPT_RECORD_ONLY',note:'已发送给专家的原文保持不变；更正不会自动重新生成回答'}])]);
    return this.turn(caseId,callId,turnId);
  }
  async endCall(caseId:string,callId:string,reason='USER_HANGUP'){
    // Same row lock as addTurn: ending cannot race a submitted turn into an ended call.
    return this.store.db.transaction(async tx=>{
      const call=(await tx.query<Row>('SELECT * FROM call_sessions WHERE id=$1 AND case_id=$2 FOR UPDATE',[callId,caseId])).rows[0];
      assert(call,'CALL_NOT_FOUND','通话不存在或不属于当前项目',404);
      const active=(await tx.query<Row>(`UPDATE call_turns SET status='CANCELLED',error=$2,timings=timings||$3::jsonb,updated_at=now() WHERE call_id=$1 AND status IN ${ACTIVE_TURN} RETURNING id`,[callId,{code:'CANCELLED',message:'通话已结束'},JSON.stringify({cancelled_at:new Date().toISOString()})])).rows;
      await tx.query("UPDATE call_sessions SET status='ENDED',ended_at=coalesce(ended_at,now()),meta=meta||$2::jsonb,updated_at=now() WHERE id=$1 AND status='ACTIVE'",[callId,JSON.stringify({ended_reason:reason})]);
      return {call:(await tx.query<Row>('SELECT * FROM call_sessions WHERE id=$1',[callId])).rows[0],cancelled:active.map(t=>t.id)};
    });
  }
  /** Single-owner app: logout ends every open call so no turn keeps generating without a session. */
  async endAllActive(reason:string){
    const open=await this.store.rows("SELECT id,case_id FROM call_sessions WHERE status='ACTIVE'");
    const cancelled:string[]=[];for(const c of open)cancelled.push(...(await this.endCall(c.case_id,c.id,reason)).cancelled);
    return cancelled;
  }
  async deleteCall(caseId:string,callId:string){
    const ended=await this.endCall(caseId,callId,'DELETED');
    await this.store.db.transaction(async tx=>{await tx.query('DELETE FROM call_turns WHERE call_id=$1',[callId]);await tx.query('DELETE FROM call_sessions WHERE id=$1 AND case_id=$2',[callId,caseId]);});
    return {deleted:callId,cancelled:ended.cancelled};
  }
  /** After a restart nothing is re-run automatically, so quota is never spent twice for one turn. */
  async recover(){
    const turns=await this.store.rows(`UPDATE call_turns SET status='FAILED',error=$1,updated_at=now() WHERE status IN ${ACTIVE_TURN} RETURNING id`,[{code:'INTERRUPTED',message:'应用曾中断；本轮未自动重新生成，请重新发送'}]);
    await this.store.db.query("UPDATE call_sessions SET status='ENDED',ended_at=now(),meta=meta||$1::jsonb,updated_at=now() WHERE status='ACTIVE'",[JSON.stringify({ended_reason:'SERVER_RESTART'})]);
    return turns.length;
  }
}
