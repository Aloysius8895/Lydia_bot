import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {dataStorageRoot} from '../shared/data-paths.ts';

// Summary of the 10:00 Drive import (written by data/data_preprocessing/cli/drive-daily.ts).
// Only batch ids, counts and reason codes leave this function; never folder internals or credentials.
const REASONS:Record<string,string>={
 REHEARSAL_CONFLICT:'有资料与已有记录内容不同，未导入，原记录保留',
 INVALID_RECORDS:'有格式无效的条目，未导入',
 IMPORT_CHECK_FAILED:'导入后的验收没有通过，未计为成功',
 DRIVE_OPERATION_FAILED:'连接 Drive 失败',
};
export async function driveSyncStatus(file=path.join(dataStorageRoot,'reports/sync/daily/latest.json')){
 let r:any;try{r=JSON.parse(await readFile(file,'utf8'));}catch{return null;}
 const pending=(r.pending||[]).map((p:any)=>({batch_id:p.batch_id||null,status:p.status,reason:p.reason,label:REASONS[p.reason]||p.reason,
  conflict:p.detail?.rehearsal?.conflict??null,invalid:p.detail?.invalid??null,at:p.at}));
 return {at:r.at,status:r.status,schedule:r.schedule||'10:00',code:r.code||null,
  imported:(r.imported||[]).map((i:any)=>({batch_id:i.batch_id,records:i.detail?.records||null})),pending,service_restarted:r.service?.was_running?r.service.restarted:null};
}
