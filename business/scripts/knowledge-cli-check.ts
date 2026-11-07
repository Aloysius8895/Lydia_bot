import {mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../backend/server.ts';
import {seedKnowledge} from '../tests/knowledge-fixture.ts';
import {constraintsSchema} from '../agents/idea-lab.ts';
const origin='http://127.0.0.1:4318';
const authResponse=await fetch(origin+'/api/auth/status'),cookie=authResponse.headers.get('set-cookie')?.split(';')[0]||'';
const health=await(await fetch(origin+'/api/health',{headers:{cookie}})).json();
if(health.subscriptionNoOverageConfirmed!==true||health.cli?.loggedIn!==true)throw Error('Existing subscription confirmation and authentication required');
const tmp=await mkdtemp(path.join(os.tmpdir(),'lydia-knowledge-real-cli-'));
const app=await createApp({dataDir:path.join(tmp,'pg'),startWorker:false,crawlStorageDir:path.join(tmp,'crawl')});
app.cli.options.noOverageConfirmed=health.subscriptionNoOverageConfirmed;
app.cli.options.workspace=path.join(tmp,'cli');
const start=Date.now();
try{
 const sources=await seedKnowledge(app.store,2);
 const run=await app.ideaLab.create(sources.map(p=>p.id),constraintsSchema.parse({time:'48 hours',skills:'React / TypeScript'}),'TEST_ONLY_REAL_CLI');
 app.ideaLab.start(run.id);
 while(app.ideaLab.active.has(run.id))await new Promise(r=>setTimeout(r,500));
 const result=await app.ideaLab.run(run.id);
 const report={status:result.status==='completed'?'TEST_PASSED':'FAILED',duration_ms:Date.now()-start,realModelCalls:1,input:'Two synthetic TEST_ONLY projects in an isolated temporary database; no production cases changed',ideas:result.output?.ideas?.length||0,commonalities:result.output?.commonalities?.length||0,error:result.error||null};
 await writeFile('../pic/hackathon-idea-lab-2026-11-08/implemented/real-cli-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.status!=='TEST_PASSED')process.exitCode=1;
}finally{await app.close();}
