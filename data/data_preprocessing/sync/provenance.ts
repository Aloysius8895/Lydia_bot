import {z} from 'zod';
import path from 'node:path';
import type {InputFile} from '../imports/parse.ts';
import {validFileId} from './drive-client.ts';
import {DriveSyncError} from './errors.ts';
const id=z.string().refine(validFileId),hash=z.string().regex(/^[a-f0-9]{64}$/),label=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/);
const receiptSchema=z.object({root_folder_id:id,producer_id:label,batch_id:label,logical_sha256:hash,files:z.array(z.object({path:z.string(),kind:z.enum(['projects','news','events']),file_id:id,sha256:hash,records:z.number().int().min(0)})).min(1).max(3),deliveries:z.array(z.object({batch_folder_id:id,ready_file_id:id,ready_sha256:hash})).min(1)});
export function applyProvenance(files:InputFile[],paths:string[],raw:unknown){
 let receipt:z.infer<typeof receiptSchema>;try{receipt=receiptSchema.parse(raw);}catch{throw new DriveSyncError('DRIVE_RECEIPT_INVALID');}
 const delivery=receipt.deliveries.at(-1)!;
 for(let i=0;i<files.length;i++){
  const entry=receipt.files.find(f=>path.resolve(f.path)===path.resolve(paths[i]));
  if(!entry||entry.sha256!==files[i].sha256||entry.records!==files[i].items.length)throw new DriveSyncError('DRIVE_RECEIPT_FILE_MISMATCH');
  files[i].provenance={provider:'google_drive',root_folder_id:receipt.root_folder_id,producer_id:receipt.producer_id,batch_id:receipt.batch_id,logical_sha256:receipt.logical_sha256,...delivery,file_id:entry.file_id};
 }
}
