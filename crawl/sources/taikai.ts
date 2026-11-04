import type {ParseContext,ParsedPage,ParsedEvent} from '../types.ts';
import {readJSON,objects,eventYear} from './structured.ts';
import {blank,makeEvent,listing,pagination,outcome} from './discovery.ts';
import {document,parentOf,anchors,find,tag,cleanText,locator} from '../../data/crawl/html.ts';

export function parseTAIKAI(url:string,html:string,context:ParseContext):ParsedPage{
 const page=blank('taikai-public-next-v1'),doc=document(html),all=anchors(doc,url),values=readJSON(html),props=values.find(v=>v?.props?.pageProps)?.props?.pageProps,challenge=props?.challengeProps;
 let event:ParsedEvent|undefined;
 if(challenge?.challengeId&&challenge?.challengeName){const ld=objects(values,o=>o['@type']==='Event'&&o.endDate)[0],date=eventYear(challenge.challengeName,ld?.endDate);event=makeEvent(challenge.challengeId,challenge.challengeName,new URL(`/en/${challenge.orgSlug}/hackathons/${challenge.challengeSlug}`,url).href,date.year,date.basis);event.meta={closed:challenge.challengeBySlug?.isClosed,scope:'unknown',allowed_participants:challenge.challengeBySlug?.allowedParticipants};page.events=[event];}
 if(!event&&context.input?.event)event=context.input.event;
 if(!event){page.pageType='inventory';for(const a of all.filter(a=>/^\/[a-z]{2}\/[^/]+\/hackathons\/[^/]+\/?$/.test(new URL(a.url).pathname))){const title=cleanText(find(a.node,n=>/^h[1-4]$/.test(tag(n)))[0]||a.node),date=eventYear(title);if(date.year!==null&&!context.years.includes(date.year))continue;const e=makeEvent(new URL(a.url).pathname,title,a.url,date.year,date.basis,a.node);page.events!.push(e);page.links.push({url:a.url,kind:'event',input:{event:e}});}Object.assign(page,pagination(html,url));page.reason='Public hackathon cards';return page;}
 page.events=[event];
 const base=event.url!.replace(/\/$/,'');page.links=all.filter(a=>new URL(a.url).href.startsWith(base)&&/\/(projects|results)\/?$/.test(new URL(a.url).pathname)).map(a=>({url:a.url,kind:a.url.includes('/results')?'results':'listing',input:{event}}));
 const projectLinks=all.filter(a=>a.url.startsWith(base+'/projects/')&&a.text);
 for(const a of projectLinks){const p=listing(new URL(a.url).pathname.split('/').filter(Boolean).at(-1)!,a.text.split('\n').find(Boolean)!,a.url,a.text,event,a.node);page.projects.push(p);page.links.push({url:a.url,kind:'detail',input:{event}});}
 const state=objects(values,o=>o.__typename==='Project'&&o.id&&o.name);
 for(const p of state){const projectURL=projectLinks.find(a=>a.url.endsWith('/'+p.id))?.url;if(projectURL&&!page.projects.some(x=>x.url===projectURL))page.projects.push(listing(p.id,p.name,projectURL,p.description||p.shortDescription||p.name,event));}
 const path=new URL(url).pathname;page.pageType=/\/results\/?$/.test(path)?'results':/\/projects\/?$/.test(path)?'listing':/\/projects\/[^/]+/.test(path)?'detail':'event';
 if(page.pageType==='detail'){const h1=find(doc,n=>tag(n)==='h1')[0],main=find(doc,n=>tag(n)==='main')[0];if(h1&&main){const p=listing(path.split('/').filter(Boolean).at(-1)!,cleanText(h1),url,cleanText(main),event,h1);delete p.meta.record_kind;p.meta.content_completeness='rendered_main';page.projects=[p];}}
 // A score table or token ranking is not an official awarded prize. Only explicit result/winner blocks qualify.
 if(page.pageType==='results')for(const a of projectLinks){const container=parentOf(a.node)!,label=cleanText(container);if(/\b(?:winner|first prize|second prize|third prize)\b/i.test(label))page.outcomes!.push(outcome(event,{url:a.url,name:a.text},'award',label.slice(0,200),label,locator(container)));}
 Object.assign(page,pagination(html,url));page.reason=page.projects.length?'Public project links/fields parsed':'Event metadata present; projects/results require dynamic loading';page.needsBrowser=['listing','results'].includes(page.pageType)&&!page.projects.length;return page;
}
