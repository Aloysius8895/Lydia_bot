// Design render v2 for "资料库搜索：书飞进搜索区" — plain flight, several 搜索区 at once,
// a delete button beside each. Real React app via a Vite dev server (no dist rebuild,
// live service untouched), on a throwaway copy of the 2026-11-10 verified backup.
// The search is real: proposed/library-search.ts + the logged-in Claude CLI (Haiku),
// answered once per query and cached for the remaining shots.
// Run from business/:  node --experimental-strip-types ../pic/magic-search-2026-11-10/render.mjs
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),business=path.join(repo,'business'),frontend=path.join(business,'frontend');
const require=createRequire(path.join(business,'package.json'));
const {chromium}=require('playwright-core');
const {createServer}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
const react=(await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
const {createApp}=await import(pathToFileURL(path.join(business,'backend/server.ts')).href);
const {searchLibrary}=await import(pathToFileURL(path.join(here,'proposed/library-search.ts')).href);

const Q1='把现金或硬件设备和链上支付连起来的项目',Q2='用传感器或硬件解决环境、健康问题的项目';
const manifest=path.join(repo,'data/data_storage/backups/database/daily/grok-import-2026-11-10T03-03-55-297Z-ea1580e4/manifest.json');
const source=JSON.parse(await readFile(manifest,'utf8'));
if(source.verified!==true)throw new Error('backup not verified');
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-magic-'));
await cp(source.database,path.join(temp,'pg'),{recursive:true});

const brief=path.join(repo,'pic/project-brief-2026-11-10');
const samples=JSON.parse(await readFile(path.join(brief,'samples.json'),'utf8')).samples;
const norm=t=>String(t).toLowerCase().replace(/[^a-z0-9]/g,'');
const sampleFor=title=>{const s=Object.entries(samples).find(([k])=>norm(title).startsWith(norm(k)))?.[1];return s?.status==='ready'?{...s,status:'ready'}:null;};

const report={date:'2026-11-10',version:2,artifact:'DESIGN_ONLY',applicationModified:false,database:'copy of '+source.database,searches:{},shots:[],video:null,errors:[]};
let app;const cache=new Map();
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='POST'&&req.url.startsWith('/api/knowledge/search')){
   const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const key=body.kind+'|'+body.query;
   if(!cache.has(key))cache.set(key,searchLibrary(app.store,app.cli,body));
   const result=await cache.get(key);
   report.searches[body.query]||={mode:result.mode,took_ms:result.took_ms,note:result.note,matches:result.matches.map(m=>({title:m.item.title,source:m.item.source_id,reason:m.reason}))};
   await new Promise(r=>setTimeout(r,2200));   // keep "正在寻找" visible in every shot, like a real call
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));return;
  }
  // Show the six real sample briefs from the brief design (the copy has no briefs yet).
  const b=/^\/api\/knowledge\/projects\/([^/]+)\/brief$/.exec(req.url||'');
  if(b&&req.method==='GET'){const p=await app.store.one('SELECT title FROM crawl_projects WHERE id=$1',[decodeURIComponent(b[1])]);const s=p&&sampleFor(p.title);if(s){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(s));return;}}
 }catch(e){report.errors.push('server: '+e.message);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:e.code||'FAILED',message:e.message}}));return;}
 app.handler(req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});

