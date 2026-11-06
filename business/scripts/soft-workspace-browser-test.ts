import {chromium} from 'playwright-core';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {businessRoot} from '../shared/config.ts';

const output=path.resolve(businessRoot,'../pic/implemented');await mkdir(output,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-soft-workspace-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),localAutoLogin:true,startWorker:false});
(app.cli as any).auth=async()=>({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'pro'});
app.cli.run=async()=>{throw new Error('No inference in visual fixture');};
const project=await app.store.createCase('TEST_ONLY · Global Sustainability Challenge','TEST_ONLY design fixture. An interdisciplinary sustainability project. This preview contains synthetic conversation content, not verified research.');
const task=await app.store.enqueue(project.id,'research',{message:'TEST_ONLY: can u introduce yourself'},'TEST_ONLY_SOFT_WORKSPACE');
await app.store.updateTask(task.id,'PAUSED',{current:'steve',collection:{status:'NOT_RUN_OR_FAILED'}},{code:'TEST_ONLY',message:'TEST_ONLY：来源支持的主张需要原始证据'});
await app.store.artifact(project.id,task.id,'summary','TEST_ONLY：我是 Steve 方法顾问，我们可以先聊清楚你的项目，再找出最值得验证的问题。');
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1717,height:1000}}),errors:string[]=[],checks:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
const panel=()=>page.getByRole('complementary',{name:'研究工作区'});
try{
  await page.goto(origin+'/#/bot/steve');await page.locator('.voice-dock').waitFor();await page.getByText('TEST_ONLY：我是 Steve 方法顾问',{exact:false}).waitFor();
  assert.equal(await page.locator('#auth-form').count(),0);checks.push('passwordless local entry and actual fixture data');
  assert.equal(await panel().getByLabel('当前研究项目',{exact:true}).count(),0);
  assert.equal(await panel().locator('.soft-panel-disclosure[open]').count(),0);assert.equal(await page.locator('.task-progress__details[open]').count(),0);
  checks.push('single project selector and collapsed research/method/task details');
  await panel().locator('summary').filter({hasText:'研究工具'}).click();await panel().getByRole('button',{name:'资料与引用',exact:false}).click();await page.locator('#source-form').waitFor();
  await panel().getByRole('button',{name:'项目',exact:true}).click();checks.push('disclosed research tools still navigate to real source form');
  const draft=page.getByRole('textbox',{name:'Message Steve Blank',exact:true});const compact=(await draft.boundingBox())!.height;
  await draft.fill('第一行\n第二行\n第三行\n第四行');assert.ok((await draft.boundingBox())!.height>compact);await draft.fill('');checks.push('compact composer grows for multiline input and shrinks back');
  await page.getByRole('button',{name:'开始通话',exact:true}).click();const card=page.getByRole('region',{name:'与 Steve Blank 的语音通话'});await card.waitFor();
  assert.ok((await card.boundingBox())!.height<480);assert.equal(await page.locator('.voice-dock').count(),0);assert.equal((await app.callStore.listCalls(project.id)).length,0);
  await card.getByRole('button',{name:'关闭通话卡片',exact:true}).click();await page.locator('.voice-dock').waitFor();checks.push('voice dock opens compact call card without starting a call or displaying fabricated live status');
  await page.screenshot({path:path.join(output,'desktop-light.png'),fullPage:true});
  await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();await page.screenshot({path:path.join(output,'desktop-dark.png'),fullPage:true});
  await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();
  for(const width of [1920,1440,1388]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const widths=await page.evaluate(()=>['.sidebar','main.main','.research-panel'].map(s=>document.querySelector(s)!.getBoundingClientRect().width));for(const [i,share]of [.27,.42,.31].entries())assert.ok(Math.abs(widths[i]/widths.reduce((a,b)=>a+b,0)-share)<.005);}
  checks.push('27/42/31 allocation of available panel space across desktop widths; light and dark render');
  await page.setViewportSize({width:390,height:844});if(await panel().isVisible())await panel().getByRole('button',{name:'Close panel',exact:true}).click();await page.screenshot({path:path.join(output,'mobile-light.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'研究工作区',exact:true}).click();await panel().waitFor();assert.ok(await panel().locator('.research-panel__body').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.screenshot({path:path.join(output,'mobile-details.png'),fullPage:true});checks.push('390px conversation and details drawer without horizontal overflow');
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({status:'PASSED',checks,pageErrors:errors,synthetic:true,productionDatabaseTouched:false,realModelCalls:0,realAudio:false},null,2));console.log(JSON.stringify({status:'PASSED',checks},null,2));
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
