import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {FileImports} from '../../data/data_preprocessing/imports/store.ts';
import {parseFile} from '../../data/data_preprocessing/imports/parse.ts';
import {readySchema} from '../../data/data_preprocessing/sync/drive-batch.ts';
import {HackathonTracker,awardLabel,evidenceGroup,phaseOf} from '../backend/hackathon-tracker.ts';
import {KnowledgeAPI} from '../backend/knowledge.ts';
import {KnowledgeNews} from '../backend/knowledge-news.ts';

const file=(value:unknown,name='TEST_ONLY.json')=>parseFile(name,Buffer.from(JSON.stringify(value)));
const ev=(id:string,extra:Record<string,unknown>={})=>({type:'hackathon_event',id,platform:'ETHGlobal',name:'TEST_ONLY '+id,source_urls:['https://example.org/events/'+id],collected_date:'2026-11-09',...extra});
const proj=(name:string,extra:Record<string,unknown>={})=>({type:'hackathon_project',id:'p-'+name,platform:'ETHGlobal',name:'TEST_ONLY '+name,idea:'TEST_ONLY summary',source_urls:['https://ethglobal.com/showcase/'+name.toLowerCase()],...extra});

test('pure helpers keep upstream claims and dates as recorded',()=>{
 assert.equal(awardLabel('Winner: Best in Show'),'Best in Show');assert.equal(awardLabel('Finalist (official)'),'Finalist');assert.equal(awardLabel('Winner'),'获奖');
 assert.deepEqual(evidenceGroup('ETHGlobal Tokyo 2026 (2026-09-25~27); Finalist announced 2026-11-07'),{name:'ETHGlobal Tokyo 2026',dates:'2026-09-25~27'});
 assert.deepEqual(evidenceGroup('Push to Prod: Building at the Frontier; Created 2026-08-08'),{name:'Push to Prod: Building at the Frontier',dates:''});
 const now=new Date('2026-11-09T00:00:00Z');
 assert.equal(phaseOf(new Date('2026-11-12T15:59:00Z'),0,now),'open');assert.equal(phaseOf(new Date('2026-11-02T15:59:00Z'),0,now),'judging');
 assert.equal(phaseOf(null,0,now),'unknown');assert.equal(phaseOf(new Date('2026-11-12T15:59:00Z'),2,now),'results');
});

test('event records parse strictly and Drive manifests accept an events file',()=>{
 const ok=file({events:[ev('a',{submission_deadline:'2026-11-23T23:59:00+08:00',platform:'DoraHacks'})]}).items[0];
 assert.equal(ok.record?.kind,'event');assert.equal(ok.record?.source,'dorahacks');
 assert.equal(file([ev('b',{submission_deadline:'2026-11-23 23:59'})]).items[0].record,undefined,'deadline needs an explicit offset');
 assert.equal(file([ev('c',{source_urls:[]})]).items[0].record,undefined,'an event needs a source URL');
 assert.ok(readySchema.safeParse({schema_version:'1',producer_id:'grok-daily',batch_id:'b1',batch_folder_id:'a'.repeat(28),created_at:'2026-11-09T12:00:00+08:00',
  files:[{kind:'events',file_id:'b'.repeat(28),sha256:'c'.repeat(64),bytes:10,records:1}]}).success);
});

