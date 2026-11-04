import type {ParseContext,ParsedPage,ParsedEvent,Outcome} from '../types.ts';
import {blank,makeEvent,listing,pagination,outcome,officialEvidence} from './discovery.ts';
import {document,parentOf,anchors,find,tag,cleanText,locator,attr} from '../../data/crawl/html.ts';
import {readJSON,objects,eventYear,knownYear} from './structured.ts';

type HostedSource='dorahacks'|'hackster'|'junction'|'google';
const patterns={
 dorahacks:{event:/^\/hackathon\/[^/]+\/?$/,project:/^\/buidl\/[^/]+\/?$/},
 hackster:{event:/^\/contests\/[^/]+\/?$/,project:/^\/(?!contests|news|users|products|projects)[^/]+\/[^/]+-[a-f0-9]{6,}\/?$/},
 junction:{event:/^\/(?:hackathons|events)\/[^/]+\/?$/,project:/^\/(?:projects|project)\/[^/]+\/?$/},
 google:{event:/solution-challenge/i,project:/^\/en\/[^/]+\/?$/},
};
export function parseHosted(source:HostedSource,url:string,html:string,context:ParseContext):ParsedPage{
 const page=blank(`${source}-public-dom-v1`),u=new URL(url),doc=document(html),all=anchors(doc,url),values=readJSON(html),h1=find(doc,n=>tag(n)==='h1')[0],title=h1?cleanText(h1):cleanText(find(doc,n=>tag(n)==='title')[0]||doc),rules=patterns[source];
 if(source==='google'){
  page.pageType='inventory';page.links=all.filter(a=>/solution challenge/i.test(a.text)&&new URL(a.url).hostname==='developers.googleblog.com').map(a=>({url:a.url,kind:'event'}));
  const year=knownYear(title);if(/solution challenge/i.test(title)&&year&&context.years.includes(year)){
   const event=makeEvent(`solution-challenge-${year}`,title,url,year,'explicit_article_event_edition');page.events=[event];
   // Regional/national final stages stay regional; never promote Top 100/nominees to global finalists.
   const regional=/india|regional|national|country/i.test(title),root=find(doc,n=>tag(n)==='article')[0]||doc;
   for(const section of find(root,n=>/^h[23]$/.test(tag(n)))){const label=cleanText(section);if(!/winner|finalist/i.test(label))continue;let container=parentOf(section)!;const targets=anchors(container,url).filter(a=>a.url!==url&&!/googleblog\.com|google\.com|youtube|twitter|facebook/.test(new URL(a.url).hostname));for(const target of targets)page.outcomes!.push(outcome(event,{url:target.url,name:target.text},/finalist/i.test(label)?'finalist':'award',label,target.text,locator(container),regional?'regional':/global/i.test(title)?'global_finalist':'unknown'));}
   page.pageType='results';page.reason=regional?'Official regional/national article; not global finalist mapping':'Official edition article; only explicit result sections parsed';
  }else page.reason='Official Solution Challenge article discovery; no verified in-scope result edition on this page';
  Object.assign(page,pagination(html,url));return page;
 }
 const ld=objects(values,o=>(o['@type']==='Event'||o['@type']==='Hackathon')&&typeof o.name==='string')[0];
 let event=context.input?.event as ParsedEvent|undefined;
 if(rules.event.test(u.pathname)||source==='junction'&&/^20\d{2}\./.test(u.hostname)){
  const d=eventYear(ld?.name||title,ld?.endDate),name=ld?.name||title;if(name&&name!=='Hackjunction'&&(d.year===null||context.years.includes(d.year)))event=makeEvent(u.hostname+u.pathname,name,url,d.year,d.basis,h1);
 }
 if(event)page.events=[event];
 const eventLinks=all.filter(a=>rules.event.test(new URL(a.url).pathname)&&a.url.split('#')[0]!==url.split('#')[0]);
 for(const a of eventLinks){const d=eventYear(a.text+' '+new URL(a.url).pathname);if(d.year!==null&&!context.years.includes(d.year))continue;const e=makeEvent(new URL(a.url).hostname+new URL(a.url).pathname,a.text||new URL(a.url).pathname,a.url,d.year,d.basis,a.node);page.events!.push(e);page.links.push({url:a.url,kind:'event',input:{event:e}});}
 const projects=all.filter(a=>rules.project.test(new URL(a.url).pathname)&&new URL(a.url).hostname===u.hostname);
 for(const a of projects){const name=cleanText(find(a.node,n=>/^h[1-4]$/.test(tag(n)))[0]||a.node);if(name)page.projects.push(listing(new URL(a.url).pathname,name,a.url,a.text,event,a.node));page.links.push({url:a.url,kind:'detail',input:event?{event}:{}});}
 if(rules.project.test(u.pathname)&&h1){const main=find(doc,n=>tag(n)==='article')[0]||find(doc,n=>tag(n)==='main')[0],content=main?cleanText(main):'';if(content.length>100){const p=listing(u.pathname,title,url,content,event,h1);delete p.meta.record_kind;p.meta.content_completeness='public_main';page.projects=[p];page.pageType='detail';page.complete=true;page.reason='Public project page; awards not inferred from descriptive text';return page;}}
 // Explicit winner containers only. A contest's advertised prizes or a score table are not results.
 if(event)for(const a of projects){let parent=parentOf(a.node);for(let level=0;parent&&level<3;level++,parent=parentOf(parent)){const label=find(parent,n=>/^h[1-4]$/.test(tag(n))).map(cleanText).find(t=>/^(?:winners?|winning projects?|global finalists?|finalists?)$/i.test(t));if(label){page.outcomes!.push(outcome(event,{url:a.url,name:a.text},/finalist/i.test(label)?'finalist':'award',label,a.text,locator(parent),/global finalist/i.test(label)?'global_finalist':/finalist/i.test(label)?'event_finalist':'unknown'));break;}}}
 if(source==='junction')page.links.push(...all.filter(a=>new URL(a.url).hostname==='www.hackjunction.com'&&/^\/(events|platform|challenges)\/?$/.test(new URL(a.url).pathname)).map(a=>({url:a.url,kind:'inventory'})));
 page.pageType=page.outcomes!.length?'results':projects.length?'listing':event?'event':'inventory';Object.assign(page,pagination(html,url));page.needsBrowser=!projects.length&&!eventLinks.length&&!event;
 page.reason=page.outcomes!.length?'Explicit public outcome/project associations':event?'Event metadata; public project/results links only':'Official navigation; history and project coverage not assumed';return page;
}
