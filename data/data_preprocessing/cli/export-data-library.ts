import net from 'node:net';
import {stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {Store} from '../database/store.ts';
import {exportLibrary} from '../imports/catalog.ts';
import {businessSnapshot} from '../imports/verify.ts';
import {stable} from '../imports/parse.ts';
import {defaultDatabaseDir,dataLibraryRoot} from '../../../business/shared/data-paths.ts';
const guard=net.createServer(socket=>socket.destroy());
await new Promise<void>((resolve,reject)=>{guard.once('error',reject);guard.listen({host:'127.0.0.1',port:4317,exclusive:true},resolve);});
let db:PGlite|undefined;
try{
 if(!(await stat(defaultDatabaseDir)).isDirectory())throw new Error('Existing database directory required');
 const listeners=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue).Count"],{windowsHide:true});
 if(Number(listeners.stdout.trim())!==0)throw new Error('Stop active service before offline catalog export');
 db=await PGlite.create(defaultDatabaseDir,{extensions:{vector}});await db.exec('SET default_transaction_read_only=on');
 const store=new Store(db),before=await businessSnapshot(store),result=await exportLibrary(store,dataLibraryRoot),after=await businessSnapshot(store);
 if(stable(before)!==stable(after))throw new Error('Database changed during catalog export');
 console.log(JSON.stringify({...result,database_unchanged:true,service:'PAUSED_NO_DEPLOYMENT'},null,2));
}finally{if(db)await db.close();await new Promise<void>(resolve=>guard.close(()=>resolve()));}
