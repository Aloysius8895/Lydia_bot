// Daily Drive import (scheduled task "Lydia Drive Daily", 10:00).
//
// Reuses the manually accepted path end to end and only adds discovery and a rehearsal:
//   1. List batch folders under the root; skip imported ones and unchanged ones already flagged.
//   2. Pull + validate each new batch (no database access). Invalid records -> flagged, no downtime.
//   3. Nothing new -> exit without touching the service.
//   4. Stop Lydia, take a verified backup, rehearse the import on a copy of that backup.
//      Any conflict or failure in the rehearsal -> flagged, the real database is not written.
//   5. Clean rehearsal -> drive-manual --pull --execute (import, repeat, readback, preserved rows).
//   6. Always restart Lydia if it was running; prune old automatic backups; write status for the UI.
// --plan lists what would happen without stopping the service or writing the database.
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {mkdir,readFile,writeFile,readdir,rm,cp,mkdtemp} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {loadCredential} from '../sync/credentials.ts';
import {DriveClient,validFileId} from '../sync/drive-client.ts';
import {checkRoot,pullBatch,type PulledBatch} from '../sync/drive-batch.ts';
import {publicError} from '../sync/errors.ts';
import {saveReceipt} from '../sync/receipts.ts';
import {digest} from '../imports/parse.ts';
import {Store} from '../database/store.ts';
import {FileImports} from '../imports/store.ts';
import {dataStorageRoot,backupRoot,defaultDatabaseDir} from '../../../business/shared/data-paths.ts';

const run=promisify(execFile);
const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const root=option('--root-folder-id')||'',producer=option('--producer-id')||'grok-daily',keep=Number(option('--keep')||30),plan=args.includes('--plan');
const service='Lydia Remote',port=4318;
const reportRoot=path.join(dataStorageRoot,'reports/sync/daily'),statePath=path.join(reportRoot,'state.json'),latestPath=path.join(reportRoot,'latest.json');
const receiptsRoot=path.join(dataStorageRoot,'reports/sync/manual/receipts'),dailyBackups=path.join(backupRoot,'daily');
const here=(file:string)=>fileURLToPath(new URL('./'+file,import.meta.url));

type Entry={batch_id?:string;logical_sha256?:string;status:'IMPORTED'|'REVIEW_REQUIRED'|'ERROR';reason:string;detail?:unknown;at:string};
type State={batches:Record<string,Entry>};
const now=()=>new Date().toISOString();
const ps=async(command:string)=>(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true})).stdout.trim();
const listening=async()=>Number(await ps(`@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue).Count`))>0;
async function waitFor(check:()=>Promise<boolean>,ms:number){const end=Date.now()+ms;while(Date.now()<end){if(await check())return true;await new Promise(r=>setTimeout(r,1000));}return false;}
const json=(text:string)=>JSON.parse(text.slice(text.indexOf('{')));

