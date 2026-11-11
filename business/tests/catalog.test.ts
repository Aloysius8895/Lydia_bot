import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,readFile} from 'node:fs/promises';
import {classify,exportLibrary,safeFolder} from '../../data/data_preprocessing/imports/catalog.ts';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {FileImports} from '../../data/data_preprocessing/imports/store.ts';
import {parseFile,stable} from '../../data/data_preprocessing/imports/parse.ts';
import {businessSnapshot} from '../../data/data_preprocessing/imports/verify.ts';

test('classification preserves claimed statuses and separates SDG suggestions from source fields',()=>{
 const row={meta:{tags:['web3','finalist','health'],source_claimed_status:'Finalist (official)'}};
 const c=classify(row,'project');assert.equal(c.state,'finalist_claimed');assert.equal(c.theme,'web3');
 assert.equal(c.sdgCandidates[0].status,'ORGANIZATION_SUGGESTION_NOT_SOURCE_CLAIM');
 assert.equal(classify({meta:{tags:[]}},'project').theme,'unclassified');
 assert.equal(classify({meta:{tags:['participant'],source_claimed_status:'Participant (prize belongs to another event)'}},'project').state,'participant_claimed');
 assert.equal(classify({meta:{tags:['policy','data-center']}},'news').theme,'policy');
 assert.equal(safeFolder('../CON:unsafe/file'),'.._CON_unsafe_file');assert.equal(safeFolder('CON'),'_CON');
});
test('readable catalog exports full records once, safe reference indexes and unchanged DB',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-catalog-')),store=await Store.open();
 try{
  await new FileImports(store).execute([parseFile('TEST_ONLY.json',Buffer.from(JSON.stringify({projects:[{type:'hackathon_project',platform:'ETHGlobal',name:'TEST_ONLY SDG Web3',idea:'<script>TEST_ONLY do not execute</script>',source_urls:['https://ethglobal.com/showcase/TEST_ONLY'],tags:['web3','health','finalist'],status:'Finalist (upstream)',collected_date:'2026-11-07'}],news:[{type:'ai_news',id:'TEST_ONLY-news',title:'TEST_ONLY Security',summary:'TEST_ONLY summary, not original article.',source:'TEST_ONLY Publisher',source_urls:['https://example.org/test-news'],tags:['security'],collected_date:'2026-11-08'}]})))]);
  const before=stable(await businessSnapshot(store)),root=path.join(dir,'library');
  const result=await exportLibrary(store,root);assert.equal(result.projects,1);assert.equal(result.news,1);assert.equal(before,stable(await businessSnapshot(store)));
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));assert.equal(manifest.records.length,2);
  for(const r of manifest.records){
   assert.ok(path.resolve(root,r.path).startsWith(root+path.sep));
   const json=JSON.parse(await readFile(path.join(root,r.path,'record.json'),'utf8'));assert.equal(json.database_record.id,r.id);
   const md=await readFile(path.join(root,r.path,'README.md'),'utf8');assert.ok(md.includes('非原文'));assert.ok(!md.includes('<script>'));
  }
  await assert.rejects(exportLibrary(store,root));
 }finally{await store.close();}
});
