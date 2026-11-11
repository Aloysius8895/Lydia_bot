// Design render for 「相似与搭档」: the real React app via a Vite dev server with the proposed files
// swapped in (no dist rebuild, live service untouched), on a throwaway copy of the newest verified
// backup. The match endpoint is simulated here and replays the REAL results in samples.json
// (made by generate-samples.ts with the logged-in Claude CLI). No Claude call happens here.
// Run from business/:
//   node --experimental-strip-types ../pic/project-match-2026-11-11/render.mjs           screenshots + render-report.json
//   node --experimental-strip-types ../pic/project-match-2026-11-11/render.mjs --serve   try it yourself on http://127.0.0.1:5321/#/knowledge
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),business=path.join(repo,'business'),frontend=path.join(business,'frontend');
const serve=process.argv.includes('--serve'),SERVE_PORT=5321;
const require=createRequire(path.join(business,'package.json'));
const {chromium}=require('playwright-core');
const {createServer}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
const react=(await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
const {createApp}=await import(pathToFileURL(path.join(business,'backend/server.ts')).href);
const samples=JSON.parse(await readFile(path.join(here,'samples.json'),'utf8')).samples;

async function latestVerifiedBackup(){
 const root=path.join(repo,'data/data_storage/backups/database'),found=[];
 for(const dir of [root,path.join(root,'daily')]){let names=[];try{names=await readdir(dir);}catch{continue;}
  for(const n of names){const m=path.join(dir,n,'manifest.json');
   try{const j=JSON.parse(await readFile(m,'utf8'));if(j.verified===true&&j.restore_verified===true&&j.database)found.push({at:(await stat(m)).mtimeMs,database:j.database});}catch{}}}
 found.sort((a,b)=>b.at-a.at);if(!found.length)throw new Error('No verified backup');return found[0];
}
const backup=await latestVerifiedBackup();
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-match-render-'));
await cp(backup.database,path.join(temp,'pg'),{recursive:true});
const report={topic:'project-match',date:'2026-11-11',artifact:'DESIGN_ONLY',applicationModified:false,database:'copy of '+path.relative(repo,backup.database),claudeCalls:0,checks:[],shots:[],errors:[]};

// Simulated match endpoint. Results already "stored" for every sample; POST replays a run.
const CANDIDATES={project:106,news:42};
let runMs=0;const runs=new Map(),stored=new Set(Object.keys(samples));
let app;
async function matchState(id,mode){
 const p=await app.store.one('SELECT title FROM crawl_projects WHERE id=$1',[id]),key=p?.title+' · '+mode,s=samples[key],r=runs.get(key);
 if(r!==undefined){
  if(Date.now()-r<runMs)return {status:'running',started_at:new Date(r).toISOString(),candidates:CANDIDATES[mode]};
  if(!s?.matches)return {status:'failed',error:{message:'设计稿只为 5 个样本生成了真实结果，这个组合没有样本'}};
  stored.add(key);
 }
 if(stored.has(key)&&s?.matches)return {status:'ready',result:s};
 return {status:'none',candidates:CANDIDATES[mode]};
}
const server=http.createServer(async(req,res)=>{
 const m=/^\/api\/knowledge\/projects\/([^/]+)\/match\?mode=(project|news)$/.exec(req.url||'');
 if(m){
  const id=decodeURIComponent(m[1]);
  if(req.method==='POST'){const p=await app.store.one('SELECT title FROM crawl_projects WHERE id=$1',[id]);const key=p?.title+' · '+m[2];stored.delete(key);runs.set(key,Date.now());}
  res.writeHead(req.method==='POST'?202:200,{'content-type':'application/json'});res.end(JSON.stringify(await matchState(id,m[2])));return;
 }
 app.handler(req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),casesDir:path.join(temp,'cases'),startWorker:false,localAutoLogin:true});
app.cli.run=async()=>{throw new Error('No inference in the design render');};

const proposed=path.join(here,'proposed'),src=path.join(frontend,'src').replace(/\\/g,'/');
const swapped={'/src/main.jsx':'main.jsx','/src/components/KnowledgeWorkspace.jsx':'KnowledgeWorkspace.jsx','/src/components/KnowledgeMaterialDetails.jsx':'KnowledgeMaterialDetails.jsx','/src/components/WorkbenchModal.jsx':'WorkbenchModal.jsx'};
const virtual={[src+'/components/ProjectMatch.jsx']:'ProjectMatch.jsx',[src+'/match.css']:'match.css'};
const swap={name:'design-swap-project-match',enforce:'pre',
 resolveId(id,importer){if(!importer)return;const f=path.resolve(path.dirname(importer.split('?')[0]),id).replace(/\\/g,'/');if(virtual[f])return f;},
 async load(id){const f=id.split('?')[0].replace(/\\/g,'/');if(virtual[f])return readFile(path.join(proposed,virtual[f]),'utf8');for(const [k,v] of Object.entries(swapped))if(f.endsWith('/frontend'+k))return readFile(path.join(proposed,v),'utf8');}};
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),swap],
 server:{host:'127.0.0.1',port:serve?SERVE_PORT:0,strictPort:serve,hmr:false,proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
if(serve){
 runMs=8000;
 console.log(`\n设计预览已启动（备份副本，不调用 Claude，不写正式库）：\n  ${base}/#/knowledge\n有样本的项目：${[...new Set(Object.keys(samples).map(k=>k.split(' · ')[0]))].join('、')}\n按 Ctrl+C 结束。\n`);
 process.on('SIGINT',async()=>{await vite.close();server.close();await app.close?.().catch(()=>{});await rm(temp,{recursive:true,force:true}).catch(()=>{});process.exit(0);});
 await new Promise(()=>{});
}

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const check=(ok,what)=>{report.checks.push((ok?'PASS ':'FAIL ')+what);if(!ok)report.errors.push('check failed: '+what);};
async function open(viewport,{theme='light',mobile=false}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?3:2,...mobile?{hasTouch:true,isMobile:true}:{}});
 await ctx.addInitScript(t=>{try{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','dismissed');}catch{}},theme);
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push('pageerror: '+e.message));
 await page.goto(base+'/#/knowledge');
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});
 await page.waitForTimeout(900);
 return {ctx,page};
}
// No title filter in the library UI: use the list view and page through it.
async function pick(page,title){
 await page.locator('.kw-seg button',{hasText:'列表'}).click();
 const prev=page.locator('.kw-pagination button',{hasText:'上一页'});
 while(await prev.count()&&await prev.isEnabled()){await prev.click();await page.waitForTimeout(500);}
 for(let i=0;i<6;i++){
  const b=page.locator('.kw-list-title',{has:page.locator('strong',{hasText:new RegExp('^'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
  if(await b.count()){await b.first().click();break;}
  await page.locator('.kw-pagination button',{hasText:'下一页'}).click();await page.waitForTimeout(700);
 }
 await page.waitForFunction(t=>document.querySelector('.kw-detail h2')?.textContent===t&&document.querySelector('.kw-match'),title,{timeout:20000});
 await page.waitForTimeout(300);
}
async function openMatch(page,title,mode='project'){
 await pick(page,title);await page.locator('.kw-match').click();
 await page.locator('.pm-target').waitFor();
 if(mode==='news')await page.locator('.pm-modes button',{hasText:'作品 × 新闻'}).click();
 await page.waitForTimeout(500);
}
const shot=async(page,name,what,opts={})=>{await page.screenshot({path:path.join(here,name),animations:'disabled',...opts});report.shots.push({file:name,what});};
const scrollTo=(page,sel,offset=12)=>page.evaluate(([s,o])=>{const c=document.querySelector('.wb-content'),e=document.querySelector(s);if(c&&e)c.scrollTop=e.getBoundingClientRect().top-c.getBoundingClientRect().top+c.scrollTop-o;},[sel,offset]);
async function chartChecks(page,label){
 const r=await page.evaluate(()=>{
  const dots=[...document.querySelectorAll('.pm-map__dot')].map(g=>{const c=g.querySelector('.pm-map__mark').getBoundingClientRect();return {x:c.x+c.width/2,y:c.y+c.height/2,g};});
  let min=1e9;for(let i=0;i<dots.length;i++)for(let j=i+1;j<dots.length;j++)min=Math.min(min,Math.hypot(dots[i].x-dots[j].x,dots[i].y-dots[j].y));
  const reachable=dots.every(d=>d.g.contains(document.elementFromPoint(d.x,d.y)));
  const c=document.querySelector('.wb-content');
  const pts=document.querySelector('.pm-radar__pair')?.getAttribute('points').trim().split(/\s+/).length;
  const [v,hz]=[...document.querySelectorAll('.pm-map__mid')].map(l=>l.getBoundingClientRect());
  const inZone=dots.every(d=>{const c=d.g.dataset.corner;return (c.endsWith('r')?d.x>v.x+8:d.x<v.x-8)&&(c.startsWith('t')?d.y<hz.y-8:d.y>hz.y+8);});
  return {inZone,n:dots.length,list:document.querySelectorAll('.pm-list li').length,min:dots.length>1?min:99,reachable,overflow:c?c.scrollWidth>c.clientWidth+1:false,pts,axes:document.querySelectorAll('.pm-radar__label').length,doc:document.documentElement.scrollWidth>innerWidth+1};
 });
 check(r.n===r.list&&r.n>0,`${label}: map shows one dot per listed match (${r.n})`);
 check(r.min>=20,`${label}: dots do not overlap (closest centres ${Math.round(r.min)}px apart)`);
 check(r.reachable,`${label}: every dot is clickable at its centre (nothing covers it)`);
 check(r.inZone,`${label}: every dot is drawn inside the zone its scores put it in (clear of the midlines)`);
 check(r.pts===r.axes,`${label}: radar has one vertex per axis (${r.axes})`);
 check(!r.overflow&&!r.doc,`${label}: no horizontal overflow`);
}

try{
 const desk={width:1440,height:900},phone={width:390,height:844};
 {const {ctx,page}=await open(desk);
  await pick(page,'Tap2ETH');
  await shot(page,'01-detail-button.png','项目详情底部多了「相似与搭档」，在「加入分析」旁边');
  await page.locator('.kw-match').click();await page.locator('.pm-charts').waitFor();await page.waitForTimeout(400);
  await shot(page,'02-tap2eth-duplicate.png','Tap2ETH × 作品：一句话总结、雷达（默认第 1 名 Carte Bleue，撞车）和搭档地图');
  await chartChecks(page,'Tap2ETH project');
  const d2=page.locator('.pm-map__dot').nth(1);await d2.click();await d2.hover();await page.waitForTimeout(300);
  await shot(page,'03-tap2eth-merge.png','点地图上的 2 号：雷达换成 LeekDIYHardwareWallet（★ 合体），鼠标停在圆点上显示名字');
  check((await page.locator('.pm-card figcaption strong').first().textContent()).includes('LeekDIYHardwareWallet'),'clicking dot 2 switches the radar to that pair');
  await page.mouse.move(5,5);await scrollTo(page,'.pm-detail');await page.waitForTimeout(250);
  await shot(page,'04-evidence.png','往下：理由、"放在一起可能是"（待验证）、两边的原文，以及全部名单');
  await scrollTo(page,'.pm-list',60);await page.waitForTimeout(200);
  await shot(page,'05-list-and-footnote.png','名单和底部说明：程序核对结果、模型、用时，以及"重新比较"');
  await page.locator('.pm-modes button',{hasText:'作品 × 新闻'}).click();await page.locator('.pm-start').waitFor();await page.waitForTimeout(200);
  await shot(page,'06-start-news.png','还没比较过的组合：说明要用 1 次额度，新闻只有 Grok 摘要');
  runMs=6000;await page.locator('.pm-start .kw-primary').click();await page.locator('.pm-start.is-running').waitFor();await page.waitForTimeout(2200);
  await shot(page,'07-running.png','比较中：可以关掉窗口，后台继续');
  await page.locator('.pm-start.is-failed').waitFor({timeout:15000});
  check(true,'a run without a sample ends in the failed state with a retry button');
  runMs=0;await page.keyboard.press('Escape');await page.waitForTimeout(300);
  await openMatch(page,'npmguard','news');await page.locator('.pm-charts').waitFor();await page.waitForTimeout(300);
  await shot(page,'08-npmguard-news.png','npmguard × 新闻：Fireworks AI 入侵等 3 条落在 ★ 时机区（分数相同的圆点自动错开）');
  await chartChecks(page,'npmguard news');
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  await openMatch(page,'watermark','news');await page.locator('.pm-charts').waitFor();await page.waitForTimeout(300);
  await shot(page,'09-watermark-weak.png','watermark × 新闻：没有真正相关的新闻，Claude 如实说"相关度偏低"，3 个点都在左下');
  await ctx.close();}
 {const {ctx,page}=await open(desk,{theme:'dark'});
  await openMatch(page,'router402');await page.locator('.pm-charts').waitFor();await page.waitForTimeout(300);
  await shot(page,'10-router402-dark.png','黑夜：router402 × 作品（x402 同类作品多，集中在撞车和搬运区）');
  await chartChecks(page,'router402 dark');
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  await openMatch(page,'Smart Water Guardian AI');await page.locator('.pm-charts').waitFor();await page.waitForTimeout(300);
  await shot(page,'11-smartwater-dark.png','黑夜：Smart Water Guardian AI（同样用 Arduino UNO Q 的作品都在左下"搬运"区）');
  await ctx.close();}
 {const {ctx,page}=await open(phone,{mobile:true});
  await pick(page,'Tap2ETH');await page.locator('.kw-match').scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  await shot(page,'12-phone-button.png','手机：详情里的按钮');
  await page.locator('.kw-match').click();await page.locator('.pm-charts').waitFor();await page.waitForTimeout(400);
  await shot(page,'13-phone-top.png','手机：工作台铺满，先看总结和雷达');
  await scrollTo(page,'.pm-card:nth-child(2)');await page.waitForTimeout(200);
  await shot(page,'14-phone-map.png','手机：搭档地图占满宽度，圆点可以点');
  await chartChecks(page,'phone');
  await scrollTo(page,'.pm-detail');await page.waitForTimeout(200);
  await shot(page,'15-phone-detail.png','手机：理由和原文上下排列');
  await ctx.close();}
}catch(e){report.errors.push(e.stack||String(e));}
finally{
 await browser.close();await vite.close();server.close();await app.close?.().catch(()=>{});
 await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,1));
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
 console.log(report.checks.join('\n'));console.log(report.shots.map(s=>s.file).join(' '));if(report.errors.length)console.log('ERRORS\n'+report.errors.join('\n'));
 process.exit(report.errors.length?1:0);
}
