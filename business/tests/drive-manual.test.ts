import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile,writeFile,unlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {DriveClient,jwtClaims,type DriveFile,type DriveReader} from '../../data/data_preprocessing/sync/drive-client.ts';
import {pullBatch,logicalFingerprint,readySchema} from '../../data/data_preprocessing/sync/drive-batch.ts';
import {stageBatch} from '../../data/data_preprocessing/sync/receipts.ts';
import {publicError} from '../../data/data_preprocessing/sync/errors.ts';
import {applyProvenance} from '../../data/data_preprocessing/sync/provenance.ts';
import {digest} from '../../data/data_preprocessing/imports/parse.ts';
import {FileImports} from '../../data/data_preprocessing/imports/store.ts';
import {businessSnapshot,preserved,verifyImported} from '../../data/data_preprocessing/imports/verify.ts';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {loadCredential} from '../../data/data_preprocessing/sync/credentials.ts';

const rootId='TEST_root',folderId='TEST_batch',producer='TEST_ONLY_grok';
test('current-user DPAPI decrypts only a generated local fixture and redacts corrupt credential errors',{skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-DPAPI-TEST_ONLY-')),source=path.join(dir,'fixture.json'),protectedFile=path.join(dir,'fixture.dpapi');
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),key=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
 await writeFile(source,JSON.stringify({type:'service_account',client_email:'TEST_ONLY@TEST_ONLY.iam.gserviceaccount.com',private_key:key}));
 const script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $plain=[IO.File]::ReadAllBytes($env:TEST_ONLY_CREDENTIAL_SOURCE); $protected=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes($env:TEST_ONLY_CREDENTIAL_TARGET,$protected); [Array]::Clear($plain,0,$plain.Length)";
 await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,env:{...process.env,TEST_ONLY_CREDENTIAL_SOURCE:source,TEST_ONLY_CREDENTIAL_TARGET:protectedFile}});
 await unlink(source);
 const loaded=await loadCredential(protectedFile);assert.equal(loaded.client_email,'TEST_ONLY@TEST_ONLY.iam.gserviceaccount.com');assert.ok(loaded.private_key===key);
 const bad=path.join(dir,'bad.dpapi');await writeFile(bad,'TEST_ONLY credential error content must not be echoed');
 await assert.rejects(loadCredential(bad),error=>publicError(error)==='CREDENTIAL_STORE_UNREADABLE'&&!String(error).includes('must not be echoed'));
});
function fixture(){
 const bodies=new Map<string,Buffer>(),meta=new Map<string,DriveFile>();
 meta.set(rootId,{id:rootId,name:'TEST_ONLY',mimeType:'application/vnd.google-apps.folder',capabilities:{canEdit:false}});
 meta.set(folderId,{id:folderId,name:'TEST_ONLY',mimeType:'application/vnd.google-apps.folder',parents:[rootId],capabilities:{canEdit:false}});
 const put=(id:string,name:string,value:unknown)=>{
  const bytes=Buffer.from(JSON.stringify(value));bodies.set(id,bytes);meta.set(id,{id,name,mimeType:'application/json',parents:[folderId],size:String(bytes.length),sha256Checksum:digest(bytes),version:'1',capabilities:{canDownload:true,canEdit:false}});return bytes;
 };
 const projects=[{type:'hackathon_project',id:'TEST_ONLY-project-1',platform:'ETHGlobal',name:'TEST_ONLY Drive Project',idea:'TEST_ONLY summary, not original.',source_urls:['https://ethglobal.com/showcase/TEST_ONLY-drive'],tags:['web3','finalist'],status:'Finalist (upstream claim)'}];
 const news=[{type:'ai_news',id:'TEST_ONLY-news-1',title:'TEST_ONLY Drive News',summary:'TEST_ONLY summary, not original reporting.',source_urls:['https://example.org/TEST_ONLY-drive-news'],verification_notes:'TEST_ONLY not verified'}];
 const projectBytes=put('TEST_projects','same-name.json',projects),newsBytes=put('TEST_news','same-name.json',news);
 const ready={schema_version:'1',producer_id:producer,batch_id:'TEST_ONLY_delivery_1',batch_folder_id:folderId,created_at:'2026-11-09T00:00:00+08:00',files:[{kind:'projects',file_id:'TEST_projects',sha256:digest(projectBytes),bytes:projectBytes.length,records:1},{kind:'news',file_id:'TEST_news',sha256:digest(newsBytes),bytes:newsBytes.length,records:1}]};
 put('TEST_ready','ready.json',ready);
 const reader:DriveReader={metadata:async id=>structuredClone(meta.get(id)!),list:async parent=>[...meta.values()].filter(m=>m.parents?.includes(parent)),download:async(id,max)=>{const b=bodies.get(id)!;assert.ok(b.length<=max);return b;}};
 return {reader,meta,bodies,put,ready,projects,news};
}
test('single Drive batch uses exact IDs despite same names and rejects ambiguous or unsafe delivery',async t=>{
 await t.test('file IDs, bytes, checksums, counts and stable IDs validate',async()=>{
  const f=fixture(),result=await pullBatch(f.reader,rootId,folderId,producer);assert.equal(result.files.length,2);assert.equal(result.files[0].parsed.items[0].record!.title,f.projects[0].name);
 });
 await t.test('same logical content with new file IDs is duplicate-ready, not a new logical batch',async()=>{
  const f=fixture();f.put('TEST_projects_copy','same-name.json',f.projects);
  f.put('TEST_ready_copy','ready.json',{...f.ready,files:f.ready.files.map(x=>x.kind==='projects'?{...x,file_id:'TEST_projects_copy'}:x)});
  const result=await pullBatch(f.reader,rootId,folderId,producer,'TEST_ready_copy');assert.equal(result.duplicateReadyIds.length,1);
  assert.equal(result.logicalSha256,logicalFingerprint(readySchema.parse(f.ready)));
 });
 await t.test('conflicting ready bodies and cross-folder payloads are rejected',async()=>{
  const f=fixture();f.put('TEST_ready_other','ready.json',{...f.ready,batch_id:'different'});
  await assert.rejects(pullBatch(f.reader,rootId,folderId,producer),/CONFLICTING_READY_FILES/);
  const g=fixture();g.meta.get('TEST_projects')!.parents=['TEST_elsewhere'];await assert.rejects(pullBatch(g.reader,rootId,folderId,producer),/FILE_OUTSIDE_BATCH/);
 });
 await t.test('checksum, count, missing-ready and missing stable ID failures cannot import',async()=>{
  const f=fixture();f.put('TEST_ready','ready.json',{...f.ready,files:f.ready.files.map(x=>({...x,sha256:'0'.repeat(64)}))});
  await assert.rejects(pullBatch(f.reader,rootId,folderId,producer),/MANIFEST_CHECKSUM_MISMATCH/);
  const g=fixture();g.put('TEST_ready','ready.json',{...g.ready,files:g.ready.files.map(x=>({...x,records:3}))});await assert.rejects(pullBatch(g.reader,rootId,folderId,producer),/MANIFEST_COUNT_MISMATCH/);
  const h=fixture();h.meta.delete('TEST_ready');await assert.rejects(pullBatch(h.reader,rootId,folderId,producer),/BATCH_NOT_READY/);
  const j=fixture(),payload=j.put('TEST_projects','same-name.json',j.projects.map(({id,...rest})=>rest));j.ready.files[0]={...j.ready.files[0],sha256:digest(payload),bytes:payload.length};j.put('TEST_ready','ready.json',j.ready);await assert.rejects(pullBatch(j.reader,rootId,folderId,producer),/UPSTREAM_STABLE_ID_REQUIRED/);
 });
 await t.test('shortcuts, edit permission and disabled download are rejected',async()=>{
  const f=fixture();f.meta.get('TEST_projects')!.mimeType='application/vnd.google-apps.shortcut';await assert.rejects(pullBatch(f.reader,rootId,folderId,producer),/ORDINARY_JSON_FILE_REQUIRED/);
  const g=fixture();g.meta.get(rootId)!.capabilities!.canEdit=true;await assert.rejects(pullBatch(g.reader,rootId,folderId,producer),/READER_PERMISSION_CHECK_FAILED/);
  const h=fixture();h.meta.get('TEST_projects')!.capabilities!.canDownload=false;await assert.rejects(pullBatch(h.reader,rootId,folderId,producer),/DOWNLOAD_PERMISSION_REQUIRED/);
 });
});

