import path from 'node:path';
import net from 'node:net';
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Store} from '../database/store.ts';
import {parseFile,stable} from '../imports/parse.ts';
import {FileImports} from '../imports/store.ts';
import {businessSnapshot,preserved,verifyImported} from '../imports/verify.ts';
import {applyProvenance} from '../sync/provenance.ts';

const args=process.argv.slice(2),option=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const paths=args.flatMap((arg,i)=>arg==='--file'&&args[i+1]?[path.resolve(args[i+1])]:[]);
if(!paths.length)throw new Error('Provide one or more --file absolute.json arguments. Preview is the default.');
const files=await Promise.all(paths.map(async file=>parseFile(path.basename(file),await readFile(file))));
const driveReceipt=option('--drive-receipt');
if(driveReceipt)applyProvenance(files,paths,JSON.parse(await readFile(driveReceipt,'utf8')));
const preview={mode:'preview',files:files.map(f=>({name:f.name,sha256:f.sha256,count:f.items.length})),counts:{project:files.flatMap(f=>f.items).filter(i=>i.record?.kind==='project').length,news:files.flatMap(f=>f.items).filter(i=>i.record?.kind==='news').length,event:files.flatMap(f=>f.items).filter(i=>i.record?.kind==='event').length,invalid:files.flatMap(f=>f.items).filter(i=>!i.record).length},items:files.flatMap(f=>f.items.map(i=>({file:i.fileName,path:i.jsonPath,kind:i.record?.kind,title:i.record?.title,aliases:i.record?.aliases,error:i.error})))};
const out=option('--out');
if(!args.includes('--execute')){
 if(out){await mkdir(path.dirname(path.resolve(out)),{recursive:true});await writeFile(out,JSON.stringify(preview,null,2));}
 console.log(JSON.stringify(preview,null,2));
}else{
 const dbPath=option('--db'),manifestPath=option('--backup-manifest');
 if(!dbPath||!manifestPath||!out)throw new Error('Execute requires --db, --backup-manifest and --out.');
 const directory=path.resolve(dbPath),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.verified!==true||manifest.restore_verified!==true||path.resolve(manifest.source)!==directory||!manifest.files?.length)throw new Error('A verified complete backup and restore manifest for this exact database is required.');
 if(!(await stat(directory)).isDirectory())throw new Error('Database directory missing.');
 const guard=net.createServer(socket=>socket.destroy());
 await new Promise<void>((resolve,reject)=>{guard.once('error',reject);guard.listen({host:'127.0.0.1',port:4317,exclusive:true},resolve);});
 let store:Store|undefined;
 try{
  const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue).Count"],{windowsHide:true});
  if(Number(result.stdout.trim())!==0)throw new Error('Stop the active Lydia writer before importing.');
  store=await Store.open(directory);
  const before=await businessSnapshot(store);
  if(stable(before)!==stable(manifest.baseline))throw new Error('Live database differs from the verified stopped backup; create a new backup.');
  const first=await new FileImports(store).execute(files,path.resolve(manifestPath));
  const afterFirst=await businessSnapshot(store);
  const second=args.includes('--verify-repeat')?await new FileImports(store).execute(files,path.resolve(manifestPath)):null;
  const after=await businessSnapshot(store),unchanged=preserved(before,after);
  const records=await verifyImported(store,[first.id,...second?[second.id]:[]]);
  const report={mode:'executed',timestamp:new Date().toISOString(),database:directory,backup_manifest:path.resolve(manifestPath),first,repeat:second,records,before,afterFirst,after,existing_rows_preserved:unchanged,
   record_counts:{project:records.filter(r=>r.kind==='project').length,news:records.filter(r=>r.kind==='news').length,event:records.filter(r=>r.kind==='event').length},
   repeat_business_rows_unchanged:stable(afterFirst)===stable(after),service_state:'PAUSED_NO_DEPLOYMENT'};
  await mkdir(path.dirname(path.resolve(out)),{recursive:true});await writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({report:path.resolve(out),first:first.counts,repeat:second?.counts,records:report.record_counts,preserved:unchanged},null,2));
  if(Object.values(unchanged).some(v=>!v)||second&&second.counts.imported!==0||!report.repeat_business_rows_unchanged)throw new Error('Verification failed; inspect saved report.');
 }finally{if(store)await store.close();await new Promise<void>(resolve=>guard.close(()=>resolve()));}
}
