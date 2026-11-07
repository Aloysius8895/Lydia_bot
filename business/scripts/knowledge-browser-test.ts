import {chromium} from 'playwright-core';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {seedKnowledge,knowledgeReply} from '../tests/knowledge-fixture.ts';
const out=path.resolve('../pic/hackathon-idea-lab-2026-11-08/implemented');await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-knowledge-browser-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
const projects=await seedKnowledge(app.store,30),caseRow=(await app.store.createCase('TEST_ONLY 原研究项目','TEST_ONLY：保留原来的讨论页面。'))!;
await mkdir(path.join(temp,'vault','.obsidian'),{recursive:true});app.obsidian.vaultOverride=path.join(temp,'vault');
let calls=0;
(app.cli as any).auth=async()=>({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'TEST_ONLY'});
app.cli.run=async(prompt:string)=>{calls++;const input=JSON.parse(prompt.split('UNTRUSTED_INPUT_JSON=')[1]);return {data:knowledgeReply(input.projects),usage:null,session_id:null,auth:await app.cli.auth()};};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1586,height:992}}),errors:string[]=[],consoleErrors:string[]=[],checks:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
async function shot(name:string){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});}
async function dragProject(i:number){
 const object=page.getByRole('button',{name:'查看项目 '+projects[i].title,exact:true});
 await object.dragTo(page.getByLabel('分析托盘',{exact:true}));
 await page.getByRole('button',{name:'移除 '+projects[i].title,exact:true}).waitFor();
}
try{
 await page.goto(origin+'/#/bot/april?case='+caseRow.id);
 await page.getByRole('textbox',{name:'Message Steve Blank',exact:true}).fill('TEST_ONLY 未发送的原始草稿');
 await page.getByRole('button',{name:'知识库',exact:true}).click();
 await page.getByRole('main',{name:'知识库工作区'}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length===30);
 await page.getByRole('button',{name:'查看项目 '+projects[0].title,exact:true}).click();
 await page.locator('.kw-detail h2').getByText(projects[0].title,{exact:true}).waitFor();
 for(const target of ['dark','light']){
  if(await page.locator('html').getAttribute('data-theme')!==target)await page.getByRole('button',{name:target==='dark'?'切换到黑夜模式':'切换到白天模式',exact:true}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.knowledge-object img')).every((e:any)=>e.complete&&e.naturalWidth>0));await shot('library-'+target);
 }
 checks.push('Authenticated actual React workspace reads 30 TEST_ONLY projects and full details; both themes render real Blender sprites');
 await page.getByRole('button',{name:'收起知识库侧栏',exact:true}).click();assert.ok(await page.locator('.kw-collapsed').count());await page.getByRole('button',{name:'展开知识库侧栏',exact:true}).click();
 await dragProject(0);await dragProject(1);await dragProject(2);await dragProject(0);assert.equal(await page.locator('.kw-tray__items>span').count(),3);
 checks.push('Native drag adds projects to tray and duplicate drops are idempotent');
 await page.locator('.kw-brand').click();await page.getByRole('textbox',{name:'Message Steve Blank',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Message Steve Blank',exact:true}).inputValue(),'TEST_ONLY 未发送的原始草稿');assert.ok(page.url().includes('/bot/april'));assert.ok(page.url().includes(caseRow.id));checks.push('Click Lydia returns to original expert route, case and unsent composer draft');
 await page.getByRole('button',{name:'知识库',exact:true}).click();await page.locator('.kw-tray__items>span').nth(2).waitFor();
 await page.getByRole('button',{name:'条件',exact:true}).click();await page.locator('.kw-constraints label').filter({hasText:'可用时间'}).locator('input').fill('48 hours');await page.getByRole('button',{name:'完成',exact:true}).click();
 await page.getByRole('button',{name:/^分析并生成/}).click();
 await page.locator('.knowledge-candidate').nth(2).waitFor();await shot('analysis-light');
 assert.equal(await page.getByText('这份结果基于上一组项目或条件。重新分析后才会更新。',{exact:true}).count(),0);
 assert.equal(calls,1);await page.getByRole('button',{name:/共同点与差异/}).click();await page.getByText('这些示例都在协调有限资源与实时信号。',{exact:true}).waitFor();await page.getByRole('button',{name:/候选 Idea/}).click();
 await page.locator('.knowledge-candidate').first().dragTo(page.locator('.knowledge-shelf'));
 await page.locator('.knowledge-shelf__list button').first().waitFor();assert.equal((await app.store.rows('SELECT * FROM knowledge_ideas')).length,1);checks.push('Comparison job returns validated source-linked candidate ideas; native drag persists selected candidate');
 await page.getByRole('button',{name:'收起分析结果',exact:true}).click();
 await page.reload();await page.locator('.knowledge-shelf__list button').first().waitFor();assert.equal(await page.locator('.kw-tray__items>span').count(),3);
 await page.locator('.knowledge-shelf__list button').first().click();await page.getByRole('textbox',{name:'Idea 备注',exact:true}).fill('TEST_ONLY 优先验证服务台交接。');await page.getByRole('button',{name:'保存备注',exact:true}).click();
 await page.getByRole('button',{name:/立即同步/}).click();await page.getByText(/Obsidian：写入/).waitFor();assert.ok((await app.obsidian.sync()).connected);
 checks.push('Draft, constraints and saved shelf survive refresh; notes save and isolated Obsidian exports run');
 await page.getByRole('button',{name:/^交给 Lydia 研究/}).click();await page.getByRole('textbox',{name:'Message Steve Blank',exact:true}).waitFor();const ideas=await app.store.rows('SELECT * FROM knowledge_ideas');assert.ok(ideas[0].case_id);assert.equal((await app.store.getCase(ideas[0].case_id)).selected_gap_id,null);checks.push('Explicit research handoff creates PROJECT background without MARKET evidence or Gap selection');
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/#/');await page.getByRole('button',{name:'知识库',exact:true}).click();await page.locator('.knowledge-workspace').waitFor();
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'列表',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.kw-project-list article').first().getByRole('button',{name:/加入/}).click();}
 await page.setViewportSize({width:390,height:844});await shot('mobile-light');await page.getByRole('button',{name:'切换到黑夜模式',exact:true}).click();await shot('mobile-dark');
 checks.push('Mobile 320/390/430px list and add-button alternatives fit without horizontal overflow');
 await page.getByRole('button',{name:'切换到白天模式',exact:true}).click();await page.setViewportSize({width:1586,height:992});await page.getByRole('button',{name:'◇ 空间',exact:true}).click();
 await page.getByRole('button',{name:'新建比较',exact:true}).click();
 await dragProject(0);
 await page.getByRole('button',{name:/添加新闻/}).click();
 await page.getByRole('textbox',{name:'新闻标题',exact:true}).fill('TEST_ONLY 校园服务容量变化');
 await page.getByRole('textbox',{name:'新闻正文',exact:true}).fill('TEST_ONLY project coordinates shared capacity. A synthetic news report about campus service changes. This is synthetic test content, not real market evidence.');
 await page.getByRole('textbox',{name:'新闻发布者',exact:true}).fill('TEST_ONLY News');
 await page.getByLabel('新闻日期',{exact:true}).fill('2026-11-01');
 await page.getByRole('button',{name:'保存新闻资料',exact:true}).click();
 await page.locator('.kw-detail h2').getByText('TEST_ONLY 校园服务容量变化',{exact:true}).waitFor();
 const newsObject=page.getByRole('button',{name:'查看项目 TEST_ONLY 校园服务容量变化',exact:true});
 await newsObject.dragTo(page.getByLabel('分析托盘',{exact:true}));
 await page.locator('.kw-tray__items [data-kind=news]').waitFor();
 await shot('news-library-light');
 await page.getByRole('button',{name:/^分析并生成/}).click();
 await page.locator('.kw-news-angle').first().waitFor();await shot('mixed-ideas-light');
 const mixedRun=await app.store.one('SELECT * FROM knowledge_runs ORDER BY created_at DESC LIMIT 1');
 assert.equal(mixedRun!.sources.filter((s:any)=>s.kind==='news').length,1);assert.equal(mixedRun!.sources.filter((s:any)=>s.kind==='hackathon').length,1);
 await page.locator('.knowledge-candidate').first().getByRole('button',{name:'收藏',exact:true}).click();
 await page.getByRole('button',{name:'收起分析结果',exact:true}).click();await page.reload();await page.locator('.kw-tray__items [data-kind=news]').waitFor();
 const mixedIdea=await app.store.one('SELECT * FROM knowledge_ideas WHERE run_id=$1',[mixedRun!.id]);assert.ok(mixedIdea);
 const exported=await app.obsidian.sync();assert.equal(exported.news,1);
 checks.push('News form persists dated source; native news+project drag generates mixed-source ideas with news explanation, saves snapshot and survives refresh; Obsidian includes News');
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));
 await writeFile(path.join(out,'report.json'),JSON.stringify({status:'TEST_PASSED',timestamp:new Date().toISOString(),checks,pageErrors:errors,consoleErrors,realModelCalls:0,mockedModelCalls:calls,fixture:'Isolated temporary database, synthetic projects/news and model output, isolated Obsidian Vault. No production cases changed.',screenshots:['library-dark.png','library-light.png','analysis-light.png','mobile-light.png','mobile-dark.png','news-library-light.png','mixed-ideas-light.png']},null,2));
 console.log(JSON.stringify({status:'TEST_PASSED',checks,pageErrors:errors,consoleErrors}));
}catch(e){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),checks,errors,consoleErrors},null,2));throw e;}
finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
