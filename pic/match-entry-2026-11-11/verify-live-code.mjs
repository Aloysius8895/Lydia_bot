// After applying the approved design (A): screenshots of the REAL app code (Vite dev, no swaps,
// no dist rebuild) on a throwaway copy of the newest verified backup. No Claude call.
// Run from business/:  node --experimental-strip-types ../pic/match-entry-2026-11-11/verify-live-code.mjs
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),business=path.join(repo,'business'),frontend=path.join(business,'frontend');
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
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-entry-live-'));
await cp(found[0].database,path.join(temp,'pg'),{recursive:true});
const report={date:new Date().toISOString(),backup:found[0].name,claudeCalls:0,checks:[],shots:[],errors:[]};
let app;const server=http.createServer((req,res)=>void app.handler(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),casesDir:path.join(temp,'cases'),startWorker:false,localAutoLogin:true});
app.cli.run=async()=>{throw new Error('No inference here');};
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react()],
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
 for(let i=0;i<6;i++){
  const b=page.locator('.kw-list-title',{has:page.locator('strong',{hasText:new RegExp('^'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
  if(await b.count()){await b.first().click();break;}
  await page.locator('.kw-pagination button',{hasText:'下一页'}).click();await page.waitForTimeout(700);
 }
 await page.waitForFunction(t=>document.querySelector('.kw-detail h2')?.textContent===t&&document.querySelector('.kw-match .kw-detective'),title,{timeout:20000});await page.waitForTimeout(300);
}
const inspector=async(page,name,what)=>{const b=await page.locator('.kw-inspector').boundingBox();await page.screenshot({path:path.join(out,name),clip:{x:b.x,y:b.y,width:b.width,height:Math.min(b.height,430)}});report.shots.push({file:name,what});};
try{
 for(const theme of ['light','dark']){
  const {ctx,page}=await open({width:1440,height:900},{theme});
  await pick(page,'explorador.pt');await inspector(page,`0${theme==='light'?1:2}-detail-${theme}.png`,`项目名字右边的侦探 logo（${theme==='light'?'白天':'黑夜'}）`);
  check(await page.locator('.kw-detail__titlebar .kw-match').count()===1,`${theme}: the logo button sits in the title bar`);
  check(await page.locator('.kw-detail button.kw-match span').evaluate(e=>getComputedStyle(e).display)==='none','logo only, no words (variant A)');
  await page.locator('.kw-match').click();await page.locator('.pm-target').waitFor();
  check(await page.locator('.wb-nav button[aria-current=page] .kw-detective').count()===1,`${theme}: the workbench section shows the same logo`);
  await page.screenshot({path:path.join(out,`0${theme==='light'?3:4}-workbench-${theme}.png`)});report.shots.push({file:`0${theme==='light'?3:4}-workbench-${theme}.png`,what:'工作台左侧「相似与搭档」也换成侦探 logo'});
  await ctx.close();
 }
 {const {ctx,page}=await open({width:390,height:844},{mobile:true});
  await pick(page,'explorador.pt');await page.locator('.kw-detail h2').scrollIntoViewIfNeeded();await page.evaluate(()=>scrollBy(0,-80));await page.waitForTimeout(200);
  await page.screenshot({path:path.join(out,'05-phone.png')});report.shots.push({file:'05-phone.png',what:'手机'});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'phone has no horizontal overflow');await ctx.close();}
}catch(e){report.errors.push(e.stack||String(e));}
finally{
 await browser.close();await vite.close();server.close();await app.close?.().catch(()=>{});
 await writeFile(path.join(out,'verify-report.json'),JSON.stringify(report,null,1));
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
 console.log(report.checks.join('\n'));if(report.errors.length)console.log('ERRORS\n'+report.errors.join('\n'));
 process.exit(report.errors.length?1:0);
}
