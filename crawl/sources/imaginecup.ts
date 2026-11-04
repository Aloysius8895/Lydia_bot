import type {ParseContext,ParsedPage} from '../types.ts';
import {blank,makeEvent,outcome,listing,officialEvidence} from './discovery.ts';
import {document,parentOf,find,tag,cleanText,locator,anchors} from '../../data/crawl/html.ts';
import {knownYear} from './structured.ts';

export function parseImagineCup(url:string,html:string,context:ParseContext):ParsedPage{
 const page=blank('imaginecup-official-v1'),doc=document(html),h1=find(doc,n=>tag(n)==='h1'),title=h1.map(cleanText).find(t=>/Imagine Cup/i.test(t))||cleanText(find(doc,n=>tag(n)==='title')[0]||doc),year=knownYear(title);
 if(year&&!context.years.includes(year)){page.reason='Official article is outside requested years';return page;}
 if(new URL(url).hostname==='techcommunity.microsoft.com'&&year&&/Imagine Cup Finalists/i.test(title)&&!/semi.?finalist/i.test(title)){
  const event=makeEvent(String(year),`Imagine Cup ${year}`,`https://imaginecup.microsoft.com/`,year,'explicit_official_article_edition');page.events=[event];
  const headings=find(doc,n=>tag(n)==='h3'&&/^.{2,100}:\s+\S/.test(cleanText(n)));
  for(const [index,heading] of headings.entries()){const name=cleanText(heading).split(':')[0].trim(),native=`article:${new URL(url).pathname.split('/').filter(Boolean).at(-1)}:section:${name}`,parent=parentOf(heading)!;
   const start=heading.sourceCodeLocation?.startOffset,end=headings[index+1]?.sourceCodeLocation?.startOffset??parent.sourceCodeLocation?.endOffset;
   const section=start!==undefined&&end!==undefined?cleanText(document(html.slice(start,end))):cleanText(heading);
   const p=listing(native,name,url,section,event,heading);p.meta={...p.meta,identity_basis:'document_section',section_locator:locator(heading),description_nature:'official_report'};p.evidence[0]=officialEvidence('title',name,cleanText(heading),locator(heading));page.projects.push(p);page.outcomes!.push(outcome(event,{id:native,name},'finalist','World Championship Finalist',cleanText(heading),locator(heading),'global_finalist'));
  }
  page.pageType='results';const count=/three teams|three standout teams/i.test(cleanText(doc))?3:null;page.complete=count!==null&&page.outcomes!.length===count;page.reason='Official World Championship finalists; article-scoped identities, no cross-article name merge';page.pagination={collectionKey:url,cursor:'article',...page.complete?{terminalEvidence:'Official article states three finalists; three sections parsed'}:{}};return page;
 }
 if(/\/winner\/?$/i.test(new URL(url).pathname)&&/Imagine Cup/i.test(title)){
  page.pageType='results';const rows=find(doc,n=>tag(n)==='tr');for(const row of rows){const content=cleanText(row),y=knownYear(content);if(!y||!context.years.includes(y))continue;const event=makeEvent(String(y),`Imagine Cup ${y}`,url,y,'official_winner_table_edition');page.events!.push(event);const name=content.match(/Team:\s*(.*?)\s*Country/i)?.[1];if(name)page.outcomes!.push(outcome(event,{name},'award','World Champion',content,locator(row)));}page.reason='Official world champion table; name-only entries retained pending exact identity review';return page;
 }
 page.pageType='inventory';page.links=anchors(doc,url).filter(a=>/imagine.?cup/i.test(a.text+' '+a.url)&&/winner|finalist|20(?:25|26)/i.test(a.text+' '+a.url)&&['imaginecup.microsoft.com','techcommunity.microsoft.com'].includes(new URL(a.url).hostname)).map(a=>({url:a.url,kind:'results'}));page.reason='Official Imagine Cup result navigation; main host authorization may block acquisition';page.needsBrowser=!page.links.length;return page;
}
