import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../../data/data_preprocessing/database/store.ts';
import {CrawlStore} from '../../data/data_preprocessing/crawl/store.ts';
import {Snapshots} from '../../data/data_preprocessing/crawl/snapshots.ts';
import {classify,robotsAllowed} from '../../crawl/fetch/http.ts';
import type {RunConfig,FetchResult} from '../../crawl/types.ts';

let store:Store,repo:CrawlStore,snapshots:Snapshots;
export const pilotConfig:RunConfig={sources:['ethglobal'],years:[2025,2026],maxPages:5,maxBytes:10000000,maxMinutes:20,delayMs:0,maxAttempts:3,finalistLimitPerEvent:20,finalistLimitTotal:200,selectionSeed:'lydia-v1'};
const result:FetchResult={requestedUrl:'https://ethglobal.com/showcase',finalUrl:'https://ethglobal.com/showcase',statusCode:200,headers:{},contentType:'text/html',classification:'readable',bytes:Buffer.from('<h1>TEST_ONLY Unicode 爬虫</h1>'),capturedAt:new Date().toISOString(),backend:'test'};
before(async()=>{store=await Store.open();repo=new CrawlStore(store);await repo.init();snapshots=new Snapshots(await mkdtemp(path.join(os.tmpdir(),'lydia-crawl-')));});
after(async()=>{await store.close();});
test('migration is versioned and preserves cases',async()=>{const c=await store.createCase('TEST_ONLY migration','existing case');assert.ok(await store.getCase(c!.id));const versions=(await store.rows('SELECT version FROM schema_migrations ORDER BY version')).map(r=>r.version);const expected=(await readdir(new URL('../../data/data_preprocessing/database/migrations/',import.meta.url))).filter(f=>/^\d+.*\.sql$/.test(f)).sort();assert.deepEqual(versions,expected);assert.ok(versions.includes('009-file-imports.sql'));});
test('persistent run idempotency, pause and fenced recovery',async()=>{
  const run=await repo.createRun(pilotConfig,'TEST_ONLY-run');assert.equal((await repo.createRun(pilotConfig,'TEST_ONLY-run')).id,run.id);
  const a=await repo.claim(10000);assert.ok(a);await store.db.query("UPDATE crawl_tasks SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[a.id]);
  const b=await repo.claim();assert.equal(b!.id,a.id);assert.notEqual(b!.lease_token,a.lease_token);assert.equal(b!.attempt,2);
  const file=await snapshots.save(result);assert.equal((await readFile(snapshots.resolve(file.relative))).toString(),result.bytes.toString());
  await assert.rejects(repo.finish(a,result,file,null),/领取已失效/);
  await repo.finish(b!,result,file,{projects:[],links:[],next:null,complete:false,reason:'test',parserVersion:'test-v1'});
  assert.equal((await repo.run(run.id)).tasks[0].status,'succeeded');
  await repo.control(run.id,'pause');assert.equal(await repo.claim(),null);await repo.control(run.id,'resume');await repo.settle();assert.equal((await repo.run(run.id)).status,'completed');
});
test('challenge pages, wildcard rules, specific agents and Allow precedence',()=>{
  assert.equal(classify(200,'text/html','<title>Just a moment...</title>'),'challenge');
  assert.equal(classify(200,'text/html','<title>Normal Project</title><h1>A normal page</h1><script src="/cdn-cgi/challenge-platform/normal.js"></script>'),'readable');
  const rules='User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*?secret=*\nUser-agent: LydiaResearchCrawler\nDisallow: /blocked\n';
  assert.equal(robotsAllowed(rules,'https://example.com/blocked'),false);
  assert.equal(robotsAllowed(rules,'https://example.com/private'),true);
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public','https://example.com/private/public'),true);
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /*?secret=*','https://example.com/a?secret=x'),false);
  assert.equal(robotsAllowed('User-agent: es\nDisallow: /','https://example.com/'),true);
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /%62ar','https://example.com/bar'),false);
});
