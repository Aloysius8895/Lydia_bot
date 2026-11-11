import {createSign} from 'node:crypto';
import {readScope,type ServiceCredential} from './credentials.ts';
import {DriveSyncError} from './errors.ts';

export type DriveFile={id:string;name:string;mimeType:string;parents?:string[];trashed?:boolean;size?:string;sha256Checksum?:string;version?:string;capabilities?:{canDownload?:boolean;canEdit?:boolean}};
export interface DriveReader {metadata(id:string):Promise<DriveFile>;list(parent:string):Promise<DriveFile[]>;download(id:string,maxBytes:number):Promise<Buffer>}
export const validFileId=(id:string)=>/^[a-zA-Z0-9_-]{5,200}$/.test(id);
export function jwtClaims(email:string,now=Math.floor(Date.now()/1000)){
 return {iss:email,scope:readScope,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3300};
}
export class DriveClient implements DriveReader {
 credential:ServiceCredential;fetcher:typeof fetch;accessToken='';expires=0;
 constructor(credential:ServiceCredential,fetcher:typeof fetch=fetch){this.credential=credential;this.fetcher=fetcher;}
 private async token(){
  if(this.accessToken&&Date.now()<this.expires)return this.accessToken;
  try{
   const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
   const unsigned=encode({alg:'RS256',typ:'JWT',...(this.credential.private_key_id?{kid:this.credential.private_key_id}:{})})+'.'+encode(jwtClaims(this.credential.client_email));
   const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
   const assertion=unsigned+'.'+signer.sign(this.credential.private_key,'base64url');
   const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
   if(!response.ok)throw new DriveSyncError(response.status===429||response.status>=500?'AUTH_TEMPORARILY_UNAVAILABLE':'AUTHORIZATION_REQUIRED');
   const data=await response.json() as any;
   if(typeof data.access_token!=='string'||data.token_type?.toLowerCase()!=='bearer'||!(Number(data.expires_in)>0))throw new DriveSyncError('AUTHORIZATION_REQUIRED');
   this.accessToken=data.access_token;this.expires=Date.now()+Math.max(1,Math.min(3600,Number(data.expires_in))-60)*1000;
   return this.accessToken;
  }catch(error){if(error instanceof DriveSyncError)throw error;throw new DriveSyncError('AUTH_CONNECTION_FAILED');}
 }
 private async request(url:URL){
  let refreshed=false;
  for(let attempt=0;attempt<3;attempt++){
   let response:Response;
   try{response=await this.fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+await this.token()}});}
   catch(error){if(error instanceof DriveSyncError)throw error;if(attempt===2)throw new DriveSyncError('NETWORK_RETRY_REQUIRED');await new Promise(r=>setTimeout(r,250*2**attempt));continue;}
   if(response.status===401&&!refreshed){this.accessToken='';this.expires=0;refreshed=true;continue;}
   if(response.status===401)throw new DriveSyncError('AUTHORIZATION_REQUIRED');
   if(response.status===403){
    let rateLimited=false;try{const body=await response.json() as any;rateLimited=body?.error?.errors?.some((e:any)=>['rateLimitExceeded','userRateLimitExceeded'].includes(e.reason))===true;}catch{}
    throw new DriveSyncError(rateLimited?'RATE_LIMIT_RETRY_REQUIRED':'FOLDER_PERMISSION_REQUIRED');
   }
   if(response.status===404)throw new DriveSyncError('FILE_MISSING_OR_NOT_SHARED');
   if(response.status===429||response.status>=500){if(attempt===2)throw new DriveSyncError('REMOTE_RETRY_REQUIRED');await new Promise(r=>setTimeout(r,Math.min(2000,250*2**attempt)));continue;}
   if(!response.ok)throw new DriveSyncError('DRIVE_REQUEST_REJECTED');return response;
  }
  throw new DriveSyncError('REMOTE_RETRY_REQUIRED');
 }
 private endpoint(id?:string){if(id&&!validFileId(id))throw new DriveSyncError('INVALID_FILE_ID');return new URL('https://www.googleapis.com/drive/v3/files'+(id?'/'+id:''));}
 async metadata(id:string){const url=this.endpoint(id);url.searchParams.set('fields','id,name,mimeType,parents,trashed,size,sha256Checksum,version,capabilities(canDownload,canEdit)');url.searchParams.set('supportsAllDrives','true');return await (await this.request(url)).json() as DriveFile;}
 async list(parent:string){
  if(!validFileId(parent))throw new DriveSyncError('INVALID_FOLDER_ID');const files:DriveFile[]=[];let page:string|undefined;
  for(let i=0;i<100;i++){
   const url=this.endpoint();url.searchParams.set('q',`'${parent}' in parents and trashed = false`);url.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed,size,sha256Checksum,version,capabilities(canDownload,canEdit))');url.searchParams.set('pageSize','100');url.searchParams.set('supportsAllDrives','true');url.searchParams.set('includeItemsFromAllDrives','true');if(page)url.searchParams.set('pageToken',page);
   const data=await (await this.request(url)).json() as any;if(data.incompleteSearch)throw new DriveSyncError('DRIVE_LIST_INCOMPLETE');files.push(...data.files||[]);page=data.nextPageToken;if(!page)return files;
  }
  throw new DriveSyncError('DRIVE_LIST_LIMIT');
 }
 async download(id:string,maxBytes:number){
  const url=this.endpoint(id);url.searchParams.set('alt','media');const response=await this.request(url);
  if(Number(response.headers.get('content-length')||0)>maxBytes)throw new DriveSyncError('FILE_TOO_LARGE');
  const reader=response.body?.getReader();if(!reader)throw new DriveSyncError('EMPTY_DOWNLOAD');
  const chunks:Buffer[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new DriveSyncError('FILE_TOO_LARGE');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
 }
}
