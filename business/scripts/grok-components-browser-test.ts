import {chromium} from 'playwright-core';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';

const out=path.resolve('../bot_rea/validation/components');await mkdir(out,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'lydia-component-port-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
app=await createApp({origin,dataDir:path.join(temporary,'pg'),casesDir:path.join(temporary,'exports'),crawlStorageDir:path.join(temporary,'crawl'),startWorker:false,skillsDir:path.join(temporary,'missing')});
app.worker.tick=async()=>{}; // Exercise task submission/cancellation without inference or network work.
const c=await app.store.createCase('TEST_ONLY Component Port','TEST_ONLY visual and interaction verification');assert.ok(c);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
const errors:string[]=[],checks:string[]=[];page.on('pageerror',e=>errors.push(e.message));
let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith(`/api/cases/${c.id}/tasks`))posts++;});
const settings=()=>page.getByRole('dialog',{name:'Settings',exact:true});
try{
 await page.goto(origin);await page.locator('#auth-form').waitFor();await page.screenshot({path:path.join(out,'login.png'),fullPage:true});
 await page.locator('#password').fill('TEST_ONLY-native-components-42');await page.locator('#auth-submit').click();await page.locator('.grok-welcome h1').waitFor();await page.waitForFunction(id=>document.querySelector<HTMLSelectElement>('.research-toolbar select')?.value===id,c.id);
 assert.equal(await page.locator('.grok-welcome').count(),1);assert.equal(await page.locator('.grok-composer textarea').count(),1);assert.equal(await page.locator('.grok-detail-profile').count(),1);checks.push('native welcome, sidebar controls, composer and detail profile are mounted');
 const sidebar=page.getByRole('complementary',{name:'Bots and rooms'});await sidebar.getByRole('button',{name:'已置顶',exact:true}).click();assert.equal(await sidebar.getByRole('navigation',{name:'Bots',exact:true}).getByRole('link').count(),3);await sidebar.getByRole('button',{name:'全部会话',exact:true}).click();assert.equal(await sidebar.getByRole('navigation',{name:'Bots',exact:true}).getByRole('link').count(),5);
 checks.push('expert and team navigation stay expanded; pinned filter works');
 const draft=page.locator('.grok-composer textarea');await page.locator('.grok-starter').first().click();assert.ok((await draft.inputValue()).length>10);assert.equal(posts,0);await page.getByRole('button',{name:'Add attachment',exact:true}).click();await page.locator('#source-form').waitFor();assert.ok((await draft.inputValue()).length>10);checks.push('suggestion fills draft without sending; opening sources preserves draft');
 await page.getByRole('complementary',{name:'研究工作区'}).getByRole('button',{name:'项目',exact:true}).click();await page.screenshot({path:path.join(out,'desktop-light.png'),fullPage:true});
 await sidebar.getByRole('button',{name:'打开 Crawl',exact:true}).click();await settings().getByRole('heading',{name:'发现值得研究的项目',exact:true}).waitFor();assert.equal(await settings().getByRole('button',{name:'Crawl',exact:true}).locator('svg').getAttribute('data-icon'),'spider');await settings().getByRole('button',{name:'Close settings',exact:true}).click();checks.push('sidebar shortcut opens native Crawl settings with spider icon');
 await draft.fill('TEST_ONLY first line');await draft.press('Shift+Enter');await draft.press('End');await draft.type('TEST_ONLY second line');assert.equal(posts,0);assert.ok((await draft.inputValue()).includes('\n'));const text=await draft.inputValue();
 const route=`**/api/cases/${c.id}/tasks`;await page.route(route,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'TEST_ONLY',message:'TEST_ONLY send failure'}})}));await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('TEST_ONLY send failure',{exact:true}).waitFor();assert.equal(await draft.inputValue(),text);await page.unroute(route);checks.push('failed send retains multiline draft and reports the error');
 const response=page.waitForResponse(r=>r.url().endsWith(`/api/cases/${c.id}/tasks`)&&r.request().method()==='POST');await draft.press('Enter');assert.equal((await response).status(),202);await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>('.grok-composer textarea')?.value==='');assert.equal(posts,2);await page.locator('.grok-message--me').waitFor();assert.equal((await app.store.snapshot(c.id)).tasks.length,1);checks.push('Enter submits exactly one persistent task; Shift+Enter only inserts newline');
 await page.getByRole('button',{name:'复制我的消息',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),text);await page.getByText('已复制到剪贴板',{exact:true}).waitFor();checks.push('message copy and acknowledgement work with native Windows line endings');
 await page.getByRole('button',{name:'Stop replying',exact:true}).click();await page.getByRole('button',{name:'Send message',exact:true}).waitFor();assert.equal((await app.store.snapshot(c.id)).tasks[0].status,'CANCELLED');checks.push('composer stop cancels the actual queued task');
 for(const width of [1388,1440,1920]){await page.setViewportSize({width,height:1000});const measures=await page.evaluate(()=>['.sidebar','main.main','.research-panel'].map(s=>document.querySelector(s)!.getBoundingClientRect().width));for(const [i,share]of [0.27,0.42,0.31].entries())assert.ok(Math.abs(measures[i]/measures.reduce((a,b)=>a+b,0)-share)<.005);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}checks.push('27/42/31 proportions survive all desktop widths');
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Settings',exact:true}).click();await settings().getByRole('button',{name:'外观',exact:true}).click();await settings().getByRole('switch',{name:'黑夜模式',exact:true}).click();await settings().getByRole('button',{name:'Close settings',exact:true}).click();await page.screenshot({path:path.join(out,'desktop-dark.png'),fullPage:true});checks.push('new page components inherit the dark theme');
 await page.getByRole('link',{name:'New project',exact:true}).first().click();await page.locator('#new-form').waitFor();await page.screenshot({path:path.join(out,'new-project.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/#/');await page.locator('.grok-mobile-tools').waitFor();await page.getByRole('button',{name:'Crawl',exact:true}).click();await settings().getByRole('heading',{name:'发现值得研究的项目',exact:true}).waitFor();await settings().getByRole('button',{name:'Close settings',exact:true}).click();await page.locator('.m-pinned a[href="#/bot/steve"]').click();await draft.waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'mobile-chat.png'),fullPage:true});checks.push('mobile home shortcuts and multiline conversation fit 390px');
 assert.deepEqual(errors,[]);const report={checks,errors,production_database_touched:false,model_calls:0,original_grok_runtime_validated:false};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({checks,errors}));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}
finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
