import type {ParsedPage,ParseContext,ParsedEvent} from '../types.ts';
import {readJSON,objects,eventYear} from './structured.ts';
import {blank,makeEvent,officialEvidence,pagination,outcome} from './discovery.ts';
import {document,parentOf,anchors,find,tag,cleanText,locator,attr} from '../../data/data_preprocessing/crawl/html.ts';

export function parseETHDiscovery(url:string,html:string,context:ParseContext):ParsedPage|null{
 const path=new URL(url).pathname;if(!path.startsWith('/events'))return null;
 if(/ERROR CODE\s*:?\s*404\s*NOT FOUND/i.test(html)){const missing=blank('ethglobal-discovery-v2');missing.reason='Official soft-404 page; no event or result inferred';return missing;}
 const values=readJSON(html),page=blank('ethglobal-discovery-v2'),doc=document(html),all=anchors(doc,url);
 const records=objects(values,o=>o.type==='hackathon'&&typeof o.slug==='string'&&typeof o.name==='string'&&typeof o.endTime==='string');
 const events:ParsedEvent[]=[...new Map(records.flatMap(o=>{
  const date=eventYear(o.name,o.endTime);if(date.year!==null&&!context.years.includes(date.year))return [];
  const e=makeEvent(o.slug,o.name,`https://ethglobal.com/events/${o.slug}`,date.year,date.basis);e.meta={platform_id:String(o.id),starts_at:o.startTime,ends_at:o.endTime,status:o.status};return [[e.id,e] as const];
 })).values()];
 page.events=events;
 if(path==='/events'||path==='/events/'){
  page.pageType='inventory';page.links=events.flatMap(e=>[{url:e.url!,kind:'event',input:{event:e}},{url:e.url!+'/prizes',kind:'results',input:{event:e}}]);
  const props=objects(values,o=>Array.isArray(o.pastEvents)||Array.isArray(o.events));
  const full=props.find(o=>Array.isArray(o.pastEvents)&&typeof o.pastEventsCount==='number'&&o.pastEvents.length===o.pastEventsCount);
  page.complete=!!full;page.reason=full?'Public pastEvents count equals embedded inventory':'Embedded official event inventory observed; no independent complete-history denominator';page.pagination={collectionKey:url,cursor:'embedded',...full?{terminalEvidence:`pastEvents ${full.pastEvents.length} equals pastEventsCount`}:{}};return page;
 }
 const native=path.split('/')[2],record=records.find(o=>o.slug===native),fromContext=context.input?.event as ParsedEvent|undefined;
 let event=events.find(e=>e.id===native)||fromContext;
 if(!event){const title=cleanText(find(doc,n=>tag(n)==='title')[0]||doc),date=eventYear(title);event=makeEvent(native,title.startsWith('ETHGlobal')?title:`ETHGlobal ${native}`,`https://ethglobal.com/events/${native}`,date.year,date.basis);page.events=[event];}
 const pLinks=all.filter(a=>/^\/showcase\/[^/]+\/?$/.test(new URL(a.url).pathname));
 page.links=[...new Map(all.filter(a=>new URL(a.url).hostname==='ethglobal.com'&&new URL(a.url).pathname.startsWith(`/events/${native}/`)&&/\/(prizes(?:\/[^/]+)?|projects|finalists|winners)\/?$/.test(new URL(a.url).pathname)).map(a=>[a.url.split('#')[0],{url:a.url.split('#')[0],kind:/prizes|winner|finalist/.test(a.url)?'results':'listing',input:{event}}])).values(),...pLinks.map(a=>({url:a.url,kind:'detail',input:{event}}))];
 page.pageType=/prizes|winners|finalists/.test(path)?'results':'event';
 // Only associate a project within an explicit published winner/finalist section, never an available prize description.
 for(const a of pLinks){
  let n=parentOf(a.node);let label='';let position='';
  for(let level=0;n&&level<5;level++,n=parentOf(n)){const headings=find(n,x=>/^h[1-6]$/.test(tag(x))).map(cleanText);const found=headings.find(h=>/^(?:winners?|winning projects?|finalists?|ETHGlobal .+ Finalists?)$/i.test(h));if(found){label=found;position=locator(n);break;}}
  if(label)page.outcomes!.push(outcome(event,{url:a.url,name:a.text},/finalist/i.test(label)?'finalist':'award',label,a.text,position,/finalist/i.test(label)?'event_finalist':'unknown'));
 }
 const pag=pagination(html,url);Object.assign(page,pag);page.reason=page.outcomes!.length?'Published outcome/project links parsed':'Prize opportunities and event metadata are not winner announcements';
 page.needsBrowser=page.pageType==='results'&&!pLinks.length&&/\/winners|\/finalists/.test(path);return page;
}
