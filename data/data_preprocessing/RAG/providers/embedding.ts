import { AppError, assert } from '../../../../business/shared/config.ts';

export class Embedding {
  url: string; model: string; fingerprint: string | null = null;
  constructor(url: string, model: string) {
    const u=new URL(url); assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'EMBEDDING_LOCAL_ONLY','Embedding 仅允许本机服务');
    this.url=u.origin; this.model=model;
  }
  async describe() {
    const r=await fetch(`${this.url}/api/tags`,{signal:AbortSignal.timeout(5000)});
    assert(r.ok,'EMBEDDING_UNAVAILABLE','无法检查本地 embedding 服务',503);
    const j=await r.json() as any;
    const m=j.models?.find((x:any)=>x.name===this.model || x.model===this.model);
    assert(m,'EMBEDDING_MISSING','本地 embedding 模型未安装',503);
    this.fingerprint=`ollama:${m.name}:${m.digest}`; return this.fingerprint;
  }
  async embed(texts: string[], query=false, signal?: AbortSignal) {
    const fingerprint=await this.describe();
    const input=texts.map(t=>this.model.startsWith('nomic-embed-text')?`${query?'search_query':'search_document'}: ${t}`:t);
    const r=await fetch(`${this.url}/api/embed`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:this.model,input,truncate:false}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
    if(!r.ok) throw new AppError('EMBEDDING_FAILED','本地 embedding 请求失败；请检查模型上下文和服务',503);
    const j=await r.json() as any;
    assert(Array.isArray(j.embeddings)&&j.embeddings.length===texts.length,'EMBEDDING_INVALID','Embedding 返回数量不符',503);
    const vectors=j.embeddings as number[][];
    assert(vectors.every(v=>v.length>0&&v.length===vectors[0].length&&v.every(Number.isFinite)),'EMBEDDING_INVALID','Embedding 向量无效',503);
    return {vectors,model:fingerprint,dimension:vectors[0].length};
  }
}
