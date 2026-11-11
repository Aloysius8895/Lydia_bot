// Lydia design render template.
// Copy to pic/<topic>-<date>/render.mjs, put proposed files in ./proposed/, edit the CONFIG block and
// the SHOTS section, then run from business/:
//   node --experimental-strip-types ../pic/<topic>/render.mjs            screenshots (+ video) + render-report.json
//   node --experimental-strip-types ../pic/<topic>/render.mjs --serve    let the user click around (fixed port)
// Options: --out <dir> (default: this file's folder), --allow-claude (real CLI calls; tell the user the count).
//
// What it guarantees: the real React app (Vite dev server, proposed files swapped in, no dist rebuild),
// the real backend on a throwaway copy of the newest *verified* backup, background workers off,
// and no inference unless --allow-claude. The live service and the live database are never touched.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,readFile,readdir,rename,rm,writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

// ---------------- CONFIG ----------------
const TOPIC='example-topic';                 // shown in the report
const SERVE_PORT=5320;                       // fixed port for --serve (5309–5312 used before)
// Existing source files to replace, keyed by path under frontend/: value is a file in ./proposed/
const SWAPPED={
 // '/src/App.jsx':'App.jsx',
 // '/src/components/KnowledgeWorkspace.jsx':'KnowledgeWorkspace.jsx',
};
// New files the proposed code imports by basename: value is a file in ./proposed/
const ADDED={
 // 'panel-resize.jsx':'panel-resize.jsx',
 // 'panel-resize.css':'panel-resize.css',
};
const DESKTOP={width:1440,height:900},PHONE={width:390,height:844};
// ----------------------------------------

const here=path.dirname(fileURLToPath(import.meta.url));
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined;};
const serve=process.argv.includes('--serve'),allowClaude=process.argv.includes('--allow-claude');
const out=path.resolve(arg('--out')||here);
const repo=path.resolve(process.env.LYDIA_REPO||path.resolve(here,'../..'));
const business=path.join(repo,'business'),frontend=path.join(business,'frontend'),proposed=path.join(here,'proposed');
const require=createRequire(path.join(business,'package.json'));
const {chromium}=require('playwright-core');
const {createServer}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
const react=(await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
const {createApp}=await import(pathToFileURL(path.join(business,'backend/server.ts')).href);
await mkdir(out,{recursive:true});

// Newest backup whose manifest says verified + restore_verified (manual and daily backups).
async function latestVerifiedBackup(){
 const root=path.join(repo,'data/data_storage/backups/database'),found=[];
 for(const dir of [root,path.join(root,'daily')]){
  let names=[];try{names=await readdir(dir);}catch{continue;}
  for(const n of names){const m=path.join(dir,n,'manifest.json');
   try{const j=JSON.parse(await readFile(m,'utf8'));if(j.verified===true&&j.restore_verified===true&&j.database)found.push({at:(await stat(m)).mtimeMs,manifest:m,database:j.database});}catch{}}
 }
 found.sort((a,b)=>b.at-a.at);
 if(!found.length)throw new Error('No verified backup found. Make one first (see deploy-ops.md), never read the live DB.');
 return found[0];
}
const backup=await latestVerifiedBackup();
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-design-'));
await cp(backup.database,path.join(temp,'pg'),{recursive:true});

const report={topic:TOPIC,date:new Date().toISOString().slice(0,10),artifact:'DESIGN_ONLY',applicationModified:false,
 database:'copy of '+path.relative(repo,backup.database),claudeCalls:allowClaude?'allowed':'disabled',checks:[],shots:[],video:[],errors:[]};
let app;
const server=http.createServer((req,res)=>void app.handler(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),casesDir:path.join(temp,'cases'),startWorker:false,localAutoLogin:true});
if(!allowClaude)app.cli.run=async()=>{throw new Error('Inference disabled in design render (pass --allow-claude to enable)');};

