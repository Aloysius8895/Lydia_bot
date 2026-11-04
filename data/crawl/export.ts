import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash,type Row} from '../database/store.ts';
import {CrawlStore} from './store.ts';
import {Snapshots} from './snapshots.ts';

export function csvCell(value:unknown){let s=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[\s]*[=+@\-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function toCSV(rows:Row[]){const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))];return '\ufeff'+[columns.map(csvCell).join(','),...rows.map(row=>columns.map(k=>csvCell(row[k])).join(','))].join('\r\n');}
export async function exportCrawl(repo:CrawlStore,snapshots:Snapshots,format:'json'|'csv'|'markdown'){
  // Consistent SQL snapshot. IDs and evidence references are preserved across entity files.
  const data=await repo.store.db.transaction(async tx=>{
    const result:Record<string,Row[]>={};
    for(const table of ['sources','runs','tasks','projects','project_versions','events','event_observations','event_aliases','result_candidates','result_observations','discovery_pages','submissions','awards','resources','resource_checks','snapshots','evidence','quality_issues','selection_decisions','relations','rag_bindings'])result[table]=(await tx.query<Row>(`SELECT * FROM crawl_${table}`)).rows;
    result.rag_documents=(await tx.query<Row>('SELECT * FROM documents WHERE id IN (SELECT document_id FROM crawl_rag_bindings) OR id IN (SELECT document_id FROM chunks WHERE id IN (SELECT chunk_id FROM crawl_chunk_bindings))')).rows;
    result.rag_chunks=(await tx.query<Row>('SELECT id,document_id,case_id,collection,content,position,embedding_model,embedding_dimension FROM chunks WHERE document_id IN (SELECT document_id FROM crawl_rag_bindings) OR id IN (SELECT chunk_id FROM crawl_chunk_bindings)')).rows;
    result.chunk_bindings=(await tx.query<Row>('SELECT * FROM crawl_chunk_bindings')).rows;
    const nodeMap=new Map<string,Row>([...result.projects.map(p=>[p.id,{id:p.id,type:'project',label:p.title}] as [string,Row]),...result.events.map(e=>[e.id,{id:e.id,type:'event',label:e.name}] as [string,Row])]);
    for(const r of result.relations)if(!nodeMap.has(r.target_id))nodeMap.set(r.target_id,{id:r.target_id,type:r.target_type,label:r.target_id.replace(/^technology:/,'')});
    result.nodes=[...nodeMap.values()];result.edges=result.relations.map(r=>({id:r.id,source_id:r.project_id,target_id:r.target_id,type:r.relation_type,nature:r.nature,evidence_id:r.evidence_id,version_id:r.version_id,active:r.active}));
    return result;
  });
  const snapshotIds=new Set(data.snapshots.map(s=>s.id));if(data.evidence.some(e=>!snapshotIds.has(e.snapshot_id)))throw new Error('Broken snapshot reference');
  const checks:[string,string,string][]=[['project_versions','project_id','projects'],['project_versions','snapshot_id','snapshots'],['submissions','project_id','projects'],['submissions','event_id','events'],['awards','submission_id','submissions'],['awards','evidence_id','evidence'],['resources','version_id','project_versions'],['resource_checks','resource_id','resources'],['resource_checks','snapshot_id','snapshots'],['rag_bindings','document_id','rag_documents'],['rag_chunks','document_id','rag_documents']];
  for(const [table,column,parent] of checks){const ids=new Set(data[parent].map(r=>r.id));if(data[table].some(r=>r[column]&&!ids.has(r[column])))throw new Error(`Broken export reference: ${table}.${column}`);}
  const id=randomUUID(),dir=snapshots.resolve(`exports/${id}`);await mkdir(dir,{recursive:true});
  const files:Record<string,{bytes:number;sha256:string}>={};
  const save=async(name:string,body:string)=>{await writeFile(path.join(dir,name),body,'utf8');files[name]={bytes:Buffer.byteLength(body),sha256:hash(body)};};
  if(format==='json')await save('crawl.json',JSON.stringify({schema_version:1,exported_at:new Date().toISOString(),data},null,2));
  if(format==='csv')for(const [name,rows] of Object.entries(data))await save(`${name}.csv`,toCSV(rows));
  if(format==='markdown')for(const p of data.projects){const v=data.project_versions.find(v=>v.id===p.current_version_id),ev=data.evidence.filter(e=>e.version_id===p.current_version_id),res=data.resources.filter(r=>r.version_id===p.current_version_id);await save(`${p.id}.md`,`# ${p.title}\n\n来源：${p.url}\n\n项目 ID：${p.id}；版本：${p.current_version_id}；年份：${p.meta.year??'未知'}；奖项状态：${p.meta.award_status||'未知'}\n\n## 项目原文\n\n${v?.content||'尚未获取'}\n\n## 证据\n\n${ev.map(e=>`- ${e.field}: ${JSON.stringify(e.value)}；${e.nature}；snapshot=${e.snapshot_id}；locator=${e.locator}`).join('\n')}\n\n## 直接资源\n\n${res.map(r=>`- ${r.kind}：${r.url}；${r.status}`).join('\n')}\n\n## 研究边界\n\n作者描述未经代码核验；赛事时实现未知。尚未执行比较研究或设计缺口推断。\n`);}
  const manifest={schema_version:1,id,format,created_at:new Date().toISOString(),coverage:'incomplete; consult run/task/source status',external_references:{cases:[...new Set(data.rag_bindings.map(b=>b.case_id))],note:'case IDs reference the existing application; private case briefs are excluded'},counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),files};
  await writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));return {...manifest,directory:dir};
}
