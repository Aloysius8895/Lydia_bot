import type {ParsedPage,ParseContext} from '../types.ts';
import {parseETHGlobal} from './ethglobal.ts';
import {parseHackQuest} from './hackquest.ts';
import {parseETHDiscovery} from './ethglobal-discovery.ts';
import {parseHQDiscovery} from './hackquest-discovery.ts';
import {parseDevfolio} from './devfolio.ts';
import {parseTAIKAI} from './taikai.ts';
import {parseNASA} from './nasa.ts';
import {parseImagineCup} from './imaginecup.ts';
import {parseHosted} from './hosted.ts';
import {pagination} from './discovery.ts';
import {sourceURL} from './registry.ts';

export function parseSource(source:string,url:string,html:string,context:ParseContext={years:[2025,2026]}):ParsedPage{
 let page:ParsedPage;
 switch(source){
  case 'ethglobal':page=parseETHDiscovery(url,html,context)||parseETHGlobal(url,html);break;
  case 'hackquest':page=parseHQDiscovery(url,html,context)||parseHackQuest(url,html);break;
  case 'devfolio':page=parseDevfolio(url,html,context);break;
  case 'taikai':page=parseTAIKAI(url,html,context);break;
  case 'nasa':page=parseNASA(url,html,context);break;
  case 'imaginecup':page=parseImagineCup(url,html,context);break;
  case 'dorahacks':case 'hackster':case 'junction':case 'google':page=parseHosted(source,url,html,context);break;
  default:throw Error('Unknown source adapter');
 }
 if(!page.pageType)page.pageType=page.projects.some(p=>p.meta.record_kind!=='listing')?'detail':'listing';
 if(!page.pagination&&page.pageType==='listing')Object.assign(page,pagination(html,url));
 for(const p of page.projects){const event=context.input?.event;if(p.year===null&&event?.year&&p.event?.id===event.id){p.year=event.year;p.meta={...p.meta,year_basis:'official_event_context',year_evidence_snapshot_id:context.input?.event_evidence_snapshot_id||null};}}
 page.projects=page.projects.filter(p=>p.year===null||context.years.includes(p.year));
 const excludedEvents=new Set(page.events?.filter(e=>e.year!==null&&!context.years.includes(e.year)).map(e=>e.id));
 page.events=page.events?.filter(e=>e.year===null||context.years.includes(e.year));page.outcomes=page.outcomes?.filter(o=>!excludedEvents.has(o.eventId));
 const seen=new Set<string>();page.links=page.links.filter(link=>{try{link.url=sourceURL(source,link.url);}catch{return false;}if(seen.has(link.url))return false;seen.add(link.url);const e=link.input?.event as any;return !e?.year||context.years.includes(e.year);});
 if(page.next)try{page.next=sourceURL(source,page.next);}catch{page.next=null;page.complete=false;page.reason+='; next URL outside source scope';}
 return page;
}
