// Design preview only: main Lydia page in the 项目库 palette, rendered on the real app with a temporary database.
// The proposed look is injected as a stylesheet; the application CSS is not changed by this script.
// Usage: node --experimental-strip-types scripts/warm-theme-design.ts <out-dir> <proposed.css>
import {chromium,type Page} from 'playwright-core';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {createApp} from '../backend/server.ts';

const out=path.resolve(process.argv[2]||'../pic/warm-theme-2026-11-09');await mkdir(out,{recursive:true});
const PROPOSED=await readFile(path.resolve(process.argv[3]||path.join(out,'proposed','warm-theme.css')),'utf8');
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-warm-theme-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),localAutoLogin:true,startWorker:false});
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});
const caseRow=(await app.store.createCase('TEST_ONLY 示例项目','TEST_ONLY：配色预览。'))!;
const REPLY='TEST_ONLY 示例回复：先别急着找大客户。建议先列出 3 个你最想验证的假设，每个假设找 5 个人聊。';
async function chat(page:Page){
 await page.goto(origin+'/#/bot/steve?case='+caseRow.id);const box=page.getByRole('textbox',{name:'Message Steve Blank',exact:true});await box.waitFor();
 if(!await page.locator('.grok-message--me').count()){await box.fill('你好');await box.press('Enter');}await page.locator('.grok-message--me').first().waitFor();
 // Sample advisor reply so both bubble types are visible (layout only; not produced by Claude).
 await page.evaluate(text=>{
  if(document.querySelector('.grok-message--bot'))return;
  const mine=document.querySelector('.grok-message--me')!;const bot=mine.cloneNode(true) as HTMLElement;
  bot.className='grok-message grok-message--bot';bot.querySelector('.bubble')!.className='bubble bubble--bot';
  bot.querySelector('.bubble')!.textContent=text;bot.querySelector('.grok-message__heading strong')!.textContent='Steve Blank';
  mine.after(bot);
 },REPLY);
 await page.waitForTimeout(400);
}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const theme of ['light','dark'] as const){
  for(const [name,vp,scale] of [['desktop',{width:1906,height:890},1],['phone',{width:390,height:844},2]] as const){
   const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:scale,hasTouch:name==='phone',isMobile:name==='phone'});
   await ctx.addInitScript(t=>localStorage.setItem('lydia-theme',t),theme);
   const page=await ctx.newPage();
   if(name==='desktop'){
    await page.goto(origin+'/#/knowledge?case='+caseRow.id);await page.locator('.kw-header').waitFor();await page.waitForTimeout(800);
    await page.screenshot({path:path.join(out,`${theme}-reference-project-library.png`)});
    await chat(page);
   }else{await page.goto(origin+'/#/');await page.waitForTimeout(800);}
   const label=name==='desktop'?'chat':'phone-home';
   await page.screenshot({path:path.join(out,`${theme}-${label}-before.png`)});
   await page.addStyleTag({content:PROPOSED});await page.waitForTimeout(250);
   await page.screenshot({path:path.join(out,`${theme}-${label}-after.png`)});
   await ctx.close();
  }
 }
 console.log('written to',out);
}finally{await browser.close();server.close();await app.close();}
