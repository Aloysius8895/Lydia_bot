import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import {remoteAddress,validateRemoteCertificate} from '../scripts/remote-config.ts';

const state=(ip='100.100.20.4',name='lydia.tail123.ts.net.')=>({BackendState:'Running',Self:{TailscaleIPs:[ip],DNSName:name}});
test('remote deployment uses only the computer Tailscale identity',()=>{
  assert.deepEqual(remoteAddress(state()),{host:'100.100.20.4',hostname:'lydia.tail123.ts.net',origin:'https://lydia.tail123.ts.net:4318'});
  for(const ip of ['127.0.0.1','192.168.100.4','100.63.255.1','100.128.0.1','100.64.0.999','::1'])assert.throws(()=>remoteAddress(state(ip)));
  for(const ip of ['100.64.0.1','100.127.255.254'])assert.equal(remoteAddress(state(ip)).host,ip);
  assert.throws(()=>remoteAddress({...state(),BackendState:'NeedsLogin'}));
  for(const name of ['example.com','bad.ts.net.evil.com','bad/path.ts.net','bad:443.ts.net',''])assert.throws(()=>remoteAddress(state('100.64.0.1',name)));
});
test('certificate validation accepts a matching pair and rejects another key or hostname',async()=>{
  assert.throws(()=>validateRemoteCertificate(Buffer.from('invalid'),Buffer.from('invalid'),'lydia.ts.net'));
  const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-test-cert-'));
  const openssl=process.env.OPENSSL_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
  const exec=promisify(execFile),certFile=path.join(dir,'test.crt'),keyFile=path.join(dir,'test.key'),other=path.join(dir,'other.key');
  try{
    await exec(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-subj','/CN=lydia.tail123.ts.net','-addext','subjectAltName=DNS:lydia.tail123.ts.net','-out',certFile,'-keyout',keyFile],{windowsHide:true});
    await exec(openssl,['genrsa','-out',other,'2048'],{windowsHide:true});
    const cert=await readFile(certFile),key=await readFile(keyFile);
    assert.match(validateRemoteCertificate(cert,key,'lydia.tail123.ts.net'),/^[A-F0-9:]+$/);
    assert.throws(()=>validateRemoteCertificate(cert,key,'another.tail123.ts.net'));
    const otherKey=await readFile(other);
    assert.throws(()=>validateRemoteCertificate(cert,otherKey,'lydia.tail123.ts.net'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