const slash=p=>p.replace(/\\/g,'/');
const swap={name:'lydia-design-swap',enforce:'pre',
 resolveId(id){const base=id.split('?')[0].split('/').pop();if(ADDED[base]&&!slash(id).includes(slash(proposed)))return slash(path.join(proposed,ADDED[base]));},
 async load(id){const f=slash(id.split('?')[0]);for(const [k,v] of Object.entries(SWAPPED))if(f.endsWith('/frontend'+k))return readFile(path.join(proposed,v),'utf8');}};
const port=serve?SERVE_PORT:0;
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),swap],
 server:{host:'127.0.0.1',port,strictPort:serve,hmr:false,fs:{strict:false},
  proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base=`http://127.0.0.1:${vite.config.server.port||vite.httpServer.address().port}`;

if(serve){
 console.log(`\n设计预览已启动（数据是备份的副本，不会写入正式资料库）：\n  主页面  ${base}/#/bot/steve\n  知识库  ${base}/#/knowledge\n按 Ctrl+C 结束。\n`);
 const stop=async()=>{await vite.close();server.close();await app.close().catch(()=>{});await rm(temp,{recursive:true,force:true}).catch(()=>{});process.exit(0);};
 process.on('SIGINT',stop);await new Promise(()=>{});
}

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const check=(ok,what)=>{report.checks.push((ok?'PASS ':'FAIL ')+what);if(!ok)report.errors.push('check failed: '+what);};
const shot=async(page,name,what)=>{await page.screenshot({path:path.join(out,name)});report.shots.push({file:name,what});};
async function open(route,viewport=DESKTOP,{theme='light',video=false,phone=false,storage={}}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:video?1:2,...(phone?{isMobile:true,hasTouch:true}:{}),
  ...(video?{recordVideo:{dir:path.join(temp,'video'),size:viewport}}:{})});
 await ctx.addInitScript(([t,s])=>{try{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','dismissed');for(const [k,v] of Object.entries(s))localStorage.setItem(k,v);}catch{}},[theme,storage]);
 const page=await ctx.newPage();
 page.on('pageerror',e=>report.errors.push('pageerror '+route+': '+e.message));
 await page.goto(base+route);
 if(route.includes('knowledge'))await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});
 else await page.waitForLoadState('networkidle');
 await page.waitForTimeout(900);                       // let open animations finish before measuring
 return {ctx,page};
}
async function saveVideo(ctx,page,name){const v=page.video();await ctx.close();if(v){await rename(await v.path(),path.join(out,name));report.video.push(name);}}

try{
 // ---------------- SHOTS: replace with the screens and checks this design needs ----------------
 for(const theme of ['light','dark']){
  const {ctx,page}=await open('/#/bot/steve',DESKTOP,{theme});
  await shot(page,`01-main-${theme}.png`,`主页面，${theme==='light'?'白天':'黑夜'}`);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`main page has no horizontal overflow (${theme})`);
  await ctx.close();
 }
 {const {ctx,page}=await open('/#/knowledge',DESKTOP);
  await shot(page,'02-knowledge-light.png','知识库，白天');
  check(await page.locator('.knowledge-object').count()>0,'knowledge workspace renders books from the DB copy');
  await ctx.close();}
 {const {ctx,page}=await open('/#/',PHONE,{phone:true});
  await shot(page,'03-phone-light.png','手机首页');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'phone has no horizontal overflow');
  await ctx.close();}
 // Video example:
 // {const {ctx,page}=await open('/#/knowledge',DESKTOP,{video:true}); /* interact */ await saveVideo(ctx,page,'demo.webm');}
 // -----------------------------------------------------------------------------------------------
}catch(e){report.errors.push(e.stack||String(e));}
finally{
 await browser.close();await vite.close();server.close();await app.close().catch(()=>{});
 await writeFile(path.join(out,'render-report.json'),JSON.stringify(report,null,1));
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
 console.log(report.checks.join('\n'));if(report.errors.length)console.log('ERRORS\n'+report.errors.join('\n'));
 process.exit(report.errors.length?1:0);
}
