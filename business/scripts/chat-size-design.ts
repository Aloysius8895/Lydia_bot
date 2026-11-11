// Design preview only: chat message size before/after, rendered on the real app with a temporary database.
// The "after" look is injected as a stylesheet; the application CSS is not changed by this script.
import {chromium,type Page} from 'playwright-core';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {createApp} from '../backend/server.ts';

const out=path.resolve(process.argv[2]||'../pic/chat-text-size-2026-11-09');await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-chat-size-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),localAutoLogin:true,startWorker:false});
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});
const caseRow=(await app.store.createCase('TEST_ONLY 示例项目','TEST_ONLY：字号预览。'))!;
export const AFTER=`
:root{--lydia-message-size:15px!important}
@media(min-width:1400px){:root{--lydia-message-size:16px!important}}
.grok-message .bubble{line-height:1.7!important}
.grok-message--me .bubble{padding:9px 14px!important;border-radius:14px 14px 4px 14px!important}
.grok-message__heading{font-size:12px!important}
@media(max-width:760px){.grok-message .bubble{font-size:15px!important;line-height:1.7!important}}`;
const REPLY='TEST_ONLY 示例回复：先别急着找大客户。建议先列出 3 个你最想验证的假设，按"问题是否存在 → 现在怎么解决 → 愿不愿意为新方案付钱"的顺序，每个假设找 5 个人聊。下次讨论时把访谈记录带来，我们一起看哪些假设站得住。';
async function setup(page:Page){
 await page.goto(origin+'/#/bot/april?case='+caseRow.id);const box=page.getByRole('textbox',{name:'Message Steve Blank',exact:true});await box.waitFor();
 await box.fill('你好');await box.press('Enter');await page.locator('.grok-message--me').first().waitFor();
 // Sample advisor reply so both bubble types are visible (layout only; not produced by Claude).
 await page.evaluate(text=>{
  const mine=document.querySelector('.grok-message--me')!;const bot=mine.cloneNode(true) as HTMLElement;
  bot.className='grok-message grok-message--bot';bot.querySelector('.bubble')!.className='bubble bubble--bot';
  bot.querySelector('.bubble')!.textContent=text;bot.querySelector('.grok-message__heading strong')!.textContent='Steve Blank';
  mine.after(bot);
 },REPLY);
 await page.waitForTimeout(300);
}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const sizes:any={};
try{
 for(const [name,vp,scale] of [['desktop',{width:1906,height:890},1.5],['phone',{width:390,height:844},3]] as const){
  const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:scale,hasTouch:name==='phone',isMobile:name==='phone'});
  await ctx.addInitScript(()=>localStorage.setItem('lydia-theme','light'));
  const page=await ctx.newPage();await setup(page);
  const measure=()=>page.locator('.grok-message .bubble').first().evaluate(e=>getComputedStyle(e).fontSize);
  sizes[name]={before:await measure()};
  await page.screenshot({path:path.join(out,`${name}-before.png`)});
  await page.addStyleTag({content:AFTER});await page.waitForTimeout(200);
  sizes[name].after=await measure();
  await page.screenshot({path:path.join(out,`${name}-after.png`)});
  await ctx.close();
 }
 await writeFile(path.join(out,'sizes.json'),JSON.stringify(sizes,null,2));console.log(JSON.stringify(sizes));
}finally{await browser.close();server.close();await app.close();}
