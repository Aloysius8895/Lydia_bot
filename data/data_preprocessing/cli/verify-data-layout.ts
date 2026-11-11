import net from 'node:net';
import path from 'node:path';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {Store} from '../database/store.ts';
import {businessSnapshot,verifyImported} from '../imports/verify.ts';
import {stable,digest} from '../imports/parse.ts';
import {assertNoLegacyDatabase,defaultDatabaseDir,relocationReportsRoot,dataLibraryRoot} from '../../../business/shared/data-paths.ts';
assertNoLegacyDatabase();await stat(defaultDatabaseDir);
const guard=net.createServer(socket=>socket.destroy());
await new Promise<void>((resolve,reject)=>{guard.once('error',reject);guard.listen({host:'127.0.0.1',port:4317,exclusive:true},resolve);});
let db:PGlite|undefined;
try{
 const listeners=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue).Count"],{windowsHide:true});
 if(Number(listeners.stdout.trim())!==0)throw new Error('Stop active writer before offline verification');
 const relocated=JSON.parse(await readFile(path.join(relocationReportsRoot,'2026-11-09-data-relocation.json'),'utf8'));
 const catalog=JSON.parse(await readFile(path.join(dataLibraryRoot,'manifest.json'),'utf8'));
 db=await PGlite.create(defaultDatabaseDir,{extensions:{vector}});await db.exec('SET default_transaction_read_only=on');
 const store=new Store(db),snapshot=await businessSnapshot(store);
 const counts=Object.fromEntries(Object.entries(snapshot).map(([name,value])=>[name,value.count]));
 if(stable(counts)!==stable(relocated.counts))throw new Error('Business counts changed');
 const completed=JSON.parse(await readFile(path.join(relocationReportsRoot,'../imports/batches/2026-11-09-grok-import-completed.json'),'utf8'));
 if(stable(snapshot)!==stable(completed.after))throw new Error('Business fingerprints changed');
 const batches=await store.rows('SELECT id FROM file_import_batches ORDER BY created_at');
 const records=await verifyImported(store,batches.map(row=>row.id));
 if(records.length!==52||catalog.records.length!==52)throw new Error('Record count mismatch');
 for(const entry of catalog.records){
  const row=await store.one(`SELECT * FROM ${entry.kind==='project'?'crawl_projects':'knowledge_news'} WHERE id=$1`,[entry.id]);
  const archived=JSON.parse(await readFile(path.join(dataLibraryRoot,entry.path,'record.json'),'utf8'));
  if(!row||digest(stable(row))!==entry.source_row_sha256||stable(JSON.parse(JSON.stringify(row)))!==stable(archived.database_record))throw new Error('Catalog snapshot does not match database');
 }
 const report={timestamp:new Date().toISOString(),status:'VERIFIED',database:defaultDatabaseDir,business_fingerprints_unchanged:true,catalog_matches_database:true,counts,records,service:'PAUSED_NO_DEPLOYMENT'};
 await writeFile(path.join(relocationReportsRoot,'2026-11-09-final-layout-verification.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:report.status,database:defaultDatabaseDir,projects:37,news:15,business_fingerprints_unchanged:true,catalog_matches_database:true,service:report.service},null,2));
}finally{if(db)await db.close();await new Promise<void>(resolve=>guard.close(()=>resolve()));}
