// End-to-end check of the implemented 「相似与搭档」 before deploying: the real app code (Vite dev,
// no swaps, no dist rebuild) and the real backend on a throwaway copy of the newest verified
// backup (migration 013 runs on that copy). Only the match worker is started; every other
// background worker stays off. Each comparison is one real Claude call (Sonnet 5.5, medium).
// Run from business/:  node --experimental-strip-types ../pic/project-match-2026-11-11/verify-real.mjs
import path from 'node:path';
import os from 'node:os';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import http from 'node:http';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),business=path.join(repo,'business'),frontend=path.join(business,'frontend');
const PART=Number(process.argv[process.argv.indexOf('--part')+1])||2;
const out=path.join(here,'implemented');await mkdir(out,{recursive:true});
const require=createRequire(path.join(business,'package.json'));
const {chromium}=require('playwright-core');
const {createServer}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
const react=(await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
const {createApp}=await import(pathToFileURL(path.join(business,'backend/server.ts')).href);

const root=path.join(repo,'data/data_storage/backups/database'),found=[];
for(const dir of [root,path.join(root,'daily')]){let names=[];try{names=await readdir(dir);}catch{continue;}
 for(const n of names){const m=path.join(dir,n,'manifest.json');try{const j=JSON.parse(await readFile(m,'utf8'));if(j.verified===true&&j.restore_verified===true&&j.database)found.push({at:(await stat(m)).mtimeMs,database:j.database,name:n});}catch{}}}
found.sort((a,b)=>b.at-a.at);
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-match-verify-'));
await cp(found[0].database,path.join(temp,'pg'),{recursive:true});
const report={date:new Date().toISOString(),backup:found[0].name,claudeCalls:0,checks:[],shots:[],runs:[],errors:[]};
let app;
const server=http.createServer((req,res)=>void app.handler(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),casesDir:path.join(temp,'cases'),startWorker:false,localAutoLogin:true});
const realRun=app.cli.run.bind(app.cli);
app.cli.run=async(...a)=>{const hooks=a[3]||{};if(!hooks.model||!/sonnet/.test(hooks.model.model))throw new Error('only the match comparison may call Claude here');report.claudeCalls++;return realRun(...a);};
await app.matchWorker.start();

const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react()],
 server:{host:'127.0.0.1',port:0,hmr:false,proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const check=(ok,what)=>{report.checks.push((ok?'PASS ':'FAIL ')+what);if(!ok)report.errors.push('check failed: '+what);};
const shot=async(page,name,what)=>{await page.screenshot({path:path.join(out,name)});report.shots.push({file:name,what});};
async function open(viewport,{theme='light',mobile=false}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?3:2,...mobile?{hasTouch:true,isMobile:true}:{}});
 await ctx.addInitScript(t=>{try{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','dismissed');}catch{}},theme);
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push('pageerror: '+e.message));
 await page.goto(base+'/#/knowledge');await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});await page.waitForTimeout(900);
 return {ctx,page};
}
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
}
async function compare(page,title,mode,prefix,reading=false){
 await pick(page,title);await page.locator('.kw-match').click();await page.locator('.pm-target').waitFor();
 if(mode==='news')await page.locator('.pm-modes button',{hasText:'作品 × 新闻'}).click();
 await page.locator('.pm-start .kw-primary').waitFor();
 const t0=Date.now();await page.locator('.pm-start .kw-primary').click();
 if(reading){await page.waitForFunction(()=>/正在读取新闻原文 \d+\/\d+/.test(document.querySelector('.pm-start.is-running')?.textContent||''),null,{timeout:60000});await page.waitForTimeout(1500);await shot(page,`${prefix}-reading.png`,`${title}：先读新闻原文，显示进度`);}
 await page.locator('.pm-charts, .pm-start.is-failed, .wb-empty').first().waitFor({timeout:300000});
 const failed=await page.locator('.pm-start.is-failed').count();
 report.runs.push({title,mode,seconds:Math.round((Date.now()-t0)/1000),failed:!!failed});
 check(!failed,`${title} × ${mode}: comparison finished (${Math.round((Date.now()-t0)/1000)} s)`);
 await page.waitForTimeout(500);await shot(page,`${prefix}-result.png`,`${title} × ${mode==='news'?'新闻':'作品'}：真实结果`);
 return failed;
}

try{
 const desk={width:1440,height:900};
 {const {ctx,page}=await open(desk);
  // Part 1 (npmguard × news, first reading of every original) passed on its own run: implemented/verify-report-1.json.
  if(PART===1&&!await compare(page,'npmguard','news','01-npmguard-news',true)){
   const foot=await page.locator('.pm-foot').textContent();check(/新闻依据原文：\d+ 条读到原文/.test(foot),'footnote says how many news originals were read: '+foot.match(/新闻依据原文：[^。]*/)?.[0]);
   const labels=await page.locator('.pm-evidence .pm-quotes').nth(1).locator('cite').allTextContents();
   check(labels.length>0&&labels.every(l=>/新闻原文|Grok 摘要/.test(l)),'news evidence is labelled original or summary: '+labels.join(' | '));
   await page.evaluate(()=>{const c=document.querySelector('.wb-content'),e=document.querySelector('.pm-detail');c.scrollTop=e.getBoundingClientRect().top-c.getBoundingClientRect().top+c.scrollTop-12;});await page.waitForTimeout(300);
   await shot(page,'02-npmguard-news-evidence.png','依据：新闻那一侧引用的是原文句子，下面写着「新闻原文 · 网站」');
  }
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  if(PART===2){await compare(page,'Tap2ETH','news','03-tap2eth-news',true);
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  await compare(page,'Tap2ETH','project','04-tap2eth-project');}
  await ctx.close();}
 {const {ctx,page}=await open({width:390,height:844},{mobile:true});
  await pick(page,PART===1?'npmguard':'Tap2ETH');await page.locator('.kw-match').click();await page.locator('.pm-modes button',{hasText:'作品 × 新闻'}).click();
  await page.locator('.pm-charts').waitFor({timeout:30000});await page.waitForTimeout(400);
  await shot(page,'05-phone-news.png','手机：结果直接打开，没有再调用 Claude');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'phone has no horizontal overflow');
  await ctx.close();}
 const src=await app.store.rows("SELECT status,count(*)::int AS n FROM news_sources GROUP BY status ORDER BY status");
 report.news_sources=src;check(src.find(r=>r.status==='read')?.n>=30,'news originals read and cached: '+JSON.stringify(src));
 const m=await app.store.rows("SELECT project_id,mode,status,result->'check' AS check,result->'news_read' AS news_read,result->>'took_ms' AS took FROM project_matches");
 report.matches=m;check(m.length===(PART===1?1:2)&&m.every(r=>r.status==='ready'),'stored results are all ready: '+m.length);
 check(report.claudeCalls===(PART===1?1:2),'one Claude call per comparison; reopening is free: '+report.claudeCalls);
}catch(e){report.errors.push(e.stack||String(e));}
finally{
 await browser.close();await vite.close();server.close();await app.close?.().catch(()=>{});
 await writeFile(path.join(out,`verify-report-${PART}.json`),JSON.stringify(report,null,1));
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
 console.log(report.checks.join('\n'));console.log(JSON.stringify(report.runs));if(report.errors.length)console.log('ERRORS\n'+report.errors.join('\n'));
 process.exit(report.errors.length?1:0);
}
