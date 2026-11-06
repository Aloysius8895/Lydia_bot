import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,writeFile,access } from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import { businessRoot,certsRoot,assert } from '../shared/config.ts';
const exec=promisify(execFile),args=process.argv.slice(2),host=args[args.indexOf('--host')+1];
assert(args.includes('--host')&&isIP(host)===4&&(/^(10\.|192\.168\.)/.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)),'LAN_ADDRESS_REQUIRED','请用 --host 指定本人电脑的私有 IPv4 地址');
const gitOpenSSL='C:/Program Files/Git/usr/bin/openssl.exe';
const openssl=process.env.OPENSSL_EXECUTABLE||await access(gitOpenSSL).then(()=>gitOpenSSL).catch(()=>'openssl'),dir=certsRoot;await mkdir(dir,{recursive:true});
const exists=async(file:string)=>{try{await access(file);return true;}catch{return false;}};
const rootKey=path.join(dir,'crew-local-ca-key.pem'),rootPem=path.join(dir,'crew-local-ca.pem'),rootCer=path.join(dir,'crew-local-ca.cer');
const prefix=`crew-${host.replaceAll('.','-')}`,key=path.join(dir,`${prefix}-key.pem`),cert=path.join(dir,`${prefix}-cert.pem`),csr=path.join(dir,`${prefix}.csr`),rootConfig=path.join(dir,'ca.cnf'),leafConfig=path.join(dir,`${prefix}.cnf`);
await writeFile(rootConfig,'[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Crew Personal Local CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
await writeFile(leafConfig,`[req]\nprompt=no\ndistinguished_name=dn\nreq_extensions=leaf\n[dn]\nCN=Crew Personal\n[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1,IP:${host}\n`);
if(!await exists(rootPem)){
  assert(!await exists(rootKey),'CA_INCOMPLETE','已有私钥但缺少对应 CA 证书，请人工检查；不覆盖原私钥');
  await exec(openssl,['genrsa','-out',rootKey,'2048'],{windowsHide:true});
  await exec(openssl,['req','-x509','-new','-key',rootKey,'-sha256','-days','365','-config',rootConfig,'-out',rootPem],{windowsHide:true});
}
if(!await exists(key))await exec(openssl,['genrsa','-out',key,'2048'],{windowsHide:true});
const valid=await exists(cert)&&await exec(openssl,['x509','-in',cert,'-checkend','86400','-noout'],{windowsHide:true}).then(()=>true).catch(()=>false);
if(!valid){
  await exec(openssl,['req','-new','-key',key,'-config',leafConfig,'-out',csr],{windowsHide:true});
  await exec(openssl,['x509','-req','-in',csr,'-CA',rootPem,'-CAkey',rootKey,'-CAcreateserial','-out',cert,'-days','90','-sha256','-extfile',leafConfig,'-extensions','leaf'],{windowsHide:true});
}
await exec(openssl,['x509','-in',rootPem,'-outform','DER','-out',rootCer],{windowsHide:true});
await exec(openssl,['verify','-CAfile',rootPem,cert],{windowsHide:true});
await exec(openssl,['x509','-in',rootPem,'-checkend','86400','-noout'],{windowsHide:true});
await exec(openssl,['x509','-in',cert,'-checkip',host,'-noout'],{windowsHide:true});
const fingerprint=(await exec(openssl,['x509','-in',rootPem,'-noout','-fingerprint','-sha256'],{windowsHide:true})).stdout.trim();
const env=`# Prepared only. Not enabled automatically; phone must trust crew-local-ca.cer.\nHOST=0.0.0.0\nPORT=4318\nAPP_ORIGIN=https://${host}:4318\nHTTPS_KEY_FILE=deployment/certs/${prefix}-key.pem\nHTTPS_CERT_FILE=deployment/certs/${prefix}-cert.pem\nLLM_PROVIDER=claude_cli\nCLAUDE_AUTH_MODE=subscription\nSUBSCRIPTION_NO_OVERAGE_CONFIRMED=true\nOLLAMA_URL=http://127.0.0.1:11434\nEMBEDDING_MODEL=nomic-embed-text:latest\n`;
await writeFile(path.join(businessRoot,'deployment','.env.lan.example'),env);
const report={timestamp:new Date().toISOString(),status:'GENERATED',localCertificateChain:'TEST_PASSED',host,origin:`https://${host}:4318`,rootCertificate:'deployment/certs/crew-local-ca.cer',rootFingerprint:fingerprint,phoneTrust:'NOT_VERIFIED',phoneInstallation:'NOT_RUN',lanReachability:'NOT_RUN',trustStoresModified:false,firewallModified:false,listenerChanged:false,instructions:'Transfer ONLY public .cer to own phone and explicitly trust it. Never transfer any *-key.pem. Then use deployment/.env.lan.example after stopping loopback server. IP changes require re-preparation.'};
await mkdir(path.join(businessRoot,'test-results'),{recursive:true});await writeFile(path.join(businessRoot,'test-results','https-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
