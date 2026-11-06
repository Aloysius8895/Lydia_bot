// Read-only transport verification; never reads project data or changes credentials.
import http from 'node:http';
import https from 'node:https';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { businessRoot, certsRoot } from '../shared/config.ts';
const prepared=JSON.parse(await readFile(path.join(businessRoot,'test-results','https-preparation.json'),'utf8'));
const root=await readFile(path.join(certsRoot,'crew-local-ca.pem'));
const get=(url:string)=>new Promise<{status:number;bytes:Buffer}>((resolve,reject)=>{
  const request=(url.startsWith('https:')?https:http).get(url,{ca:root},res=>{const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode!,bytes:Buffer.concat(chunks)}));});request.setTimeout(10000,()=>request.destroy(new Error('Connection timed out')));request.on('error',reject);
});
const origin=`https://${prepared.host}:4318`,bootstrap=`http://${prepared.host}:4319`;
const state=await get(origin+'/api/auth/status');assert.equal(state.status,200);
const status=JSON.parse(state.bytes.toString());assert.equal(status.secure,true);assert.equal(status.passwordless,false);
const download=await get(bootstrap+'/lydia-local-ca.cer');assert.equal(download.status,200);assert.equal(new X509Certificate(download.bytes).fingerprint256,new X509Certificate(root).fingerprint256);
assert.equal((await get(bootstrap+'/crew-local-ca-key.pem')).status,404);
assert.equal((await get(origin+'/')).status,200);
const report={timestamp:new Date().toISOString(),status:'TEST_PASSED',origin,bootstrap,ownerConfigured:status.configured,checks:['Running HTTPS service validates against explicit CA','LAN password required','Public bootstrap DER matches CA','Bootstrap private path rejected','App shell available'],phoneReachability:'PENDING_USER',phoneTrust:'PENDING_USER',phoneStandalone:'PENDING_USER'};
await writeFile(path.join(businessRoot,'test-results','phone-live-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
