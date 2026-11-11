import {z} from 'zod';
import {digest,parseFile,stable,type InputFile} from '../imports/parse.ts';
import type {DriveFile,DriveReader} from './drive-client.ts';
import {validFileId} from './drive-client.ts';
import {DriveSyncError} from './errors.ts';
const id=z.string().refine(validFileId),label=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/);
const descriptor=z.object({kind:z.enum(['projects','news','events']),file_id:id,sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().min(1).max(10*1024*1024),records:z.number().int().min(0).max(10000)}).strict();
export const readySchema=z.object({schema_version:z.literal('1'),producer_id:label,batch_id:label,batch_folder_id:id,created_at:z.string().datetime({offset:true}),files:z.array(descriptor).min(1).max(3)}).strict();
export type Ready=z.infer<typeof readySchema>;
export function logicalFingerprint(ready:Ready){return digest(stable({schema_version:ready.schema_version,producer_id:ready.producer_id,batch_id:ready.batch_id,files:ready.files.map(({kind,sha256,bytes,records})=>({kind,sha256,bytes,records})).sort((a,b)=>a.kind.localeCompare(b.kind))}));}
function ensure(condition:unknown,code:string):asserts condition{if(!condition)throw new DriveSyncError(code);}
function folder(meta:DriveFile){ensure(meta.mimeType==='application/vnd.google-apps.folder'&&!meta.trashed,'FOLDER_INVALID');ensure(meta.capabilities?.canEdit===false,'READER_PERMISSION_CHECK_FAILED');}
function child(meta:DriveFile,parent:string){ensure(!meta.trashed&&meta.parents?.includes(parent),'FILE_OUTSIDE_BATCH');ensure(!meta.mimeType.startsWith('application/vnd.google-apps.'),'ORDINARY_JSON_FILE_REQUIRED');ensure(meta.capabilities?.canDownload===true,'DOWNLOAD_PERMISSION_REQUIRED');ensure(meta.capabilities?.canEdit===false,'READER_PERMISSION_CHECK_FAILED');}
async function verifiedBytes(reader:DriveReader,before:DriveFile,max:number){
 const bytes=await reader.download(before.id,max),hash=digest(bytes),after=await reader.metadata(before.id);
 ensure(after.id===before.id&&after.parents?.join(',')===before.parents?.join(',')&&!after.trashed,'FILE_CHANGED_AFTER_READY');
 ensure(!before.version||after.version===before.version,'FILE_CHANGED_AFTER_READY');
 ensure(!before.sha256Checksum||hash===before.sha256Checksum,'DRIVE_CHECKSUM_MISMATCH');
 ensure(!after.sha256Checksum||hash===after.sha256Checksum,'DRIVE_CHECKSUM_MISMATCH');
 ensure(!before.size||Number(before.size)===bytes.length,'DRIVE_SIZE_MISMATCH');return {bytes,hash};
}
export async function checkRoot(reader:DriveReader,rootId:string){const root=await reader.metadata(rootId);ensure(root.id===rootId,'ROOT_ID_MISMATCH');folder(root);return {root_folder_id:root.id,permission:'READ_ONLY',daily_sync_enabled:false};}
export type PulledBatch={ready:Ready;readyBytes:Buffer;readyFileId:string;readySha256:string;logicalSha256:string;duplicateReadyIds:string[];files:{descriptor:Ready['files'][number];bytes:Buffer;parsed:InputFile}[]};
export async function pullBatch(reader:DriveReader,rootId:string,batchFolderId:string,producerId:string,selectedReadyId?:string):Promise<PulledBatch>{
 await checkRoot(reader,rootId);
 const batch=await reader.metadata(batchFolderId);folder(batch);ensure(batch.id===batchFolderId&&batch.parents?.includes(rootId),'BATCH_OUTSIDE_ROOT');
 const candidates=(await reader.list(batchFolderId)).filter(f=>f.name==='ready.json'&&!f.trashed);
 ensure(candidates.length>0,'BATCH_NOT_READY');ensure(candidates.length<=10,'TOO_MANY_READY_FILES');
 if(selectedReadyId)ensure(candidates.some(f=>f.id===selectedReadyId),'READY_NOT_IN_BATCH');
 const readyFiles:{id:string;hash:string;bytes:Buffer;ready:Ready}[]=[];
 for(const candidate of candidates){
  const meta=await reader.metadata(candidate.id);child(meta,batchFolderId);ensure(meta.name==='ready.json','READY_NAME_CHANGED');
  const value=await verifiedBytes(reader,meta,256*1024);let ready:Ready;
  try{ready=readySchema.parse(JSON.parse(value.bytes.toString('utf8')));}catch{throw new DriveSyncError('READY_SCHEMA_INVALID');}
  ensure(ready.batch_folder_id===batchFolderId&&ready.producer_id===producerId,'READY_SOURCE_MISMATCH');
  ensure(new Set(ready.files.map(f=>f.kind)).size===ready.files.length&&new Set(ready.files.map(f=>f.file_id)).size===ready.files.length,'READY_DUPLICATE_DESCRIPTOR');
  ensure(!ready.files.some(f=>candidates.some(c=>c.id===f.file_id)),'READY_CANNOT_REFERENCE_ITSELF');
  readyFiles.push({id:meta.id,hash:value.hash,bytes:value.bytes,ready});
 }
 const selected=selectedReadyId?readyFiles.find(f=>f.id===selectedReadyId)!:readyFiles[0];
 ensure(readyFiles.every(f=>logicalFingerprint(f.ready)===logicalFingerprint(selected.ready)),'CONFLICTING_READY_FILES');
 const files:PulledBatch['files']=[];
 for(const entry of selected.ready.files){
  const meta=await reader.metadata(entry.file_id);ensure(meta.id===entry.file_id,'FILE_ID_MISMATCH');child(meta,batchFolderId);
  const value=await verifiedBytes(reader,meta,entry.bytes);ensure(value.bytes.length===entry.bytes&&value.hash===entry.sha256,'MANIFEST_CHECKSUM_MISMATCH');
  let parsed:InputFile;try{parsed=parseFile(entry.kind+'.json',value.bytes);}catch{throw new DriveSyncError('DATA_JSON_INVALID');}
  ensure(parsed.items.length===entry.records,'MANIFEST_COUNT_MISMATCH');
  ensure(parsed.items.every(i=>i.record&&i.record.kind===({projects:'project',news:'news',events:'event'} as const)[entry.kind]),'DATA_FIELDS_OR_KIND_INVALID');
  ensure(parsed.items.every(i=>typeof i.record!.raw.id==='string'&&i.record!.raw.id.trim().length>0),'UPSTREAM_STABLE_ID_REQUIRED');
  files.push({descriptor:entry,bytes:value.bytes,parsed});
 }
 return {ready:selected.ready,readyBytes:selected.bytes,readyFileId:selected.id,readySha256:selected.hash,logicalSha256:logicalFingerprint(selected.ready),duplicateReadyIds:readyFiles.filter(f=>f.id!==selected.id).map(f=>f.id),files};
}
