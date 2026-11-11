// Design render for the "项目简介 · AI 整理" card in the hackathon inspector.
// Real React app via a Vite dev server (no dist rebuild, live service untouched),
// backed by a throwaway copy of the 2026-11-10 verified daily backup.
// Briefs come from samples.json (real source pages + real Claude CLI, see generate-samples.ts).
// Run from business/:  node --experimental-strip-types ../pic/project-brief-2026-11-10/render.mjs
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

const manifest=path.join(repo,'data/data_storage/backups/database/daily/grok-import-2026-11-10T03-03-55-297Z-ea1580e4/manifest.json');
const source=JSON.parse(await readFile(manifest,'utf8'));
if(source.verified!==true)throw new Error('backup not verified');
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-brief-'));
await cp(source.database,path.join(temp,'pg'),{recursive:true});

let app;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
app.cli.auth=async()=>({loggedIn:true,subscriptionType:'DESIGN_ONLY'});

const proposed=path.join(here,'proposed');
const extraCss=await readFile(path.join(proposed,'project-brief.css'),'utf8');
const swap={name:'design-swap-brief',enforce:'pre',async load(id){
 const f=id.split('?')[0].replace(/\\/g,'/');
 if(f.endsWith('/src/components/KnowledgeMaterialDetails.jsx'))return readFile(path.join(proposed,'KnowledgeMaterialDetails.jsx'),'utf8');
 if(f.endsWith('/src/knowledge.css'))return (await readFile(path.join(frontend,'src/knowledge.css'),'utf8'))+'\n'+extraCss;
}};
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),swap],
 server:{host:'127.0.0.1',port:5293,strictPort:true,hmr:false,proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base='http://127.0.0.1:5293';

const samples=JSON.parse(await readFile(path.join(here,'samples.json'),'utf8')).samples;
// Design states for projects without a sample: shown exactly as the app would show them.
const states={
 yohaku:{status:'running',step:'正在读取 ethglobal.com 项目页…'},
 CosmicNova:{status:'failed',sources:[{url:'https://www.spaceappschallenge.org/2025/awards/global-finalists/',status:'failed',reason:'读取超时'},{url:'https://www.spaceappschallenge.org/2025/find-a-team/cosmicnova1/?tab=project',status:'failed',reason:'读取超时'}]},
};
const norm=t=>String(t).toLowerCase().replace(/[^a-z0-9]/g,'');
const lookup=(map,title)=>Object.entries(map).find(([k])=>norm(title).startsWith(norm(k)))?.[1];
const briefFor=title=>{const s=lookup(samples,title);return s?.status==='ready'?s:lookup(states,title)||{status:'none'};};

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={date:'2026-11-10',artifact:'DESIGN_ONLY',applicationModified:false,database:'copy of '+source.database,shots:[],errors:[]};
async function open(viewport,{theme='light',mobile=false}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?3:2,...mobile?{hasTouch:true,isMobile:true}:{}});
 await ctx.addInitScript(t=>{try{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','dismissed');}catch{}},theme);
 await ctx.route('**/api/crawl/projects/*',async route=>{
  const res=await route.fetch(),body=await res.json();
  route.fulfill({response:res,json:{...body,brief:briefFor(body.title)}});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/#/knowledge');
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});
 await page.waitForTimeout(800);
 const toast=page.locator('.kt-toast button',{hasText:'稍后'});if(await toast.count())await toast.first().click();
 return {ctx,page};
}
async function pick(page,title){
 const onPage=await page.evaluate(t=>[...document.querySelectorAll('.knowledge-object')].some(b=>b.getAttribute('aria-label').toLowerCase().includes(t.toLowerCase())),title);
 if(!onPage){
  await page.fill('input[aria-label="搜索比赛项目"]',title);
  await page.waitForFunction(t=>{const a=[...document.querySelectorAll('.knowledge-object')];return a.length&&a.every(b=>b.getAttribute('aria-label').toLowerCase().includes(t.toLowerCase()));},title,{timeout:20000});
  await page.waitForTimeout(700);
 }
 const found=await page.evaluate(t=>{
  const all=[...document.querySelectorAll('.knowledge-object')],key=t.toLowerCase();
  const el=all.find(b=>b.getAttribute('aria-label')==='查看项目 '+t)||all.find(b=>b.getAttribute('aria-label').toLowerCase().includes(key));
  if(!el)return {ok:false,titles:all.map(b=>b.getAttribute('aria-label').slice(5))};
  el.click();return {ok:true,title:el.getAttribute('aria-label').slice(5)};
 },title);
 if(!found.ok){report.titles=found.titles;throw new Error('title not in library: '+title);}
 await page.waitForFunction(t=>document.querySelector('.kw-detail h2')?.textContent===t&&document.querySelector('.kw-brief'),found.title,{timeout:20000});
 await page.waitForTimeout(400);
}
async function shot(page,name,opts={}){await page.screenshot({path:path.join(here,name+'.png'),animations:'disabled',...opts});report.shots.push(name+'.png');}
const inspector=async(page,name)=>{await page.evaluate(()=>{const i=document.querySelector('.kw-inspector');i.scrollTop=0;});const box=await page.locator('.kw-detail').boundingBox();await shot(page,name,{clip:{x:box.x-18,y:box.y-22,width:box.width+36,height:box.height+30}});};
try{
 // 1. Desktop, as it sits in the workspace.
 {const {ctx,page}=await open({width:1280,height:890});await pick(page,'kalash');await shot(page,'01-desktop-kalash-light');await ctx.close();}
 // 2–6. Inspector close-ups (tall viewport so the whole card is visible).
 for(const [n,title] of [['02','kalash'],['03','Takarabako'],['04','Bramble'],['05','yohaku'],['06','CosmicNova']]){
  const {ctx,page}=await open({width:1280,height:1700});await pick(page,title);
  await inspector(page,`${n}-inspector-${title.toLowerCase()}-${briefFor(title).status}`);await ctx.close();
 }
 // 7. Dark.
 {const {ctx,page}=await open({width:1280,height:1700},{theme:'dark'});await pick(page,'Smart Water Guardian AI');await inspector(page,'07-inspector-dark-smart-water');await ctx.close();}
 // 8. Phone: scroll the stacked inspector into view.
 {const {ctx,page}=await open({width:390,height:844},{mobile:true});await pick(page,'kalash');
  await page.evaluate(()=>document.querySelector('.kw-detail__eyebrow').scrollIntoView({block:'start'}));await page.evaluate(()=>document.querySelector('.knowledge-workspace').scrollBy(0,-125));await page.waitForTimeout(300);
  await shot(page,'08-phone-kalash');await ctx.close();}
}catch(e){report.errors.push(String(e.message||e));
}finally{
 await browser.close();await vite.close();server.close();await app.close?.();
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
}
await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.errors.length)process.exitCode=1;
