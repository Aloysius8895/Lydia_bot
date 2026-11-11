import path from 'node:path';
import net from 'node:net';
import {readFile,writeFile,readdir,cp,mkdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {Store} from '../database/store.ts';
import {businessSnapshot} from '../imports/verify.ts';
import {digest} from '../imports/parse.ts';
const args=process.argv.slice(2),get=(flag:string)=>args[args.indexOf(flag)+1];
if(!args.includes('--db')||!args.includes('--destination'))throw new Error('Explicit --db and --destination are required.');
const source=path.resolve(get('--db')),destination=path.resolve(get('--destination'));
if(source===destination||destination.startsWith(source+path.sep))throw new Error('Backup cannot be placed inside the source DB.');
if(!(await stat(source)).isDirectory())throw new Error('Source database missing.');
const guard=net.createServer(socket=>socket.destroy());
await new Promise<void>((resolve,reject)=>{guard.once('error',reject);guard.listen({host:'127.0.0.1',port:4317,exclusive:true},resolve);});
try{
 const check=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue).Count"],{windowsHide:true});
 if(Number(check.stdout.trim())!==0)throw new Error('Active writer: stop Lydia before copying.');
 await mkdir(destination,{recursive:true});
 const root=path.join(destination,'grok-import-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
 await mkdir(root);const database=path.join(root,'database'),restore=path.join(root,'restore-check');
 await cp(source,database,{recursive:true,errorOnExist:true,force:false});
 const inventory=async(dir:string,prefix=''):Promise<{path:string;bytes:number;sha256:string}[]>=>{
  const result:{path:string;bytes:number;sha256:string}[]=[];
  for(const entry of await readdir(path.join(dir,prefix),{withFileTypes:true})){
   const relative=path.join(prefix,entry.name);
   if(entry.isSymbolicLink())throw new Error('Database symlink found; manual backup needed.');
   if(entry.isDirectory())result.push(...await inventory(dir,relative));
   else{const bytes=await readFile(path.join(dir,relative));result.push({path:relative,bytes:bytes.length,sha256:digest(bytes)});}
  }
  return result.sort((a,b)=>a.path.localeCompare(b.path));
 };
 const original=await inventory(source),copied=await inventory(database);
 if(JSON.stringify(original)!==JSON.stringify(copied))throw new Error('Backup file hashes differ from stopped database.');
 await cp(database,restore,{recursive:true,errorOnExist:true,force:false});
 const db=await PGlite.create(restore,{extensions:{vector}});let baseline,versions;
 try{
  await db.exec('SET default_transaction_read_only=on');
  baseline=await businessSnapshot(new Store(db));
  versions=(await db.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
 }finally{await db.close();}
 const manifest={created_at:new Date().toISOString(),source,database,restore,verified:true,restore_verified:true,files:copied,baseline,migrations:versions};
 const output=path.join(root,'manifest.json');await writeFile(output,JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({manifest:output,files:copied.length,bytes:copied.reduce((sum,f)=>sum+f.bytes,0),counts:Object.fromEntries(Object.entries(baseline!).map(([name,value])=>[name,value.count])),migrations:versions},null,2));
}finally{await new Promise<void>(resolve=>guard.close(()=>resolve()));}
