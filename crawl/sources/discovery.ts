import {document,anchors,attr,tag,find,cleanText,locator,type HtmlNode} from '../../data/crawl/html.ts';
import type {ParsedPage,ParsedEvent,ParsedProject,Evidence,Outcome} from '../types.ts';
import {canonicalUrl} from '../../data/RAG/retrieval.ts';
import {knownYear} from './structured.ts';

export function blank(parserVersion:string,reason='Unknown template'):ParsedPage{return {projects:[],events:[],outcomes:[],links:[],next:null,complete:false,reason,parserVersion,pageType:'unknown'};}
export function officialEvidence(field:string,value:unknown,quote:string,position:string):Evidence{return {field,value,quote:quote.slice(0,2000),locator:position,nature:'official_fact'};}
export function makeEvent(id:string,name:string,url:string|undefined,year:number|null,basis:string,node?:HtmlNode):ParsedEvent{return {id,name,url,year,yearBasis:basis,kind:'hackathon',evidence:officialEvidence('event',name,name,node?locator(node):'public embedded event data')};}
export function titleOf(html:string){const doc=document(html);return cleanText(find(doc,n=>tag(n)==='h1')[0]||find(doc,n=>tag(n)==='title')[0]||doc);}
export function pagination(html:string,url:string,collectionKey?:string){
 const doc=document(html),u=new URL(url),all=anchors(doc,url),current=Number(u.searchParams.get('page')||1);
 const next=all.find(a=>attr(a.node,'rel').split(/\s+/).includes('next')||/^(next|next page|下一页|suivant|seguinte)\s*[›»→]?$/i.test(a.text)&&attr(a.node,'aria-disabled')!=='true');
 const numbers=all.filter(a=>/^\d+$/.test(a.text)).map(a=>({a,page:Number(new URL(a.url).searchParams.get('page'))})).filter(x=>x.page===current+1);
 const nextUrl=next?.url||numbers[0]?.a.url||null;
 const disabled=find(doc,n=>['button','a'].includes(tag(n))&&/^(next|next page|下一页|suivant|seguinte)\s*[›»→]?$/i.test(cleanText(n))&&(attr(n,'aria-disabled')==='true'||'attrs'in n&&n.attrs.some(a=>a.name==='disabled')))[0];
 const base=new URL(url);base.searchParams.delete('page');base.searchParams.delete('cursor');base.hash='';
 return {next:nextUrl===canonicalUrl(url)?nextUrl:nextUrl,complete:!nextUrl&&!!disabled,pagination:{collectionKey:collectionKey||base.href,cursor:u.searchParams.get('cursor')||u.searchParams.get('page')||'1',...!nextUrl&&disabled?{terminalEvidence:`disabled Next control at ${locator(disabled)}`}:{}}};
}
export function listing(nativeId:string,title:string,url:string,content:string,event?:ParsedEvent,node?:HtmlNode):ParsedProject{
 return {nativeId,title,url,content:content||title,year:event?.year??null,event:event?{id:event.id,name:event.name,url:event.url}:undefined,awards:[],stage:'unknown',resources:[],evidence:[{field:'title',value:title,quote:title,locator:node?locator(node):'public project data',nature:'author_claim'},...event?[officialEvidence('event',event.name,event.name,'public project/event association')]:[]],quality:event?.year?'accepted':'review',meta:{record_kind:'listing',content_completeness:'listing_only',year_basis:event?.yearBasis||'unknown',award_status:'unknown'}};
}
export function outcome(event:ParsedEvent,target:{url?:string;id?:string;name?:string},kind:Outcome['kind'],label:string,quote:string,position:string,qualification:Outcome['qualification']='unknown'):Outcome{return {eventId:event.id,projectUrl:target.url,projectNativeId:target.id,projectName:target.name,kind,label,qualification,verification:'official',evidence:officialEvidence(kind,label,quote,position)};}
export function scopeYear(name:string){return knownYear(name);}
