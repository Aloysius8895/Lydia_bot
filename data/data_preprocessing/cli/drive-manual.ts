import path from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import {loadCredential} from '../sync/credentials.ts';
import {DriveClient,validFileId} from '../sync/drive-client.ts';
import {checkRoot,pullBatch} from '../sync/drive-batch.ts';
import {stageBatch,saveReceipt} from '../sync/receipts.ts';
import {DriveSyncError,publicError} from '../sync/errors.ts';
import {dataStorageRoot,rawImportsRoot,defaultDatabaseDir} from '../../../business/shared/data-paths.ts';

const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const root=option('--root-folder-id'),batchFolder=option('--batch-folder-id'),producer=option('--producer-id'),ready=option('--ready-file-id');
const reportRoot=path.join(dataStorageRoot,'reports/sync/manual'),operationId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
let status:any={at:new Date().toISOString(),operation_id:operationId,mode:'MANUAL_ONLY',daily_sync_enabled:false};
let operationGuard:net.Server|undefined;
try{
 const supported=new Set(['--check','--pull','--execute','--root-folder-id','--batch-folder-id','--producer-id','--ready-file-id','--backup-manifest']);
 if(args.some(arg=>arg.startsWith('--')&&!supported.has(arg)))throw new DriveSyncError('UNSUPPORTED_MANUAL_OPTION_DAILY_NOT_AVAILABLE');
 if(args.includes('--check')&&args.includes('--pull'))throw new DriveSyncError('CHOOSE_CHECK_OR_PULL');
 if(!root||!validFileId(root))throw new DriveSyncError('ROOT_FOLDER_ID_REQUIRED');
 operationGuard=net.createServer(socket=>socket.destroy());
 try{await new Promise<void>((resolve,reject)=>{operationGuard!.once('error',reject);operationGuard!.listen({host:'127.0.0.1',port:4316,exclusive:true},resolve);});}
 catch{operationGuard=undefined;throw new DriveSyncError('MANUAL_OPERATION_ALREADY_RUNNING');}
 const execute=args.includes('--execute'),backup=option('--backup-manifest');
 if(execute&&!backup)throw new DriveSyncError('VERIFIED_BACKUP_REQUIRED_BEFORE_EXECUTE');
 const client=new DriveClient(await loadCredential());
 if(args.includes('--check')){
  if(execute)throw new DriveSyncError('CHECK_CANNOT_IMPORT');
  status={...status,status:'CONNECTED',...await checkRoot(client,root)};
 }else{
  if(!args.includes('--pull')||!batchFolder||!validFileId(batchFolder)||!producer||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/.test(producer))throw new DriveSyncError('EXPLICIT_BATCH_AND_PRODUCER_REQUIRED');
  const batch=await pullBatch(client,root,batchFolder,producer,ready);
  const staged=await stageBatch(batch,root,rawImportsRoot,path.join(reportRoot,'receipts'));
  status={...status,status:'VALIDATED_NOT_IMPORTED',root_folder_id:root,batch_folder_id:batchFolder,producer_id:producer,batch_id:batch.ready.batch_id,receipt:staged.receiptPath,previous_receipt_imported:staged.alreadyImported,
   counts:{projects:batch.files.filter(f=>f.descriptor.kind==='projects').reduce((n,f)=>n+f.descriptor.records,0),news:batch.files.filter(f=>f.descriptor.kind==='news').reduce((n,f)=>n+f.descriptor.records,0),events:batch.files.filter(f=>f.descriptor.kind==='events').reduce((n,f)=>n+f.descriptor.records,0)},
   preview:batch.files.flatMap(f=>f.parsed.items.map(i=>({kind:i.record!.kind,title:i.record!.title,external_id:i.record!.raw.id,source_url:i.record!.url}))) };
  if(execute){
   const output=path.join(reportRoot,'imports',operationId+'.json');await mkdir(path.dirname(output),{recursive:true});
   status={...status,import_report:output};
   const cli=fileURLToPath(new URL('./import-files.ts',import.meta.url));
   const parameters=['--experimental-strip-types',cli,'--execute','--verify-repeat','--db',defaultDatabaseDir,'--backup-manifest',path.resolve(backup!),
    ...staged.files.flatMap(f=>['--file',f.path]),'--drive-receipt',staged.receiptPath,'--out',output];
   try{await promisify(execFile)(process.execPath,parameters,{windowsHide:true,timeout:180000,maxBuffer:1024*1024});}
   catch{throw new DriveSyncError('IMPORT_NOT_COMPLETED_CHECK_BACKUP_AND_WRITER');}
   const result=JSON.parse(await readFile(output,'utf8'));
   const review=result.first.counts.conflict>0||result.first.counts.failed>0;
   staged.receipt.status=review?'REVIEW_REQUIRED':'IMPORTED';staged.receipt.last_import_report=output;staged.receipt.last_batch_id=result.first.id;
   await saveReceipt(staged.receiptPath,staged.receipt);
   status={...status,status:staged.receipt.status,import_report:output,first:result.first.counts,repeat:result.repeat?.counts,records:result.record_counts,existing_rows_preserved:Object.values(result.existing_rows_preserved).every(Boolean)};
   if(review)process.exitCode=2;
  }
 }
}catch(error){
 const code=publicError(error);
 status={...status,status:'ACTION_REQUIRED',code,recovery:['AUTHORIZATION_REQUIRED','AUTH_CONNECTION_FAILED','CREDENTIAL_STORE_UNREADABLE'].includes(code)?'CHECK_LOCAL_SERVICE_ACCOUNT_CREDENTIAL':code.includes('PERMISSION')||code==='FILE_MISSING_OR_NOT_SHARED'?'RESTORE_FOLDER_VIEWER_AND_DOWNLOAD_PERMISSION':'REVIEW_REPORT_AND_RETRY_EXPLICITLY'};
 process.exitCode=1;
}
await mkdir(path.join(reportRoot,'operations'),{recursive:true});
const operationReport=path.join(reportRoot,'operations',operationId+'.json');
await writeFile(operationReport,JSON.stringify(status,null,2),{flag:'wx'});
// Never log raw upstream exceptions or credential state. The explicit preview contains only source data.
console.log(JSON.stringify({...status,operation_report:operationReport},null,2));
if(operationGuard)await new Promise<void>(resolve=>operationGuard!.close(()=>resolve()));
