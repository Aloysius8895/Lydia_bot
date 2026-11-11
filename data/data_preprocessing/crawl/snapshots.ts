import {mkdir,writeFile,rename,readFile,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {crawlDataRoot} from '../../../business/shared/data-paths.ts';
import type {FetchResult} from '../../../crawl/types.ts';

export const crawlStorageRoot=process.env.LYDIA_CRAWL_STORAGE_DIR?path.resolve(process.env.LYDIA_CRAWL_STORAGE_DIR):crawlDataRoot;
export class Snapshots {
  root:string;
  constructor(root=crawlStorageRoot){this.root=path.resolve(root);}
  resolve(relative:string){const target=path.resolve(this.root,relative);if(!target.startsWith(this.root+path.sep))throw new Error('Invalid storage path');return target;}
  async save(result:FetchResult){
    const sha256=createHash('sha256').update(result.bytes).digest('hex'),relative=`snapshots/${sha256.slice(0,2)}/${sha256}.bin`,target=this.resolve(relative);
    await mkdir(path.dirname(target),{recursive:true});const tmp=target+`.${randomUUID()}.tmp`;
    await writeFile(tmp,result.bytes,{flag:'wx'});
    try{await rename(tmp,target);}catch(e){await unlink(tmp).catch(()=>{});const existing=await readFile(target).catch(()=>null);if(!existing||createHash('sha256').update(existing).digest('hex')!==sha256)throw e;}
    return {sha256,relative,byteLength:result.bytes.length};
  }
  async read(relative:string){return readFile(this.resolve(relative));}
}
