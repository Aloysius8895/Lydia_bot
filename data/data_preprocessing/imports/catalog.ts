import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import type {Row,Store} from '../database/store.ts';
import {digest,stable} from './parse.ts';

export function safeFolder(value:string){
 const text=value.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim().slice(0,32)||'unknown';
 return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(text)?'_'+text:text;
}
const has=(tags:string[],values:string[])=>values.some(v=>tags.includes(v));
export function classify(row:Row,kind:'project'|'news'){
 const tags=(row.meta?.tags||[]).map((v:string)=>v.toLowerCase()),status=String(row.meta?.source_claimed_status||'');
 let state='unknown',theme='unclassified',subtheme='other';
 if(kind==='project'){
  state=/^participant/i.test(status)||tags.includes('participant')?'participant_claimed':/^winner/i.test(status)||tags.includes('winner')?'winner_claimed':/finalist/i.test(status)||tags.includes('finalist')?'finalist_claimed':'unknown';
  if(has(tags,['sdg','sustainable-development-goals'])){theme='sdg';subtheme='goal_unspecified';}
  else if(has(tags,['web3','defi','solana','zk','oracle','rwa','wallet','blockchain'])){
   theme='web3';subtheme=has(tags,['defi'])?'defi':has(tags,['rwa'])?'real_world_assets':has(tags,['zk','privacy'])?'privacy_zk':has(tags,['wallet'])?'wallets':has(tags,['solana'])?'solana':has(tags,['oracle'])?'oracles':'general';
  }else if(has(tags,['space'])){theme='space';subtheme=has(tags,['climate'])?'earth_climate':has(tags,['education'])?'education':has(tags,['ai'])?'ai_science':'general';}
  else if(has(tags,['iot','hardware','wearable','robotics'])){theme='hardware_iot';subtheme=tags.includes('iot')?'iot':tags.includes('robotics')?'robotics':tags.includes('wearable')?'wearables':'hardware';}
  else if(has(tags,['ai','ai-agent'])){theme='ai';subtheme=tags.includes('health')?'healthcare':tags.includes('aging')?'aging':tags.includes('devtools')?'developer_tools':tags.includes('finance')?'finance':tags.includes('disaster-response')?'disaster_response':tags.includes('security')?'security':tags.includes('ai-agent')?'agents':'general';}
  else if(has(tags,['climate','esg'])){theme='climate_environment';subtheme='general';}
 }else{
  state='news';
  if(has(tags,['security','cryptography'])){theme='security';subtheme=tags.includes('cryptography')?'cryptography':tags.includes('export-control')?'export_controls':'general';}
  else if(has(tags,['ipo','funding','investment'])){theme='business_finance';subtheme=tags.includes('ipo')?'ipo':tags.includes('investment')?'investment':'funding';}
  else if(has(tags,['policy'])){theme='policy';subtheme=tags.includes('data-center')?'data_centers':tags.includes('data-scraping')?'data_usage':'general';}
  else if(has(tags,['data-center','infrastructure','gpu'])){theme='infrastructure';subtheme='data_centers';}
  else if(has(tags,['science','benchmark'])){theme='research';subtheme='science_benchmarks';}
  else if(has(tags,['video-generation','memory'])){theme='models';subtheme=tags.includes('video-generation')?'video_generation':'memory';}
  else if(has(tags,['product','muse','doubao'])){theme='products';subtheme='updates';}
 }
 const sdgCandidates:Row[]=[];
 for(const [goal,basis] of [['goal_03_health',['health','aging']],['goal_04_education',['education']],['goal_13_climate',['climate','disaster-response']]] as [string,string[]][]){
  const matched=tags.filter((v:string)=>basis.includes(v));if(matched.length)sdgCandidates.push({goal,basis_tags:matched,status:'ORGANIZATION_SUGGESTION_NOT_SOURCE_CLAIM'});
 }
 return {state,theme,subtheme,tags,sdgCandidates,basis:'RULE_BASED_FROM_UPSTREAM_TAGS_AND_STATUS_NOT_INDEPENDENT_VERIFICATION'};
}
const display=(value:unknown)=>String(value??'未提供').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const quoted=(value:unknown)=>display(value).split(/\r?\n/).map(line=>'> '+line).join('\n');
export async function exportLibrary(store:Store,root:string){
 // Explicit snapshot export only: never edits DB and never overwrites a prior catalog.
 await mkdir(root,{recursive:false});
 const records:Row[]=[];
 for(const [table,kind] of [['crawl_projects','project'],['knowledge_news','news']] as const){
  for(const row of await store.rows(`SELECT * FROM ${table} ORDER BY id`)){
   const c=classify(row,kind),name=safeFolder(row.title)+'--'+row.id.slice(0,8),meta=row.meta||{};
   const date=/^\d{4}-\d{2}-\d{2}$/.test(meta.collected_date||'')?meta.collected_date:'date_unknown';
   const rel=kind==='project'?path.join('hackathon_projects',c.state,c.theme,c.subtheme,safeFolder(row.source_id),name):path.join('news',c.theme,c.subtheme,date,name);
   const folder=path.join(root,rel);await mkdir(folder,{recursive:true});
   await writeFile(path.join(folder,'record.json'),JSON.stringify({database_record:row,organization_annotation:c},null,2),{flag:'wx'});
   const summary=meta.imported_summary||'';
   const markdown=`# ${display(row.title)}\n\n数据库 ID：\`${row.id}\`\n\n类型：${kind==='project'?'外部比赛项目案例':'新闻资料'}\n\n## 外部资料摘要（非原文）\n\n${quoted(summary||'没有单独摘要')}\n\n## 来源与日期\n\n原始日期：${display(meta.original_date)}\n\n采集日期：${display(meta.collected_date)}\n\n原始分类标签：${display((meta.tags||[]).join('、'))}\n\n上游状态声称：${display(meta.source_claimed_status)}\n\n${(meta.source_urls||[row.url]).filter(Boolean).map((url:string)=>'- '+display(url)).join('\n')}\n\n## 核实边界\n\n${quoted(meta.verification_notes||'资料包未提供核实说明；导入状态为未独立核实。')}\n\n${meta.claims_note?quoted(meta.claims_note)+'\n\n':''}原文尚未采集。目录分类是根据上游标签和状态做的整理，不代表获奖、来源事实或 SDG 关系已经核实。数据库仍是权威记录，本文为只读快照。\n`;
   await writeFile(path.join(folder,'README.md'),markdown,{flag:'wx'});
   records.push({id:row.id,title:row.title,kind,source:kind==='news'?row.publisher:row.source_id,path:rel.replaceAll('\\','/'),classification:c,source_row_sha256:digest(stable(row))});
  }
 }
 const indexes=path.join(root,'indexes');await mkdir(indexes);
 for(const field of ['tags','sdg_candidates','publishers'])await mkdir(path.join(indexes,field));
 const tagGroups=new Map<string,Row[]>(),sdgGroups=new Map<string,Row[]>(),publisherGroups=new Map<string,Row[]>();
 for(const record of records){
  for(const tag of record.classification.tags){const values=tagGroups.get(tag)||[];values.push(record);tagGroups.set(tag,values);}
  for(const match of record.classification.sdgCandidates){const values=sdgGroups.get(match.goal)||[];values.push({...record,sdg_basis:match});sdgGroups.set(match.goal,values);}
  if(record.kind==='news'){const key=record.source||'unknown',values=publisherGroups.get(key)||[];values.push(record);publisherGroups.set(key,values);}
 }
 const index=async(folder:string,key:string,items:Row[])=>{
  const dir=path.join(indexes,folder,safeFolder(key)+'--'+digest(key).slice(0,6));await mkdir(dir);
  const references=items.map(r=>({id:r.id,title:r.title,kind:r.kind,record_path:'../../../'+r.path+'/record.json',sdg_basis:r.sdg_basis}));
  await writeFile(path.join(dir,'references.json'),JSON.stringify(references,null,2),{flag:'wx'});
  await writeFile(path.join(dir,'README.md'),`# ${display(key)}\n\n仅为分类索引，原始条目没有复制成多个权威版本。\n\n`+references.map(r=>`- [${display(r.title)}](${r.record_path.replace('/record.json','/README.md')}) · ${r.id}`).join('\n')+'\n',{flag:'wx'});
 };
 for(const [key,items] of tagGroups)await index('tags',key,items);
 for(const [key,items] of sdgGroups)await index('sdg_candidates',key,items);
 for(const [key,items] of publisherGroups)await index('publishers',key,items);
 await writeFile(path.join(indexes,'sdg_candidates','README.md'),'# SDG 候选关联\n\n这是整理建议，不是附件声明或核实结论。仅 health/aging → SDG 3、education → SDG 4、climate/disaster-response → SDG 13 的原始标签会进入候选索引，references.json 保留依据；不把其他作品猜成 SDG 项目。人工核对前不能声称正式 SDG 归属。\n',{flag:'wx'});
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({created_at:new Date().toISOString(),authoritative:false,mode:'EXPLICIT_READ_ONLY_DATABASE_SNAPSHOT',record_count:records.length,counts:{projects:records.filter(r=>r.kind==='project').length,news:records.filter(r=>r.kind==='news').length},records},null,2),{flag:'wx'});
 await writeFile(path.join(root,'README.md'),'# 可阅读资料目录\n\n此目录从真实数据库显式导出，不是另一套权威数据库，也不是自动同步。\n\n- [比赛项目](hackathon_projects/)：上游状态 → 主题 → 子主题 → 平台 → 作品。\n- [新闻](news/)：主题 → 子主题 → 采集日期 → 条目。\n- [标签索引](indexes/tags/)：跨主题查找，同一作品只保存一份快照。\n- [SDG 候选索引](indexes/sdg_candidates/)：基于标签的待核对整理建议。\n- 每个条目的 record.json 保留完整数据库记录、原始条目及来源；README.md 可直接阅读。\n- 缺失分类为 unclassified；finalist_claimed/winner_claimed 是上游声称，未升级为独立核实。\n',{flag:'wx'});
 return {root,projects:records.filter(r=>r.kind==='project').length,news:records.filter(r=>r.kind==='news').length,tag_indexes:tagGroups.size,sdg_candidate_indexes:sdgGroups.size};
}
