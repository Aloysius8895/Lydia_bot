import {document,find,tag,attr,children,type HtmlNode} from '../../data/crawl/html.ts';

export function jsonObjects(html:string){
 const doc=document(html),values:unknown[]=[];
 for(const n of find(doc,n=>tag(n)==='script')){
  const raw=children(n).map(n=>'value'in n?String(n.value):'').join('');
  if(attr(n,'id')==='__NEXT_DATA__'||attr(n,'type')==='application/ld+json'||attr(n,'type')==='application/json')try{values.push(JSON.parse(raw));}catch{}
  for(const m of raw.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)(?:;|$)/g))try{const v=JSON.parse(m[1]);if(typeof v[1]==='string'){
   for(const line of v[1].split('\n')){const offset=line.indexOf(':');if(offset>=0)try{values.push(JSON.parse(line.slice(offset+1)));}catch{}}
  }}catch{}
 }
 return values;
}
export function objects(value:unknown,predicate:(o:Record<string,any>)=>boolean,max=20000){
 const found:Record<string,any>[]=[],seen=new Set<object>();let visited=0;
 function walk(v:unknown){if(!v||typeof v!=='object'||seen.has(v)||++visited>max)return;seen.add(v);if(!Array.isArray(v)&&predicate(v as Record<string,any>))found.push(v as Record<string,any>);for(const x of Object.values(v))walk(x);}
 walk(value);return found;
}
export function readJSON(html:string):any[]{return jsonObjects(html);}
export function knownYear(input:unknown){const value=String(input??'').match(/\b(20\d{2})\b/);return value?Number(value[1]):null;}
export function eventYear(name:string,ending?:string){const y=knownYear(name);return {year:y??knownYear(ending),basis:y?'explicit_event_edition':ending?'event_end_date':'unknown'};}
