import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {Store} from '../../data/database/store.ts';
import {IdeaLab,constraintsSchema} from '../agents/idea-lab.ts';
import {ObsidianBridge} from './obsidian.ts';
import {assert} from '../shared/config.ts';
import {KnowledgeNews} from './knowledge-news.ts';

export class KnowledgeAPI {
 store:Store;lab:IdeaLab;obsidian:ObsidianBridge;news:KnowledgeNews;
 constructor(store:Store,lab:IdeaLab,obsidian:ObsidianBridge){this.store=store;this.lab=lab;this.obsidian=obsidian;this.news=new KnowledgeNews(store);}
 async handle(p:string,method:string,body:()=>Promise<any>,url=new URL('http://localhost')){
  if(!p.startsWith('/api/knowledge/'))return null;
  if(p==='/api/knowledge/news'&&method==='GET')return {data:await this.news.list(url)};
  if(p==='/api/knowledge/news'&&method==='POST'){const item=await this.news.create(await body());void this.obsidian.sync().catch(()=>{});return {data:item,status:201};}
  if(p==='/api/knowledge/news/importable'&&method==='GET'){
   const caseId=z.string().uuid().parse(url.searchParams.get('case_id'));await this.store.getCase(caseId);
   return {data:await this.store.rows("SELECT id,title,url,version FROM documents WHERE case_id=$1 AND collection='MARKET' AND active=true ORDER BY created_at DESC LIMIT 100",[caseId])};
  }
  const newsItem=/^\/api\/knowledge\/news\/([^/]+)$/.exec(p);
  if(newsItem&&method==='GET')return {data:await this.news.get(z.string().uuid().parse(newsItem[1]))};
  if(p==='/api/knowledge/projects'&&method==='GET'){
   const b=z.object({query:z.string().max(200).default(''),source:z.string().max(80).default(''),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse(Object.fromEntries(url.searchParams));
   const params=[b.query?'%'+b.query+'%':null,b.source||null];
   const where="meta->>'source_nature' IS DISTINCT FROM 'SOCIAL_POST' AND ($1::text IS NULL OR title ILIKE $1) AND ($2::text IS NULL OR source_id=$2)";
   return {data:{items:await this.store.rows('SELECT * FROM crawl_projects WHERE '+where+' ORDER BY updated_at DESC,id LIMIT 48 OFFSET $3',[...params,b.offset]),total:Number((await this.store.one('SELECT count(*) AS n FROM crawl_projects WHERE '+where,params))!.n),sources:await this.store.rows("SELECT source_id,count(*)::integer AS count FROM crawl_projects WHERE meta->>'source_nature' IS DISTINCT FROM 'SOCIAL_POST' GROUP BY source_id ORDER BY source_id")}};
  }
  if(p==='/api/knowledge/obsidian'&&method==='GET')return {data:await this.obsidian.status()};
  if(p==='/api/knowledge/obsidian/sync'&&method==='POST')return {data:await this.obsidian.sync()};
  if(p==='/api/knowledge/draft'&&method==='GET')return {data:await this.store.setting('knowledge_draft')||{project_ids:[],constraints:constraintsSchema.parse({}),run_id:null}};
  if(p==='/api/knowledge/draft'&&method==='PUT'){
   const b=z.object({project_ids:z.array(z.string().uuid()).max(6),news_ids:z.array(z.string().uuid()).max(6).default([]),constraints:constraintsSchema,run_id:z.string().uuid().nullable()}).refine(v=>v.project_ids.length+v.news_ids.length<=6).parse(await body());
   await this.store.setSetting('knowledge_draft',b);return {data:b};
  }
  if(p==='/api/knowledge/runs'&&method==='POST'){
   const b=z.object({project_ids:z.array(z.string().uuid()).max(6),news_ids:z.array(z.string().uuid()).max(6).default([]),constraints:constraintsSchema,request_key:z.string().min(8).max(100)}).parse(await body());
   const r=await this.lab.create(b.project_ids,b.constraints,b.request_key,b.news_ids);this.lab.start(r.id);return {data:r,status:202};
  }
  const run=/^\/api\/knowledge\/runs\/([^/]+)(?:\/(cancel))?$/.exec(p);
  if(run){const id=z.string().uuid().parse(run[1]);if(method==='GET'&&!run[2])return {data:await this.lab.run(id)};if(method==='POST'&&run[2]==='cancel')return {data:await this.lab.cancel(id)};}
  if(p==='/api/knowledge/ideas'&&method==='GET')return {data:await this.store.rows('SELECT * FROM knowledge_ideas ORDER BY created_at DESC')};
  if(p==='/api/knowledge/ideas'&&method==='POST'){
   const b=z.object({run_id:z.string().uuid(),candidate_index:z.number().int().min(0).max(4)}).parse(await body()),r=await this.lab.run(b.run_id);
   assert(r.status==='completed'&&r.output?.ideas[b.candidate_index],'IDEA_NOT_READY','候选不存在或分析尚未完成',409);
   const c=r.output.ideas[b.candidate_index];
   const row=await this.store.one('INSERT INTO knowledge_ideas(id,run_id,candidate_index,title,snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,candidate_index) DO UPDATE SET title=knowledge_ideas.title RETURNING *',[randomUUID(),r.id,b.candidate_index,c.title,{candidate:c,sources:r.sources,constraints:r.constraints,analysis:r.output,created_at:new Date().toISOString()}]);
   void this.obsidian.sync().catch(()=>{});return {data:row,status:201};
  }
  const idea=/^\/api\/knowledge\/ideas\/([^/]+)(?:\/(research))?$/.exec(p);
  if(idea){
   const id=z.string().uuid().parse(idea[1]),old=await this.store.one('SELECT * FROM knowledge_ideas WHERE id=$1',[id]);assert(old,'IDEA_NOT_FOUND','收藏不存在',404);
   if(method==='PATCH'&&!idea[2]){
    const b=z.object({note:z.string().max(10000),status:z.enum(['explore','shortlist','archived'])}).parse(await body());
    const row=await this.store.one('UPDATE knowledge_ideas SET note=$2,status=$3,updated_at=now() WHERE id=$1 RETURNING *',[id,b.note,b.status]);void this.obsidian.sync().catch(()=>{});return {data:row};
   }
   if(method==='POST'&&idea[2]==='research'){
    const result=await this.store.db.transaction(async tx=>{
     const held=(await tx.query('SELECT * FROM knowledge_ideas WHERE id=$1 FOR UPDATE',[id])).rows[0] as any;
     if(held.case_id)return {id:held.case_id};
     const caseId=randomUUID(),s=held.snapshot;
     await tx.query('INSERT INTO cases(id,title,brief,meta) VALUES($1,$2,$3,$4)',[caseId,held.title.slice(0,120),s.candidate.summary,{idea_id:id,region:s.constraints.region||'待指定',brief_status:'GENERATED_IDEA_NOT_VALIDATED'}]);
     await tx.query('INSERT INTO documents(id,case_id,collection,source_id,title,content,content_hash,meta,version,active) VALUES($1,$2,\'PROJECT\',$3,$4,$5,$6,$7,1,true)',[randomUUID(),caseId,'P-IDEA',held.title,JSON.stringify(s),id,{source_nature:'GENERATED_IDEA_NOT_VALIDATED',market_evidence:false}]);
     await tx.query('UPDATE knowledge_ideas SET case_id=$2 WHERE id=$1',[id,caseId]);return {id:caseId};
    });void this.obsidian.sync().catch(()=>{});return {data:result};
   }
  }
  return null;
 }
}