const proposed=path.join(here,'proposed');
const css=(await readFile(path.join(frontend,'src/knowledge.css'),'utf8'))+'\n'+await readFile(path.join(proposed,'magic-search.css'),'utf8');
const files={'/src/knowledge-warehouse.js':'knowledge-warehouse.js','/src/components/KnowledgeScene.jsx':'KnowledgeScene.jsx','/src/components/KnowledgeWorkspace.jsx':'KnowledgeWorkspace.jsx'};
const swap={name:'design-swap-search',enforce:'pre',async load(id){
 const f=id.split('?')[0].replace(/\\/g,'/');
 if(f.endsWith('/src/knowledge.css'))return css;
 for(const [k,v] of Object.entries(files))if(f.endsWith(k))return readFile(path.join(proposed,v),'utf8');
}};
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),swap],
 server:{host:'127.0.0.1',port:5294,strictPort:true,hmr:false,proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base='http://127.0.0.1:5294';

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
async function open(viewport,{theme='light',mobile=false,video=false}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:video?1:mobile?3:2,...mobile?{hasTouch:true,isMobile:true}:{},...video?{recordVideo:{dir:path.join(temp,'video'),size:viewport}}:{}});
 await ctx.addInitScript(t=>{try{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','dismissed');}catch{}},theme);
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/#/knowledge');
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});
 await page.waitForTimeout(900);
 const toast=page.locator('.kt-toast button',{hasText:'稍后'});if(await toast.count())await toast.first().click();
 return {ctx,page};
}
const input='input[aria-label="在资料库里找资料"]';
async function search(page,q,{slow=1,typeDelay=0}={}){
 await page.evaluate(s=>{window.__ksSlow=s;},slow);
 await page.locator(input).click();
 typeDelay?await page.locator(input).pressSequentially(q,{delay:typeDelay}):await page.fill(input,q);
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>!document.querySelector('.kw-magic-chip.is-casting'),null,{timeout:180000});
}
async function shot(page,name,opts={}){await page.screenshot({path:path.join(here,name+'.png'),...opts});report.shots.push(name+'.png');}
async function openFound(page,q){
 const title=report.searches[q]?.matches?.[0]?.title;
 await page.evaluate(t=>{const all=[...document.querySelectorAll('.knowledge-object')].filter(b=>b.getAttribute('aria-label')==='查看项目 '+t);all[all.length-1]?.click();},title);
 await page.waitForSelector('.kw-why',{timeout:20000});await page.waitForTimeout(700);
}
const del=(page,q)=>page.locator(`.ks-zone-del[aria-label="删除搜索区 ${q}"]`).click();
try{
 // Video at normal speed: two searches side by side, open one book, delete the first band.
 {
  const {ctx,page}=await open({width:1280,height:800},{video:true});
  await page.waitForTimeout(500);await search(page,Q1,{typeDelay:60});await page.waitForTimeout(5200);
  await search(page,Q2,{typeDelay:60});await page.waitForTimeout(5200);
  await page.evaluate(()=>document.querySelector('.ks-overview')?.click());await page.waitForTimeout(1500);
  await openFound(page,Q2);await page.waitForTimeout(2200);
  await del(page,Q1);await page.waitForTimeout(3500);
  const v=page.video();await ctx.close();await rename(await v.path(),path.join(here,'magic-search-demo.webm'));report.video='magic-search-demo.webm';
 }
 // Stills.
 {const {ctx,page}=await open({width:1280,height:890});
  await page.locator(input).click();await page.fill(input,Q1);await page.waitForTimeout(300);await shot(page,'01-typing-query');
  await page.keyboard.press('Enter');await page.waitForTimeout(1200);await shot(page,'02-searching-band-appears');
  await page.waitForFunction(()=>!document.querySelector('.kw-magic-chip.is-casting'),null,{timeout:180000});
  await page.evaluate(()=>{window.__ksSlow=.3;});
  await ctx.close();}
 {const {ctx,page}=await open({width:1280,height:890});
  await search(page,Q1,{slow:.25});await page.waitForTimeout(3400);await shot(page,'03-books-flying');
  await page.evaluate(()=>{window.__ksSlow=1;});await page.waitForTimeout(6500);
  await search(page,Q2);await page.waitForTimeout(6000);
  await page.evaluate(()=>document.querySelector('.ks-overview')?.click());await page.waitForTimeout(1200);await shot(page,'04-two-search-zones-with-delete');
  await openFound(page,Q2);await shot(page,'05-open-found-book');
  await del(page,Q1);await page.waitForTimeout(4200);await shot(page,'06-after-deleting-first-zone');
  await ctx.close();}
 {const {ctx,page}=await open({width:1280,height:890},{theme:'dark'});
  await search(page,Q1);await page.waitForTimeout(5500);await search(page,Q2);await page.waitForTimeout(5500);
  await page.evaluate(()=>document.querySelector('.ks-overview')?.click());await page.waitForTimeout(1200);await shot(page,'07-dark-two-zones');await ctx.close();}
 {const {ctx,page}=await open({width:390,height:844},{mobile:true});
  await search(page,Q1);await page.waitForTimeout(6000);await shot(page,'08-phone-landed');await ctx.close();}
}catch(e){report.errors.push(String(e.stack||e.message||e));
}finally{
 await browser.close();await vite.close();server.close();await app.close?.();
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
}
await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({shots:report.shots,video:report.video,errors:report.errors,searches:Object.fromEntries(Object.entries(report.searches).map(([k,v])=>[k,{n:v.matches.length,ms:v.took_ms,mode:v.mode}]))},null,2));
if(report.errors.length)process.exitCode=1;
