import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config,businessRoot } from '../shared/config.ts';
import { Store } from '../../data/data_preprocessing/database/store.ts';
import { ClaudeCLI } from '../agents/providers/claude.ts';
import { Skills } from '../agents/skills.ts';
import { Embedding } from '../../data/data_preprocessing/RAG/providers/embedding.ts';
const exec=promisify(execFile);
const store=await Store.open(config.dataDir);
try{
  const cli=new ClaudeCLI({executable:config.cli,workspace:config.cliWorkspace,timeout:60000,noOverageConfirmed:true});
  const version=await exec(config.cli,['--version'],{windowsHide:true,timeout:15000});
  const auth=await cli.auth().catch(e=>({status:'BLOCKED',code:e.code}));
  const embedding=new Embedding(config.ollamaUrl,config.embeddingModel);
  const embeddingStatus=await embedding.describe().then(model=>({status:'CONNECTED',model})).catch(e=>({status:'BLOCKED',code:e.code}));
  const skills=await new Skills(config.skillsDir).status();
  const report={timestamp:new Date().toISOString(),timezone:'Asia/Kuala_Lumpur',node:process.version,platform:os.platform(),ramGiB:+(os.totalmem()/2**30).toFixed(1),cli:{version:version.stdout.trim(),auth},embedding:embeddingStatus,database:{kind:'PGlite embedded PostgreSQL WASM (not standalone server)',extensions:await store.rows('SELECT extname,extversion FROM pg_extension')},skills,search:'NOT_RUN: no confirmed free credentials/credits',expertBaselineComparison:skills.every(s=>s.status==='LOADED')?'NOT_RUN: canonical skills loaded; actual end-to-end evaluation pending':'BLOCKED: canonical skills unavailable',phoneInstall:'NOT_RUN: requires user phone and trusted HTTPS',extraPaidBudgetUSD:0};
  await mkdir(path.join(businessRoot,'test-results'),{recursive:true});await writeFile(path.join(businessRoot,'test-results','environment-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await store.close();}
