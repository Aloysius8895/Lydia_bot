// Design render: 「相似与搭档」 entry moved beside the project name. Real React app (Vite dev, the two
// proposed files swapped in, no dist rebuild) on a throwaway copy of the newest verified backup.
// No Claude call: opening the workbench only reads the stored match state.
// Run from business/:  node --experimental-strip-types ../pic/match-entry-2026-11-11/render.mjs
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),business=path.join(repo,'business'),frontend=path.join(business,'frontend');
const require=createRequire(path.join(business,'package.json'));
const {chromium}=require('playwright-core');
const {createServer}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
const react=(await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
const {createApp}=await import(pathToFileURL(path.join(business,'backend/server.ts')).href);

const root=path.join(repo,'data/data_storage/backups/database'),found=[];
for(const dir of [root,path.join(root,'daily')]){let names=[];try{names=await readdir(dir);}catch{continue;}
 for(const n of names){const m=path.join(dir,n,'manifest.json');try{const j=JSON.parse(await readFile(m,'utf8'));if(j.verified===true&&j.restore_verified===true&&j.database)found.push({at:(await stat(m)).mtimeMs,database:j.database,name:n});}catch{}}}
found.sort((a,b)=>b.at-a.at);
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-entry-'));
await cp(found[0].database,path.join(temp,'pg'),{recursive:true});
const report={topic:'match-entry',date:'2026-11-11',artifact:'DESIGN_ONLY',applicationModified:false,database:'copy of '+found[0].name,claudeCalls:0,checks:[],shots:[],errors:[]};
let app;
const server=http.createServer((req,res)=>void app.handler(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),casesDir:path.join(temp,'cases'),startWorker:false,localAutoLogin:true});
app.cli.run=async()=>{throw new Error('No inference in the design render');};

const proposed=path.join(here,'proposed');
const swapped={'/src/components/KnowledgeMaterialDetails.jsx':'KnowledgeMaterialDetails.jsx','/src/match.css':'match.css'};
const src=path.join(frontend,'src').replace(/\\/g,'/');
const virtual={[src+'/components/DetectiveIcon.jsx']:'DetectiveIcon.jsx'};   // new file the proposed details import
const swap={name:'design-swap-match-entry',enforce:'pre',
 resolveId(id,importer){if(!importer)return;const f=path.resolve(path.dirname(importer.split('?')[0]),id).replace(/\\/g,'/');if(virtual[f])return f;},
 async load(id){const f=id.split('?')[0].replace(/\\/g,'/');if(virtual[f])return readFile(path.join(proposed,virtual[f]),'utf8');for(const [k,v] of Object.entries(swapped))if(f.endsWith('/frontend'+k))return readFile(path.join(proposed,v),'utf8');}};
const variantB=await readFile(path.join(proposed,'variant-b.css'),'utf8');
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),swap],
 server:{host:'127.0.0.1',port:0,hmr:false,proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const check=(ok,what)=>{report.checks.push((ok?'PASS ':'FAIL ')+what);if(!ok)report.errors.push('check failed: '+what);};
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
 await page.waitForTimeout(300);
}
// Inspector top only, so the change is easy to see.
async function shot(page,name,what,{full=false}={}){
 const box=await page.locator('.kw-inspector').boundingBox();
 await page.screenshot({path:path.join(here,name),...(full?{}:{clip:{x:box.x,y:box.y,width:box.width,height:Math.min(box.height,430)}})});
 report.shots.push({file:name,what});
}
async function measure(page,label){
 const r=await page.evaluate(()=>{
  const h=document.querySelector('.kw-detail h2').getBoundingClientRect(),b=document.querySelector('.kw-match').getBoundingClientRect(),ins=document.querySelector('.kw-inspector').getBoundingClientRect();
  const range=document.createRange();range.selectNodeContents(document.querySelector('.kw-detail h2'));const first=range.getClientRects()[0];
  return {overlap:!(b.left>=h.right-1||b.right<=h.left+1||b.top>=h.bottom-1||b.bottom<=h.top+1),inside:b.right<=ins.right+1&&b.left>=ins.left,
   visible:b.top>=0&&b.bottom<=innerHeight,lineMid:first.top+first.height/2,btnMid:b.top+b.height/2,btn:{w:Math.round(b.width),h:Math.round(b.height)},titleW:Math.round(h.width),lines:Math.round(h.height/first.height)};
 });
 check(!r.overlap&&r.inside,`${label}: pill sits beside the title without overlapping it, inside the panel (pill ${r.btn.w}×${r.btn.h}px, title ${r.titleW}px wide, ${r.lines} line(s))`);
 check(r.visible,`${label}: pill is visible without scrolling`);
 check(Math.abs(r.lineMid-r.btnMid)<=8,`${label}: pill lines up with the first line of the title (off by ${Math.round(Math.abs(r.lineMid-r.btnMid))}px)`);
}

