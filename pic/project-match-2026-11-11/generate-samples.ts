// Generates real 「相似与搭档」 results with proposed/project-match.ts and the logged-in Claude CLI.
// Works on a throwaway copy of the newest verified backup (never the live database); the copy is
// deleted afterwards. Each target costs one Claude call (Sonnet 5.5, medium effort).
// Run from business/:
//   node --experimental-strip-types ../pic/project-match-2026-11-11/generate-samples.ts --dry   prompt sizes only, no Claude
//   node --experimental-strip-types ../pic/project-match-2026-11-11/generate-samples.ts         real calls
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const dry=process.argv.includes('--dry');
const {createApp}=await import(pathToFileURL(path.join(repo,'business/backend/server.ts')).href);
const M=await import(pathToFileURL(path.join(here,'proposed/project-match.ts')).href);
const TARGETS:[string,'project'|'news'][]=[['router402','project'],['Smart Water Guardian AI','project'],['watermark','news'],['npmguard','news'],['Tap2ETH','project']];

const root=path.join(repo,'data/data_storage/backups/database'),found:any[]=[];
for(const dir of [root,path.join(root,'daily')]){let names:string[]=[];try{names=await readdir(dir);}catch{continue;}
 for(const n of names){const m=path.join(dir,n,'manifest.json');try{const j=JSON.parse(await readFile(m,'utf8'));if(j.verified===true&&j.restore_verified===true&&j.database)found.push({at:(await stat(m)).mtimeMs,database:j.database,name:n});}catch{}}}
found.sort((a,b)=>b.at-a.at);
if(!found.length)throw new Error('no verified backup');
console.log('database copy from backup',found[0].name);
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-match-'));
await cp(found[0].database,path.join(temp,'pg'),{recursive:true});
const app=await createApp({origin:'http://127.0.0.1:1',dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),casesDir:path.join(temp,'cases'),startWorker:false,localAutoLogin:true});
const file=path.join(here,'samples.json');
let samples:Record<string,any>={};try{samples=JSON.parse(await readFile(file,'utf8')).samples||{};}catch{}
try{
 const lib=await M.loadLibrary(app.store);
 // Older samples named items by prompt number (P94); rebuild the same numbering and show titles.
 for(const [key,v] of Object.entries(samples) as [string,any][]){
  if(!v?.matches||v.summary_raw)continue;
  const refs=new Map(M.candidatesFor(v.mode,lib,v.target.id).map((c:any)=>[c.ref,c.row.title]));
  const named=(t:string)=>M.titlesForRefs(t,refs,v.target.title);
  v.summary_raw=v.summary;v.summary=named(v.summary);for(const m of v.matches){m.reason=named(m.reason);m.combo=named(m.combo||'');}
  console.log(key,'titles:',v.summary);
 }
 if(!dry)await writeFile(file,JSON.stringify({date:'2026-11-11',backup:found[0].name,samples},null,1));
 for(const [title,mode] of TARGETS){
  const key=title+' · '+mode,p=lib.projects.find((x:any)=>x.title===title);
  if(!p){console.log(key,'not found');continue;}
  if(dry){
   const pool=mode==='project'?lib.projects.filter((x:any)=>x.id!==p.id):lib.news;
   const prompt=M.matchPrompt(mode,p,pool.map((row:any,i:number)=>({ref:(mode==='project'?'P':'N')+(i+1),row})));
   console.log(key,'candidates',pool.length,'prompt chars',prompt.length);continue;
  }
  if(samples[key]?.matches){console.log(key,'already generated, skipped');continue;}
  try{
   const r=await M.generateMatch(app.cli,app.store,p.id,mode);
   samples[key]=r;console.log(key,'done',Math.round(r.took_ms/1000)+'s','returned',r.check.returned,'kept',r.check.kept,'dropped',r.check.dropped);
  }catch(e:any){samples[key]={error:e?.message,code:e?.code};console.log(key,'FAILED',e?.code,e?.message);}
  await writeFile(file,JSON.stringify({date:'2026-11-11',backup:found[0].name,samples},null,1));
 }
}finally{await app.close?.().catch(()=>{});await rm(temp,{recursive:true,force:true}).catch(()=>{});}
process.exit(0);
