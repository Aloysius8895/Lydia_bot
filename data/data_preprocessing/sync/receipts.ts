import path from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {digest} from '../imports/parse.ts';
import type {PulledBatch} from './drive-batch.ts';
import {DriveSyncError} from './errors.ts';
export async function stageBatch(batch:PulledBatch,rootId:string,rawRoot:string,reportRoot:string){
 const logicalKey=digest(rootId+'\n'+batch.ready.producer_id+'\n'+batch.ready.batch_id);
 const receiptPath=path.join(reportRoot,logicalKey+'.json');let old:any;
 try{old=JSON.parse(await readFile(receiptPath,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new DriveSyncError('RECEIPT_UNREADABLE');}
 if(old&&old.logical_sha256!==batch.logicalSha256)throw new DriveSyncError('DELIVERY_CONTENT_CONFLICT');
 const folder=path.join(rawRoot,'drive',batch.ready.producer_id,batch.ready.batch_id,batch.logicalSha256);
 await mkdir(folder,{recursive:true});const files=[];
 for(const file of batch.files){
  const target=path.join(folder,file.descriptor.kind+'.json');
  try{await writeFile(target,file.bytes,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(digest(await readFile(target))!==file.descriptor.sha256)throw new DriveSyncError('LOCAL_FILE_CHANGED');}
  files.push({path:target,kind:file.descriptor.kind,file_id:file.descriptor.file_id,sha256:file.descriptor.sha256,records:file.descriptor.records});
 }
 const readyPath=path.join(folder,'ready-'+batch.readySha256+'.json');
 try{await writeFile(readyPath,batch.readyBytes,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(digest(await readFile(readyPath))!==batch.readySha256)throw new DriveSyncError('LOCAL_READY_CHANGED');}
 const event={at:new Date().toISOString(),batch_folder_id:batch.ready.batch_folder_id,ready_file_id:batch.readyFileId,ready_sha256:batch.readySha256,duplicate_ready_ids:batch.duplicateReadyIds,file_ids:batch.files.map(f=>f.descriptor.file_id)};
 const receipt={...(old||{}),mode:'MANUAL_ONLY',daily_sync_enabled:false,root_folder_id:rootId,producer_id:batch.ready.producer_id,batch_id:batch.ready.batch_id,logical_sha256:batch.logicalSha256,status:old?.status==='IMPORTED'?'IMPORTED':'VALIDATED',files,deliveries:[...old?.deliveries||[],event]};
 await saveReceipt(receiptPath,receipt);return {receiptPath,receipt,files,alreadyImported:old?.status==='IMPORTED'};
}
export async function saveReceipt(file:string,value:unknown){await mkdir(path.dirname(file),{recursive:true});const pending=file+'.'+randomUUID()+'.tmp';await writeFile(pending,JSON.stringify(value,null,2),{flag:'wx'});await rename(pending,file);}
