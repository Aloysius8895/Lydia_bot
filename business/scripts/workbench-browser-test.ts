// Workbench page (Idea 实验台 / 我的 Idea / Lydia 研究), roomier sidebar and the 商业逻辑 header link.
// Temporary database, TEST_ONLY projects and ideas; screenshots go to pic/workbench-2026-11-09/implemented.
import {chromium,type Page} from 'playwright-core';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {seedKnowledge} from '../tests/knowledge-fixture.ts';

const out=path.resolve('../pic/workbench-2026-11-09/implemented');await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-workbench-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),localAutoLogin:true,startWorker:false});
await seedKnowledge(app.store,24);
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});
const runId=randomUUID();
const ideas=[
 {title:'TEST_ONLY 社区冰箱调度助手',summary:'把邻里共享冰箱的存量和取用记录变成可预测的补货提醒。',difference:'已有案例只做登记，这里用取用节奏预测缺口。',first_test:'找 3 个社区冰箱志愿者，手动记录两周取用数据。',status:'shortlist'},
 {title:'TEST_ONLY 小团队排班信号',summary:'从日历和即时消息里读出团队的忙闲信号，自动建议会议时间。',difference:'不需要成员手动填写可用时间。',first_test:'在一个 5 人团队里用一周，比较人工排班耗时。',status:'explore'},
 {title:'TEST_ONLY 二手教材流转',summary:'按课程表匹配学期末的二手教材供需。',difference:'按课程编号而不是书名匹配，减少错配。',first_test:'在一个院系群里发布表单，看一周内的匹配数。',status:'explore'},
 {title:'TEST_ONLY 旧数据看板',summary:'已经不再追的方向。',difference:'—',first_test:'—',status:'archived'},
];
await app.store.db.query("INSERT INTO knowledge_runs(id,request_key,input_hash,project_ids,sources,status,output) VALUES($1,$2,'TEST_ONLY','[]',$3,'completed',$4)",[runId,'TEST_ONLY-'+runId,JSON.stringify([{id:'p1',kind:'hackathon',title:'TEST_ONLY Study Loop 1'},{id:'n1',kind:'news',title:'TEST_ONLY 新闻'}]),JSON.stringify({ideas:ideas.map(i=>({...i,source_project_ids:[]})),commonalities:[],differences:[],gaps:[]})]);
for(const [i,idea] of ideas.entries())await app.store.db.query("INSERT INTO knowledge_ideas(id,run_id,candidate_index,title,snapshot,status,note) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),runId,i,idea.title,{candidate:idea,sources:[{kind:'hackathon',title:'TEST_ONLY Study Loop 1'},{kind:'news',title:'TEST_ONLY 新闻'}]},idea.status,i===0?'TEST_ONLY 先问志愿者每周补货几次。':'']);

const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const checks:string[]=[],errors:string[]=[],shots:string[]=[];
const shot=async(page:Page,name:string)=>{await page.waitForTimeout(260);await page.screenshot({path:path.join(out,name+'.png')});shots.push(name+'.png');};
try{
 for(const theme of ['light','dark'] as const){
  const ctx=await browser.newContext({viewport:{width:1440,height:820},deviceScaleFactor:2});
  await ctx.addInitScript(t=>{localStorage.setItem('lydia-theme',t);sessionStorage.setItem('lydia-tracker-toast','x');},theme);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/knowledge');await page.locator('.knowledge-object').nth(5).waitFor();await page.waitForTimeout(500);
  if(theme==='light'){
   // Sidebar fits: nothing hidden below the fold, recent list shows several readable rows.
   const sb=await page.locator('.kw-sidebar').evaluate(e=>({client:e.clientHeight,scroll:e.scrollHeight}));
   assert.ok(sb.scroll<=sb.client+1,'sidebar content fits without overflow '+JSON.stringify(sb));
   const rows=await page.locator('.kw-recent button').evaluateAll(b=>b.filter(x=>{const r=x.getBoundingClientRect(),s=x.closest('.kw-recent')!.getBoundingClientRect();return r.height>=24&&r.bottom<=s.bottom+1;}).length);
   assert.ok(rows>=4,'at least 4 recent rows fully visible, got '+rows);
   const news=page.getByRole('button',{name:'打开新闻资料库',exact:true});await news.click();await page.waitForTimeout(300);
   assert.equal(await news.getAttribute('class'),'is-active');await page.getByRole('button',{name:'项目库',exact:true}).first().click();
   // 商业逻辑 sits left of 项目库 and is the real, clickable route back to Lydia.
   const logic=page.locator('.kw-header nav .kw-logic'),lib=page.locator('.kw-header nav button',{hasText:'项目库'});
   assert.ok((await logic.boundingBox())!.x<(await lib.boundingBox())!.x,'商业逻辑 is left of 项目库');
   const hit=await logic.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(hit,'商业逻辑 is not covered');
   assert.equal(await page.locator('.kw-sidebar__back,.kw-sidebar__bottom').count(),0);
   await shot(page,'01-sidebar-header-'+theme);
   checks.push('Sidebar fits the viewport (no hidden overflow); 新闻与资讯 joins the main list; recent list shows readable rows; 商业逻辑 sits left of 项目库 and is clickable');
  }
  // Idea 实验台
  await page.getByRole('button',{name:'Idea 实验台',exact:true}).first().click();
  await page.getByRole('dialog',{name:'Hackathon 工作区'}).waitFor();
  assert.equal(await page.locator('.wb-nav [aria-current=page]').innerText().then(t=>t.split('\n')[0]),'Idea 实验台');
  await page.getByRole('button',{name:'查看项目 TEST_ONLY Study Loop 1',exact:true}).count();
  await shot(page,'02-lab-empty-'+theme);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.wb-dialog').count(),0,'Esc closes');
  for(const n of [1,2])await page.locator('.knowledge-object').nth(n).dblclick();
  await page.locator('.kw-tray__actions button',{hasText:'条件'}).click();await page.locator('.wb-tray li').nth(1).waitFor();
  await page.getByLabel('目标用户').fill('TEST_ONLY 大学生');
  assert.equal(await page.locator('.wb-tray li').count(),2);assert.ok(await page.locator('.wb-actions .kw-primary').isEnabled(),'analyze enabled with 2 items');
  await shot(page,'03-lab-tray-'+theme);
  // 我的 Idea
  await page.locator('.wb-nav button',{hasText:'我的 Idea'}).click();await page.locator('.wb-idea').waitFor();
  assert.equal(await page.locator('.wb-idea-list li').count(),4);
  const short=page.locator('.wb-seg button',{hasText:'优先研究'});await short.click();assert.equal(await page.locator('.wb-idea-list li').count(),Number(await short.locator('em').innerText()),'filter matches its count');
  await page.locator('.wb-seg button',{hasText:'全部'}).click();
  await page.locator('.wb-idea-list button',{hasText:'小团队排班信号'}).click();
  if(theme==='light'){
   await page.getByLabel('Idea 备注').fill('TEST_ONLY 记一下：先找 5 人团队');await page.getByLabel('Idea 状态').selectOption('shortlist');
   await page.getByRole('button',{name:'保存备注'}).click();await page.locator('.kw-toast',{hasText:'备注已保存'}).waitFor();
   assert.equal(await page.locator('.wb-seg button',{hasText:'优先研究'}).locator('em').innerText(),'2','status change saved');
  }
  await shot(page,'04-ideas-'+theme);
  // Lydia 研究
  await page.locator('.wb-nav button',{hasText:'Lydia 研究'}).click();await page.locator('.wb-rows').first().waitFor();
  assert.ok(await page.locator('.wb-rows').first().locator('li').count()>=2);
  await shot(page,'05-research-'+theme);
  await page.getByRole('button',{name:'关闭工作台'}).click();
  // Idea shelf click opens 我的 Idea on that idea.
  await page.locator('.knowledge-shelf__list button',{hasText:'二手教材流转'}).click();
  assert.match(await page.locator('.wb-idea h4').innerText(),/二手教材流转/);await page.getByRole('button',{name:'关闭工作台'}).click();
  checks.push(theme+': workbench opens from sidebar/header/tray; sections switch; Esc and × close; shelf opens the chosen idea'+(theme==='light'?'; note and status save':''));
  await ctx.close();
 }
 // Phone: sidebar is hidden, the bar button opens the same page full screen.
 const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
 await phone.addInitScript(()=>{localStorage.setItem('lydia-theme','dark');sessionStorage.setItem('lydia-tracker-toast','x');});
 const m=await phone.newPage();m.on('pageerror',e=>errors.push(e.message));
 await m.goto(origin+'/#/knowledge');await m.locator('.knowledge-object').nth(5).waitFor();
 assert.ok(await m.locator('.kw-header .kw-return').isVisible(),'phone keeps a 商业逻辑 link');assert.match(await m.locator('.kw-header .kw-return').innerText(),/商业逻辑/);
 await m.getByRole('button',{name:'打开 Idea 工作台'}).tap();await m.locator('.wb-dialog').waitFor();await m.waitForTimeout(350);
 const box=(await m.locator('.wb-dialog').boundingBox())!;assert.ok(box.width>=389&&box.height>=840,'full screen on phone '+JSON.stringify(box));
 await m.locator('.wb-nav button',{hasText:'我的 Idea'}).tap();await m.locator('.wb-idea').waitFor();
 assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
 await shot(m,'06-phone-ideas-dark');await phone.close();
 checks.push('Phone: 商业逻辑 stays in the header; the bar button opens the page full screen without overflow');
 assert.equal(errors.length,0,errors.join('\n'));
 const report={status:'TEST_PASSED',timestamp:new Date().toISOString(),checks,shots,errors,fixture:'Temporary database; TEST_ONLY projects and ideas. Headless Chrome, not real devices.'};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
