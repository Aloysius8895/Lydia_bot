import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {Store,hash,type Row} from '../../data/database/store.ts';
import {fetchPublic} from '../../data/RAG/sources.ts';
import {canonicalUrl} from '../../data/RAG/retrieval.ts';
import {assert} from '../shared/config.ts';

const input=z.object({
 title:z.string().trim().max(200).default(''),content:z.string().trim().max(150000).default(''),
 url:z.string().url().regex(/^https?:\/\//).max(2000).optional(),
 publisher:z.string().trim().max(160).default(''),published_at:z.string().trim().max(80).default(''),
 document_id:z.string().uuid().optional(),case_id:z.string().uuid().optional()
});
export class KnowledgeNews {
 store:Store;
 constructor(store:Store){this.store=store;}
 async get(id:string){
  const r=await this.store.one('SELECT * FROM knowledge_news WHERE id=$1',[id]);assert(r,'NEWS_NOT_FOUND','新闻资料不存在',404);
  return {...r,kind:'news',source_id:r.publisher||'未注明媒体',depth:'新闻',quality:'报道待核对',submissions:[],resources:[]};
 }
 async list(url:URL){
  const b=z.object({query:z.string().max(200).default(''),source:z.string().max(160).default(''),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse(Object.fromEntries(url.searchParams));
  const where="($1::text IS NULL OR title ILIKE $1) AND ($2::text IS NULL OR COALESCE(NULLIF(publisher,''),'未注明媒体')=$2)",params=[b.query?'%'+b.query+'%':null,b.source||null];
  const items=await this.store.rows('SELECT * FROM knowledge_news WHERE '+where+' ORDER BY updated_at DESC,id LIMIT 48 OFFSET $3',[...params,b.offset]);
  return {items:items.map(r=>({...r,kind:'news',source_id:r.publisher||'未注明媒体',depth:'新闻',quality:'报道待核对'})),total:Number((await this.store.one('SELECT count(*) AS n FROM knowledge_news WHERE '+where,params))!.n),sources:await this.store.rows("SELECT COALESCE(NULLIF(publisher,''),'未注明媒体') AS source_id,count(*)::integer AS count FROM knowledge_news GROUP BY publisher ORDER BY publisher")};
 }
 async create(raw:unknown){
  const b=input.parse(raw);let {title,content,url,publisher,published_at}=b;const meta:Row={source_nature:'NEWS_REPORT_NOT_VERIFIED'};
  if(b.document_id){
   assert(b.case_id,'NEWS_CASE_REQUIRED','从已有资料导入时需要指定所属研究项目');
   await this.store.getCase(b.case_id);
   const doc=await this.store.one("SELECT * FROM documents WHERE id=$1 AND case_id=$2 AND collection='MARKET' AND active=true",[b.document_id,b.case_id]);
   assert(doc,'NEWS_DOCUMENT_SCOPE','资料不存在、已失效或不属于所选研究项目',404);
   title=doc.title;content=doc.content;url=doc.url||undefined;publisher=publisher||doc.meta.publisher||'';published_at=published_at||doc.meta.published_at||'';
   Object.assign(meta,{document_id:doc.id,case_id:b.case_id,document_version:doc.version,classification:'user_selected_as_news'});
  }
  if(content.length<30){
   assert(url,'NEWS_CONTENT_REQUIRED','请粘贴至少 30 字正文，或提供可读取的公开新闻链接');
   const fetched=await fetchPublic(url);content=fetched.content;title=title||fetched.title;url=fetched.url;meta.fetch_status=fetched.status;
  }else meta.fetch_status='USER_PROVIDED';
  assert(title.trim(),'NEWS_TITLE_REQUIRED','请填写新闻标题');
  const canon=url?canonicalUrl(url):null;
  const key=hash(canon?'url:'+canon:b.document_id?'document:'+b.document_id:'text:'+hash(content));
  const fingerprint=hash(JSON.stringify({title,content,url:canon,publisher,published_at,meta}));
  const r=await this.store.one(`INSERT INTO knowledge_news(id,origin_key,title,content,url,publisher,published_at,content_hash,meta) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT(origin_key) DO UPDATE SET title=excluded.title,content=excluded.content,url=excluded.url,publisher=excluded.publisher,published_at=excluded.published_at,content_hash=excluded.content_hash,meta=excluded.meta,revision=CASE WHEN knowledge_news.content_hash=excluded.content_hash THEN knowledge_news.revision ELSE knowledge_news.revision+1 END,updated_at=CASE WHEN knowledge_news.content_hash=excluded.content_hash THEN knowledge_news.updated_at ELSE now() END RETURNING *`,
   [randomUUID(),key,title,content,canon,publisher,published_at||null,fingerprint,meta]);
  return this.get(r!.id);
 }
}
