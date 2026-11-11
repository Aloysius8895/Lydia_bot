import type {ParsedPage,ParseContext,ParsedEvent} from '../types.ts';
import {readJSON,objects,eventYear} from './structured.ts';
import {blank,makeEvent,pagination,listing,officialEvidence,outcome} from './discovery.ts';
import {document,anchors,cleanText,find,tag,locator} from '../../data/data_preprocessing/crawl/html.ts';

export function parseDevfolio(url:string,html:string,context:ParseContext):ParsedPage{
 const page=blank('devfolio-next-v1'),u=new URL(url),values=readJSON(html),next=values.find(v=>v?.props?.pageProps),props=next?.props?.pageProps||{},doc=document(html),all=anchors(doc,url);
 const records=objects(values,o=>o.type==='HACKATHON'&&typeof o.uuid==='string'&&typeof o.slug==='string'&&typeof o.name==='string'&&o.ends_at);
 const events=[...new Map(records.flatMap(o=>{const date=eventYear(o.name,o.ends_at);if(date.year!==null&&!context.years.includes(date.year))return [];const event=makeEvent(o.uuid,o.name,`https://${o.slug}.devfolio.co/`,date.year,date.basis);event.meta={slug:o.slug,starts_at:o.starts_at,ends_at:o.ends_at};return [[event.id,event] as const];})).values()];
 page.events=events;
 if(u.hostname==='devfolio.co'&&u.pathname==='/'||u.pathname.startsWith('/hackathons')){
  page.pageType='inventory';page.links=[...events.map(e=>({url:e.url!,kind:'event',input:{event:e}})),...all.filter(a=>a.url.startsWith('https://devfolio.co/hackathons/past')).map(a=>({url:a.url,kind:'inventory'}))];
  Object.assign(page,pagination(html,url));page.reason=events.length?'Public Next.js hackathon records parsed':'Past-list data requires dynamic loading';page.needsBrowser=!events.length&&u.pathname.includes('/past');return page;
 }
 const hostSlug=u.hostname.endsWith('.devfolio.co')?u.hostname.slice(0,-'.devfolio.co'.length):null;
 const event=events.find(e=>e.meta?.slug===hostSlug)||context.input?.event as ParsedEvent|undefined;
 if(event){page.events=[event];page.links=all.filter(a=>new URL(a.url).hostname===u.hostname&&/\/(projects|prizes|winners)\/?$/.test(new URL(a.url).pathname)).map(a=>({url:a.url,kind:a.url.includes('projects')?'listing':'results',input:{event}}));}
 const projectRecords=objects(values,o=>typeof o.uuid==='string'&&typeof o.name==='string'&&typeof o.slug==='string'&&(o.project_description||o.project_desc||o.tagline&&Array.isArray(o.hackathons))&&o.type!=='HACKATHON');
 for(const o of projectRecords){const projectURL=`https://devfolio.co/projects/${o.slug}`,body=String(o.project_description||o.project_desc||o.desc||o.tagline||'');const p=listing(o.uuid,o.name,projectURL,body,event);if(body.length>100){delete p.meta.record_kind;p.meta.content_completeness='public_project_fields';}page.projects.push(p);page.links.push({url:projectURL,kind:'detail',input:{event}});}
 for(const a of all.filter(a=>new URL(a.url).hostname==='devfolio.co'&&/^\/projects\/[^/]+/.test(new URL(a.url).pathname))){if(!page.projects.some(p=>p.url===a.url)){const name=a.text.split('\n').filter(Boolean)[0];if(name)page.projects.push(listing('slug:'+new URL(a.url).pathname.split('/')[2],name,a.url,a.text,event,a.node));}page.links.push({url:a.url,kind:'detail',input:{event}});}
 if(event&&props.winnersAnnounced===true){
  // Explicit winner records must link to actual projects; prize definitions alone are excluded.
  for(const winner of objects(props,o=>(o.project_uuid||o.project?.uuid)&&(o.prize?.name||o.prize_name)&&o.is_winner===true))page.outcomes!.push(outcome(event,{id:winner.project_uuid||winner.project.uuid,url:winner.project?.slug?`https://devfolio.co/projects/${winner.project.slug}`:undefined,name:winner.project?.name},'award',winner.prize?.name||winner.prize_name,winner.prize?.name||winner.prize_name,'__NEXT_DATA__: confirmed winner record'));
 }
 page.pageType=u.pathname.includes('/projects')?'listing':u.pathname.includes('/prizes')?'results':event?'event':page.projects.length?'detail':'unknown';Object.assign(page,pagination(html,url));
 page.reason=props.winnersAnnounced===false?'Official winnersAnnounced=false; prize definitions are not awards':page.projects.length?'Public project records parsed':event?'Official event metadata; project listing requires browser/data':'Unknown project template';page.needsBrowser=page.pageType==='listing'&&!page.projects.length;return page;
}
