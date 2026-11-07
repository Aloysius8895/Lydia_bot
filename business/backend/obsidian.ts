import path from 'node:path';
import {readFile,writeFile,mkdir,rename,realpath} from 'node:fs/promises';
import {Store,hash,type Row} from '../../data/database/store.ts';
import {assert} from '../shared/config.ts';

type Entry={managed:string;notes:string};
const divider='\n<!-- LYDIA-NOTES: keep your notes below this line -->\n';
export async function discoverVaults():Promise<{path:string;open:boolean}[]>{
 try{
  const registry=JSON.parse(await readFile(path.join(process.env.APPDATA||'','obsidian','obsidian.json'),'utf8'));
  const found=[];
  for(const v of Object.values(registry.vaults||{}) as any[]){
   if(typeof v.path!=='string'||!path.isAbsolute(v.path))continue;
   try{await realpath(path.join(v.path,'.obsidian'));found.push({path:await realpath(v.path),open:!!v.open});}catch{}
  }
  return found.sort((a,b)=>Number(b.open)-Number(a.open));
 }catch{return [];}
}
const clean=(s:unknown)=>String(s??'').replace(/\u0000/g,'');
const title=(s:unknown)=>clean(s).replace(/[\r\n]/g,' ');
export class ObsidianBridge {
 store:Store;vaultOverride?:string;timer:ReturnType<typeof setInterval>|null=null;pending:Promise<Row>|null=null;
 constructor(store:Store,vaultOverride?:string){this.store=store;this.vaultOverride=vaultOverride;}
 async init(automatic=true){
  if(automatic&&this.vaultOverride===undefined){
   const setting=await this.store.setting('knowledge_obsidian');
   if(!setting){const vault=(await discoverVaults())[0];if(vault)await this.store.setSetting('knowledge_obsidian',{enabled:true,vault:vault.path});}
  }
  if(automatic){this.timer=setInterval(()=>void this.sync().catch(()=>{}),60000);void this.sync().catch(()=>{});}
 }
 async target(){
  if(this.vaultOverride){await realpath(path.join(this.vaultOverride,'.obsidian'));return realpath(this.vaultOverride);}
  const cfg=await this.store.setting('knowledge_obsidian');if(!cfg?.enabled)return null;
  const allowed=await discoverVaults();return allowed.find(v=>v.path===cfg.vault)?.path||null;
 }
 async status(){
  const vault=await this.target();return {connected:!!vault,vault,folder:vault?path.join(vault,'Lydia'):null,direction:'database_to_markdown',last:await this.store.setting('knowledge_obsidian_result')||null};
 }
 async sync():Promise<Row>{
  if(this.pending)return this.pending;
  this.pending=this.export().finally(()=>{this.pending=null;});return this.pending;
 }
 async export():Promise<Row>{
  const vault=await this.target();if(!vault)return {connected:false,message:'未发现启用的 Obsidian Vault'};
  const root=path.join(vault,'Lydia');await mkdir(root,{recursive:true});
  const resolved=await realpath(root);assert(path.dirname(resolved)===vault,'VAULT_PATH','Lydia 目录不能指向 Vault 外部');
  const manifestFile=path.join(root,'.lydia-sync.json');
  let previous:Record<string,Entry>={};
  try{previous=JSON.parse(await readFile(manifestFile,'utf8'));}catch{}
  const next={...previous},conflicts:string[]=[],files:Record<string,string>={};
  const projects=await this.store.rows("SELECT p.*,v.content FROM crawl_projects p LEFT JOIN crawl_project_versions v ON v.id=p.current_version_id WHERE p.meta->>'source_nature' IS DISTINCT FROM 'SOCIAL_POST' ORDER BY p.id");
  const ideas=await this.store.rows('SELECT * FROM knowledge_ideas ORDER BY created_at');
  const cases=await this.store.listCases();
  const news=await this.store.rows('SELECT * FROM knowledge_news ORDER BY created_at');
  files['Index.md']='# Lydia 知识库\n\n此目录由 Lydia 同步。比赛项目是案例来源，候选 idea 尚待验证。可以在每篇笔记底部添加自己的笔记。\n\n## Hackathon 项目\n\n'+projects.map(p=>`- [[Projects/${p.id}|${title(p.title)}]]`).join('\n')+'\n\n## 我的 Idea\n\n'+ideas.map(i=>`- [[Ideas/${i.id}|${title(i.title)}]]`).join('\n')+'\n\n## Lydia 研究\n\n'+cases.map(c=>`- [[Research/${c.id}|${title(c.title)}]]`).join('\n')+'\n';
  for(const p of projects)files[`Projects/${p.id}.md`]=`---\nlydia_kind: hackathon_project\nlydia_id: "${p.id}"\nrevision: ${p.revision}\n---\n# ${title(p.title)}\n\n来源：${clean(p.url)}\n\n平台：${p.source_id} · 深度：${p.depth} · 质量：${p.quality}\n\n项目自述不代表市场需求已验证。\n\n${clean(p.content)||'正文尚未采集。'}\n`;
  files['Index.md']+='\n## 新闻与资讯\n\n'+news.map(n=>`- [[News/${n.id}|${title(n.title)}]]`).join('\n')+'\n';
  for(const n of news)files[`News/${n.id}.md`]=`---\nlydia_kind: news_report\nlydia_id: "${n.id}"\nrevision: ${n.revision}\n---\n# ${title(n.title)}\n\n来源：${clean(n.url)||'用户粘贴正文'}\n\n发布者：${clean(n.publisher)||'未知'}\n\n报道日期：${clean(n.published_at)||'未知，待核验'}\n\n新闻报道不等于独立核实或市场需求验证。\n\n${clean(n.content)}\n`;
  for(const idea of ideas){
   const s=idea.snapshot,c=s.candidate;
   files[`Ideas/${idea.id}.md`]=`---\nlydia_kind: candidate_idea\nlydia_id: "${idea.id}"\nstatus: ${idea.status}\n---\n# ${title(idea.title)}\n\n待验证的候选 idea。\n\n${c.summary}\n\n## 用户与场景\n${c.users}\n\n## 借鉴项目\n${s.sources.map((p:Row)=>`- [[../${p.kind==='news'?'News':'Projects'}/${p.id}|${title(p.title)}]] · 输入版本 ${p.revision}`).join('\n')}\n\n## 差异与适配\n${c.difference}\n\n${c.fit}\n\n## 最小演示\n${c.mvp}\n\n## 待验证假设\n${c.assumptions.map((a:string)=>'- '+a).join('\n')}\n\n## 第一步验证\n${c.first_test}\n\n## Lydia 备注\n${clean(idea.note)}\n`;
   if(c.news_angle)files[`Ideas/${idea.id}.md`]+='\n## 新闻启发\n'+c.news_angle+'\n';
  }
  for(const c of cases){
   const summary=await this.store.one("SELECT content FROM artifacts WHERE case_id=$1 AND kind='summary' ORDER BY created_at DESC LIMIT 1",[c.id]);
   files[`Research/${c.id}.md`]=`---\nlydia_kind: research\nlydia_id: "${c.id}"\n---\n# ${title(c.title)}\n\n## 项目描述\n${clean(c.brief)}\n\n## 最近研究摘要\n${clean(summary?.content)||'尚未生成研究摘要。'}\n`;
  }
  let written=0,unchanged=0;
  for(const [file,content] of Object.entries(files)){
   const dest=path.join(root,file),dir=path.dirname(dest);await mkdir(dir,{recursive:true});
   assert((await realpath(dir))===path.join(resolved,path.dirname(file)==='.'?'':path.dirname(file)),'VAULT_PATH','同步子目录不能指向其他位置');
   let existing:string|null=null;try{existing=await readFile(dest,'utf8');}catch(e){if((e as any).code!=='ENOENT')throw e;}
   const parts=existing?.split(divider),oldManaged=parts?.[0],notes=parts?.slice(1).join(divider)||'\n## 我的笔记\n\n';
   if(existing!==null&&(!previous[file]||!parts||parts.length<2||hash(oldManaged!)!==previous[file].managed)){
    conflicts.push(file);continue;
   }
   const managed=content.trimEnd()+'\n',combined=managed+divider+notes;
   if(existing===combined)unchanged++;else{await writeFile(dest+'.lydia-tmp',combined,'utf8');await rename(dest+'.lydia-tmp',dest);written++;}
   next[file]={managed:hash(managed),notes:hash(notes)};
  }
  await writeFile(manifestFile+'.tmp',JSON.stringify(next,null,2),'utf8');await rename(manifestFile+'.tmp',manifestFile);
  const result={connected:true,folder:root,at:new Date().toISOString(),written,unchanged,conflicts,projects:projects.length,news:news.length,ideas:ideas.length,research:cases.length};
  await this.store.setSetting('knowledge_obsidian_result',result);return result;
 }
 async stop(){if(this.timer)clearInterval(this.timer);await this.pending?.catch(()=>{});}
}
