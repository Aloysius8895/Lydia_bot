import {hash,type Row} from '../../data/database/store.ts';
export type Candidate={id:string;winner:boolean;events:{id:string;source:string;year:number;track?:string}[]};
export function selectProjects(candidates:Candidate[],config:{finalistLimitPerEvent:number;finalistLimitTotal:number;selectionSeed:string}){
  const result:{projectId:string;selected:boolean;reason:string;eventId:string|null}[]=[],counts=new Map<string,number>();
  const winners=new Set(candidates.filter(c=>c.winner).map(c=>c.id));
  for(const id of winners)result.push({projectId:id,selected:true,reason:'verified_winner',eventId:null});
  const groups=new Map<string,Candidate[]>();
  for(const c of candidates.filter(c=>!winners.has(c.id))){
    const events=[...c.events].sort((a,b)=>a.year-b.year||a.source.localeCompare(b.source)||a.id.localeCompare(b.id));
    const key=events[0]?`${events[0].year}:${events[0].source}:${events[0].id}:${events[0].track||''}`:'unknown';
    groups.set(key,[...groups.get(key)||[],{...c,events}]);
  }
  for(const list of groups.values())list.sort((a,b)=>hash(config.selectionSeed+a.id).localeCompare(hash(config.selectionSeed+b.id)));
  const lists=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);let total=0;
  while(lists.some(l=>l.length))for(const list of lists){const c=list.shift();if(!c)continue;
    const event=c.events.find(e=>(counts.get(e.id)||0)<config.finalistLimitPerEvent),selected=!!event&&total<config.finalistLimitTotal;
    if(selected){counts.set(event!.id,(counts.get(event!.id)||0)+1);total++;}
    result.push({projectId:c.id,selected,reason:selected?'finalist_stratified':!event?'event_limit_or_unknown':'total_limit',eventId:selected?event!.id:null});
  }
  return result;
}
