import type {ParsedPage,ParsedProject,Evidence} from '../types.ts';
import {plain,links} from './ethglobal.ts';

/** Read JSON strings embedded in public Next.js Flight scripts; never evaluate page JavaScript. */
export function publicProjectData(html:string):Record<string,any>|null{
  for(const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g))try{
    const value=JSON.parse(m[1]);if(typeof value[1]!=='string')continue;
    const text=value[1],start=text.indexOf('"project":{');if(start<0)continue;
    const offset=start+'"project":'.length;let depth=0,string=false,escape=false;
    for(let i=offset;i<text.length;i++){
      const ch=text[i];if(string){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')string=false;continue;}
      if(ch==='"')string=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){const project=JSON.parse(text.slice(offset,i+1));if(typeof project.id==='string'&&typeof project.name==='string')return project;break;}
    }
  }catch{/* Unknown script/template remains unparsed. */}
  return null;
}
export function parseHackQuest(url:string,html:string):ParsedPage{
  const parserVersion='hackquest-public-flight-v1',path=new URL(url).pathname;
  if(path==='/projects'||path==='/projects/'){
    const found=[...new Map(links(html,url).filter(a=>new URL(a.url).hostname===new URL(url).hostname&&/^\/projects\/[^/]+\/?$/.test(new URL(a.url).pathname)).map(a=>[a.url,a])).values()];
    const projects:ParsedProject[]=found.flatMap(a=>{const title=a.text.split('\n').find(s=>/^#{1,6} /.test(s.trim()))?.replace(/^\s*#+\s*/,'');if(!title)return [];return [{nativeId:'alias:'+new URL(a.url).pathname.split('/').at(-1)!,title,url:a.url,content:a.text,year:null,awards:[],stage:'unknown',resources:[],evidence:[{field:'title',value:title,quote:title,locator:`a[href="${new URL(a.url).pathname}"] heading`,nature:'author_claim' as const}],quality:'review',meta:{record_kind:'listing',year_basis:'unknown',award_status:'unknown',content_completeness:'listing_only',identity_basis:'url_alias_pending_platform_id'}}];});
    return {projects,links:found.map(a=>({url:a.url,kind:'detail'})),next:null,complete:false,reason:'Visible project links only; no verified pagination termination',parserVersion};
  }
  const p=publicProjectData(html);
  if(!p||!/^\/projects\/[^/]+\/?$/.test(path)||p.alias&&decodeURIComponent(path.split('/').at(-1)!)!==p.alias)return {projects:[],links:[],next:null,complete:false,reason:'Unknown public project data template or identity mismatch',parserVersion};
  const yearInEvent=typeof p.hackathonName==='string'?p.hackathonName.match(/\b(20\d{2})\b/):null;
  const published=!p.hackathonId&&typeof p.createdAt==='string'&&/^202[56]-/.test(p.createdAt)?Number(p.createdAt.slice(0,4)):null;
  const year=yearInEvent?Number(yearInEvent[1]):published;
  const evidence:Evidence[]=[{field:'title',value:p.name,quote:p.name,locator:'public Flight JSON: project.name',nature:'author_claim'},
    {field:'description',value:plain(p.description||''),quote:plain(p.description||'').slice(0,400),locator:'public Flight JSON: project.description',nature:'author_claim'}];
  if(p.hackathonId&&p.hackathonName)evidence.push({field:'event',value:p.hackathonName,quote:p.hackathonName,locator:'public Flight JSON: project.hackathonId/hackathonName',nature:'official_fact'});
  if(Array.isArray(p.teachStack))evidence.push({field:'technology_claim',value:p.teachStack,quote:p.teachStack.join(', '),locator:'public Flight JSON: project.teachStack',nature:'author_claim'});
  if(p.createdAt)evidence.push({field:'created_at',value:p.createdAt,quote:p.createdAt,locator:'public Flight JSON: project.createdAt (not event year)',nature:'official_fact'});
  const resources:{url:string;kind:string}[]=[];
  for(const [value,kind] of [[p.openSourceLink,'github'],[p.demoVideo,'video'],[p.pitchVideo,'video'],[p.projectLinks?.mvpLink,'demo']] as const){if(typeof value==='string')try{const u=new URL(value);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)resources.push({url:u.href,kind});}catch{}}
  const content=`# ${p.name}\n\n${p.oneLineIntro||''}\n\n## Description\n\n${plain(p.description||'')}\n\n## Tech Stack (author claim)\n\n${Array.isArray(p.teachStack)?p.teachStack.join(', '):'Unknown'}\n\n## Deployment (author claim)\n\n${p.deployEcosystem||'Unknown'}\n${p.deploymentDetails||''}`;
  return {projects:[{nativeId:p.id,title:p.name,url,content,year,event:p.hackathonId&&p.hackathonName?{id:p.hackathonId,name:p.hackathonName}:undefined,awards:[],stage:'unknown',resources,evidence,quality:year&&p.description?'accepted':'review',meta:{parser_version:parserVersion,year_basis:yearInEvent?'event_name':published?'independent_project_created_at':'unknown; project_created_at_is_not_event_year',created_at:p.createdAt||null,updated_at:p.updatedAt||null,award_status:'unknown',raw_prize_tracks:p.prizeTrack||null,raw_winner:p.winner||null,content_completeness:'public project fields; checkpoints and team excluded',implementation_version:'event_time_unknown'}}],links:[],next:null,complete:true,reason:'Public embedded project fields parsed; event year and award mapping require independent evidence',parserVersion};
}
