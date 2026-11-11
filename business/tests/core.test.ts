import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../data/data_preprocessing/database/store.ts';
import { ingest, retrieve, canonicalUrl, splitText, tokenize } from '../../data/data_preprocessing/RAG/retrieval.ts';
import { Embedding } from '../../data/data_preprocessing/RAG/providers/embedding.ts';
import { Skills, roles } from '../agents/skills.ts';
import { ClaudeCLI, subscriptionEnv, cliArgs, parseResult } from '../agents/providers/claude.ts';
import { Search } from '../../data/data_preprocessing/RAG/search.ts';
import { publicIP, validatePublicURL } from '../../data/data_preprocessing/RAG/sources.ts';
import { exportCase } from '../backend/export.ts';
import { plan } from '../agents/research.ts';
import { Worker } from '../agents/worker.ts';
import { reviewCitations } from '../agents/citations.ts';

let store:Store,a:string,b:string,tmp:string;
before(async()=>{tmp=await mkdtemp(path.join(os.tmpdir(),'crew-test-'));store=await Store.open();a=(await store.createCase('TEST_ONLY-A','SME 招聘'))!.id;b=(await store.createCase('TEST_ONLY-B','隔离案件'))!.id;});
after(async()=>{await store.close();});
test('real Postgres pgvector extension and rollback',async()=>{
  assert.equal((await store.one("SELECT extversion FROM pg_extension WHERE extname='vector'"))!.extversion.length>0,true);
  await assert.rejects(store.db.transaction(async tx=>{await tx.query("INSERT INTO settings VALUES('rollback-test','{}')");throw Error('rollback');}));
  assert.equal(await store.setting('rollback-test'),undefined);
});
test('scope isolation, injection text and exact multilingual keywords',async()=>{
  await ingest(store,null,{caseId:a,collection:'MARKET',title:'TEST_ONLY ATS',content:'SME 的 ATS-Blue 企业招聘流程。招聘筛选耗时。Majikan memerlukan saringan calon. hiring workflow.',meta:{synthetic:true}});
  await ingest(store,null,{caseId:b,collection:'MARKET',title:'TEST_ONLY PRIVATE',content:'招聘 ATS-Blue SECRET_OTHER_CASE'});
  const result=await retrieve(store,null,a,'招聘');assert.ok(result.matches.length);assert.ok(result.matches.every(m=>!m.content.includes('SECRET_OTHER_CASE')));
  assert.ok((await retrieve(store,null,a,'saringan')).matches.length);
  assert.ok((await retrieve(store,null,a,'ATS-Blue')).matches.length);
  assert.equal((await retrieve(store,null,a,"'; DROP TABLE cases; --")).matches.length,0);
  assert.equal((await store.listCases()).length,2);
});
test('deduplication and updates retain historical source versions',async()=>{
  const input={caseId:a,collection:'MARKET' as const,title:'TEST_ONLY v1',content:'A repeated public requirement with substantial original text.',url:'https://example.com/product?utm_source=test'};
  const first=await ingest(store,null,input),duplicate=await ingest(store,null,{...input,url:'https://example.org/repost'});
  assert.equal(duplicate.id,first.id);assert.equal(duplicate.duplicate,true);
  const second=await ingest(store,null,{...input,content:'Updated product requirement in a later version.'});
  assert.equal(second.source_id,first.source_id);assert.equal(second.version,2);
  assert.equal((await store.one('SELECT active FROM documents WHERE id=$1',[first.id]))!.active,false);
  assert.ok((await store.evidence(a)).some(e=>e.id===first.id));
  assert.equal(canonicalUrl('https://example.com/a?utm_source=x&b=1#top'),'https://example.com/a?b=1');
});
test('market claims cannot cite methods or another case evidence',async()=>{
  const other=await ingest(store,null,{caseId:b,collection:'MARKET',title:'TEST_ONLY foreign source',content:'独立的其他案件证据'});
  await assert.rejects(store.saveClaim(a,{statement:'invalid',claim_label:'SOURCE_SUPPORTED',evidence_ids:['S-SB-001']}));
  // E IDs are local per case, therefore use an ID that does not exist in A.
  await assert.rejects(store.checkEvidence(a,['E9999'],'SOURCE_SUPPORTED'));
  await assert.rejects(store.saveClaim(a,{statement:'unsupported',claim_label:'SOURCE_SUPPORTED',evidence_ids:[]}));
  assert.ok(other.id);
});
test('requirements cannot invent mandatory priority or unknown gap linkage',async()=>{
  await assert.rejects(store.saveRequirement(a,{statement:'99.99% accuracy',priority:'EXPLICIT_MUST',claim_label:'TO_VALIDATE',evidence_ids:[]}));
  await assert.rejects(store.saveRequirement(a,{statement:'unsupported gap',gap_id:'G999',claim_label:'TO_VALIDATE',evidence_ids:[]}));
  const r=await store.saveRequirement(a,{statement:'验收准确率待确认',priority:'UNKNOWN',claim_label:'TO_VALIDATE',evidence_ids:[],acceptance_criterion:'需与买方确认'});
  assert.ok(r.startsWith('R'));
});
test('continue never selects; explicit confirmed Gap selection has immutable decisions',async()=>{
  const g=await store.saveGap(a,{name:'TEST_ONLY Gap',claim_label:'TO_VALIDATE',evidence_ids:[]});
  await assert.rejects(store.enqueue(a,'model',{message:'继续'},'model-not-selected'));
  await assert.rejects(store.selectGap(a,g,false,'继续'));
  assert.equal((await store.getCase(a)).phase,'SCOPED');
  await store.selectGap(a,g,true,`我选择 ${g}`);await store.selectGap(a,g,true,`再次确认 ${g}`);
  assert.equal((await store.getCase(a)).selection_version,2);
  assert.equal((await store.snapshot(a)).decisions.length,2);
});
test('idempotency, recovery and queued cancellation persist accurately',async()=>{
  const x=await store.enqueue(b,'question',{message:'继续'},'idempotent-request');
  assert.equal((await store.enqueue(b,'question',{message:'继续'},'idempotent-request'))!.id,x!.id);
  await assert.rejects(store.enqueue(b,'question',{message:'different'},'idempotent-request'));
  await store.updateTask(x!.id,'RUNNING',{completed:['steve']});await store.recover();
  assert.equal((await store.task(x!.id)).status,'PAUSED');assert.deepEqual((await store.task(x!.id)).checkpoint.completed,['steve']);
  await store.resumeTask(x!.id);
  const worker=new Worker(store,new Skills(path.join(tmp,'missing')),{} as ClaudeCLI);await worker.cancel(x!.id);
  assert.equal((await store.task(x!.id)).status,'CANCELLED');await assert.rejects(store.resumeTask(x!.id));
});
test('persisted Postgres survives close and reopen',async()=>{
  const dir=path.join(tmp,'pg');const s=await Store.open(dir);const c=await s.createCase('TEST_ONLY persisted','持久化验证');await s.close();
  const reopened=await Store.open(dir);assert.equal((await reopened.getCase(c!.id)).title,'TEST_ONLY persisted');await reopened.close();
});
test('hybrid pgvector SQL scopes to case and rejects mismatched embedding spaces',async()=>{
  const fake={embed:async(texts:string[])=>({vectors:texts.map(()=>[1,0,0]),model:'TEST_ONLY_MODEL_A',dimension:3})} as Embedding;
  await ingest(store,fake,{caseId:a,collection:'MARKET',title:'TEST_ONLY vector',content:'A distinct semantic signal in this case'});
  await ingest(store,fake,{caseId:b,collection:'MARKET',title:'TEST_ONLY hidden',content:'SECRET_VECTOR_CASE_B'});
  const r=await retrieve(store,fake,a,'unmatched-query');assert.equal(r.mode,'HYBRID_RRF');assert.ok(r.matches.length);assert.ok(r.matches.every(m=>!m.content.includes('SECRET_VECTOR')));
  const changed={embed:async()=>({vectors:[[1,0,0]],model:'TEST_ONLY_MODEL_B',dimension:3})} as unknown as Embedding;
  assert.equal((await retrieve(store,changed,a,'unmatched-query')).matches.length,0);
});
test('text boundaries, original offsets and Chinese/English/Malay segmentation',()=>{
  const text='# 标题\n招聘问题\n'.repeat(300),parts=splitText(text);assert.equal(parts.map(p=>p.text).join(''),text);
  for(const p of parts)assert.equal(text.slice(p.start,p.end),p.text);
  assert.ok(tokenize('招聘 hiring majikan').includes('招聘'));assert.ok(tokenize('招聘 hiring majikan').includes('majikan'));
});
test('SSRF blocks private, IPv6 mapped, reserved networks and unsafe redirects',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.5','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','198.18.0.1'])assert.equal(publicIP(ip),false,ip);
  assert.equal(publicIP('1.1.1.1'),true);
  await assert.rejects(validatePublicURL('file:///etc/passwd'));
  await assert.rejects(validatePublicURL('https://user:pass@example.com'));
  await assert.rejects(validatePublicURL('http://localhost'));
  await assert.rejects(validatePublicURL('https://example.com',async()=>[{address:'127.0.0.1',family:4}] as any));
});
test('free search unknown or exhausted prevents network calls and credits reserve atomically',async()=>{
  await assert.rejects(new Search(store,{}).reserve(a));
  const env={TAVILY_FREE_ONLY_CONFIRMED:'true',TAVILY_API_KEY:'TEST_ONLY',TAVILY_ACCOUNT_ID:'test-account',TAVILY_CREDIT_PERIOD:new Date().toISOString().slice(0,7),TAVILY_BALANCE_CHECKED_AT:new Date().toISOString(),TAVILY_CREDITS_REMAINING:'1'};
  const outcomes=await Promise.allSettled([new Search(store,env).reserve(a),new Search(store,env).reserve(a)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  await assert.rejects(new Search(store,{...env,TAVILY_BALANCE_CHECKED_AT:'unknown'}).reserve(a));
});
test('CLI arguments and environment do not bypass permissions or inherit API routing',()=>{
  const e=subscriptionEnv({PATH:'test',ANTHROPIC_API_KEY:'TEST_ONLY',ANTHROPIC_PROFILE:'api',CLAUDE_CODE_USE_BEDROCK:'1',CLAUDE_CODE_OAUTH_TOKEN:'TEST_ONLY'});
  assert.equal(e.PATH,'test');assert.equal(e.ANTHROPIC_API_KEY,undefined);assert.equal(e.CLAUDE_CODE_OAUTH_TOKEN,undefined);
  const args=cliArgs();assert.ok(!args.includes('--bare'));assert.ok(!args.includes('--dangerously-skip-permissions'));assert.ok(args.includes('--no-session-persistence'));
  assert.equal(args[args.indexOf('--tools')+1],'','research profile stays tool-free');
  const voice=cliArgs({type:'object'},'dialogue');
  assert.equal(voice[voice.indexOf('--tools')+1],'StructuredOutput');
  assert.equal(voice[voice.indexOf('--allowedTools')+1],'StructuredOutput');
  assert.equal(voice[voice.indexOf('--effort')+1],'low');assert.ok(voice.includes('--system-prompt'));
  for(const flag of ['--bare','--model','--fallback-model','--dangerously-skip-permissions'])assert.equal(voice.includes(flag),false,flag);
  // Approved per-step allocation: experts Sonnet 5.5 low, final review Sonnet 5.5 medium, helpers / small talk Haiku 5.5 low, voice Sonnet 5.5 low.
  const pick=(a:string[])=>({model:a[a.indexOf('--model')+1],effort:a[a.indexOf('--effort')+1],efforts:a.filter(x=>x==='--effort').length});
  assert.deepEqual(pick(cliArgs({type:'object'},'default','expert')),{model:'claude-sonnet-5-5',effort:'low',efforts:1});
  assert.deepEqual(pick(cliArgs({type:'object'},'default','review')),{model:'claude-sonnet-5-5',effort:'medium',efforts:1});
  assert.deepEqual(pick(cliArgs({type:'object'},'default','helper')),{model:'claude-haiku-5-5',effort:'low',efforts:1});
  assert.deepEqual(pick(cliArgs({type:'object'},'dialogue','voice')),{model:'claude-sonnet-5-5',effort:'low',efforts:1});
  assert.deepEqual(pick(cliArgs({type:'object'},'default','idea')),{model:'claude-sonnet-5-5',effort:'low',efforts:1});
  const chat=cliArgs({type:'object'},'chat','chat');assert.deepEqual(pick(chat),{model:'claude-sonnet-5-5',effort:'low',efforts:1});
  assert.deepEqual(pick(cliArgs({type:'object'},'default','expert',{model:'claude-opus-5-5',effort:'high'})),{model:'claude-opus-5-5',effort:'high',efforts:1},'the model chosen in the message box replaces the tier default');
  assert.equal(chat[chat.indexOf('--tools')+1],'StructuredOutput');assert.ok(chat.includes('--system-prompt'));
  const schema={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{text:{type:'string',maxLength:100}},required:['text']};
  const compatible=cliArgs(schema,'dialogue'),sent=JSON.parse(compatible[compatible.indexOf('--json-schema')+1]);
  assert.equal(sent.$schema,undefined);assert.deepEqual(sent.properties,schema.properties);assert.deepEqual(sent.required,schema.required);assert.ok(schema.$schema,'caller schema not mutated');
  // Research steps, query expansion and reranking use the default profile: CLI 2.1.322 exits 1 on the $schema URI.
  for(const [profile,tier] of [['default','helper'],['default','expert'],['default',undefined]] as const){
   const a=cliArgs(schema,profile,tier),wire=JSON.parse(a[a.indexOf('--json-schema')+1]);
   assert.equal(wire.$schema,undefined,`no $schema for ${profile}/${tier}`);assert.deepEqual(wire.properties,schema.properties);
  }
  assert.ok(schema.$schema,'caller schema still not mutated');
});
test('CLI process JSON errors and malformed results are not success',()=>{
  assert.throws(()=>parseResult('{"type":"result","subtype":"success","result":"{}"}',1));
  assert.throws(()=>parseResult('{"type":"result","subtype":"success","is_error":true,"result":"API Error: 400 Claude Code 2.1.143 does not support this model; version 2.1.280 or newer is required. Run claude update"}',1),(e:any)=>e.code==='CLI_UPDATE_REQUIRED');
  assert.throws(()=>parseResult('{"type":"result","subtype":"error_max_turns","result":"error"}',0));
  assert.throws(()=>parseResult('not json',0));assert.throws(()=>parseResult('{"type":"result","subtype":"success","result":"hello"}',0));
  assert.deepEqual(parseResult('{"type":"result","subtype":"success","structured_output":{"ok":true}}',0).data,{ok:true});
  assert.deepEqual(parseResult(JSON.stringify({type:'result',subtype:'success',result:'```json\n{"ok":true}\n```'}),0).data,{ok:true});
  assert.throws(()=>parseResult(JSON.stringify({type:'result',subtype:'success',result:'Some prose before {"ok":true}'}),0));
  assert.throws(()=>parseResult('{"type":"result","subtype":"error","is_error":true,"result":"Usage limit reached"}',0),(e:any)=>e.code==='CLI_QUOTA_EXHAUSTED');
  assert.throws(()=>parseResult('{"type":"result","subtype":"success","is_error":true,"result":"You have hit your limit"}',1),(e:any)=>e.code==='CLI_QUOTA_EXHAUSTED');
});
test('CLI stdin is not shell-interpreted, and timeout/cancel are bounded',async()=>{
  const cli=new ClaudeCLI({executable:process.execPath,workspace:path.join(tmp,'workspace'),timeout:2000,noOverageConfirmed:true});
  const payload='$(echo LEAK); & dir | secret';const r=await cli.process(['-e',"process.stdin.pipe(process.stdout)"],payload);assert.equal(r.stdout,payload);
  await assert.rejects(cli.process(['-e','setTimeout(()=>{},30000)'],'',undefined,50),(e:any)=>e.code==='CLI_TIMEOUT');
  const abort=new AbortController();const p=cli.process(['-e','setTimeout(()=>{},30000)'],'',abort.signal);setTimeout(()=>abort.abort(),50);await assert.rejects(p,(e:any)=>e.code==='CANCELLED');
  const blocked=new ClaudeCLI({...cli.options,noOverageConfirmed:false});await assert.rejects(blocked.run('never call model',{}),(e:any)=>e.code==='BILLING_CONFIRMATION_REQUIRED');
});
test('skills are loaded only from canonical root with hashes; missing stays blocked',async()=>{
  await assert.rejects(new Skills(path.join(tmp,'missing')).load('steve'));
  const root=path.join(tmp,'TEST_ONLY-skills');await mkdir(path.join(root,roles.steve,'references'),{recursive:true});
  await writeFile(path.join(root,roles.steve,'SKILL.md'),'TEST_ONLY synthetic method, not real Steve skill');await writeFile(path.join(root,roles.steve,'references','methods.md'),'TEST_ONLY method reference');
  const s=await new Skills(root).load('steve');assert.equal(s.mode,'EXPLICIT_CONTEXT_INJECTION');assert.equal(s.parts[0].hash.length,64);
});
test('expert routing is scoped by question and explicit modeling mode',()=>{
  assert.deepEqual(plan('question','谁审批付款？'),['bob','steve_review']);assert.deepEqual(plan('question','竞品有哪些？'),['april','steve_review']);assert.ok(plan('model','继续').includes('ash'));assert.ok(!plan('question','继续').includes('ash'));
});
test('semantic citation review rejects unsupported claims and retains uncertainty',async()=>{
  const items=[{claim_label:'SOURCE_SUPPORTED',statement:'Employer will buy our tool',evidence_ids:['E001']}],evidence=[{id:'E001',content:'TEST_ONLY Employer posted a job vacancy'}];
  const cli={run:async()=>({data:{checks:[{index:0,verdict:'UNSUPPORTED',reason:'招聘不是购买承诺'}]}})} as unknown as ClaudeCLI;
  await assert.rejects(reviewCitations(cli,items,evidence,new AbortController().signal),(e:any)=>e.code==='CITATION_UNSUPPORTED');
  const uncertain={run:async()=>({data:{checks:[{index:0,verdict:'UNCERTAIN',reason:'原文不完整'}]}})} as unknown as ClaudeCLI;
  const review=await reviewCitations(uncertain,items,evidence,new AbortController().signal);assert.equal(review.status,'HUMAN_REVIEW_REQUIRED');assert.equal(review.independentHumanVerification,false);
});
test('global method retrieval remains role-scoped and never becomes market evidence',async()=>{
  for(const role of ['steve','bob'])await ingest(store,null,{caseId:null,collection:'METHOD',title:`TEST_ONLY ${role}`,content:'TEST_ONLY shared method about payroll workflow',sourceId:`METHOD-${role}`,meta:{role}});
  const result=await retrieve(store,null,a,'payroll','METHOD',8,'bob');assert.ok(result.matches.length);assert.ok(result.matches.every(m=>m.meta.role==='bob'));
  assert.ok(!(await retrieve(store,null,a,'payroll','MARKET')).matches.some(m=>m.source_id==='METHOD-bob'));
});
test('exports have six base files, retain history and do not fabricate model',async()=>{
  const root=path.join(tmp,'exports');const result=await exportCase(store,b,root);assert.equal(Object.keys(result.files).length,6);assert.equal(result.files['model.md'],undefined);
  assert.ok(result.files['research-summary.md'].includes('尚未完成真实专家研究'));assert.ok(await readFile(path.join(root,b,result.snapshot,'evidence.json'),'utf8'));
});
