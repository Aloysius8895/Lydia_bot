// Design render for "big platform zone gets its own band".
// Real React app via Vite dev servers (no dist rebuild, live service untouched),
// backed by a throwaway copy of the 2026-11-09 verified daily backup.
// Run from business/:  node --experimental-strip-types ../pic/knowledge-big-zone-2026-11-10/render.mjs
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

const manifest=path.join(repo,'data/data_storage/backups/database/daily/grok-import-2026-11-09T16-55-40-624Z-b3ea1b6d/manifest.json');
const source=JSON.parse(await readFile(manifest,'utf8'));
if(source.verified!==true)throw new Error('backup not verified');
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-bigzone-'));
await cp(source.database,path.join(temp,'pg'),{recursive:true});

let app;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
app.cli.auth=async()=>({loggedIn:true,subscriptionType:'DESIGN_ONLY'});

const proposed=path.join(here,'proposed/knowledge-warehouse.js');
const swap={name:'design-swap-warehouse',enforce:'pre',async load(id){if(id.split('?')[0].replace(/\\/g,'/').endsWith('/src/knowledge-warehouse.js'))return readFile(proposed,'utf8');}};
async function vite(port,useProposed){
 const s=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),...useProposed?[swap]:[]],
  server:{host:'127.0.0.1',port,strictPort:true,hmr:false,proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
 await s.listen();return s;
}
const servers=[await vite(5291,false),await vite(5292,true)];
const base={current:'http://127.0.0.1:5291',proposed:'http://127.0.0.1:5292'};

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={date:'2026-11-10',artifact:'DESIGN_ONLY',applicationModified:false,database:'copy of '+source.database,shots:[],pages:{},errors:[]};
async function open(ctx,which,{page2=false,theme='light'}={}){
 await ctx.addInitScript(t=>{try{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','dismissed');}catch{}},theme);
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(which+': '+e.message));
 await page.goto(base[which]+'/#/knowledge');
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});
 if(page2){const first=await page.locator('.knowledge-object').first().getAttribute('aria-label');await page.getByRole('button',{name:'下一页'}).click();await page.waitForFunction(f=>document.querySelector('.knowledge-object')?.getAttribute('aria-label')!==f,first);}
 await page.waitForTimeout(900);
 const toast=page.locator('.kt-toast button',{hasText:'稍后'});if(await toast.count())await toast.first().click();
 return page;
}
const zoneStats=page=>page.evaluate(()=>[...document.querySelectorAll('.ks-zone-g')].map(g=>({zone:g.dataset.zone,count:g.querySelector('.ks-zcount')?.textContent})));
async function shot(page,name){await page.waitForTimeout(500);await page.screenshot({path:path.join(here,name+'.png'),animations:'disabled'});report.shots.push(name+'.png');}
async function focusZone(page,label){
 const r=await page.locator('.ks-zname').evaluateAll((els,l)=>{const e=els.find(e=>e.textContent===l);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};},label);
 if(r){await page.mouse.click(r.x,r.y);await page.waitForTimeout(900);}
}
try{
 for(const [which,n] of [['current','01'],['proposed','02']]){
  const ctx=await browser.newContext({viewport:{width:1280,height:890},deviceScaleFactor:2});
  const page=await open(ctx,which);report.pages[which+'-page1']=await zoneStats(page);
  await shot(page,`${n}-${which}-page1-light`);
  if(which==='proposed'){await focusZone(page,'ETHGLOBAL');await shot(page,'03-proposed-ethglobal-focus-light');}
  await ctx.close();
  const ctx2=await browser.newContext({viewport:{width:1280,height:890},deviceScaleFactor:2});
  const p2=await open(ctx2,which,{page2:true});report.pages[which+'-page2']=await zoneStats(p2);
  await shot(p2,`${which==='current'?'05':'06'}-${which}-page2-light`);await ctx2.close();
 }
 const dark=await browser.newContext({viewport:{width:1280,height:890},deviceScaleFactor:2});
 await shot(await open(dark,'proposed',{theme:'dark'}),'07-proposed-page1-dark');await dark.close();
 const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
 await shot(await open(phone,'proposed'),'08-phone-proposed-light');await phone.close();
}finally{
 await browser.close();for(const s of servers)await s.close();server.close();await app.close?.();
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
}
await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.errors.length)process.exitCode=1;