test('validated staging retains raw ready bytes, physical delivery history and protects a logical batch',async()=>{
 const f=fixture(),batch=await pullBatch(f.reader,rootId,folderId,producer),dir=await mkdtemp(path.join(os.tmpdir(),'lydia-drive-stage-'));
 const stage=await stageBatch(batch,rootId,path.join(dir,'raw'),path.join(dir,'reports'));
 const ready=await readFile(path.join(path.dirname(stage.files[0].path),'ready-'+batch.readySha256+'.json'));assert.equal(digest(ready),batch.readySha256);
 const again=await stageBatch(batch,rootId,path.join(dir,'raw'),path.join(dir,'reports'));assert.equal(again.receipt.deliveries.length,2);
 await assert.rejects(stageBatch({...batch,logicalSha256:'f'.repeat(64)},rootId,path.join(dir,'raw'),path.join(dir,'reports')),/DELIVERY_CONTENT_CONFLICT/);
 await writeFile(stage.files[0].path,'TEST_ONLY tamper');await assert.rejects(stageBatch(batch,rootId,path.join(dir,'raw'),path.join(dir,'reports')),/LOCAL_FILE_CHANGED/);
});

test('isolated Drive pull/import/search retains provenance and all pre-existing business records',async()=>{
 const f=fixture(),batch=await pullBatch(f.reader,rootId,folderId,producer),dir=await mkdtemp(path.join(os.tmpdir(),'lydia-drive-db-')),store=await Store.open();
 try{
  await store.createCase('TEST_ONLY existing case','preserve');const before=await businessSnapshot(store);
  const stage=await stageBatch(batch,rootId,path.join(dir,'raw'),path.join(dir,'reports'));
  const files=batch.files.map(f=>f.parsed);applyProvenance(files,stage.files.map(f=>f.path),stage.receipt);
  const first=await new FileImports(store).execute(files);assert.deepEqual(first.counts,{imported:2,duplicate:0,conflict:0,failed:0});
  const saved=await store.one('SELECT files FROM file_import_batches WHERE id=$1',[first.id]);assert.equal(saved!.files[0].provenance.ready_file_id,'TEST_ready');assert.equal(saved!.files[0].provenance.file_id,'TEST_projects');
  const second=await new FileImports(store).execute(files);assert.equal(second.counts.imported,0);assert.equal(second.counts.duplicate,2);
  const records=await verifyImported(store,[first.id]);assert.equal(records.length,2);assert.ok(records.every(r=>r.search_verified));assert.ok(Object.values(preserved(before,await businessSnapshot(store))).every(Boolean));
 }finally{await store.close();}
});

