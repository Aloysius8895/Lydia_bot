import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {Store,Row} from '../../data/data_preprocessing/database/store.ts';
import {normalizeName} from '../../data/data_preprocessing/imports/parse.ts';
import {assert} from '../shared/config.ts';

// Upstream status is a claim ("Winner: Best in Show", "Finalist (official)").
// It is shown as such; nothing here upgrades it to a verified award.
export const resultKind=(status:string)=>/^\s*winner/i.test(status)?'winner':/finalist/i.test(status)?'finalist':null;
export function awardLabel(status:string){
 if(resultKind(status)!=='winner')return 'Finalist';
 const m=/^\s*winner\s*[:：-]\s*(.+)$/i.exec(status);return m?m[1].trim().slice(0,80):'获奖';
}
// "ETHGlobal Tokyo 2026 (2026-09-25~27); Finalist announced …" → {name, dates}
export function evidenceGroup(evidence:string){
 const first=evidence.split(/[;；]/)[0].trim(),m=/^(.*?)\s*[(（]([^)）]*)[)）]/.exec(first);
 return {name:(m?m[1]:first).trim().slice(0,160),dates:m?m[2].trim().slice(0,120):''};
}
export type Phase='open'|'judging'|'results'|'unknown';
export function phaseOf(deadline:Date|null,results:number,now=new Date()):Phase{
 if(results>0)return 'results';if(!deadline)return 'unknown';return now<deadline?'open':'judging';
}
const SEEN='hackathon_tracker_seen_at';
const linkable="meta->>'source_nature' IS DISTINCT FROM 'SOCIAL_POST' AND (meta->>'event_external_id' IS NOT NULL OR meta->>'event_and_date_evidence' IS NOT NULL OR meta->>'source_claimed_status' ~* '(finalist|winner)')";

export class HackathonTracker {
 store:Store;
 constructor(store:Store){this.store=store;}
 async list(now=new Date()){
  const events=await this.store.rows('SELECT * FROM hackathon_events WHERE tracking ORDER BY submission_deadline NULLS LAST,discovered_at DESC');
  const projects=await this.store.rows(`SELECT id,source_id,title,url,meta,created_at FROM crawl_projects WHERE ${linkable} ORDER BY created_at,id`);
  const used=new Set<string>(),cards:Row[]=[];
  const result=(p:Row)=>{const status=String(p.meta?.source_claimed_status||''),kind=resultKind(status);return kind?{id:p.id,title:p.title,source_id:p.source_id,kind,award:awardLabel(status),created_at:p.created_at}:null;};
  const summarize=(linked:Row[])=>{
   const items=linked.map(result).filter(Boolean) as Row[];
   return {items,finalists:items.filter(i=>i.kind==='finalist').length,winners:items.filter(i=>i.kind==='winner').length,
    first_result_at:items.length?items.map(i=>new Date(i.created_at).getTime()).reduce((a,b)=>Math.min(a,b)):null};
  };
  for(const e of events){
   const names=[e.name,...(e.match_names||[])].map(normalizeName).filter(Boolean);
   const linked=projects.filter(p=>(e.external_id&&p.meta?.event_external_id===e.external_id)||
    (p.source_id===e.source_id&&typeof p.meta?.event_and_date_evidence==='string'&&names.some(n=>normalizeName(p.meta.event_and_date_evidence).startsWith(n))));
   linked.forEach(p=>used.add(p.id));
   const r=summarize(linked),deadline=e.submission_deadline?new Date(e.submission_deadline):null;
   cards.push({id:e.id,kind:'tracked',source_id:e.source_id,platform:e.platform,name:e.name,url:e.url,submission_deadline:deadline?.toISOString()??null,
    deadline_note:e.deadline_note,event_dates:e.event_dates,discovered_at:new Date(e.discovered_at).toISOString(),linked:linked.length,
    phase:phaseOf(deadline,r.items.length,now),results:r.items,finalists:r.finalists,winners:r.winners,
    first_result_at:r.first_result_at?new Date(r.first_result_at).toISOString():null});
  }
  // Finalist/winner projects already in the library but not linked to a tracked
  // event are grouped by their recorded event evidence, so earlier results stay
  // visible. Grouping is a reading aid, not a verified event identity.
  const groups=new Map<string,Row>();
  for(const p of projects){
   if(used.has(p.id)||!result(p)||typeof p.meta?.event_and_date_evidence!=='string')continue;
   const g=evidenceGroup(p.meta.event_and_date_evidence);if(!g.name)continue;
   const key=p.source_id+'\u0000'+normalizeName(g.name);
   const old=groups.get(key)||{name:g.name,dates:g.dates,source_id:p.source_id,projects:[] as Row[]};
   if(!old.dates&&g.dates)old.dates=g.dates;old.projects.push(p);groups.set(key,old);
  }
  for(const [key,g] of groups){
   const r=summarize(g.projects);
   cards.push({id:'group-'+createHash('sha256').update(key).digest('hex').slice(0,16),kind:'grouped',source_id:g.source_id,platform:g.source_id,name:g.name,url:null,
    submission_deadline:null,deadline_note:null,event_dates:g.dates||null,discovered_at:new Date(g.projects[0].created_at).toISOString(),linked:g.projects.length,
    phase:'results' as Phase,results:r.items,finalists:r.finalists,winners:r.winners,first_result_at:new Date(r.first_result_at!).toISOString()});
  }
  const delivery=await this.store.one("SELECT max(completed_at) AS at FROM file_import_batches WHERE status='completed'");
  return {events:cards,seen_at:(await this.store.setting(SEEN))?.at??null,last_delivery_at:delivery?.at?new Date(delivery.at).toISOString():null,now:now.toISOString()};
 }
 async markSeen(){const at=new Date().toISOString();await this.store.setSetting(SEEN,{at});return {seen_at:at};}
 async untrack(id:string){
  const row=await this.store.one('UPDATE hackathon_events SET tracking=false,updated_at=now() WHERE id=$1 RETURNING id,tracking',[z.string().uuid().parse(id)]);
  assert(row,'EVENT_NOT_FOUND','追踪的赛事不存在',404);return row;
 }
}
