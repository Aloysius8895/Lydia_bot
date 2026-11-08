import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config, frontendRoot, assert, AppError } from '../shared/config.ts';
import { Store } from '../../data/database/store.ts';
import { Auth } from './auth.ts';
import { Skills } from '../agents/skills.ts';
import { Embedding } from '../../data/RAG/providers/embedding.ts';
import { ClaudeCLI } from '../agents/providers/claude.ts';
import { Worker } from '../agents/worker.ts';
import { ingest, retrieve } from '../../data/RAG/retrieval.ts';
import { ingestURL } from '../../data/RAG/sources.ts';
import { Search } from '../../data/RAG/search.ts';
import { exportCase } from './export.ts';
import { expandQueries } from '../../data/RAG/query-expansion.ts';
import { rerank } from '../../data/RAG/rerank.ts';
import {CrawlStore} from '../../data/crawl/store.ts';
import {Snapshots} from '../../data/crawl/snapshots.ts';
import {CrawlWorker} from '../../crawl/core/worker.ts';
import {CrawlAPI} from './crawl.ts';
import {CallStore} from '../../data/database/calls.ts';
import {Dialogue} from '../agents/dialogue.ts';
import {CallAPI} from './calls.ts';
import {VoiceTTS} from './voice-tts.ts';
import {phoneInfo,publicCA,selfLANConnection} from './phone.ts';
import {IdeaLab} from '../agents/idea-lab.ts';
import {KnowledgeAPI} from './knowledge.ts';
import {ObsidianBridge} from './obsidian.ts';

