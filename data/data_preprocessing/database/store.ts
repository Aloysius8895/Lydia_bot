import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { assert, AppError } from '../../../business/shared/config.ts';
import {migrate} from './migrations.ts';

export type Row = Record<string, any>;
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export class Store {
  db: PGlite;
  constructor(db: PGlite) { this.db = db; }
  static async open(dir?: string) {
    if (dir) await mkdir(dir, { recursive: true });
    const db = await PGlite.create(dir || 'memory://', { extensions: { vector } });
    await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    const store=new Store(db);
    try{await migrate(store);return store;}catch(e){await db.close();throw e;}
  }
  async rows(sql: string, params: any[] = []): Promise<Row[]> { return (await this.db.query<Row>(sql, params)).rows; }
  async one(sql: string, params: any[] = []) { return (await this.rows(sql, params))[0]; }
  async createCase(title: string, brief: string, meta: Row = {}) {
    return this.one('INSERT INTO cases(id,title,brief,meta) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(),title,brief,meta]);
  }
  async getCase(id: string) { const c = await this.one('SELECT * FROM cases WHERE id=$1',[id]); assert(c,'CASE_NOT_FOUND','项目不存在',404); return c; }
  async listCases() { return this.rows('SELECT * FROM cases ORDER BY updated_at DESC'); }
  async setting(key: string) { return (await this.one('SELECT data FROM settings WHERE key=$1',[key]))?.data; }
  async setSetting(key: string, data: unknown) { await this.db.query('INSERT INTO settings VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET data=$2',[key,data]); }
  async nextId(scope: string, prefix: string) {
    const row = await this.one('INSERT INTO counters VALUES($1,1) ON CONFLICT(scope) DO UPDATE SET value=counters.value+1 RETURNING value',[scope]);
    return prefix + String(row!.value).padStart(3,'0');
  }
  async evidence(caseId: string) { await this.getCase(caseId); return this.rows("SELECT id,source_id,title,content,url,canonical_url,meta,version,active,created_at FROM documents WHERE case_id=$1 AND collection='MARKET' ORDER BY created_at",[caseId]); }
  async checkEvidence(caseId: string, ids: string[], label?: string) {
    assert(label !== 'SOURCE_SUPPORTED' || ids.length > 0,'EVIDENCE_REQUIRED','来源支持的主张需要原始证据');
    for (const id of ids) {
      const e = await this.one("SELECT id FROM documents WHERE case_id=$1 AND collection='MARKET' AND source_id=$2",[caseId,id]);
      assert(e,'CROSS_CASE_EVIDENCE',`证据 ${id} 不属于本项目`);
    }
  }
  async saveClaim(caseId: string, data: Row) {
    await this.checkEvidence(caseId,data.evidence_ids || [],data.claim_label);
    const id = await this.nextId(`${caseId}:claim`,'C');
    await this.db.query('INSERT INTO claims VALUES($1,$2,$3,now())',[caseId,id,{...data,id}]); return id;
  }
  async saveGap(caseId: string, data: Row) {
    await this.getCase(caseId); await this.checkEvidence(caseId,data.evidence_ids || [],data.claim_label);
    const id=await this.nextId(`${caseId}:gap`,'G');
    await this.db.query('INSERT INTO gaps(case_id,id,data) VALUES($1,$2,$3)',[caseId,id,{...data,id}]); return id;
  }
  async saveRequirement(caseId: string, data: Row) {
    await this.checkEvidence(caseId,data.evidence_ids || [],data.claim_label);
    if (data.gap_id) assert(await this.one('SELECT id FROM gaps WHERE case_id=$1 AND id=$2',[caseId,data.gap_id]),'GAP_NOT_FOUND','要求关联的缺口不存在');
    if (data.priority === 'EXPLICIT_MUST') assert(data.claim_label === 'SOURCE_SUPPORTED' && data.priority_basis,'PRIORITY_UNSUPPORTED','明确必需要求必须有原文依据');
    const id=await this.nextId(`${caseId}:requirement`,'R');
    const saved={...data,id,verification_status:data.verification_status || 'NOT_VERIFIED'};
    await this.db.query('INSERT INTO requirements(case_id,id,gap_id,data) VALUES($1,$2,$3,$4)',[caseId,id,data.gap_id || null,saved]); return id;
  }
  async selectGap(caseId: string, gapId: string, confirmed: boolean, userMessage: string) {
    assert(confirmed === true && userMessage.trim().length>0,'SELECTION_REQUIRED','需要明确确认具体 Gap');
    await this.db.transaction(async tx => {
      const c=(await tx.query<Row>('SELECT * FROM cases WHERE id=$1 FOR UPDATE',[caseId])).rows[0];
      assert(c,'CASE_NOT_FOUND','项目不存在',404);
      assert((await tx.query('SELECT id FROM gaps WHERE case_id=$1 AND id=$2',[caseId,gapId])).rows.length,'GAP_NOT_FOUND','缺口不属于该项目');
      assert(!(await tx.query("SELECT id FROM tasks WHERE case_id=$1 AND status IN ('RUNNING','QUEUED')",[caseId])).rows.length,'TASK_ACTIVE','请先完成或取消当前任务',409);
      const v=c.selection_version+1;
      await tx.query('INSERT INTO decisions(id,case_id,gap_id,version,user_message) VALUES($1,$2,$3,$4,$5)',[randomUUID(),caseId,gapId,v,userMessage]);
      await tx.query("UPDATE cases SET selected_gap_id=$2,selection_version=$3,phase='MODELING',updated_at=now() WHERE id=$1",[caseId,gapId,v]);
    });
    return this.getCase(caseId);
  }
  async enqueue(caseId: string, kind: string, input: Row, key: string) {
    const c=await this.getCase(caseId);
    assert(kind !== 'model' || c.selected_gap_id,'SELECTION_REQUIRED','请先选择一个 Gap');
    const existing=await this.one('SELECT * FROM tasks WHERE case_id=$1 AND request_key=$2',[caseId,key]);
    if(existing) { assert(hash(JSON.stringify(existing.input))===hash(JSON.stringify(input)) && existing.kind===kind,'IDEMPOTENCY_CONFLICT','相同请求标识不能用于不同内容',409); return existing; }
    const created=await this.one("INSERT INTO tasks(id,case_id,kind,status,input,request_key,selection_version) VALUES($1,$2,$3,'QUEUED',$4,$5,$6) ON CONFLICT(case_id,request_key) DO NOTHING RETURNING *",[randomUUID(),caseId,kind,input,key,c.selection_version]);
    if(created)return created;
    const concurrent=await this.one('SELECT * FROM tasks WHERE case_id=$1 AND request_key=$2',[caseId,key]);
    assert(concurrent&&hash(JSON.stringify(concurrent.input))===hash(JSON.stringify(input))&&concurrent.kind===kind,'IDEMPOTENCY_CONFLICT','相同请求标识不能用于不同内容',409);return concurrent;
  }
  async task(id: string) { const t=await this.one('SELECT * FROM tasks WHERE id=$1',[id]); assert(t,'TASK_NOT_FOUND','任务不存在',404); return t; }
  async updateTask(id: string, status: string, checkpoint: Row, error: Row|null=null) {
    const updated=await this.rows("UPDATE tasks SET status=$2,checkpoint=$3,error=$4,updated_at=now() WHERE id=$1 AND status<>'CANCELLED' RETURNING id",[id,status,checkpoint,error]);
    assert(updated.length,'CANCELLED','任务已取消，禁止重新开始');
  }
  async recover() {
    return this.rows("UPDATE tasks SET status='PAUSED',error=$1,updated_at=now() WHERE status='RUNNING' RETURNING id",[{code:'INTERRUPTED',message:'应用曾中断；已完成步骤保留，请手动恢复。进行中的模型调用不会自动重复。'}]);
  }
  async snapshot(caseId: string) {
    const c=await this.getCase(caseId);
    const result: Row={case:c,evidence:await this.evidence(caseId),project_documents:await this.rows("SELECT id,source_id,title,url,meta,version,created_at,left(content,6000) AS content,length(content) AS character_count FROM documents WHERE case_id=$1 AND collection='PROJECT' AND active=true ORDER BY created_at DESC LIMIT 100",[caseId])};
    for(const table of ['gaps','requirements','claims','decisions','tasks','artifacts','fetch_attempts']) result[table]=await this.rows(`SELECT * FROM ${table} WHERE case_id=$1 ORDER BY created_at`,[caseId]);
    return result;
  }
  async resumeTask(id: string) {
    const t=await this.task(id); assert(t.status==='PAUSED','NOT_PAUSED','仅暂停任务可以恢复');
    const c=await this.getCase(t.case_id); assert(c.selection_version===t.selection_version,'STALE_SELECTION','选择已经改变，请创建新任务');
    await this.updateTask(id,'QUEUED',t.checkpoint); return this.task(id);
  }
  async artifact(caseId: string, taskId: string, kind: string, content: string, meta: Row={}) {
    const c=await this.getCase(caseId);
    assert(!['model','validation'].includes(kind)||c.selected_gap_id,'SELECTION_REQUIRED','选定后才能生成商业模式');
    await this.db.query('INSERT INTO artifacts(id,case_id,task_id,kind,selection_version,content,meta) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),caseId,taskId,kind,c.selection_version,content,meta]);
  }
  async close() { await this.db.close(); }
}