async function discover(state:State){
 const client=new DriveClient(await loadCredential());await checkRoot(client,root);
 const folders=(await client.list(root)).filter(f=>f.mimeType==='application/vnd.google-apps.folder'&&!f.trashed&&validFileId(f.id));
 const candidates:{folderId:string;batch:PulledBatch}[]=[],skipped:{folder_id:string;reason:string}[]=[];
 for(const folder of folders){
  const known=state.batches[folder.id];
  if(known?.status==='IMPORTED')continue;
  let batch:PulledBatch;
  try{batch=await pullBatch(client,root,folder.id,producer);}
  catch(error){
   const code=publicError(error);
   if(code==='BATCH_NOT_READY'){skipped.push({folder_id:folder.id,reason:'NOT_READY_YET'});continue;}   // Grok still uploading
   state.batches[folder.id]={status:'ERROR',reason:code,at:now()};continue;
  }
  const receipt=await readFile(path.join(receiptsRoot,digest(root+'\n'+producer+'\n'+batch.ready.batch_id)+'.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(receipt?.status==='IMPORTED'){state.batches[folder.id]={batch_id:batch.ready.batch_id,logical_sha256:batch.logicalSha256,status:'IMPORTED',reason:'IMPORTED_EARLIER',at:now()};continue;}
  // Already flagged and unchanged since: wait for a person (or a corrected delivery) instead of retrying daily.
  if(known&&known.logical_sha256===batch.logicalSha256&&known.status==='REVIEW_REQUIRED')continue;
  const invalid=batch.files.flatMap(f=>f.parsed.items).filter(i=>!i.record);
  if(invalid.length){state.batches[folder.id]={batch_id:batch.ready.batch_id,logical_sha256:batch.logicalSha256,status:'REVIEW_REQUIRED',reason:'INVALID_RECORDS',detail:{invalid:invalid.length,errors:invalid.slice(0,5).map(i=>String(i.error).slice(0,200))},at:now()};continue;}
  candidates.push({folderId:folder.id,batch});
 }
 return {candidates,skipped};
}

async function backup(){
 await mkdir(dailyBackups,{recursive:true});
 const {stdout}=await run(process.execPath,['--experimental-strip-types',here('backup-for-import.ts'),'--db',defaultDatabaseDir,'--destination',dailyBackups],{windowsHide:true,timeout:600000,maxBuffer:16*1024*1024});
 const manifestPath=json(stdout).manifest as string,manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.verified!==true||manifest.restore_verified!==true)throw new Error('BACKUP_NOT_VERIFIED');
 return {manifestPath,database:manifest.database as string};
}

/** Import into a throwaway copy of the fresh backup; the live database is untouched. */
async function rehearse(database:string,batch:PulledBatch){
 const tmp=await mkdtemp(path.join(os.tmpdir(),'lydia-daily-rehearsal-'));
 try{
  await cp(database,path.join(tmp,'db'),{recursive:true});
  const store=await Store.open(path.join(tmp,'db'));
  try{return (await new FileImports(store).execute(batch.files.map(f=>f.parsed))).counts;}finally{await store.close();}
 }finally{await rm(tmp,{recursive:true,force:true});}
}

async function execute(folderId:string,manifestPath:string){
 const parameters=['--experimental-strip-types',here('drive-manual.ts'),'--pull','--execute','--root-folder-id',root,'--batch-folder-id',folderId,'--producer-id',producer,'--backup-manifest',manifestPath];
 let stdout='';
 try{stdout=(await run(process.execPath,parameters,{windowsHide:true,timeout:600000,maxBuffer:16*1024*1024})).stdout;}catch(error:any){stdout=error.stdout||'';}
 try{return json(stdout);}catch{return {status:'ACTION_REQUIRED',code:'DRIVE_MANUAL_OUTPUT_UNREADABLE'};}
}

async function prune(){
 const names=(await readdir(dailyBackups,{withFileTypes:true}).catch(()=>[])).filter(d=>d.isDirectory()&&d.name.startsWith('grok-import-')).map(d=>d.name).sort().reverse();
 const removed=names.slice(keep);
 for(const name of removed)await rm(path.join(dailyBackups,name),{recursive:true,force:true});
 return removed;
}

let guard:net.Server|undefined;
const report:any={at:now(),mode:'DAILY',schedule:'10:00',producer_id:producer,plan,imported:[],flagged:[],service:{was_running:false,stopped:false,restarted:false}};
let state:State={batches:{}};
try{
 if(!validFileId(root))throw new Error('ROOT_FOLDER_ID_REQUIRED');
 if(!Number.isInteger(keep)||keep<3)throw new Error('KEEP_AT_LEAST_3_BACKUPS');
 guard=net.createServer(s=>s.destroy());
 await new Promise<void>((resolve,reject)=>{guard!.once('error',()=>reject(new Error('DAILY_RUN_ALREADY_ACTIVE')));guard!.listen({host:'127.0.0.1',port:4315,exclusive:true},resolve);});
 state=await readFile(statePath,'utf8').then(JSON.parse).catch(()=>({batches:{}}));
 const {candidates,skipped}=await discover(state);
 report.candidates=candidates.map(c=>({folder_id:c.folderId,batch_id:c.batch.ready.batch_id,counts:Object.fromEntries(c.batch.ready.files.map(f=>[f.kind,f.records]))}));report.not_ready=skipped;
 if(plan){report.status='PLAN_ONLY';}
 else if(!candidates.length){report.status='NO_NEW_BATCH';}
 else{
  report.service.was_running=await listening();
  if(report.service.was_running){
   await ps(`Stop-ScheduledTask -TaskName '${service}'`);
   if(!await waitFor(async()=>!await listening(),45000))throw new Error('SERVICE_DID_NOT_STOP');
   report.service.stopped=true;
  }
  try{
   for(const {folderId,batch} of candidates){
    const base={batch_id:batch.ready.batch_id,logical_sha256:batch.logicalSha256,at:now()};
    const snapshot=await backup();
    const counts=await rehearse(snapshot.database,batch);
    if(counts.conflict||counts.failed){
     state.batches[folderId]={...base,status:'REVIEW_REQUIRED',reason:'REHEARSAL_CONFLICT',detail:{rehearsal:counts}};
     report.flagged.push({folder_id:folderId,...state.batches[folderId]});continue;
    }
    const result=await execute(folderId,snapshot.manifestPath);
    if(result.status==='IMPORTED'&&result.existing_rows_preserved===true&&result.repeat?.imported===0){
     state.batches[folderId]={...base,status:'IMPORTED',reason:'DAILY_IMPORT',detail:{first:result.first,repeat:result.repeat,records:result.records,backup:snapshot.manifestPath,import_report:result.import_report}};
     report.imported.push({folder_id:folderId,...state.batches[folderId]});
    }else{
     state.batches[folderId]={...base,status:'ERROR',reason:result.code||result.status||'IMPORT_CHECK_FAILED',detail:{result,backup:snapshot.manifestPath}};
     report.flagged.push({folder_id:folderId,...state.batches[folderId]});
     break;   // stop on the first failed import; later batches wait for the next run
    }
   }
  }finally{
   if(report.service.was_running){
    await ps(`Start-ScheduledTask -TaskName '${service}'`);
    report.service.restarted=await waitFor(listening,90000);
   }
  }
  report.pruned_backups=await prune();
  report.status=report.flagged.length?'REVIEW_REQUIRED':'IMPORTED';
 }
}catch(error){
 report.status='ERROR';report.code=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:publicError(error);
}finally{
 report.pending=Object.entries(state.batches).filter(([,e])=>e.status!=='IMPORTED').map(([folder_id,e])=>({folder_id,...e}));
 if(!plan){
  await mkdir(path.join(reportRoot,'runs'),{recursive:true});
  await saveReceipt(statePath,state);
  await writeFile(path.join(reportRoot,'runs',report.at.replace(/[:.]/g,'-')+'.json'),JSON.stringify(report,null,2));
  await saveReceipt(latestPath,report);
 }
 // Only ids, counts and codes are printed; never credential state.
 console.log(JSON.stringify(report,null,2));
 if(guard)await new Promise<void>(r=>guard!.close(()=>r()));
 if(report.status==='ERROR'||report.status==='REVIEW_REQUIRED'||report.service.was_running&&!report.service.restarted)process.exitCode=1;
}
