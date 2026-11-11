// Generates real "深入了解" samples with proposed/project-deep-dive.ts and the logged-in Claude CLI.
// Works on a throwaway copy of the live database (read-only use; the copy is deleted afterwards).
// Run from business/:  node --experimental-strip-types ../pic/project-deep-dive-2026-11-11/generate-samples.ts
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const {createApp}=await import(pathToFileURL(path.join(repo,'business/backend/server.ts')).href);
const {generateDeepDive}=await import(pathToFileURL(path.join(here,'proposed/project-deep-dive.ts')).href);
const TITLES=['Tap2ETH','Smart Water Guardian AI','Tokito'];

const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-deepdive-'));
await cp(path.join(repo,'data/data_storage/database'),path.join(temp,'pg'),{recursive:true});
const app=await createApp({origin:'http://127.0.0.1:1',dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
const samples:Record<string,any>={};
try{
 for(const title of TITLES){
  const p=await app.store.one('SELECT * FROM crawl_projects WHERE title=$1',[title]);
  if(!p){samples[title]={error:'not found'};continue;}
  const steps:string[]=[];
  try{
   samples[title]=await generateDeepDive(app.cli,p,undefined,(s:string)=>{steps.push(s);console.log(title,'·',s);});
   samples[title].steps=steps;
   const c=samples[title].check;console.log(title,'done',samples[title].took_ms,'ms · kept',c.kept,'moved',c.moved,'dropped',c.dropped);
  }catch(e:any){samples[title]={error:e?.message,code:e?.code,log:e?.log,steps};console.log(title,'FAILED',e?.code,e?.message);}
  await writeFile(path.join(here,'samples.json'),JSON.stringify({date:'2026-11-11',model:'claude-sonnet-5-5 (medium)',samples},null,1));
 }
}finally{await app.close?.().catch(()=>{});await rm(temp,{recursive:true,force:true}).catch(()=>{});}
process.exit(0);
