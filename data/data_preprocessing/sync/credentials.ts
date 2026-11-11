import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';
import {workspaceRoot} from '../../../business/shared/data-paths.ts';
import {DriveSyncError} from './errors.ts';

export const credentialStore=path.join(workspaceRoot,'business/deployment/.runtime/credentials/google-drive-reader.dpapi');
export const readScope='https://www.googleapis.com/auth/drive.readonly';
export const credentialSchema=z.object({type:z.literal('service_account'),client_email:z.string().regex(/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/),private_key:z.string().startsWith('-----BEGIN PRIVATE KEY-----'),private_key_id:z.string().optional(),token_uri:z.literal('https://oauth2.googleapis.com/token').optional()});
export type ServiceCredential=z.infer<typeof credentialSchema>;
export async function loadCredential(store=credentialStore):Promise<ServiceCredential>{
 if(process.platform!=='win32')throw new DriveSyncError('WINDOWS_CREDENTIAL_STORE_REQUIRED');
 // Decrypted material is returned only through an internal child-process pipe, never a log or argument.
 const script=`$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.Security; $bytes=[IO.File]::ReadAllBytes($env:LYDIA_DRIVE_CREDENTIAL_FILE); $plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::Write([Text.Encoding]::UTF8.GetString($plain)); [Array]::Clear($plain,0,$plain.Length) } catch { [Console]::Error.Write('CREDENTIAL_STORE_UNREADABLE'); exit 1 }`;
 try{
  const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:15000,maxBuffer:128*1024,env:{...process.env,LYDIA_DRIVE_CREDENTIAL_FILE:store}});
  return credentialSchema.parse(JSON.parse(result.stdout));
 }catch{throw new DriveSyncError('CREDENTIAL_STORE_UNREADABLE');}
}
