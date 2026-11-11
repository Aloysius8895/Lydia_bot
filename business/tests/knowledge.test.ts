import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../backend/server.ts';
import {ObsidianBridge} from '../backend/obsidian.ts';
import {ideaOutput,validateIdeaSources} from '../agents/idea-lab.ts';
import {seedKnowledge,knowledgeReply} from './knowledge-fixture.ts';
import {ingest} from '../../data/data_preprocessing/RAG/retrieval.ts';

let app:Awaited<ReturnType<typeof createApp>>,server:http.Server,origin:string,cookie='',csrf='',temp:string,projects:any[],run:any,saved:any;
before(async()=>{
 temp=await mkdtemp(path.join(os.tmpdir(),'lydia-knowledge-'));
 server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 origin='http://127.0.0.1:'+(server.address() as any).port;
 app=await createApp({origin,dataDir:path.join(temp,'pg'),startWorker:false,localAutoLogin:false,crawlStorageDir:path.join(temp,'crawl')});
 projects=await seedKnowledge(app.store,3);
 app.cli.run=async()=>({data:knowledgeReply(projects),usage:null,session_id:null,auth:{loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'TEST_ONLY'}});
});
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await app.close();});
async function req(p:string,method='GET',data?:unknown,headers:Record<string,string>={}){
 const r=await fetch(origin+p,{method,headers:{origin,cookie,'x-csrf-token':csrf,'content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
 return {r,j:await r.json()};
}
test('knowledge requires auth, origin and CSRF; library excludes social posts',async()=>{
 assert.equal((await req('/api/knowledge/ideas')).r.status,401);
 const password='TEST_ONLY-knowledge-password';await req('/api/auth/setup','POST',{password});const login=await req('/api/auth/login','POST',{password});cookie=login.r.headers.get('set-cookie')!.split(';')[0];csrf=login.j.csrf;
 assert.equal((await req('/api/knowledge/draft','PUT',{},{'x-csrf-token':'bad'})).r.status,403);
 assert.equal((await req('/api/knowledge/obsidian/sync','POST',{}, {origin:'https://other.example'})).r.status,403);
 const list=await req('/api/knowledge/projects');assert.equal(list.j.total,3);assert.ok(list.j.items.every((p:any)=>p.meta.source_nature!=='SOCIAL_POST'));
 assert.equal((await req('/api/knowledge/projects?offset=-1')).r.status,400);
});
test('comparison captures project versions, saves idempotently and never selects a Gap',async()=>{
 const b={project_ids:projects.map(p=>p.id),constraints:{time:'48 hours'},request_key:'TEST_ONLY-knowledge-analysis'};
 run=(await req('/api/knowledge/runs','POST',b)).j;
 for(let n=0;n<60;n++){run=await app.ideaLab.run(run.id);if(run.status==='completed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(run.status,'completed');assert.equal(run.sources[0].revision,1);
 assert.equal((await req('/api/knowledge/runs','POST',b)).j.id,run.id);
 assert.equal((await req('/api/knowledge/runs','POST',{...b,project_ids:projects.slice(0,2).map(p=>p.id)})).r.status,409);
 saved=(await req('/api/knowledge/ideas','POST',{run_id:run.id,candidate_index:0})).j;
 assert.equal((await req('/api/knowledge/ideas','POST',{run_id:run.id,candidate_index:0})).j.id,saved.id);
 assert.equal((await req('/api/knowledge/ideas')).j.length,1);
 const research=(await req('/api/knowledge/ideas/'+saved.id+'/research','POST',{})).j;
 assert.equal((await req('/api/knowledge/ideas/'+saved.id+'/research','POST',{})).j.id,research.id);
 assert.equal((await app.store.getCase(research.id)).selected_gap_id,null);
 assert.equal((await app.store.evidence(research.id)).length,0);
 assert.equal((await app.store.snapshot(research.id)).project_documents.length,1);
});
test('fabricated source IDs and nonliteral quotes are rejected; cancellation fences late output',async()=>{
 const good=knowledgeReply(projects);validateIdeaSources(ideaOutput.parse(good),projects);
 const bad=structuredClone(good);bad.ideas[0].source_project_ids=[randomUUID()];assert.throws(()=>validateIdeaSources(ideaOutput.parse(bad),projects));
 const quote=structuredClone(good);quote.commonalities[0].quotes[0].quote='Not in original';assert.throws(()=>validateIdeaSources(ideaOutput.parse(quote),projects));
 let release!:(v:any)=>void;
 app.cli.run=()=>new Promise(r=>{release=r;});
 const r=await app.ideaLab.create(projects.slice(0,2).map(p=>p.id),run.constraints,'TEST_ONLY-cancel-analysis');app.ideaLab.start(r.id);
 for(let n=0;n<60&&!release;n++)await new Promise(r=>setTimeout(r,10));
 assert.ok(release);await app.ideaLab.cancel(r.id);release({data:good,usage:null});await new Promise(r=>setTimeout(r,50));assert.equal((await app.ideaLab.run(r.id)).status,'cancelled');
});
test('Obsidian sync writes linked Markdown, preserves notes and refuses managed-content overwrite',async()=>{
 const vault=path.join(temp,'vault');await mkdir(path.join(vault,'.obsidian'),{recursive:true});
 const bridge=new ObsidianBridge(app.store,vault);
 let sync=await bridge.sync();assert.equal(sync.projects,3);assert.equal(sync.ideas,1);assert.equal(sync.conflicts.length,0);
 const file=path.join(vault,'Lydia','Ideas',saved.id+'.md');let md=await readFile(file,'utf8');assert.ok(md.includes('../Projects/'));
 await writeFile(file,md+'\nMy private note remains.\n');
 await bridge.sync();assert.ok((await readFile(file,'utf8')).includes('My private note remains.'));
 md=await readFile(file,'utf8');await writeFile(file,md.replace('# '+saved.title,'# My changed managed title'));
 sync=await bridge.sync();assert.ok(sync.conflicts.includes('Ideas/'+saved.id+'.md'));
 assert.ok((await readFile(file,'utf8')).includes('# My changed managed title'));
 assert.ok((await readFile(path.join(vault,'Lydia','Index.md'),'utf8')).includes('[[Projects/'));
});
test('news is explicitly imported, URL-normalized and versioned without crossing research scopes',async()=>{
 const newsBody={title:'TEST_ONLY 服务变化报道',url:'https://example.com/article?utm_source=test',content:'TEST_ONLY project coordinates shared capacity. A synthetic news report about changing service capacity. This is synthetic test content, not real market evidence.',publisher:'TEST_ONLY News',published_at:'2026-11-01'};
 const first=await req('/api/knowledge/news','POST',newsBody);assert.equal(first.r.status,201);assert.equal(first.j.kind,'news');assert.equal(first.j.revision,1);
 assert.equal((await req('/api/knowledge/news','POST',{...newsBody,url:'https://example.com/article'})).j.id,first.j.id);
 const update=await req('/api/knowledge/news','POST',{...newsBody,content:newsBody.content+' Updated synthetic report.'});assert.equal(update.j.revision,2);
 const a=(await app.store.createCase('TEST_ONLY news A','A'))!,b=(await app.store.createCase('TEST_ONLY news B','B'))!;
 const doc=await ingest(app.store,null,{caseId:a.id,collection:'MARKET',title:'TEST_ONLY 旧新闻',content:newsBody.content});
 assert.equal((await req('/api/knowledge/news','POST',{document_id:doc.id,case_id:b.id})).r.status,404);
 assert.equal((await req('/api/knowledge/news','POST',{document_id:doc.id,case_id:a.id})).r.status,201);
 assert.equal((await req('/api/knowledge/news?source=TEST_ONLY+News')).j.total,1);
 assert.equal((await req('/api/knowledge/news','POST',{title:'short',content:'short'})).r.status,400);
 assert.equal((await req('/api/knowledge/news','POST',{url:'http://127.0.0.1/private'})).r.status,400);
});
test('mixed analysis requires both source kinds; snapshots, shelf and Obsidian preserve the news connection',async()=>{
 const article=(await req('/api/knowledge/news?source=TEST_ONLY+News')).j.items[0];
 app.cli.run=async(prompt:string)=>{const input=JSON.parse(prompt.split('UNTRUSTED_INPUT_JSON=')[1]);return {data:knowledgeReply(input.projects),usage:null,session_id:null,auth:{loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'TEST_ONLY'}};};
 const result=await req('/api/knowledge/runs','POST',{project_ids:[projects[0].id],news_ids:[article.id],constraints:{},request_key:'TEST_ONLY-mixed-news'});
 assert.equal(result.r.status,202);
 let mixed=result.j;
 for(let n=0;n<60;n++){mixed=await app.ideaLab.run(mixed.id);if(mixed.status==='completed'||mixed.status==='failed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(mixed.status,'completed');assert.equal(mixed.sources.filter((s:any)=>s.kind==='news').length,1);assert.equal(mixed.news_ids[0],article.id);
 const bad=structuredClone(mixed.output);bad.ideas[0].source_project_ids=[projects[0].id];assert.throws(()=>validateIdeaSources(ideaOutput.parse(bad),mixed.sources),(e:any)=>e.code==='IDEA_MIXED_SOURCES_REQUIRED');
 const savedNews=(await req('/api/knowledge/ideas','POST',{run_id:mixed.id,candidate_index:0})).j;
 assert.ok(savedNews.snapshot.sources.some((s:any)=>s.kind==='news'&&s.published_at));
 const bridge=new ObsidianBridge(app.store,path.join(temp,'vault'));await bridge.sync();
 assert.ok((await readFile(path.join(temp,'vault','Lydia','Ideas',savedNews.id+'.md'),'utf8')).includes('../News/'+article.id));
 assert.ok((await readFile(path.join(temp,'vault','Lydia','News',article.id+'.md'),'utf8')).includes(article.publisher||'未知'));
});