const id=z.string().uuid(),text=z.string().trim().min(1).max(150000);
const publicFiles=['index.html','manifest.webmanifest','sw.js','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','fonts/dm-sans-latin.woff2','fonts/bricolage-grotesque-latin.woff2','fonts/OFL-dmsans.txt','fonts/OFL-bricolagegrotesque.txt'];
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
async function buildFiles(){
  let manifest:Record<string,{file:string;css?:string[];assets?:string[]}>;
  try{manifest=JSON.parse(await readFile(path.join(frontendRoot,'.vite','manifest.json'),'utf8'));}catch{throw new AppError('FRONTEND_BUILD_REQUIRED','请先在 business 根目录运行 npm.cmd run build:frontend',503);}
  const files=new Set(publicFiles);
  for(const entry of Object.values(manifest))for(const name of [entry.file,...entry.css||[],...entry.assets||[]]){
    assert(/^assets\/[a-zA-Z0-9_.-]+\.(js|css|svg|png|woff2)$/.test(name),'BUILD_ASSET_INVALID','前端构建资源路径无效',503);files.add(name);
  }
  return files;
}
export async function createApp(options:{dataDir?:string;origin?:string;secure?:boolean;localAutoLogin?:boolean;skillsDir?:string;startWorker?:boolean;casesDir?:string;crawlStorageDir?:string;voiceFetch?:typeof fetch;voiceAPIKey?:string}={}){
  const staticFiles=await buildFiles();
  const store=await Store.open(options.dataDir||config.dataDir),origin=options.origin||config.origin,secure=options.secure||false;
  const auth=new Auth(store,secure),skills=new Skills(options.skillsDir||config.skillsDir),embedding=new Embedding(config.ollamaUrl,config.embeddingModel);
  const crawlStore=new CrawlStore(store);await crawlStore.init();
  const crawlSnapshots=new Snapshots(options.crawlStorageDir),crawlWorker=new CrawlWorker(crawlStore,crawlSnapshots),crawlAPI=new CrawlAPI(crawlStore,crawlSnapshots,crawlWorker);crawlWorker.embedding=embedding;
  if(options.startWorker!==false)crawlWorker.start();
  const savedSubscription=await store.setting('subscription_no_overage');
  const cli=new ClaudeCLI({executable:config.cli,workspace:config.cliWorkspace,timeout:config.cliTimeout,noOverageConfirmed:savedSubscription?.confirmed??config.subscriptionNoOverage});
  const worker=new Worker(store,skills,cli,embedding),search=new Search(store);if(options.startWorker!==false)await worker.start();
  const ideaLab=new IdeaLab(store,crawlStore,cli);await ideaLab.recover();
  const obsidian=new ObsidianBridge(store);await obsidian.init(options.startWorker!==false&&!options.dataDir);
  const knowledgeAPI=new KnowledgeAPI(store,ideaLab,obsidian);
  // Calls interrupted by a restart are marked, never re-run automatically (no duplicate subscription use).
  const callStore=new CallStore(store);await callStore.recover();
  const dialogue=new Dialogue(store,callStore,skills,cli,embedding),callAPI=new CallAPI(callStore,dialogue);
  const voiceTTS=new VoiceTTS(store,callStore,path.join(path.dirname(options.dataDir||config.dataDir),'voice-secrets','master.key'),options.voiceAPIKey,options.voiceFetch);
  const body=async(req:http.IncomingMessage)=>{let size=0;const buffers:Buffer[]=[];for await(const b of req){size+=b.length;assert(size<2*1024*1024,'REQUEST_SIZE','请求超过 2 MiB',413);buffers.push(b);}try{return JSON.parse(Buffer.concat(buffers).toString('utf8')||'{}');}catch{throw new AppError('JSON_INVALID','请求 JSON 无效');}};
  const handler=async(req:http.IncomingMessage,res:http.ServerResponse)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(data:unknown,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Cookie');res.end(JSON.stringify(data));};
    try{
      assert(req.headers.host===new URL(origin).host,'HOST_INVALID','请求 Host 不匹配',403);
      const url=new URL(req.url||'/',origin),p=url.pathname,method=req.method||'GET';
      if(p==='/phone-ca.cer'&&['GET','HEAD'].includes(method)){
        const ca=await publicCA();res.setHeader('content-type','application/pkix-cert');res.setHeader('content-disposition','attachment; filename="lydia-local-ca.cer"');res.setHeader('cache-control','no-store');res.end(method==='HEAD'?undefined:ca.bytes);return;
      }
      if(!p.startsWith('/api/')){
        assert(['GET','HEAD'].includes(method),'METHOD_INVALID','方法不允许',405);
        if(p==='/crawl/'||p==='/crawl'){res.statusCode=302;res.setHeader('Location','/?settings=crawl');res.setHeader('Cache-Control','no-store');res.end();return;}
        const name=p==='/'?'index.html':decodeURIComponent(p.slice(1));assert(staticFiles.has(name),'NOT_FOUND','页面不存在',404);
        const data=await readFile(path.join(frontendRoot,name));res.setHeader('content-type',mime[path.extname(name)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(method==='HEAD'?undefined:data);return;
      }
      const mutation=!['GET','HEAD'].includes(method);
      if(mutation)assert(req.headers.origin===origin,'ORIGIN_INVALID','仅接受本应用同源请求',403);
      let session=await auth.session(req);
      const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')||selfLANConnection(secure,req.socket.remoteAddress,req.socket.localAddress,new URL(origin).hostname);
      const passwordless=!!options.localAutoLogin&&local&&['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname);
      if(p==='/api/auth/status'&&method==='GET'){
        if(passwordless&&!session){
          assert(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin'||req.headers['sec-fetch-site']==='none','ORIGIN_INVALID','仅接受本应用请求',403);
          const created=await auth.createSession();auth.setCookie(res,created.token);session={csrf:created.csrf};
        }
        json({configured:await auth.configured(),authenticated:!!session,csrf:session?.csrf||null,secure,local,passwordless});return;
      }
      if(p==='/api/auth/setup'&&method==='POST'){
        const selfLAN=selfLANConnection(secure,req.socket.remoteAddress,req.socket.localAddress,new URL(origin).hostname);
        assert(local||selfLAN,'SETUP_LOCAL_ONLY','首次设置仅允许在电脑本机完成',403);
        const b=z.object({password:z.string().min(12).max(128)}).parse(await body(req));await auth.setup(b.password);json({configured:true});return;
      }
      if(p==='/api/auth/login'&&method==='POST'){
        assert(secure||['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''),'HTTPS_REQUIRED','手机登录需要受信任 HTTPS',403);
        const b=z.object({password:z.string().min(1).max(128)}).parse(await body(req)),s=await auth.login(b.password,req.socket.remoteAddress||'');auth.setCookie(res,s.token);json({csrf:s.csrf});return;
      }
      assert(session,'LOGIN_REQUIRED','请先登录',401);
      if(p==='/api/phone'&&method==='GET'){json(await phoneInfo(origin,secure));return;}
      if(mutation)assert(req.headers['x-csrf-token']===session.csrf,'CSRF_INVALID','会话校验未通过，请刷新页面',403);
      const knowledgeResult=await knowledgeAPI.handle(p,method,()=>body(req),url);if(knowledgeResult){json(knowledgeResult.data,knowledgeResult.status||200);return;}
      const crawlDownload=/^\/api\/crawl\/exports\/([^/]+)\/files\/([^/]+)$/.exec(p);
      if(crawlDownload&&['GET','HEAD'].includes(method)){const file=await crawlAPI.download(crawlDownload[1],crawlDownload[2]);res.setHeader('content-type',file.type);res.setHeader('Content-Disposition',`attachment; filename="${file.name}"`);res.setHeader('Cache-Control','no-store');if(method==='HEAD')res.end();else createReadStream(file.path).on('error',()=>res.destroy()).pipe(res);return;}
      const crawlResult=await crawlAPI.handle(p,method,url,()=>body(req),{loopback:['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')});if(crawlResult){json(crawlResult.data,crawlResult.status||200);return;}
      if(p==='/api/auth/logout'&&method==='POST'){voiceTTS.abortAll();dialogue.abortTurns(await callStore.endAllActive('LOGOUT'));await auth.logout(req,res);json({ok:true});return;}
      if(p==='/api/health'&&method==='GET'){
        const [skillStatus,cliStatus,embedStatus]=await Promise.all([skills.status(),cli.auth().catch(e=>({status:'BLOCKED',code:e.code,message:e.message})),embedding.describe().then(model=>({status:'CONNECTED',model})).catch(e=>({status:'BLOCKED',code:e.code||'UNAVAILABLE'}))]);
        json({database:'PGLITE_POSTGRES_PGVECTOR',skills:skillStatus,cli:cliStatus,embedding:embedStatus,subscriptionNoOverageConfirmed:cli.options.noOverageConfirmed,searchEnabled:process.env.TAVILY_FREE_ONLY_CONFIRMED==='true',paidBudgetUSD:0,cloudInference:true});return;
      }
      if(p==='/api/settings/subscription'&&method==='POST'){
        const b=z.object({confirmed:z.literal(true)}).parse(await body(req));await store.setSetting('subscription_no_overage',{confirmed:b.confirmed,at:new Date().toISOString()});cli.options.noOverageConfirmed=true;json({confirmed:true});return;
      }
      if(p==='/api/voice/capabilities'&&method==='GET'){
        const caps=callAPI.capabilities(await cli.auth().then(a=>({status:'CONNECTED',subscriptionType:a.subscriptionType})).catch(e=>({status:'BLOCKED',code:e.code}))),tts=await voiceTTS.status();
        caps.server.tts={status:tts.provider==='elevenlabs'?'CONFIGURED_NOT_VERIFIED':'BROWSER',reason:tts.provider==='elevenlabs'?'ElevenLabs TTS；实际声音待用户验证':'浏览器本机/系统朗读'};
        caps.server.paid_voice_services=tts.provider==='elevenlabs';caps.server.cloud_voice_api=tts.provider==='elevenlabs';json({...caps,tts});return;
      }
      const voiceResult=await voiceTTS.handle(p,method,url,()=>body(req),req,res);
      if(voiceResult){if('data'in voiceResult)json(voiceResult.data);return;}
      const callResult=await callAPI.handle(p,method,()=>body(req));if(callResult){
        const ended=/\/calls\/([^/]+)(?:\/end)?$/.exec(p);if(ended&&(method==='DELETE'||p.endsWith('/end')))voiceTTS.abortCall(ended[1]);
        json(callResult.data,callResult.status||200);return;}
      if(p==='/api/cases'&&method==='GET'){json(await store.listCases());return;}
      if(p==='/api/cases'&&method==='POST'){const b=z.object({title:z.string().trim().min(1).max(120),brief:text,region:z.string().max(120).default('马来西亚')}).parse(await body(req));json(await store.createCase(b.title,b.brief,{region:b.region,brief_status:'USER_PROVIDED',scope_limits:'其他比赛约束待补充'}),201);return;}
      const cm=/^\/api\/cases\/([^/]+)(?:\/(.*))?$/.exec(p);
      if(cm){const caseId=id.parse(cm[1]),action=cm[2]||'';await store.getCase(caseId);
        if(!action&&method==='GET'){json(await store.snapshot(caseId));return;}
        if(action==='documents'&&method==='POST'){
          const b=z.object({title:z.string().min(1).max(200),content:text,collection:z.enum(['MARKET','PROJECT']).default('MARKET'),published_at:z.string().max(50).nullable().default(null),region:z.string().max(120).nullable().default(null),speaker:z.string().max(200).nullable().default(null),synthetic:z.boolean().default(false)}).parse(await body(req));
          json(await ingest(store,embedding,{caseId,collection:b.collection,title:b.title,content:b.content,meta:{...b,content:undefined,title:undefined,source_nature:'USER_UPLOADED_NOT_VERIFIED',fetch_status:'FETCHED',limitations:'用户上传资料；未经独立核实'}}),201);return;
        }
        if(action==='sources'&&method==='POST'){const b=z.object({url:z.string().url().max(2000),collection:z.enum(['MARKET','PROJECT']).default('MARKET')}).parse(await body(req));json(await ingestURL(store,embedding,caseId,b.url,undefined,b.collection),201);return;}
        if(action==='search'&&method==='POST'){const b=z.object({query:z.string().min(2).max(500)}).parse(await body(req));json({results:await search.search(caseId,b.query),notice:'摘要用于发现，不计市场证据；需读取来源正文'});return;}
        if(action==='retrieve'&&method==='POST'){const b=z.object({query:z.string().min(1).max(500),collection:z.enum(['MARKET','PROJECT','METHOD']).default('MARKET')}).parse(await body(req));const expansion=await expandQueries(store,cli,caseId,b.query),base=await retrieve(store,embedding,caseId,b.query,b.collection,20,null,expansion.variants),ranking=await rerank(store,cli,caseId,b.query,base.matches,8);json({...base,matches:ranking.matches,reason:`${base.reason}；${ranking.reason}`,expansion,ranking:{status:ranking.status,reason:ranking.reason}});return;}
        if(action==='tasks'&&method==='POST'){
          const b=z.object({kind:z.enum(['research','question','model']),message:z.string().min(1).max(8000),request_key:z.string().min(8).max(100)}).parse(await body(req));
          json(await store.enqueue(caseId,b.kind,{message:b.message},b.request_key),202);void worker.tick().catch(()=>{});return;
        }
        if(action==='selection'&&method==='POST'){const b=z.object({gap_id:z.string().regex(/^G\d+$/),confirmed:z.literal(true),user_message:z.string().min(1).max(1000)}).parse(await body(req));json(await store.selectGap(caseId,b.gap_id,b.confirmed,b.user_message));return;}
        if(action==='export'&&method==='POST'){json(await exportCase(store,caseId,options.casesDir||config.casesDir));return;}
      }
      const tm=/^\/api\/tasks\/([^/]+)(?:\/(cancel|resume))?$/.exec(p);
      if(tm){const taskId=id.parse(tm[1]);if(method==='GET'&&!tm[2]){json(await store.task(taskId));return;}
        if(method==='POST'&&tm[2]==='cancel'){json(await worker.cancel(taskId));return;}
        if(method==='POST'&&tm[2]==='resume'){json(await store.resumeTask(taskId));void worker.tick().catch(()=>{});return;}
      }
      throw new AppError('NOT_FOUND','接口不存在',404);
    }catch(e){if(res.headersSent){res.destroy();return;}const err=e as any;json({error:{code:err instanceof z.ZodError?'INPUT_INVALID':err.code||'INTERNAL_ERROR',message:err instanceof z.ZodError?'输入格式或长度不符合要求':err instanceof AppError?err.message:'服务操作未成功，请查看状态并重试'}},err instanceof z.ZodError?400:err.status||500);}
  };
  return {store,auth,skills,embedding,cli,worker,callStore,dialogue,voiceTTS,crawlStore,crawlWorker,crawlSnapshots,ideaLab,obsidian,handler,close:async()=>{await ideaLab.stop();await obsidian.stop();voiceTTS.abortAll();await crawlWorker.stop();await worker.stop();await dialogue.stop();while(worker.active||worker.checking)await new Promise(r=>setTimeout(r,20));for(let i=0;dialogue.active.size&&i<100;i++)await new Promise(r=>setTimeout(r,20));await store.close();}};
}
export async function main(){
  assert(Number.isInteger(config.port)&&config.port>0&&config.port<65536,'PORT_INVALID','端口无效');
  const secure=!!(config.httpsKey&&config.httpsCert);
  assert(secure||['127.0.0.1','localhost','::1'].includes(config.host),'HTTPS_REQUIRED','对手机/局域网开放前请配置可信 HTTPS');
  assert(new URL(config.origin).protocol===(secure?'https:':'http:'),'ORIGIN_SCHEME','APP_ORIGIN 与 TLS 配置不符');
  let app:Awaited<ReturnType<typeof createApp>>|undefined;
  const listener=(req:http.IncomingMessage,res:http.ServerResponse)=>{if(app)void app.handler(req,res);else{res.statusCode=503;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify({error:{code:'STARTING',message:'本地数据库正在初始化，请稍后刷新'}}));}};
  const server=secure?https.createServer({key:await readFile(config.httpsKey!),cert:await readFile(config.httpsCert!)},listener):http.createServer(listener);
  server.requestTimeout=30000;
  // Claim the port before touching the persistent database, preventing ordinary double-starts.
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,()=>{server.removeListener('error',reject);resolve();});});
  try{app=await createApp({secure,localAutoLogin:process.env.LYDIA_LOCAL_AUTO_LOGIN!=='false'});}catch(e){server.close();throw e;}
  console.log(`Lydia listening at ${config.origin}; paid inference API disabled; inference=claude_cli`);
  let closing=false;const stop=async()=>{if(closing)return;closing=true;server.close();await app!.close();process.exit(0);};process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
  if(process.send){process.on('message',message=>{
    if(message==='LYDIA_SHUTDOWN')void stop();
    if(message==='LYDIA_RELOAD_TLS'&&server instanceof https.Server){
      void Promise.all([readFile(config.httpsKey!),readFile(config.httpsCert!)]).then(([key,cert])=>{
        server.setSecureContext({key,cert});console.log('HTTPS certificate reloaded');
      }).catch(()=>console.error('HTTPS certificate reload failed; previous certificate retained'));
    }
  });process.on('disconnect',()=>void stop());}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(e=>{console.error(e instanceof AppError?e.message:'应用启动失败；请检查本地依赖与端口');process.exitCode=1;});
