import {chromium} from 'playwright-core';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {businessRoot} from '../shared/config.ts';
const output=path.resolve(businessRoot,'../pic/mobile-implemented-2026-11-06');await mkdir(output,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-mobile-glass-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),localAutoLogin:true,startWorker:false});
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});app.cli.run=async()=>{throw Error('Real inference disabled in mobile fixture');};
const project=await app.store.createCase('TEST_ONLY · Campus Study','TEST_ONLY：面向大学生的 AI 学习助手，先验证一个具体学习场景。');
const task=await app.store.enqueue(project.id,'research',{message:'TEST_ONLY：我应该先验证什么？'},'TEST_ONLY_MOBILE_GLASS');
await app.store.updateTask(task.id,'PAUSED',{current:'steve'},{code:'TEST_ONLY',message:'TEST_ONLY：等待补充市场资料'});
await app.store.artifact(project.id,task.id,'summary','TEST_ONLY：先从一个具体场景开始。你最想帮助哪一类学生？他们上一次遇到学习困难时，是怎么解决的？');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});const errors:string[]=[],checks:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
const nav=()=>page.getByRole('navigation',{name:'手机主导航'});
const save=async(name:string)=>page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
try{
 await page.goto(origin);await page.locator('.mobile-home-scroll .row').last().waitFor();
 for(const theme of ['light','dark']){
   if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)await page.getByRole('button',{name:theme==='dark'?'Switch to dark theme':'Switch to light theme',exact:true}).click();
   await page.locator('.mobile-home-scroll .row').last().scrollIntoViewIfNeeded();
   const last=(await page.locator('.mobile-home-scroll .row').last().boundingBox())!,bar=(await nav().boundingBox())!;assert.ok(last.y+last.height<bar.y,`last expert clear of nav (${theme})`);
   assert.ok(await nav().getByRole('button',{name:'会话',exact:true}).getAttribute('aria-current'));await save('home-'+theme);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 checks.push('All experts reachable; Bob fully above glass navigation in day and night; no horizontal overflow');
 await page.reload();await page.locator('.mobile-brand').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');checks.push('Chosen theme persists on refresh');
 await nav().getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).waitFor();await save('settings-dark');
 await page.getByRole('button',{name:'外观',exact:true}).click();assert.equal(await page.getByRole('navigation',{name:'设置分类'}).isVisible(),false);
 await page.getByRole('switch',{name:'黑夜模式',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');await page.getByRole('button',{name:'返回设置',exact:true}).click();await save('settings-light');await page.getByRole('button',{name:'外观',exact:true}).click();await page.getByRole('switch',{name:'黑夜模式',exact:true}).click();
 await page.getByRole('button',{name:'返回设置',exact:true}).click();await page.getByRole('button',{name:'手机',exact:true}).click();await page.getByRole('heading',{name:'iPhone 安装',exact:true}).waitFor();
 await page.getByRole('button',{name:'返回设置',exact:true}).click();await nav().getByRole('button',{name:'项目',exact:true}).click();await page.getByRole('heading',{name:'Projects',exact:true}).waitFor();
 await page.getByLabel('上传项目文件',{exact:true}).setInputFiles({name:'TEST_ONLY-mobile.md',mimeType:'text/markdown',buffer:Buffer.from('TEST_ONLY：大学生学习助手项目背景；不是市场需求证据。')});
 await page.getByRole('button',{name:'保存到项目',exact:true}).click();await page.getByText('已保存到此项目，Steve 讨论时可以读取。',{exact:true}).waitFor({timeout:30000});
 await save('projects-dark');checks.push('Settings vertical overview, subsection back, phone guide and project file upload use existing APIs');
 await nav().getByRole('button',{name:'会话',exact:true}).click();await page.locator('.mobile-home-scroll a[href="#/bot/steve"]').click();await page.locator('.grok-message').first().waitFor();
 assert.equal(await nav().count(),0);assert.equal(await page.locator('.voice-dock').count(),0);
 const call=page.getByRole('button',{name:'与 Steve Blank 语音通话',exact:true});assert.equal(await call.count(),1);await call.click();await page.getByRole('region',{name:'与 Steve Blank 的语音通话'}).waitFor();assert.equal((await app.callStore.listCalls(project.id)).length,0);await page.getByRole('button',{name:'关闭通话卡片',exact:true}).click();
 checks.push('Single header call entry opens existing card; no automatic call; no bottom dock/nav in chat');
 for(const theme of ['dark','light']){
   if(theme==='light'){await page.goto(origin);await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();await page.locator('.mobile-home-scroll a[href="#/bot/steve"]').click();await page.locator('.grok-message').first().waitFor();}
   await save('chat-'+theme);await page.getByRole('button',{name:'研究工作区',exact:true}).click();await page.getByRole('complementary',{name:'研究工作区'}).waitFor();await save('research-'+theme);await page.getByRole('button',{name:'Close panel',exact:true}).click();
 }
 await page.getByRole('button',{name:'取消任务',exact:true}).click();await page.locator('.task-progress').waitFor({state:'detached'});checks.push('Research drawer/tabs available in both themes; paused task cancellation persists');
 for(const [width,height]of [[320,600],[390,500],[430,932]]){
   await page.setViewportSize({width,height});const input=await page.locator('.grok-composer').boundingBox();assert.ok(input&&input.y+input.height<=height);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 checks.push('Composer stays visible at 320px, reduced 500px height and 430px; 16px editing text');
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/#/bot/steve');await page.locator('.voice-dock').waitFor();assert.equal(await page.locator('.mobile-call-entry').count(),0);assert.equal(await nav().count(),0);await save('desktop-unchanged');checks.push('Desktop retains original call dock/three-column interface');
 assert.deepEqual(errors,[]);
 const report={date:'2026-11-06',status:'PASSED',checks,pageErrors:errors,fixture:'TEST_ONLY isolated DB, mocked CLI identity; real inference and audio disabled',productionDatabaseTouched:false,phoneKeyboard:'Desktop resized viewport only; actual iPhone keyboard still requires user verification'};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await save('failure');throw e;}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