test('service-account client requests only drive.readonly, no delegation and redacts upstream failures',async()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),key=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
 const credential={type:'service_account' as const,client_email:'TEST_ONLY@TEST_ONLY.iam.gserviceaccount.com',private_key:key};
 const calls:{method:string;url:string}[]=[];let tokens=0;
 const fake=(async(input:any,options:any)=>{
  const url=String(input);calls.push({method:options.method,url});
  if(url==='https://oauth2.googleapis.com/token'){
   tokens++;const assertion=options.body.get('assertion'),claims=JSON.parse(Buffer.from(assertion.split('.')[1],'base64url').toString());
   assert.equal(claims.scope,'https://www.googleapis.com/auth/drive.readonly');assert.equal('sub' in claims,false);
   return new Response(JSON.stringify({access_token:'TEST_ONLY_access',expires_in:3600,token_type:'Bearer'}));
  }
  if(tokens===1)return new Response('',{status:401});
  return new Response(JSON.stringify({error:{message:'TEST_ONLY_SECRET_MUST_NOT_ESCAPE'}}),{status:403});
 }) as typeof fetch;
 const client=new DriveClient(credential,fake);
 try{await client.metadata(rootId);assert.fail('expected denial');}catch(error){assert.equal(publicError(error),'FOLDER_PERMISSION_REQUIRED');assert.ok(!String(error).includes('TEST_ONLY_SECRET_MUST_NOT_ESCAPE'));}
 assert.equal(tokens,2);assert.ok(calls.every(c=>c.url.startsWith('https://www.googleapis.com/drive/')?c.method==='GET':c.method==='POST'));
 assert.equal(jwtClaims(credential.client_email).scope,'https://www.googleapis.com/auth/drive.readonly');
});