test('tracked events import with audit, link results and move from yellow to green',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-hackathons-'));const store=await Store.open(path.join(dir,'pg'));const imports=new FileImports(store);
 const tracker=new HackathonTracker(store),now=new Date('2026-11-09T00:00:00Z');
 try{
  const open=ev('open',{submission_deadline:'2026-11-23T23:59:00+08:00'}),judging=ev('judging',{submission_deadline:'2026-11-02T23:59:00+08:00'});
  const unknown=ev('unknown',{deadline_note:'官方未写明'}),byName=ev('byname',{name:'TEST_ONLY Mumbai 2026',submission_deadline:'2026-11-07T23:59:00+05:30',match_names:['TEST_ONLY Mumbai Hack']});
  await t.test('events import once and repeat as duplicates',async()=>{
   const first=await imports.execute([file({events:[open,judging,unknown,byName]})]);assert.deepEqual(first.counts,{imported:4,duplicate:0,conflict:0,failed:0});
   assert.ok(first.items.every(i=>i.kind==='event'&&i.target_id));
   const again=await imports.execute([file({events:[open,judging,unknown,byName]})]);assert.deepEqual(again.counts,{imported:0,duplicate:4,conflict:0,failed:0});
  });
  await t.test('a changed deadline is a preserved conflict, not an overwrite',async()=>{
   const before=await store.one("SELECT * FROM hackathon_events WHERE external_id='open'");
   const r=await imports.execute([file({events:[{...open,submission_deadline:'2026-11-30T23:59:00+08:00'}]})]);assert.equal(r.counts.conflict,1);
   assert.deepEqual(await store.one("SELECT * FROM hackathon_events WHERE external_id='open'"),before);
  });
  await t.test('phases before any results',async()=>{
   const list=await tracker.list(now),by=(id:string)=>list.events.find(e=>e.name==='TEST_ONLY '+id)!;
   assert.equal(by('open').phase,'open');assert.equal(by('judging').phase,'judging');assert.equal(by('unknown').phase,'unknown');assert.equal(by('unknown').deadline_note,'官方未写明');
   assert.equal(list.events.find(e=>e.name==='TEST_ONLY Mumbai 2026')!.phase,'judging');
   assert.equal(by('open').submission_deadline,'2026-11-23T15:59:00.000Z');assert.ok(list.last_delivery_at);assert.equal(list.seen_at,null);
  });
  await t.test('results link by event_id or recorded evidence; participants and other platforms do not count',async()=>{
   await imports.execute([file({projects:[
    proj('Alpha',{event_id:'open',status:'Finalist (official)'}),
    proj('Beta',{status:'Winner: Best DeFi',event_and_date_evidence:'TEST_ONLY Mumbai Hack (2026-11-05~07); finalists announced'}),
    proj('Gamma',{status:'Participant',event_and_date_evidence:'TEST_ONLY Mumbai 2026 (2026-11-05~07)'}),
    {...proj('Delta',{status:'Finalist',event_and_date_evidence:'TEST_ONLY Mumbai 2026'}),platform:'Devfolio',source_urls:['https://devfolio.co/projects/delta']},
    proj('Epsilon',{status:'Global Finalist (official)',event_and_date_evidence:'TEST_ONLY Space 2025 (2025-11-26); later award not verified'}),
    proj('Zeta',{status:'Participant',event_and_date_evidence:'TEST_ONLY Participants 2026 (2026-04-24)'})
   ]})]);
   const list=await tracker.list(now),open=list.events.find(e=>e.name==='TEST_ONLY open')!,mumbai=list.events.find(e=>e.name==='TEST_ONLY Mumbai 2026'&&e.kind==='tracked')!;
   assert.equal(open.phase,'results');assert.deepEqual(open.results.map((r:any)=>r.award),['Finalist']);
   assert.equal(mumbai.phase,'results');assert.equal(mumbai.winners,1);assert.equal(mumbai.finalists,0);assert.equal(mumbai.linked,2,'participant is linked but is not a result');
   assert.equal(mumbai.results[0].award,'Best DeFi');
   const grouped=list.events.filter(e=>e.kind==='grouped').map(e=>[e.source_id,e.name,e.event_dates,e.finalists]);
   assert.deepEqual(grouped.sort(),[['devfolio','TEST_ONLY Mumbai 2026',null,1],['ethglobal','TEST_ONLY Space 2025','2025-11-26',1]]);
   assert.ok(!list.events.some(e=>e.name==='TEST_ONLY Participants 2026'),'participant-only evidence is not a tracked result');
  });
  await t.test('seen marker, untrack and the authenticated API surface',async()=>{
   const seen=await tracker.markSeen();assert.equal((await tracker.list(now)).seen_at,seen.seen_at);
   const target=(await tracker.list(now)).events.find(e=>e.name==='TEST_ONLY judging')!;
   await tracker.untrack(target.id);assert.ok(!(await tracker.list(now)).events.some(e=>e.id===target.id));
   await assert.rejects(tracker.untrack('not-a-uuid'));
   const api=new KnowledgeAPI(store,null as any,null as any);
   const res=await api.handle('/api/knowledge/hackathons','GET',async()=>({}));assert.ok((res!.data as any).events.length>=4);
  });
  await t.test('news list exposes a category for the spatial zones',async()=>{
   await imports.execute([file({news:[{type:'ai_news',id:'n1',title:'TEST_ONLY 安全新闻',summary:'TEST_ONLY',source:'TEST_ONLY',source_urls:['https://example.org/n1'],tags:['security']}]})]);
   const list=await new KnowledgeNews(store).list(new URL('http://x/api/knowledge/news'));assert.equal(list.items[0].category,'security');
  });
 }finally{await store.close();}
});

