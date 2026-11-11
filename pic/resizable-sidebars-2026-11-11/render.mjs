// Design render for "左右侧栏可以拖动调整宽度" (main Lydia page + knowledge workspace).
// Real React app via a Vite dev server with the proposed files swapped in (no dist rebuild,
// live service untouched), on a throwaway copy of the verified 2026-11-10 database backup.
// Run from business/:
//   node --experimental-strip-types ../pic/resizable-sidebars-2026-11-11/render.mjs           screenshots + video
//   node --experimental-strip-types ../pic/resizable-sidebars-2026-11-11/render.mjs --serve   try it yourself
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {cp,mkdtemp,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),business=path.join(repo,'business'),frontend=path.join(business,'frontend');
const serve=process.argv.includes('--serve');
const require=createRequire(path.join(business,'package.json'));
const {chromium}=require('playwright-core');
const {createServer}=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
const react=(await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
const {createApp}=await import(pathToFileURL(path.join(business,'backend/server.ts')).href);

const manifest=path.join(repo,'data/data_storage/backups/database/grok-import-2026-11-10T08-37-03-279Z-a2496fbd/manifest.json');
const source=JSON.parse(await readFile(manifest,'utf8'));
if(source.verified!==true)throw new Error('backup not verified');
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-resize-'));
await cp(source.database,path.join(temp,'pg'),{recursive:true});

const report={date:'2026-11-11',artifact:'DESIGN_ONLY',applicationModified:false,database:'copy of '+source.database,checks:[],shots:[],video:null,errors:[]};
let app;
const server=http.createServer((req,res)=>void app.handler(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
app.cli.run=async()=>{throw new Error('No inference in the resize design render');};

const proposed=path.join(here,'proposed');
const swapped={'/src/App.jsx':'App.jsx','/src/main.jsx':'main.jsx','/src/components/KnowledgeWorkspace.jsx':'KnowledgeWorkspace.jsx'};
const added={'panel-resize.jsx':'panel-resize.jsx','panel-resize.css':'panel-resize.css'};
const swap={name:'design-swap-resize',enforce:'pre',
 resolveId(id){const base=id.split('?')[0].split('/').pop();if(added[base]&&!id.includes(proposed.replace(/\\/g,'/')))return path.join(proposed,added[base]).replace(/\\/g,'/');},
 async load(id){const f=id.split('?')[0].replace(/\\/g,'/');for(const [k,v] of Object.entries(swapped))if(f.endsWith('/frontend'+k))return readFile(path.join(proposed,v),'utf8');}};
const port=serve?5310:5309;
const vite=await createServer({configFile:false,root:frontend,logLevel:'error',plugins:[react(),swap],
 server:{host:'127.0.0.1',port,strictPort:true,hmr:false,fs:{strict:false},proxy:{'/api':{target:origin,changeOrigin:true,configure(proxy){proxy.on('proxyReq',r=>r.setHeader('origin',origin));}}}}});
await vite.listen();
const base='http://127.0.0.1:'+port;

if(serve){
 console.log(`\n设计预览已启动（数据是 11-10 备份的副本，不会写入正式资料库）：\n  主页面  ${base}/#/bot/steve\n  知识库  ${base}/#/knowledge\n按 Ctrl+C 结束。\n`);
 await new Promise(()=>{});
}

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const check=(ok,what)=>{report.checks.push((ok?'PASS ':'FAIL ')+what);if(!ok)report.errors.push('check failed: '+what);};
async function open(route,viewport,{theme='light',video=false,storage={}}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:video?1:2,...video?{recordVideo:{dir:path.join(temp,'video'),size:viewport}}:{}});
 await ctx.addInitScript(([t,s])=>{try{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','dismissed');for(const [k,v] of Object.entries(s))localStorage.setItem(k,v);}catch{}},[theme,storage]);
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+route);
 if(route.includes('knowledge'))await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0,null,{timeout:60000});
 else await page.locator('.claude-sidebar').waitFor({timeout:60000});
 await page.waitForTimeout(900);
 const toast=page.locator('.kt-toast button',{hasText:'稍后'});if(await toast.count())await toast.first().click();
 return {ctx,page};
}
const width=(page,sel)=>page.evaluate(s=>Math.round(document.querySelector(s)?.getBoundingClientRect().width||0),sel);
const handle=(page,label)=>page.locator(`.panel-resize[aria-label="${label}"]:visible`);
async function center(loc){const b=await loc.boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function drag(page,loc,dx,{hold=false,steps=24}={}){const c=await center(loc);await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x+dx,c.y,{steps});if(!hold)await page.mouse.up();}
async function shot(page,name,what){await page.screenshot({path:path.join(here,name)});report.shots.push({file:name,what});}

const L='调整左侧栏宽度',R='调整右侧栏宽度';
const M={left:'.app>.sidebar',right:'.app>.research-panel'},K={left:'.kw-layout>.kw-sidebar',right:'.kw-layout>.kw-inspector'};
try{
 // ---- Main page ----
 {const {ctx,page}=await open('/#/bot/steve',{width:1440,height:900});
  const l0=await width(page,M.left),r0=await width(page,M.right);
  check(await handle(page,L).count()===1&&await handle(page,R).count()===1,'main page shows both dividers');
  await shot(page,'01-main-default.png',`主页面默认宽度：左 ${l0}px，右 ${r0}px`);
  const c=await center(handle(page,L));await page.mouse.move(c.x,c.y);await page.waitForTimeout(250);
  await shot(page,'02-main-hover-divider.png','鼠标移到左侧栏和对话之间：出现一条细线，鼠标变成左右箭头');
  await page.mouse.move(c.x,c.y+300);
  await drag(page,handle(page,L),-90);await page.waitForTimeout(200);
  await drag(page,handle(page,R),-110,{hold:true});await page.waitForTimeout(250);
  const l1=await width(page,M.left),r1=await width(page,M.right);
  await shot(page,'03-main-dragging.png',`拖动中：左侧栏收窄到 ${l1}px，右侧栏拉宽到 ${r1}px，对话区自动变宽/变窄`);
  await page.mouse.up();await page.waitForTimeout(200);
  check(l1<l0-60&&r1>r0+60,`main drag changes widths (${l0}->${l1}, ${r0}->${r1})`);
  await page.reload();await page.locator('.claude-sidebar').waitFor();await page.waitForTimeout(700);
  check(Math.abs(await width(page,M.left)-l1)<=2&&Math.abs(await width(page,M.right)-r1)<=2,'main widths are remembered after reload');
  await drag(page,handle(page,R),-900);check(await width(page,M.right)<=640,'right panel never grows past 640px');
  const mainW=await width(page,'.app>.main');check(mainW>=379,`conversation keeps at least 380px (${mainW})`);
  await handle(page,R).dblclick();await page.waitForTimeout(200);check(Math.abs(await width(page,M.right)-r0)<=2,'double-click restores the right panel default');
  await drag(page,handle(page,R),-110);await page.waitForTimeout(200);
  await handle(page,L).focus();for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);
  check(Math.abs(await width(page,M.left)-(l1+48))<=2,'arrow keys move the focused divider 16px a step');
  for(let i=0;i<3;i++)await page.keyboard.press('ArrowLeft');await page.waitForTimeout(150);await page.mouse.move(5,5);
  await page.evaluate(()=>{localStorage.setItem('lydia-theme','dark');});await page.reload();await page.locator('.claude-sidebar').waitFor();await page.waitForTimeout(700);
  const c2=await center(handle(page,R));await page.mouse.move(c2.x,c2.y);await page.waitForTimeout(250);
  await shot(page,'04-main-dark-resized.png','黑夜模式，宽度已记住（右侧分隔线处于悬停状态）');
  await ctx.close();}

 // ---- Knowledge workspace ----
 {const {ctx,page}=await open('/#/knowledge',{width:1440,height:900});
  const l0=await width(page,K.left),r0=await width(page,K.right);
  check(await handle(page,L).count()===1&&await handle(page,R).count()===1,'knowledge page shows both dividers');
  await shot(page,'05-knowledge-default.png',`知识库默认宽度：左 ${l0}px，右 ${r0}px`);
  const c=await center(handle(page,R));await page.mouse.move(c.x,c.y);await page.waitForTimeout(250);
  await shot(page,'06-knowledge-hover-divider.png','鼠标移到书库和右侧栏之间');
  await page.mouse.move(c.x,c.y+300);
  await drag(page,handle(page,L),70);await page.waitForTimeout(200);
  await drag(page,handle(page,R),-130,{hold:true});await page.waitForTimeout(400);
  const l1=await width(page,K.left),r1=await width(page,K.right);
  await shot(page,'07-knowledge-dragging.png',`拖动中：左侧栏拉宽到 ${l1}px，右侧栏拉宽到 ${r1}px，书库跟着缩放`);
  await page.mouse.up();await page.waitForTimeout(300);
  check(l1>l0+50&&r1>r0+100,`knowledge drag changes widths (${l0}->${l1}, ${r0}->${r1})`);
  await page.locator('.kw-collapse').click({timeout:5000});await page.waitForTimeout(300);
  check(await handle(page,L).count()===0,'collapse button stays clickable; left divider hides while collapsed');
  await page.locator('.kw-collapse').click();await page.waitForTimeout(300);
  check(Math.abs(await width(page,K.left)-l1)<=2,'expanding again returns to the dragged width');
  await page.evaluate(()=>{localStorage.setItem('lydia-theme','dark');});await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length>0);await page.waitForTimeout(800);
  check(Math.abs(await width(page,K.left)-l1)<=2&&Math.abs(await width(page,K.right)-r1)<=2,'knowledge widths are remembered after reload');
  await shot(page,'08-knowledge-dark-resized.png','黑夜模式，宽度已记住');
  await ctx.close();}

 // ---- Phone: no dividers ----
 {const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await ctx.newPage();
  await page.goto(base+'/#/knowledge');await page.waitForTimeout(2500);
  check(await page.locator('.panel-resize:visible').count()===0,'phone layout has no dividers');await ctx.close();}

 // ---- Video ----
 for(const [route,sel,moves] of [['/#/bot/steve',M,[[L,-80],[L,60],[R,140],[R,-60]]],['/#/knowledge',K,[[L,80],[R,-150],[R,70]]]]){
  const {ctx,page}=await open(route,{width:1440,height:900},{video:true});
  await page.waitForTimeout(600);
  for(const [label,dx] of moves){const c=await center(handle(page,label));await page.mouse.move(c.x,c.y+260,{steps:10});await page.mouse.move(c.x,c.y,{steps:14});await page.waitForTimeout(500);await page.mouse.down();await page.mouse.move(c.x+dx,c.y,{steps:45});await page.waitForTimeout(250);await page.mouse.up();await page.waitForTimeout(500);}
  const c=await center(handle(page,R));await page.mouse.move(c.x,c.y,{steps:10});await page.waitForTimeout(400);await page.mouse.dblclick(c.x,c.y);await page.waitForTimeout(900);
  const v=page.video();await ctx.close();const file=route.includes('knowledge')?'demo-knowledge.webm':'demo-main.webm';await rename(await v.path(),path.join(here,file));report.video=[...(report.video||[]),file];
 }
}catch(e){report.errors.push(e.stack||String(e));}
finally{
 await browser.close();await vite.close();server.close();await app.store?.close?.().catch(()=>{});
 await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,1));
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
 console.log(report.checks.join('\n'));if(report.errors.length)console.log('ERRORS\n'+report.errors.join('\n'));
 process.exit(report.errors.length?1:0);
}
