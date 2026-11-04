import { randomUUID } from 'node:crypto';
import { Store, hash, type Row } from '../database/store.ts';
import { Embedding } from './providers/embedding.ts';
import { assert } from '../../business/shared/config.ts';

export function tokenize(text: string,limit=64) {
  const seg=new Intl.Segmenter('zh',{granularity:'word'});
  return [...new Set([...seg.segment(text.normalize('NFKC').toLowerCase())].filter(s=>s.isWordLike).map(s=>s.segment))].slice(0,limit);
}
export function splitText(text: string, limit=1300) {
  const out:{text:string;start:number;end:number;heading:string}[]=[];
  let cursor=0, heading='';
  while(cursor<text.length) {
    let end=Math.min(text.length,cursor+limit);
    if(end<text.length) { const cut=text.lastIndexOf('\n',end); if(cut>cursor+limit/2)end=cut+1; }
    const slice=text.slice(cursor,end); const hs=[...slice.matchAll(/^#{1,6}\s+(.+)$/gm)];
    if(hs.length) heading=hs.at(-1)![1];
    if(slice.trim()) out.push({text:slice,start:cursor,end,heading});
    cursor=end;
  }
  return out;
}
export function canonicalUrl(input?:string|null) {
  if(!input)return null;const u=new URL(input);u.hash='';
  for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);
  u.searchParams.sort();return u.toString();
}
export async function ingest(store:Store, embedding:Embedding|null, input:{caseId:string|null;collection:'MARKET'|'PROJECT'|'METHOD';title:string;content:string;url?:string|null;sourceId?:string;meta?:Row;originKey?:string;projectionFingerprint?:string;activate?:boolean},signal?:AbortSignal):Promise<Row> {
  assert(input.content.trim().length>0&&input.content.length<=150000,'DOCUMENT_SIZE','资料需有正文且不超过 150000 字符');
  assert(input.collection==='METHOD'?input.caseId===null:!!input.caseId,'DOCUMENT_SCOPE','方法资料应全局，案件资料必须指定项目');
  if(input.caseId)await store.getCase(input.caseId);
  const contentHash=hash(input.content.normalize('NFKC').replace(/\s+/g,' ').trim());
  const methodRole=input.collection==='METHOD'?input.meta?.role||null:null;
  const old=input.originKey?await store.one("SELECT * FROM documents WHERE case_id IS NOT DISTINCT FROM $1 AND collection=$2 AND meta->>'origin_key'=$3 AND meta->>'projection_fingerprint'=$4 AND (active=true OR meta->>'projection_staged'='true')",[input.caseId,input.collection,input.originKey,input.projectionFingerprint||contentHash]):await store.one('SELECT * FROM documents WHERE case_id IS NOT DISTINCT FROM $1 AND collection=$2 AND content_hash=$3 AND active=true AND meta->>\'origin_key\' IS NULL AND ($4::text IS NULL OR meta->>\'role\'=$4)',[input.caseId,input.collection,contentHash,methodRole]);
  if(old)return {...old,duplicate:true};
  const canon=canonicalUrl(input.url);
  const previous=input.originKey?await store.one("SELECT * FROM documents WHERE case_id IS NOT DISTINCT FROM $1 AND collection=$2 AND meta->>'origin_key'=$3 ORDER BY version DESC LIMIT 1",[input.caseId,input.collection,input.originKey]):canon?await store.one('SELECT * FROM documents WHERE case_id IS NOT DISTINCT FROM $1 AND collection=$2 AND canonical_url=$3 AND active=true AND meta->>\'origin_key\' IS NULL ORDER BY version DESC LIMIT 1',[input.caseId,input.collection,canon]):input.sourceId?await store.one('SELECT * FROM documents WHERE case_id IS NOT DISTINCT FROM $1 AND collection=$2 AND source_id=$3 AND active=true AND meta->>\'origin_key\' IS NULL ORDER BY version DESC LIMIT 1',[input.caseId,input.collection,input.sourceId]):null;
  const id=randomUUID(), sourceId=input.sourceId || previous?.source_id || await store.nextId(`${input.caseId}:${input.collection}`,input.collection==='MARKET'?'E':input.collection==='METHOD'?'METHOD-':'P');
  const chunks=splitText(input.content);
  let embedded:Awaited<ReturnType<Embedding['embed']>>|undefined;
  let embeddingError:string|null=null;
  if(embedding)try{embedded=await embedding.embed(chunks.map(c=>c.text),false,signal);}catch(e){if(signal?.aborted)throw e;embeddingError=(e as any).code||'UNAVAILABLE';}
  try{await store.db.transaction(async tx=>{
    if(previous&&input.activate!==false)await tx.query('UPDATE documents SET active=false WHERE id=$1',[previous.id]);
    await tx.query('INSERT INTO documents(id,case_id,collection,source_id,title,content,content_hash,url,canonical_url,meta,version,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,input.caseId,input.collection,sourceId,input.title,input.content,contentHash,input.url||null,canon,{...input.meta,...input.originKey?{origin_key:input.originKey,projection_fingerprint:input.projectionFingerprint||contentHash,projection_staged:input.activate===false}:{},accessed_at:new Date().toISOString(),published_at:input.meta?.published_at||null,fetch_status:input.meta?.fetch_status||'FETCHED',embedding_status:embedded?'CONNECTED':'KEYWORD_ONLY',embedding_error:embeddingError},(previous?.version||0)+1,input.activate!==false]);
    for(let i=0;i<chunks.length;i++) {
      const c=chunks[i];await tx.query('INSERT INTO chunks(id,document_id,case_id,collection,content,position,search_text,embedding,embedding_model,embedding_dimension) VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$9,$10)',[randomUUID(),id,input.caseId,input.collection,c.text,{start:c.start,end:c.end,heading:c.heading,extractor:'crew-text-v1'},tokenize(`${input.title} ${c.text}`,4096).join(' '),embedded?JSON.stringify(embedded.vectors[i]):null,embedded?.model||null,embedded?.dimension||null]);
    }
  });}catch(e){
    if((e as any).code==='23505'){
      const duplicate=input.originKey?await store.one("SELECT * FROM documents WHERE case_id IS NOT DISTINCT FROM $1 AND collection=$2 AND meta->>'origin_key'=$3 AND meta->>'projection_fingerprint'=$4 AND (active=true OR meta->>'projection_staged'='true')",[input.caseId,input.collection,input.originKey,input.projectionFingerprint||contentHash]):await store.one('SELECT * FROM documents WHERE case_id IS NOT DISTINCT FROM $1 AND collection=$2 AND content_hash=$3 AND active=true AND meta->>\'origin_key\' IS NULL AND ($4::text IS NULL OR meta->>\'role\'=$4)',[input.caseId,input.collection,contentHash,methodRole]);
      if(duplicate)return {...duplicate,duplicate:true};
    }
    throw e;
  }
  return {...await store.one('SELECT * FROM documents WHERE id=$1',[id]),duplicate:false};
}
export async function retrieve(store:Store,embedding:Embedding|null,caseId:string,query:string,collection:'MARKET'|'PROJECT'|'METHOD'='MARKET',limit=8,methodRole:string|null=null,queryVariants:string[]=[query]) {
  await store.getCase(caseId);const scope=collection==='METHOD'?null:caseId;
  const variants=[...new Set([query,...queryVariants])].slice(0,4).map(q=>q.slice(0,1500));
  const lexicalLists:Row[][]=[];
  for(const variant of variants){const terms=tokenize(variant).map(t=>`'${t.replace(/'/g,"''")}'`).join(' | ');
  lexicalLists.push(await store.rows(`SELECT c.id,c.content,c.position,d.title,d.source_id,d.url,d.meta,d.version,c.document_id,
    ts_rank_cd(to_tsvector('simple',c.search_text),to_tsquery('simple',$3)) AS rank
    FROM chunks c JOIN documents d ON d.id=c.document_id
    WHERE c.case_id IS NOT DISTINCT FROM $1 AND c.collection=$2 AND d.active=true AND ($4::text IS NULL OR d.meta->>'role'=$4)
    AND to_tsvector('simple',c.search_text) @@ to_tsquery('simple',$3)
    ORDER BY rank DESC,c.id LIMIT 30`,[scope,collection,terms,methodRole]));}
  const semanticLists:Row[][]=[];let mode='KEYWORD_ONLY', reason='未启用或无法连接 embedding';
  if(embedding)try{
    const e=await embedding.embed(variants,true);
    for(const v of e.vectors){let semantic=await store.rows(`SELECT c.id,c.content,c.position,d.title,d.source_id,d.url,d.meta,d.version,c.document_id,
      c.embedding <=> $4::vector AS distance FROM chunks c JOIN documents d ON d.id=c.document_id
      WHERE c.case_id IS NOT DISTINCT FROM $1 AND c.collection=$2 AND d.active=true
      AND c.embedding_model=$3 AND c.embedding_dimension=$5 AND c.embedding IS NOT NULL AND ($6::text IS NULL OR d.meta->>'role'=$6)
      ORDER BY distance,c.id LIMIT 30`,[scope,collection,e.model,JSON.stringify(v),e.dimension,methodRole]);
    semanticLists.push(semantic.filter(r=>Number(r.distance)<0.55));}mode='HYBRID_RRF';reason='关键词与本地向量融合';
  }catch(e){reason=`Embedding 不可用：${(e as any).code||'UNAVAILABLE'}`;}
  const scores=new Map<string,Row>();
  for(const list of [...lexicalLists,...semanticLists])list.forEach((r,i)=>{const old=scores.get(r.id);scores.set(r.id,{...r,score:(old?.score||0)+1/(60+i+1)});});
  const sources=new Map<string,number>();
  const matches=[...scores.values()].sort((a,b)=>b.score-a.score).filter(r=>{const n=sources.get(r.document_id)||0;sources.set(r.document_id,n+1);return n<3;}).slice(0,limit);
  return {mode,reason,matches,queryVariantCount:variants.length};
}
