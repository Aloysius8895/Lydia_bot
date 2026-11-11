import type {ParseContext,ParsedPage} from '../types.ts';
import {blank,makeEvent,outcome,listing,pagination,officialEvidence} from './discovery.ts';
import {document,find,tag,cleanText,anchors,children,locator,attr} from '../../data/data_preprocessing/crawl/html.ts';
import {knownYear} from './structured.ts';

export function parseNASA(url:string,html:string,context:ParseContext):ParsedPage{
 const page=blank('nasa-official-results-v1'),doc=document(html),title=cleanText(find(doc,n=>tag(n)==='h1')[0]||find(doc,n=>tag(n)==='title')[0]||doc),u=new URL(url);
 const year=(knownYear(title)??Number(u.pathname.match(/^\/(20\d{2})\//)?.[1]||0))||null;
 if(year!==null&&!context.years.includes(year)){page.reason='Known edition outside requested years';return page;}
 if(!year){page.links=anchors(doc,url).filter(a=>/spaceappschallenge\.org$/.test(new URL(a.url).hostname)&&context.years.some(y=>new URL(a.url).pathname.startsWith('/'+y+'/'))).map(a=>({url:a.url,kind:'inventory'}));page.reason='Official year navigation only';page.pageType='inventory';page.needsBrowser=!page.links.length;return page;}
 const event=makeEvent(String(year),`NASA Space Apps Challenge ${year}`,`https://www.spaceappschallenge.org/${year}/`,year,'explicit_event_edition');page.events=[event];
 const article=find(doc,n=>tag(n)==='article')[0]||find(doc,n=>tag(n)==='main')[0]||doc;
 const globalWinner=/global-winners/i.test(u.pathname)&&/global winners/i.test(title);
 if(u.hostname==='www.nasa.gov'&&globalWinner){
  const paragraphs=find(article,n=>tag(n)==='p'),awardHeaders=paragraphs.filter(n=>/^[^:]{3,90}Award:\s*\S/.test(cleanText(n)));
  for(let i=0;i<awardHeaders.length;i++){
   const heading=awardHeaders[i],label=cleanText(heading),next=awardHeaders[i+1],start=heading.sourceCodeLocation!.startOffset,end=next?.sourceCodeLocation?.startOffset??article.sourceCodeLocation?.endOffset??html.length;
   const section=document(html.slice(start,end)),target=anchors(section,url).find(a=>/spaceappschallenge\.org$/.test(new URL(a.url).hostname)&&/\/find-a-team\//.test(new URL(a.url).pathname));
   const split=label.indexOf(':'),name=label.slice(split+1).trim(),award=label.slice(0,split).trim();
   page.outcomes!.push(outcome(event,{url:target?.url,name},'award',award,label,locator(heading)));
   if(target){const p=listing(new URL(target.url).pathname.replace(/\/$/,''),name,target.url,cleanText(section),event,heading);p.evidence=[officialEvidence('title',name,label,locator(heading)),officialEvidence('official_report_excerpt',p.content,p.content.slice(0,500),`NASA article range ${start}:${end}`),officialEvidence('event',event.name,event.name,'article title')];p.meta={...p.meta,source_report_url:url,detail_fetch_status:'not_fetched',description_nature:'official_report',identity_basis:'official_project_url'};page.projects.push(p);page.links.push({url:target.url,kind:'detail',input:{event}});}
  }
  page.pageType='results';const declared=cleanText(article).match(/(?:announced\s+\w+\s+|announced\s+)(\d+) winners/i)?.[1];
  page.complete=!!declared&&Number(declared)===page.outcomes!.length;page.pagination={collectionKey:url,cursor:'article',...page.complete?{terminalEvidence:`Official article declares ${declared} winners; ${page.outcomes!.length} award sections parsed`}:{}};page.reason='Official NASA award sections; team details may be inaccessible independently';return page;
 }
 const isFinalist=/\/awards\/global-finalists\/?$/.test(u.pathname)&&/global finalists/i.test(title),isWinner=/\/awards\/global-winners\/?$/.test(u.pathname)&&/global winners/i.test(title);
 const teams=anchors(article,url).filter(a=>/\/find-a-team\/[^/]+/.test(new URL(a.url).pathname));
 if(isFinalist||isWinner){page.pageType='results';for(const a of teams)page.outcomes!.push(outcome(event,{url:a.url,name:a.text},isFinalist?'finalist':'award',isFinalist?'Global Finalist':'Global Winner',a.text,locator(a.node),isFinalist?'global_finalist':'unknown'));page.links=teams.map(a=>({url:a.url,kind:'detail',input:{event}}));Object.assign(page,pagination(html,url));page.reason='Explicit global result page; no nomination-to-finalist promotion';page.needsBrowser=!teams.length;return page;}
 if(/\/find-a-team\/[^/]+/.test(u.pathname)&&title&&!/find a team/i.test(title)){
  const content=cleanText(article),p=listing(u.pathname.replace(/\/$/,''),title,url,content,event);if(content.length>150){delete p.meta.record_kind;p.meta.content_completeness='public_team_page';p.quality='accepted';}page.projects=[p];page.pageType='detail';page.complete=true;page.reason='Public team page parsed';return page;
 }
 page.links=anchors(article,url).filter(a=>/spaceappschallenge\.org$/.test(new URL(a.url).hostname)&&new URL(a.url).pathname.startsWith('/'+year+'/')&&/find-a-team|\/awards\//.test(a.url)).map(a=>({url:a.url,kind:/awards/.test(a.url)?'results':'listing',input:{event}}));page.pageType='inventory';Object.assign(page,pagination(html,url));page.reason='Year-scoped public team and awards navigation';return page;
}