try{
 const desk={width:1440,height:900};
 const B=async page=>{await page.addStyleTag({content:variantB});await page.waitForTimeout(150);};
 const oneLine=page=>page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.kw-detail h2'));return r.getClientRects().length===1;});
 {const {ctx,page}=await open(desk);
  await pick(page,'explorador.pt');
  // The logo on its own, large and small, on both themes (drawn from the button's own SVG).
  const svg=await page.evaluate(()=>document.querySelector('.kw-match svg').outerHTML.replace(/width="d+" height="d+"/,''));
  const logo=await ctx.newPage();
  await logo.setContent('<body style="margin:0;display:flex;font-family:sans-serif">'+[['#fffefa','#22211f','白天'],['#101010','#ecebe8','黑夜']].map(([bg,fg,t])=>'<div style="flex:1;background:'+bg+';color:'+fg+';padding:28px;display:flex;align-items:end;gap:28px"><span style="width:160px;height:160px;display:block">'+svg.replace('<svg','<svg width="160" height="160"')+'</span><span style="width:40px;height:40px;display:block">'+svg.replace('<svg','<svg width="40" height="40"')+'</span><span style="width:24px;height:24px;display:block">'+svg.replace('<svg','<svg width="24" height="24"')+'</span><span style="width:16px;height:16px;display:block">'+svg.replace('<svg','<svg width="16" height="16"')+'</span><small style="margin-left:auto;opacity:.6">'+t+'</small></div>').join('')+'</body>');
  await logo.setViewportSize({width:900,height:216});await logo.screenshot({path:path.join(here,'00-logo.png')});report.shots.push({file:'00-logo.png',what:'侦探 logo 本身：160 / 40 / 24 / 16 像素，白天和黑夜'});await logo.close();
  await measure(page,'A 1440 light');await shot(page,'01-a-logo-light.png','A：只有侦探 logo 的圆按钮（白天）');
  check(await page.locator('.kw-match').getAttribute('aria-label')==='相似与搭档'&&(await page.locator('.kw-match').getAttribute('title')).includes('撞车'),'A: the logo-only button has a name and a hover explanation');
  await B(page);await measure(page,'B 1440 light');await shot(page,'07-b-logo-words-light.png','B：侦探 logo + 文字（白天）');
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});
  await pick(page,'ECI Centauri / Exoplanet Hunter AI');await measure(page,'A 1440 long title');await shot(page,'03-a-long-title.png','A：长名字');
  await page.locator('.kw-match').click();await page.locator('.pm-target').waitFor();
  check((await page.locator('.pm-target strong').textContent())==='ECI Centauri / Exoplanet Hunter AI','clicking the logo opens 相似与搭档 for this project');
  await page.screenshot({path:path.join(here,'06-click-opens.png')});report.shots.push({file:'06-click-opens.png',what:'点 logo：和原来一样打开工作台的「相似与搭档」'});
  await ctx.close();}
 {const {ctx,page}=await open(desk,{theme:'dark'});
  await pick(page,'explorador.pt');await measure(page,'A 1440 dark');await shot(page,'02-a-logo-dark.png','A：黑夜（和你截图同一个项目）');
  await B(page);await measure(page,'B 1440 dark');await shot(page,'08-b-logo-words-dark.png','B：黑夜');await ctx.close();}
 {const {ctx,page}=await open({width:1180,height:820});
  await pick(page,'explorador.pt');await measure(page,'A 1180 narrow panel');check(await oneLine(page),'A 1180: the name stays on one line');await shot(page,'04-a-narrow-panel.png','A：右栏最窄 255px');
  await B(page);await measure(page,'B 1180 narrow panel');check(await oneLine(page),'B 1180: the words drop and the name stays on one line');await shot(page,'09-b-narrow-panel.png','B：右栏窄时自动只剩 logo');await ctx.close();}
 {const {ctx,page}=await open({width:390,height:844},{mobile:true});
  await pick(page,'explorador.pt');await page.locator('.kw-detail h2').scrollIntoViewIfNeeded();await page.evaluate(()=>scrollBy(0,-80));await page.waitForTimeout(200);
  await measure(page,'A phone');await page.screenshot({path:path.join(here,'05-a-phone.png')});report.shots.push({file:'05-a-phone.png',what:'A：手机'});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'phone has no horizontal overflow');
  await ctx.close();}
}catch(e){report.errors.push(e.stack||String(e));}
finally{
 await browser.close();await vite.close();server.close();await app.close?.().catch(()=>{});
 await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,1));
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
 console.log(report.checks.join('\n'));if(report.errors.length)console.log('ERRORS\n'+report.errors.join('\n'));
 process.exit(report.errors.length?1:0);
}
