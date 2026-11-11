import type {ParseContext,ParsedPage} from '../types.ts';
import {readJSON,objects,eventYear} from './structured.ts';
import {blank,makeEvent,pagination,outcome,listing} from './discovery.ts';
import {document,parentOf,anchors,find,tag,cleanText,locator} from '../../data/data_preprocessing/crawl/html.ts';

export function parseHQDiscovery(url:string,html:string,context:ParseContext):ParsedPage|null{
 const u=new URL(url);if(!(u.pathname.startsWith('/hackathons')||u.pathname==='/projects'&&u.searchParams.get('view')==='hackathons'||u.pathname==='/projects/prize-leaderboard'))return null;
 const page=blank('hackquest-discovery-v2'),values=readJSON(html),doc=document(html),all=anchors(doc,url);
 const records=objects(values,o=>o.id&&o.name&&o.alias&&Array.isArray(o.currentStatus)&&typeof o.timeline==='object');
 const events=[...new Map(records.flatMap(o=>{const d=eventYear(o.name,o.timeline?.submissionClose);if(d.year!==null&&!context.years.includes(d.year))return [];const e=makeEvent(o.id,o.name,`https://www.hackquest.io/hackathons/${o.alias}`,d.year,d.basis);e.meta={alias:o.alias,project_count:o.projectCount,winner_count:o.winnerCount,announce:o.announce,submission_close:o.timeline?.submissionClose};return [[e.id,e] as const];})).values()];page.events=events;
 const event=u.pathname.startsWith('/hackathons/')?events.find(e=>e.url===u.origin+u.pathname)||context.input?.event:undefined;
 if(event){
  page.events=[event];page.pageType='event';
  const projectLinks=all.filter(a=>/^\/projects\/(?!prize-leaderboard)[^/]+\/?$/.test(new URL(a.url).pathname));
  for(const a of projectLinks){const title=cleanText(find(a.node,n=>/^h[1-4]$/.test(tag(n)))[0]||a.node);if(title)page.projects.push(listing('alias:'+new URL(a.url).pathname.split('/').at(-1),title,a.url,a.text,event,a.node));page.links.push({url:a.url,kind:'detail',input:{event}});}
  // Only inspect actual winner/project associations, never prize-track definitions or announce flags alone.
  for(const a of projectLinks){let parent=parentOf(a.node);for(let i=0;parent&&i<3;i++,parent=parentOf(parent)){const headings=find(parent,n=>/^h[1-4]$/.test(tag(n))).map(cleanText),label=headings.find(t=>/\b(?:winners?|first place|second place|third place)\b/i.test(t));if(label&&event.meta?.announce===true){page.outcomes!.push(outcome(event,{url:a.url,name:a.text},/grant/i.test(label)?'grant':'award',label,cleanText(parent).slice(0,1000),locator(parent)));break;}}}
  page.needsBrowser=u.searchParams.get('tab')==='projectGallery'&&!projectLinks.length;Object.assign(page,pagination(html,url));page.reason=event.meta?.announce===false?'Results not announced; opportunities/grants are not verified wins':projectLinks.length?'Public event gallery associations':'Event metadata observed; gallery/results require rendering';return page;
 }
 page.pageType=u.pathname.includes('prize-leaderboard')?'results':'inventory';
 page.links=events.map(e=>({url:e.url!+'?tab=projectGallery',kind:'listing',input:{event:e}}));
 if(page.pageType==='results'){
  // This leaderboard is a discovery aid: amounts and ranks alone are not event-specific award definitions.
  for(const a of all.filter(a=>/^\/projects\/(?!prize-leaderboard)[^/]+\/?$/.test(new URL(a.url).pathname)))page.links.push({url:a.url,kind:'detail',input:{discovery_method:'official_prize_leaderboard; award mapping pending'}});
 }
 Object.assign(page,pagination(html,url));page.reason=events.length?'Official event inventory and pagination links':'Leaderboard links retained for discovery; prize/category mapping remains explicit';page.needsBrowser=!page.links.length;return page;
}
