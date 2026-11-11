// Design render for the 成果 page. Real React app via a Vite dev server with the proposed files
// swapped in (no dist rebuild, live service untouched). Data: a copy of the live database
// (data/data_storage/design-copies/outputs-page-2026-11-11, git-ignored) on which run-pipeline.ts ran the REAL research for "Global Sustainability Challenge" (Sonnet).
// Run from business/:  node --experimental-strip-types ../pic/outputs-page-2026-11-11/render.mjs
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),business=path.join(repo,'business'),frontend=path.join(business,'frontend');
const require=createRequire(path.join(business,'package.json'));
const {chromium}=require('playwright-core');
const {createServer}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
const react=(await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
const {createApp}=await import(pathToFileURL(path.join(business,'backend/server.ts')).href);

const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-outputs-'));
await cp(path.join(repo,'data/data_storage/design-copies/outputs-page-2026-11-11/pg'),path.join(temp,'pg'),{recursive:true});
const report={date:'2026-11-11',artifact:'DESIGN_ONLY',applicationModified:false,database:'copy of the live database after a real Sonnet research run (run-pipeline.ts)',shots:[],errors:[]};
let app;
const server=http.createServer((req,res)=>void app.handler(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
app.cli.run=async()=>{throw new Error('No inference in the outputs design render');};
const caseRow=await app.store.one("SELECT id FROM cases WHERE title='Global Sustainability Challenge'");

const proposed=path.join(here,'proposed'),src=path.join(frontend,'src').replace(/\\/g,'/');
const swapped={'/src/App.jsx':'App.jsx','/src/hooks.js':'hooks.js','/src/components/Sidebar.jsx':'Sidebar.jsx'};
const virtual={[src+'/components/OutputsPage.jsx']:'OutputsPage.jsx',[src+'/outputs.css']:'outputs.css'};
const swap={name:'design-swap-outputs',enforce:'pre',
 resolveId(id,importer){if(!importer)return;const f=path.resolve(path.dirname(importer.split('?')[0]),id).replace(/\\/g,'/');if(virtual[f])return f;},
 async load(id){const f=id.split('?')[0].replace(/\\/g,'/');
  if(virtual[f])return readFile(path.join(proposed,virtual[f]),'utf8');
  if(f.endsWith('/frontend/src/main.jsx'))return (await readFile(f,'utf8')).replace("import './knowledge.css';","import './knowledge.css';\nimport './outputs.css';");
  for(const [k,v] of Object.entries(swapped))if(f.endsWith('/frontend'+k))return readFile(path.join(proposed,v),'utf8');}};
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),swap],
 server:{host:'127.0.0.1',port:5312,strictPort:true,hmr:false,fs:{strict:false},proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base='http://127.0.0.1:5312';

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
async function open(route,viewport,{theme='light',mobile=false}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?3:2,...mobile?{hasTouch:true,isMobile:true}:{}});
 await ctx.addInitScript(t=>{try{localStorage.setItem('lydia-theme',t);}catch{}},theme);
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+route);await page.waitForTimeout(2500);return {ctx,page};
}
async function shot(page,name,what){await page.screenshot({path:path.join(here,name)});report.shots.push({file:name,what});}
const nav=(page,label)=>page.locator('.out-nav nav button').filter({has:page.locator('span',{hasText:new RegExp('^'+label+'$')})}).click();
try{
 const desk={width:1440,height:900},q='?case='+caseRow.id;
 {const {ctx,page}=await open('/#/bot/steve'+q,desk);
  await page.locator('.claude-sidebar').waitFor();await shot(page,'01-sidebar-entry.png','左侧栏多了「成果」入口（在「知识库」下面）');
  await page.locator('.claude-sidebar button',{hasText:'成果'}).click();await page.locator('.outputs-page .out-doc').waitFor();await page.waitForTimeout(600);
  await shot(page,'02-research-report.png','成果页：左边是进度和成果列表，中间是研究报告，右边是目录和引用的资料');
  await page.evaluate(()=>{const r=document.querySelector('.out-reader');const h=document.getElementById('sec-findings');r.scrollTop=h.offsetTop-20;});await page.waitForTimeout(300);
  const chip=page.locator('.out-ref').first();if(await chip.count()){await chip.click();await page.waitForTimeout(350);}
  await shot(page,'03-findings-and-sources.png','主要发现：按专家分组，每条标明依据类型和资料编号；点编号，右边对应的资料会高亮');
  await nav(page,'选择缺口');await page.waitForTimeout(400);await shot(page,'04-no-gaps-why.png','这次研究没有缺口：写明原因（只有 1 份自己上传的资料），以及怎么补');
  await nav(page,'商业模式');await page.waitForTimeout(300);await shot(page,'05-model-locked.png','商业模式：还没选缺口时的提示');
  await nav(page,'企业计划书');await page.waitForTimeout(300);await shot(page,'06-plan-locked.png','企业计划书：完成前面三步后才能生成，说明会写成什么样');
  await ctx.close();}
 {const {ctx,page}=await open('/#/outputs'+q,desk,{theme:'dark'});await page.locator('.outputs-page .out-doc').waitFor();await page.waitForTimeout(500);
  await shot(page,'07-dark-report.png','黑夜模式');await ctx.close();}
 {const {ctx,page}=await open('/#/outputs'+q,{width:390,height:844},{mobile:true});await page.locator('.outputs-page .out-doc').waitFor();await page.waitForTimeout(500);
  await shot(page,'08-phone.png','手机：成果列表变成顶部横向标签');await ctx.close();}
}catch(e){report.errors.push(e.stack||String(e));}
finally{
 await browser.close();await vite.close();server.close();await app.close?.().catch(()=>{});
 await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,1));
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
 console.log(report.shots.map(s=>s.file).join('\n'));if(report.errors.length)console.log('ERRORS\n'+report.errors.join('\n'));
 process.exit(report.errors.length?1:0);
}
