import type {ParsedPage,ParsedProject,Evidence} from '../types.ts';

export function decode(text:string){return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi,s=>{
  const named:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(named[s.toLowerCase()])return named[s.toLowerCase()];const n=s.toLowerCase().startsWith('&#x')?parseInt(s.slice(3,-1),16):Number(s.slice(2,-1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
});}
export function plain(html:string){return decode(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[^]*?-->/g,'').replace(/<h([1-6])\b[^>]*>/gi,(_,n)=>'\n'+'#'.repeat(Number(n))+' ').replace(/<\/(?:p|div|section|article|h[1-6]|li|tr)>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
export function links(html:string,base:string){return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap(m=>{try{return [{url:new URL(decode(m[1]),base).href,text:plain(m[2])}];}catch{return [];}});}
function meta(html:string,key:string){const tags=html.match(/<meta\b[^>]*>/gi)||[];for(const t of tags)if(new RegExp(`(?:property|name)=["']${key}["']`,'i').test(t))return decode(t.match(/content=["']([^"']*)/i)?.[1]||'');return '';}

export function parseETHGlobal(url:string,html:string):ParsedPage{
  const path=new URL(url).pathname,allLinks=links(html,url),parserVersion='ethglobal-html-v1';
  if(path==='/showcase'||path==='/showcase/'){
    const projectLinks=[...new Map(allLinks.filter(a=>new URL(a.url).origin===new URL(url).origin&&/^\/showcase\/[^/]+\/?$/.test(new URL(a.url).pathname)).map(a=>[a.url,a])).values()];
    const next=allLinks.find(a=>/^(next|load more|下一页)$/i.test(a.text))?.url||null;
    const projects:ParsedProject[]=projectLinks.flatMap(a=>{
      const lines=a.text.split('\n').map(s=>s.trim()).filter(Boolean),title=lines.find(s=>/^#{1,6} /.test(s))?.replace(/^#+\s*/,'');
      if(!title)return [];
      const event=lines.find(s=>/^ETHGlobal .+\b20\d{2}\b/.test(s)),yearMatch=event?.match(/\b(20\d{2})\b/),year=yearMatch?Number(yearMatch[1]):null;
      const evidence:Evidence[]=[{field:'title',value:title,quote:title,locator:`a[href="${new URL(a.url).pathname}"] heading`,nature:'author_claim'}];
      if(event)evidence.push({field:'event_label',value:event,quote:event,locator:`a[href="${new URL(a.url).pathname}"] event label`,nature:'official_fact'});
      return [{nativeId:new URL(a.url).pathname.split('/').filter(Boolean).at(-1)!,title,url:a.url,content:a.text,year,awards:[],stage:'unknown',resources:[],evidence,quality:year?'accepted':'review',meta:{record_kind:'listing',year_basis:year?'official_event_label':'unknown',event_label:event||null,award_status:'unknown',content_completeness:'listing_only',identity_basis:'platform_slug'}}];
    });
    return {projects,links:projectLinks.map(a=>({url:a.url,kind:'detail'})),next,complete:false,reason:next?'next_link_found':'No verified end-of-pagination signal; current visible page only',parserVersion};
  }
  const heading=plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||meta(html,'og:title')).replace(/\s*\|\s*ETHGlobal.*$/i,'').trim();
  const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||'';
  const descriptionStart=html.search(/<h[1-6]\b[^>]*>\s*Project Description\s*<\/h[1-6]>/i);
  const mailingStart=html.search(/<h[1-6]\b[^>]*>\s*Join the mailing list/i);
  const body=descriptionStart>=0?html.slice(descriptionStart,mailingStart>descriptionStart?mailingStart:html.indexOf('<script',descriptionStart)>descriptionStart?html.indexOf('<script',descriptionStart):undefined):main;
  const content=plain(body),nativeId=path.split('/').filter(Boolean).at(-1)!;
  if(!/^\/showcase\/[^/]+\/?$/.test(path)||!heading||content.length<60||!/description|how it.s made|how it is made|project|built|created/i.test(content))return {projects:[],links:[],next:null,complete:false,reason:'Unknown detail template or missing project fields',parserVersion};
  const eventLink=allLinks.find(a=>/^\/events\/[^/]+\/?$/.test(new URL(a.url).pathname)&&/20\d{2}/.test(a.text)),yearMatch=eventLink?.text.match(/\b(20\d{2})\b/),year=yearMatch?Number(yearMatch[1]):null;
  const evidence:Evidence[]=[{field:'title',value:heading,quote:heading,locator:'h1',nature:'author_claim'}];
  if(eventLink)evidence.push({field:'event',value:eventLink.text,quote:eventLink.text,locator:`a[href="${new URL(eventLink.url).pathname}"]`,nature:'official_fact'});
  const resources=allLinks.filter(a=>/^https?:/.test(a.url)&&new URL(a.url).hostname!=='ethglobal.com').filter(a=>!/twitter.com|x.com|discord|linkedin|facebook|instagram|ethconf.com|mirror.xyz/.test(new URL(a.url).hostname)&&a.url!=='https://www.youtube.com/ethglobal').map(a=>({url:a.url,kind:new URL(a.url).hostname==='github.com'?'github':/youtube|youtu.be|vimeo/.test(a.url)?'video':/\.pdf(?:$|\?)/i.test(a.url)?'pdf':'demo'}));
  // Award markup is only accepted within a clearly labelled prizes section; no text-wide "winner" inference.
  const awardSection=html.match(/<h[1-6][^>]*>\s*(?:Prizes|Awards)\s*<\/h[1-6]>([\s\S]*?)(?=<h[1-6]|$)/i)?.[1]||'';
  const awardNames=links(awardSection,url).filter(a=>/\/events\/[^/]+\/prizes\//.test(new URL(a.url).pathname)).map(a=>a.text).filter(Boolean);
  const awards=[...new Set(awardNames)].map(name=>({name,evidence:{field:'award',value:name,quote:name,locator:`awards section / prize link: ${name}`,nature:'official_fact' as const}}));
  const project:ParsedProject={nativeId,title:heading,url,content,year,event:eventLink?{id:new URL(eventLink.url).pathname.split('/').filter(Boolean).at(-1)!,name:eventLink.text,url:eventLink.url}:undefined,awards,stage:'unknown',resources:[...new Map(resources.map(r=>[r.url,r])).values()],evidence,quality:year?'accepted':'review',meta:{year_basis:year?'event_link':'unknown',award_status:awards.length?'official_verified':'unknown',content_completeness:main?'main_element':'partial',parser_version:parserVersion,language:'unknown',implementation_version:'event_time_unknown'}};
  return {projects:[project],links:[],next:null,complete:true,reason:'single project detail parsed; awards/stage may remain unknown',parserVersion};
}
