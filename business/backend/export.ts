import { mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Store, type Row } from '../../data/data_preprocessing/database/store.ts';
import { assert } from '../shared/config.ts';

export async function exportCase(store:Store,caseId:string,root:string){
  const s=await store.snapshot(caseId);assert(/^[\w-]+$/.test(caseId),'CASE_PATH','案件 ID 无效');
  await mkdir(root,{recursive:true});const resolvedRoot=await realpath(root),folder=path.join(resolvedRoot,caseId);
  await mkdir(folder,{recursive:true});const resolvedFolder=await realpath(folder);
  assert(path.dirname(resolvedFolder)===resolvedRoot,'EXPORT_PATH','导出目录越界');
  // Immutable versioned snapshots avoid overwriting earlier choices and prevent user-file collisions.
  const stamp=`${Date.now()}-${s.case.selection_version}`,dir=path.join(resolvedFolder,stamp);await mkdir(dir);
  const stringify=(value:unknown)=>JSON.stringify(value,null,2);
  const latest=(kind:string)=>s.artifacts.filter((a:Row)=>a.kind===kind&&a.selection_version===s.case.selection_version).at(-1)?.content;
  const files:Record<string,string>={
    'brief.md':`# ${s.case.title}\n\n${s.case.brief}\n\n地区与资源限制：\n${stringify(s.case.meta)}\n`,
    'research-summary.md':`# 研究摘要\n\n导出时间 ${new Date().toISOString()}；阶段 ${s.case.phase}。\n\n${latest('summary')||'尚未完成真实专家研究。'}\n\n引用语义仍需人工复核；公开资料不等于真人访谈。\n\n## 来源采集状态\n\n${stringify(s.fetch_attempts)}\n\n## 研究任务状态\n\n${stringify(s.tasks.map((t:Row)=>({id:t.id,status:t.status,checkpoint:t.checkpoint,error:t.error})))}`,
    'evidence.json':stringify(s.evidence),
    'gaps.md':`# 缺口候选\n\n${s.gaps.length?s.gaps.map((g:Row)=>`## ${g.id} ${g.data.name}\n\n${stringify(g.data)}`).join('\n\n'):'尚无已生成的候选，不凑数。'}`,
    'company-requirements.md':`# 企业产品要求\n\n${s.requirements.length?s.requirements.map((r:Row)=>`## ${r.id}\n\n${stringify(r.data)}`).join('\n\n'):'尚无企业要求。未提供依据的指标保持未知。'}`,
    'decisions.json':stringify({case:s.case,decisions:s.decisions}),
  };
  if(s.case.selected_gap_id&&latest('model'))files['model.md']=latest('model');
  if(s.case.selected_gap_id&&latest('validation'))files['validation.md']=latest('validation');
  for(const [name,content] of Object.entries(files))await writeFile(path.join(dir,name),content,'utf8');
  return {snapshot:stamp,files};
}
