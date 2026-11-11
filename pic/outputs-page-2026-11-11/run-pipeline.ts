// Design sample for the 成果 page: runs the REAL research pipeline on a throwaway copy of the
// live database for "Global Sustainability Challenge" (the user's own preriminary_idea material):
// full research (5 experts) → the first gap is selected for the sample → business model.
// Uses Sonnet (low) for every step to keep usage down; the user's live task uses Opus.
// The resulting database copy is kept in data/data_storage/design-copies/ (git-ignored) so render.mjs can
// show real outputs; it is deleted once the design is rendered.
// Run from business/:  node --experimental-strip-types ../pic/outputs-page-2026-11-11/run-pipeline.ts
import path from 'node:path';
import {cp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const {createApp}=await import(pathToFileURL(path.join(repo,'business/backend/server.ts')).href);
const db=path.join(repo,'data/data_storage/design-copies/outputs-page-2026-11-11');   // git-ignored: holds a copy of private data
await rm(db,{recursive:true,force:true});
await cp(path.join(repo,'data/data_storage/database'),path.join(db,'pg'),{recursive:true});
const app:any=await createApp({origin:'http://127.0.0.1:1',dataDir:path.join(db,'pg'),crawlStorageDir:path.join(db,'crawl'),startWorker:false,localAutoLogin:true});
const log:any={started:new Date().toISOString(),steps:[]};
const save=()=>writeFile(path.join(here,'pipeline-log.json'),JSON.stringify(log,null,1));
const SONNET={id:'sonnet',effort:'low'};
async function runTask(id:string,label:string){
 const t0=Date.now();
 await app.worker.tick();
 const t=await app.store.task(id);
 log.steps.push({label,status:t.status,error:t.error,seconds:Math.round((Date.now()-t0)/1000)});await save();
 console.log(label,t.status,t.error?.message||'',Math.round((Date.now()-t0)/1000)+'s');
 if(t.status!=='COMPLETED')throw new Error(label+' did not complete');
}
try{
 const c=await app.store.one("SELECT * FROM cases WHERE title='Global Sustainability Challenge'");
 log.case=c.id;
 // The paused live task, on the copy, with Sonnet instead of Opus.
 const paused=await app.store.one("SELECT * FROM tasks WHERE case_id=$1 AND status='PAUSED' ORDER BY created_at DESC LIMIT 1",[c.id]);
 await app.store.db.query("UPDATE tasks SET input=jsonb_set(input,'{model}',$2::jsonb) WHERE id=$1",[paused.id,JSON.stringify(SONNET)]);
 await app.store.resumeTask(paused.id);
 await runTask(paused.id,'research');
 const gaps=await app.store.rows('SELECT * FROM gaps WHERE case_id=$1 ORDER BY id',[c.id]);
 log.gaps=gaps.map((g:any)=>({id:g.id,name:g.data.name}));await save();
 if(!gaps.length)throw new Error('research produced no gap candidates');
 await app.store.selectGap(c.id,gaps[0].id,true,'设计稿示例：为了展示成果页，选第一个缺口（不是用户的选择）');
 const model=await app.store.enqueue(c.id,'model',{message:'基于已选缺口，给出商业模式和验证计划',model:SONNET},'DESIGN_SAMPLE_MODEL_'+Date.now());
 await runTask(model.id,'model');
 log.finished=new Date().toISOString();await save();
}catch(e:any){log.error=String(e?.stack||e);await save();console.log('FAILED',e?.message);}
finally{await app.close().catch(()=>{});process.exit(0);}