test('a Drive events receipt carries provenance through import, repeat and raw-field readback',async()=>{
 const {applyProvenance}=await import('../../data/data_preprocessing/sync/provenance.ts');
 const {verifyImported}=await import('../../data/data_preprocessing/imports/verify.ts');
 const body=Buffer.from(JSON.stringify({events:[
  {type:'hackathon_event',id:'TEST_ONLY-evt-1',platform:'Luma',name:'TEST_ONLY Receipt Event',source_urls:['https://example.com/TEST_ONLY-1'],deadline_note:'TEST_ONLY 官方未披露',collected_date:'2026-11-09'},
  {type:'hackathon_event',id:'TEST_ONLY-evt-2',platform:'Luma',name:'TEST_ONLY Timed Event',source_urls:['https://example.com/TEST_ONLY-2'],submission_deadline:'2026-12-05T17:00:00+08:00',collected_date:'2026-11-09'}]}));
 const file=parseFile('events.json',body),filePath=path.join(os.tmpdir(),'TEST_ONLY-events.json');
 const receipt={root_folder_id:'TEST_root',producer_id:'TEST_ONLY_grok',batch_id:'TEST_ONLY-batch',logical_sha256:'a'.repeat(64),
  files:[{path:filePath,kind:'events',file_id:'TEST_events',sha256:file.sha256,records:2}],deliveries:[{batch_folder_id:'TEST_batch',ready_file_id:'TEST_ready',ready_sha256:'b'.repeat(64)}]};
 applyProvenance([file],[filePath],receipt);assert.equal(file.provenance!.file_id,'TEST_events');
 const store=await Store.open();
 try{
  const first=await new FileImports(store).execute([file]);assert.deepEqual(first.counts,{imported:2,duplicate:0,conflict:0,failed:0});
  const again=await new FileImports(store).execute([file]);assert.deepEqual(again.counts,{imported:0,duplicate:2,conflict:0,failed:0});
  const records=await verifyImported(store,[first.id,again.id]);
  assert.deepEqual(records.map(r=>[r.kind,r.title,r.tracker_verified]).sort(),[['event','TEST_ONLY Receipt Event',true],['event','TEST_ONLY Timed Event',true]]);
  await store.db.query("UPDATE hackathon_events SET meta=jsonb_set(meta,'{imported_record,name}','\"TEST_ONLY changed\"') WHERE external_id='TEST_ONLY-evt-1'");
  await assert.rejects(verifyImported(store,[first.id]),/RAW_FIELDS_CHANGED/);
 }finally{await store.close();}
});

test('Drive daily status exposes only batch ids, counts and readable reasons',async()=>{
 const {driveSyncStatus}=await import('../backend/drive-sync-status.ts');
 const {writeFile}=await import('node:fs/promises');
 const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-daily-status-')),file=path.join(dir,'latest.json');
 assert.equal(await driveSyncStatus(file),null);
 await writeFile(file,JSON.stringify({at:'2026-11-10T02:00:00.000Z',status:'REVIEW_REQUIRED',schedule:'10:00',service:{was_running:true,restarted:true},
  imported:[{batch_id:'TEST_ONLY-a',detail:{records:{project:0,news:0,event:3},backup:'C:/secret/path'}}],
  pending:[{folder_id:'TEST_folder',batch_id:'TEST_ONLY-b',status:'REVIEW_REQUIRED',reason:'REHEARSAL_CONFLICT',detail:{rehearsal:{imported:1,duplicate:0,conflict:1,failed:0}},at:'2026-11-10T02:00:00.000Z'}]}));
 const s=await driveSyncStatus(file);
 assert.deepEqual(s!.imported,[{batch_id:'TEST_ONLY-a',records:{project:0,news:0,event:3}}]);
 assert.equal(s!.pending[0].conflict,1);assert.match(s!.pending[0].label,/未导入，原记录保留/);assert.equal(s!.service_restarted,true);
 assert.ok(!JSON.stringify(s).includes('TEST_folder')&&!JSON.stringify(s).includes('secret'),'no folder ids or local paths');
});
