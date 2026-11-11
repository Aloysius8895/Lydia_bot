import {document,find,attr,tag,cleanText,parentOf,locator,children,type HtmlNode} from '../../data/data_preprocessing/crawl/html.ts';
import type {ParsedPage,ParsedProject,Evidence} from '../types.ts';

const hosts=new Set(['x.com','www.x.com','twitter.com','www.twitter.com']);
const reserved=new Set(['home','explore','notifications','messages','settings','i','login','logout','signup','intent','share','compose','account','search','tos','privacy']);
function withCursor(base:string,input:URL){
 const cursor=input.searchParams.get('_lydia_cursor'),count=input.searchParams.get('_lydia_count');
 if(cursor!==null&&(cursor.length<1||cursor.length>1024))throw Error('Invalid X pagination cursor');
 if(count!==null&&(!/^\d{1,4}$/.test(count)||Number(count)>1000))throw Error('Invalid X pagination count');
 const out=new URL(base);if(cursor)out.searchParams.set('_lydia_cursor',cursor);if(count!==null)out.searchParams.set('_lydia_count',String(Number(count)));return out.href;
}
export function twitterURL(input:string){
 const u=new URL(input);
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.has(u.hostname))throw Error('X URL outside source scope');
 const parts=u.pathname.split('/').filter(Boolean);
 if(parts.length===1&&parts[0]==='search'){
  const query=u.searchParams.get('q')?.trim();if(!query||query.length>512)throw Error('X search requires a query of 1–512 characters');
  return withCursor('https://x.com/search?'+new URLSearchParams({q:query,f:'live'}),u);
 }
 if(!parts[0]||!/^[A-Za-z0-9_]{1,15}$/.test(parts[0])||reserved.has(parts[0].toLowerCase()))throw Error('Invalid X account');
 if(parts.length!==1&&!(parts.length===3&&parts[1]==='status'&&/^\d{1,25}$/.test(parts[2])))throw Error('X URL must be an account, search or post');
 return withCursor('https://x.com/'+parts.join('/'),u);
}
export function twitterSeed(mode:'account'|'search',value:string){
 const v=value.trim();
 if(mode==='search')return twitterURL('https://x.com/search?'+new URLSearchParams({q:v,f:'live'}));
 return twitterURL(v.startsWith('https://')?v:'https://x.com/'+v.replace(/^@/,''));
}
function quote(n:HtmlNode){return attr(n,'data-testid')==='quoteTweet'||tag(n)!=='a'&&attr(n,'role')==='link';}
function owned(root:HtmlNode,predicate:(n:HtmlNode)=>boolean){
 return find(root,n=>{if(!predicate(n))return false;let p=parentOf(n);while(p&&p!==root){if(tag(p)==='article'||quote(p))return false;p=parentOf(p);}return p===root;});
}
function postText(n:HtmlNode):string{if(tag(n)==='img')return attr(n,'alt');if(tag(n)==='br')return '\n';if(n.nodeName==='#text'&&'value'in n)return n.value;return children(n).map(postText).join('');}
export function parseTwitter(url:string,html:string):ParsedPage{
 const canonical=twitterURL(url),target=/\/status\/(\d+)$/.exec(new URL(canonical).pathname)?.[1];
 const doc=document(html),projects:ParsedProject[]=[],seen=new Set<string>();
 for(const card of find(doc,n=>tag(n)==='article'&&(!attr(n,'data-testid')||attr(n,'data-testid')==='tweet'))){
  let ancestor=parentOf(card),nested=false;while(ancestor){if(tag(ancestor)==='article'||quote(ancestor)){nested=true;break;}ancestor=parentOf(ancestor);}if(nested)continue;
  const times=owned(card,n=>tag(n)==='time'&&!!attr(n,'datetime'));
  let identity:{id:string;handle:string;url:string;time:HtmlNode}|undefined;
  for(const time of times){let p=parentOf(time);while(p&&p!==card&&tag(p)!=='a')p=parentOf(p);if(!p||tag(p)!=='a')continue;
   try{const link=twitterURL(new URL(attr(p,'href'),canonical).href),m=/^\/([^/]+)\/status\/(\d+)$/.exec(new URL(link).pathname);if(m){identity={id:m[2],handle:m[1],url:link,time};break;}}catch{}
  }
  if(!identity||target&&identity.id!==target||seen.has(identity.id))continue;
  const textNodes=owned(card,n=>attr(n,'data-testid')==='tweetText'),body=textNodes.map(n=>postText(n).trim()).filter(Boolean).join('\n');
  const media=owned(card,n=>tag(n)==='img'&&!!attr(n,'alt')).filter(n=>{let p=parentOf(n);while(p&&p!==card){if(attr(p,'data-testid')==='tweetPhoto')return true;p=parentOf(p);}return false;}).map(n=>({alt:attr(n,'alt')}));
  const hasMedia=media.length>0||owned(card,n=>['tweetPhoto','videoPlayer'].includes(attr(n,'data-testid'))).length>0;
  if(!body&&!hasMedia)continue;
  const rawDate=attr(identity.time,'datetime'),date=new Date(rawDate),published=Number.isFinite(date.getTime())?date.toISOString():null;
  const author=owned(card,n=>attr(n,'data-testid')==='User-Name')[0];
  const metrics=Object.fromEntries(['reply','retweet','unretweet','like','unlike','bookmark','removeBookmark'].map(key=>{
   const n=owned(card,n=>attr(n,'data-testid')===key)[0];return [key,n?{display:cleanText(n)||null,label:attr(n,'aria-label')||null}:null];
  }));
  const truncated=owned(card,n=>attr(n,'data-testid')==='tweet-text-show-more-link').length>0;
  const views=owned(card,n=>tag(n)==='a'&&/\/status\/\d+\/analytics(?:\?|$)/.test(attr(n,'href')))[0];metrics.views=views?{display:cleanText(views)||null,label:attr(views,'aria-label')||null}:null;
  const evidence:Evidence[]=[{field:'content',value:body||null,quote:body||'[media-only post]',locator:locator(card),nature:'author_claim'},
   {field:'author',value:identity.handle,quote:author?cleanText(author):identity.handle,locator:locator(identity.time),nature:'author_claim'},
   {field:'published_at',value:published,quote:rawDate,locator:locator(identity.time),nature:'author_claim'},
   {field:'visible_metrics',value:metrics,quote:JSON.stringify(metrics),locator:locator(card),nature:'author_claim'}];
  seen.add(identity.id);
  const content=[`@${identity.handle}`,published||'发布时间未知',body||'[媒体推文，无可见正文]',...media.map(m=>m.alt)].join('\n\n');
  const resources:{url:string;kind:string}[]=[];
  // Only links inside the primary text belong to the post; navigation and quoted links do not.
  for(const textNode of textNodes)for(const a of find(textNode,n=>tag(n)==='a'))try{const link=new URL(attr(a,'href'),canonical);if(link.protocol==='https:'&&!hosts.has(link.hostname)&&!link.username&&!link.password)resources.push({url:link.href,kind:'external_link'});}catch{}
  projects.push({nativeId:identity.id,title:`@${identity.handle} · ${body.slice(0,80)||'媒体推文'}`,url:identity.url,content,year:published?date.getUTCFullYear():null,awards:[],stage:'not_applicable',resources:resources.filter(r=>r.url),evidence,quality:truncated||!published?'review':'accepted',
   meta:{record_kind:'social_post',source_nature:'SOCIAL_POST',identity_basis:'tweet_id',author_handle:identity.handle,author_display:author?cleanText(author):null,published_at:published,year_basis:'post_published_at',metrics,media,text_truncated:truncated,body_status:body?'present':'not_provided',coverage:'observed_posts_only'}});
 }
 return {projects,links:[],next:null,complete:false,reason:projects.length?'Observed X posts only; history and search coverage unverified':'No supported X post cards; login, empty results or template requires verification',parserVersion:'twitter-dom-v1',pageType:target?'detail':'listing',pagination:target?undefined:{collectionKey:canonical,cursor:'browser-scroll'}};
}
