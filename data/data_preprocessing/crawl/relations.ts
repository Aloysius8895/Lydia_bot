import {CrawlStore} from './store.ts';
import type {Row} from '../database/store.ts';

export async function relations(repo:CrawlStore,id:string,limits:{depth:number;nodes:number;edges:number}){
 const p=await repo.project(id),nodes=new Map<string,Row>([[id,{id,label:p.title,type:'project'}]]),edges:Row[]=[];
 const direct=await repo.store.rows(`SELECT r.*,e.name AS event_name FROM crawl_relations r LEFT JOIN crawl_events e ON r.target_type='event' AND r.target_id=e.id WHERE r.project_id=$1 AND r.active=true ORDER BY r.id LIMIT 201`,[id]);
 let truncated=false;
 const append=(r:Row)=>{const label=r.event_name||(r.target_type==='technology'?r.target_id.replace(/^technology:/,''):r.target_id);
   if(edges.length>=limits.edges||!nodes.has(r.target_id)&&nodes.size>=limits.nodes||!nodes.has(r.project_id)&&nodes.size>=limits.nodes){truncated=true;return;}
   if(!nodes.has(r.project_id))nodes.set(r.project_id,{id:r.project_id,label:r.project_title,type:'project'});
   if(!nodes.has(r.target_id)){if(nodes.size>=limits.nodes){truncated=true;return;}nodes.set(r.target_id,{id:r.target_id,label,type:r.target_type});}
   edges.push({...r,source_id:r.project_id,target_name:label});
 };
 for(const r of direct)append(r);
 if(limits.depth===2&&direct.length){
   const neighbors=await repo.store.rows(`SELECT r.*,p.title AS project_title,e.name AS event_name FROM crawl_relations r JOIN crawl_projects p ON p.id=r.project_id LEFT JOIN crawl_events e ON r.target_type='event' AND e.id=r.target_id WHERE r.active=true AND r.project_id<>$1 AND r.target_id=ANY($2::text[]) ORDER BY r.id LIMIT 201`,[id,direct.map(r=>r.target_id)]);
   for(const r of neighbors)append(r);if(neighbors.length>200)truncated=true;
 }
 if(direct.length>200)truncated=true;
 return {nodes:[...nodes.values()],edges,truncated,depth:limits.depth,revision:p.revision,legend:{official_fact:'公开赛事事实',author_claim:'作者技术声明',computed_similarity:'计算相似度（当前不生成）'},limitations:'同赛事/同技术不表示合作、因果或抄袭'};
}
