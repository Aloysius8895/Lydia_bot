import path from 'node:path';
import net from 'node:net';
import {readFile,writeFile,readdir,mkdir,rename,rmdir,lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {Store} from '../database/store.ts';
import {businessSnapshot,preserved,verifyImported} from '../imports/verify.ts';
import {digest,stable} from '../imports/parse.ts';
import {workspaceRoot,dataStorageRoot,defaultDatabaseDir,backupRoot,importReportsRoot,caseExportsRoot,crawlDataRoot,legacyDatabaseDir} from '../../../business/shared/data-paths.ts';

const relative=(value:string)=>path.relative(workspaceRoot,value);
const checked=(value:string)=>{
 const resolved=path.resolve(value),rel=path.relative(path.resolve(workspaceRoot),resolved);
 if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Relocation path escapes workspace');
 return resolved;
};
const mappings=[
 [legacyDatabaseDir,defaultDatabaseDir],
 [path.join(workspaceRoot,'business/.runtime/backups'),backupRoot],
 [path.join(workspaceRoot,'business/.runtime/import-reports'),importReportsRoot],
 [path.join(workspaceRoot,'data/.runtime/crawl'),crawlDataRoot],
 [path.join(workspaceRoot,'business/cases'),caseExportsRoot],
].map(([source,target])=>({source:checked(source),target:checked(target)}));
const guard=net.createServer(socket=>socket.destroy());
await new Promise<void>((resolve,reject)=>{guard.once('error',reject);guard.listen({host:'127.0.0.1',port:4317,exclusive:true},resolve);});
type Entry={path:string;bytes:number;sha256:string};
const inventory=async(dir:string,prefix=''):Promise<Entry[]>=>{
 const entries:Entry[]=[];
 for(const e of await readdir(path.join(dir,prefix),{withFileTypes:true})){
  const file=path.join(prefix,e.name);if(e.isSymbolicLink())throw new Error('Symlink requires manual handling');
  if(e.isDirectory())entries.push(...await inventory(dir,file));else{const bytes=await readFile(path.join(dir,file));entries.push({path:file,bytes:bytes.length,sha256:digest(bytes)});}
 }
 return entries.sort((a,b)=>a.path.localeCompare(b.path));
};
const exists=async(file:string)=>lstat(file).then(()=>true).catch(()=>false);
let db:PGlite|undefined;
try{
 const status=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue).Count"],{windowsHide:true});
 if(Number(status.stdout.trim())!==0)throw new Error('Stop writer before relocation');
 const prior=JSON.parse(await readFile(path.join(workspaceRoot,'business/.runtime/import-reports/2026-11-09-grok-import-completed.json'),'utf8'));
 const manifests=[];
 for(const mapping of mappings){
  if(!await exists(mapping.source))throw new Error('Expected source missing: '+relative(mapping.source));
  if((await lstat(mapping.source)).isSymbolicLink())throw new Error('Source symlink');
  if(await exists(mapping.target)&&mapping.target!==importReportsRoot)throw new Error('Destination already exists: '+relative(mapping.target));
  const files=await inventory(mapping.source);manifests.push({...mapping,files});
  if(mapping.target===importReportsRoot&&await exists(mapping.target)){
   for(const child of await readdir(mapping.source))if(await exists(path.join(mapping.target,child)))throw new Error('Report destination conflict');
   for(const child of await readdir(mapping.source))await rename(checked(path.join(mapping.source,child)),checked(path.join(mapping.target,child)));
   await rmdir(mapping.source);
  }else{await mkdir(path.dirname(mapping.target),{recursive:true});await rename(mapping.source,mapping.target);}
  const after=await inventory(mapping.target);
  for(const old of files){const copied=after.find(e=>e.path===old.path);if(!copied||copied.bytes!==old.bytes||copied.sha256!==old.sha256)throw new Error('Moved file mismatch');}
 }
 const logs=path.join(workspaceRoot,'business/deployment/.runtime/logs/legacy');
 const legacyFiles=(await readdir(defaultDatabaseDir)).filter(name=>/^server.*\.(log|json)$/.test(name));
 await mkdir(logs,{recursive:true});
 for(const name of legacyFiles){const target=checked(path.join(logs,name));if(await exists(target))throw new Error('Legacy log collision');await rename(checked(path.join(defaultDatabaseDir,name)),target);}
 db=await PGlite.create(defaultDatabaseDir,{extensions:{vector}});await db.exec('SET default_transaction_read_only=on');
 const store=new Store(db),after=await businessSnapshot(store);
 if(stable(after)!==stable(prior.after))throw new Error('Business rows changed during relocation');
 const allBatchIds=(await store.rows('SELECT id FROM file_import_batches ORDER BY created_at')).map(r=>r.id);
 const records=await verifyImported(store,allBatchIds);
 if(records.filter(r=>r.kind==='project').length!==37||records.filter(r=>r.kind==='news').length!==15)throw new Error('Expected imported record counts differ');
 const migrations=await store.rows('SELECT version,checksum FROM schema_migrations ORDER BY version');
 const report={timestamp:new Date().toISOString(),status:'VERIFIED',layout:{processing:path.join(workspaceRoot,'data/data_preprocessing'),storage:dataStorageRoot},
  source_attachments_unchanged:true,service:'PAUSED_NO_DEPLOYMENT',mappings:manifests,byte_preservation_before_open:true,legacy_logs:{target:logs,files:legacyFiles},
  business_rows_unchanged:preserved(prior.after,after),counts:Object.fromEntries(Object.entries(after).map(([name,value])=>[name,value.count])),migrations,records,
  historical_paths:'Earlier import reports and backup manifests retain original paths as immutable point-in-time records. Resolve them using this mappings list.'};
 await writeFile(path.join(importReportsRoot,'2026-11-09-data-relocation.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:report.status,database:defaultDatabaseDir,records:{project:37,news:15},moved_files:manifests.reduce((n,m)=>n+m.files.length,0),legacy_log_files:legacyFiles.length,service:report.service},null,2));
}finally{if(db)await db.close();await new Promise<void>(resolve=>guard.close(()=>resolve()));}
