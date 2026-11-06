import type {ParsedPage,ParsedProject,Evidence} from '../types.ts';
import {twitterURL} from './twitter.ts';

type ObjectMap=Record<string,any>;
export function apiObject(value:unknown):value is ObjectMap{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function parseTwitterAPI(url:string,payload:unknown,accountUser?:ObjectMap):ParsedPage{
 const canonical=twitterURL(url);if(!apiObject(payload))throw Error('Invalid X API object');
 const rows=Array.isArray(payload.data)?payload.data:apiObject(payload.data)?[payload.data]:[];
 if(!rows.length&&!apiObject(payload.meta)&&!Array.isArray(payload.errors))throw Error('Missing X API data or result metadata');
 const users=new Map<string,ObjectMap>();if(accountUser)users.set(accountUser.id,accountUser);
 for(const user of payload.includes?.users||[])if(apiObject(user)&&typeof user.id==='string')users.set(user.id,user);
 const media=new Map<string,ObjectMap>();for(const item of payload.includes?.media||[])if(apiObject(item)&&typeof item.media_key==='string')media.set(item.media_key,item);
 const projects:ParsedProject[]=[],seen=new Set<string>();
 for(let i=0;i<rows.length;i++){
  const row=rows[i];if(!apiObject(row)||typeof row.id!=='string'||!/^\d{1,25}$/.test(row.id)||typeof row.text!=='string')throw Error('Malformed X API post');
  if(seen.has(row.id))continue;seen.add(row.id);
  const author=users.get(row.author_id),handle=typeof author?.username==='string'&&/^[A-Za-z0-9_]{1,15}$/.test(author.username)?author.username:null;
  const date=new Date(row.created_at),published=typeof row.created_at==='string'&&Number.isFinite(date.getTime())?date.toISOString():null;
  const body=typeof row.note_tweet?.text==='string'?row.note_tweet.text:row.text;
  const metrics=Object.fromEntries(['retweet_count','reply_count','like_count','quote_count','bookmark_count','impression_count'].map(key=>[key,Number.isSafeInteger(row.public_metrics?.[key])&&row.public_metrics[key]>=0?row.public_metrics[key]:null]));
  const attached=(Array.isArray(row.attachments?.media_keys)?row.attachments.media_keys:[]).flatMap((key:string)=>{const m=media.get(key);return m?[{key,type:typeof m.type==='string'?m.type:null,alt:typeof m.alt_text==='string'?m.alt_text:null,url:typeof m.url==='string'?m.url:null,preview_image_url:typeof m.preview_image_url==='string'?m.preview_image_url:null}]:[];});
  const resources:{url:string;kind:string}[]=[];
  for(const link of row.note_tweet?.entities?.urls||row.entities?.urls||[])try{const u=new URL(link.unwound_url||link.expanded_url||link.url);if(u.protocol==='https:'&&!u.username&&!u.password)resources.push({url:u.href,kind:'external_link'});}catch{}
  const source=handle?`https://x.com/${handle}/status/${row.id}`:`https://x.com/i/web/status/${row.id}`;
  const ev=(field:string,value:unknown,quote:string,path:string):Evidence=>({field,value,quote,locator:path,nature:'author_claim'});
  const evidence=[ev('content',body,body,`$.data[${i}].${row.note_tweet?.text?'note_tweet.text':'text'}`),ev('author',handle,handle||String(row.author_id||''),author===accountUser?'acquisition.account_user':'$.includes.users'),ev('published_at',published,row.created_at||'',`$.data[${i}].created_at`),ev('visible_metrics',metrics,JSON.stringify(metrics),`$.data[${i}].public_metrics`)];
  projects.push({nativeId:row.id,title:`${handle?'@'+handle:'X'} · ${body.slice(0,80)||'媒体推文'}`,url:source,content:[handle?'@'+handle:'作者账号未返回',published||'发布时间未知',body||'[媒体推文，无正文]',...attached.map((m:{alt:string|null})=>m.alt).filter(Boolean)].join('\n\n'),year:published?date.getUTCFullYear():null,awards:[],stage:'not_applicable',resources,evidence,quality:handle&&published?'accepted':'review',meta:{record_kind:'social_post',source_nature:'SOCIAL_POST',identity_basis:'tweet_id',author_id:row.author_id||null,author_handle:handle,author_display:author?.name||null,published_at:published,year_basis:'post_published_at',metrics,media:attached,body_status:body?'present':'not_provided',text_truncated:false,text_basis:row.note_tweet?.text?'api_note_tweet':'api_text',coverage:'api_returned_posts_only',acquisition_mode:'official_api',referenced_tweets:row.referenced_tweets||[]}});
 }
 const incomplete=!!payload.errors?.length;
 return {projects,links:[],next:null,complete:false,reason:incomplete?'X API returned partial errors':'X API page observed; coverage limited to endpoint and query',parserVersion:'twitter-api-v1',pageType:/\/status\//.test(new URL(canonical).pathname)?'detail':'listing'};
}
