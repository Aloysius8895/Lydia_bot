import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {ClaudeCLI} from '../agents/providers/claude.ts';
import {rerank} from '../../data/data_preprocessing/RAG/rerank.ts';
test('reranker validates IDs, permits empty abstention, and caches by case and content version',async()=>{
  const store=await Store.open();let calls=0;const matches=[{id:'TEST_ONLY-A',version:1,title:'test',content:'招聘需求',source_id:'E001'},{id:'TEST_ONLY-B',version:1,title:'other',content:'库存需求',source_id:'E002'}];
  const cli={options:{noOverageConfirmed:true},run:async()=>{calls++;return {data:{rankings:[{index:0,items:[{id:'TEST_ONLY-A',relevance:'HIGH',reason:'招聘相关'}]}]}};}} as unknown as ClaudeCLI;
  try{const a=await store.createCase('TEST_ONLY','test');const first=await rerank(store,cli,a!.id,'招聘',matches,3);assert.equal(first.status,'RERANKED');assert.deepEqual(first.matches.map(m=>m.id),['TEST_ONLY-A']);
    assert.equal((await rerank(store,cli,a!.id,'招聘',matches,3)).status,'CACHED');assert.equal(calls,1);
    cli.run=async()=>({data:{rankings:[{index:0,items:[{id:'UNKNOWN-ID',relevance:'HIGH',reason:'invalid'}]}]},auth:{} as any,usage:null,session_id:null});
    assert.equal((await rerank(store,cli,a!.id,'different-query',matches)).status,'NOT_RUN');
    cli.run=async()=>({data:{rankings:[{index:0,items:[]}]},auth:{} as any,usage:null,session_id:null});
    assert.equal((await rerank(store,cli,a!.id,'unrelated',matches)).matches.length,0);
    cli.options.noOverageConfirmed=false;assert.equal((await rerank(store,cli,a!.id,'no-billing',matches)).status,'NOT_RUN');
  }finally{await store.close();}
});
