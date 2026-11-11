// v5 warehouse + hackathon tracker regression on the real React app.
// Temporary database only: real local Grok packages are read (never modified)
// and three TEST_ONLY tracked events are added so every card state is visible.
import {chromium,type Page} from 'playwright-core';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {parseFile} from '../../data/data_preprocessing/imports/parse.ts';
import {FileImports} from '../../data/data_preprocessing/imports/store.ts';

const out=path.resolve('../pic/knowledge-iso-warehouse-2026-11-09/implemented');await mkdir(out,{recursive:true});
const raw=path.resolve('../data/data_storage/raw_imports/grok/2026-11-07_08');
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-warehouse-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),startWorker:false,localAutoLogin:true});
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});
const files=[];
for(const name of ['lydia-import-2026-11-07_08.json','lydia-news-2026-11-07_08.json'])if(existsSync(path.join(raw,name)))files.push(parseFile(name,await readFile(path.join(raw,name))));
assert.ok(files.length===2,'local Grok packages are required for this visual regression');
const day=86400000,iso=(ms:number)=>new Date(Date.now()+ms).toISOString();
const events=[
 {type:'hackathon_event',id:'TEST_ONLY-agents-week',platform:'Devfolio',name:'TEST_ONLY 示例 AI Agents Build Week',source_urls:['https://example.org/TEST_ONLY/agents'],submission_deadline:iso(2.6*day),event_dates:'TEST_ONLY'},
 {type:'hackathon_event',id:'TEST_ONLY-winter-online',platform:'ETHGlobal',name:'TEST_ONLY 示例 冬季线上黑客松',source_urls:['https://example.org/TEST_ONLY/winter'],submission_deadline:iso(13.6*day)},
 {type:'hackathon_event',id:'TEST_ONLY-city',platform:'TAIKAI',name:'TEST_ONLY 示例 Solana 城市黑客松',source_urls:['https://example.org/TEST_ONLY/city'],submission_deadline:iso(-7*day)},
 {type:'hackathon_event',id:'TEST_ONLY-mumbai-track',platform:'ETHGlobal',name:'ETHGlobal Mumbai 2026',source_urls:['https://example.org/TEST_ONLY/mumbai'],submission_deadline:'2026-11-07T23:59:00+05:30',event_dates:'2026-11-05~07'}
];
files.push(parseFile('TEST_ONLY-events.json',Buffer.from(JSON.stringify({events}))));
const imported=await new FileImports(app.store).execute(files);
assert.equal(imported.counts.failed,0);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors:string[]=[],checks:string[]=[],shots:string[]=[];
const shot=async(page:Page,name:string)=>{await page.waitForTimeout(700);await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});shots.push(name+'.png');};
const rects=(page:Page,sel:string)=>page.locator(sel).evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,t:(e.textContent||'').trim()};}));
const overlap=(a:any,b:any,pad=0)=>a.x+pad<b.x+b.w&&b.x+pad<a.x+a.w&&a.y+pad<b.y+b.h&&b.y+pad<a.y+a.h;
try{
 const context=await browser.newContext({viewport:{width:1280,height:890},deviceScaleFactor:2});
 await context.addInitScript(()=>{try{if(!localStorage.getItem('lydia-theme'))localStorage.setItem('lydia-theme','dark');}catch{}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(origin+'/#/knowledge');
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length===37);
 await page.waitForTimeout(400);
 assert.equal(await page.locator('.ks-zone-g').count(),9,'one zone per platform');
 // Hit-test the centre of every glyph of every zone label: the topmost painted
 // element there must be the label itself, never a book drawn on top of it.
 const noClip=async()=>{
  const covered=await page.evaluate(()=>{
   const style=document.createElement('style');style.textContent='.knowledge-scene__svg *{pointer-events:auto!important}.ks-hits,.ks-labels,.knowledge-scene__legend{visibility:hidden!important}';document.head.append(style);
   const bad:string[]=[];let checked=0;
   for(const t of document.querySelectorAll<SVGTextElement>('.ks-zname,.ks-zcount')){
    const m=t.getScreenCTM()!;
    for(let i=0;i<t.getNumberOfChars();i++){const b=t.getExtentOfChar(i),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m);
     if(p.x<0||p.y<0||p.x>innerWidth||p.y>innerHeight)continue;checked++;const top=document.elementFromPoint(p.x,p.y);if(top?.closest('.ks-item'))bad.push(t.textContent+'#'+i);}
   }
   style.remove();return {bad,checked};
  });
  assert.ok(covered.checked>20,'label glyphs were sampled');assert.deepEqual(covered.bad,[],'books painted over zone labels');
 };
 await noClip();checks.push('37 real Grok projects render as 9 platform zones; no book covers a zone label');
 const toast=page.locator('.kt-toast');await toast.waitFor();assert.match(await toast.innerText(),/AI Agents Build Week/);assert.match(await toast.innerText(),/还剩 3 天/);
 await shot(page,'01-projects-overview-dark');
 await toast.getByRole('button',{name:'稍后',exact:true}).click();await toast.waitFor({state:'detached'});
 checks.push('Newest open tracked event is announced once beside the sidebar button with deadline and days left');
 const zname=(await rects(page,'.ks-zname')).find(r=>r.t==='ETHGLOBAL')!;
 await page.mouse.click(zname.x+zname.w/2,zname.y+zname.h/2);
 await page.locator('.kw-crumb strong',{hasText:'ETHGLOBAL'}).waitFor();await page.waitForTimeout(700);
 const labels=await rects(page,'.ks-name');assert.ok(labels.length>=6,'titles appear once a zone is focused');
 for(let a=0;a<labels.length;a++)for(let b=a+1;b<labels.length;b++)assert.ok(!overlap(labels[a],labels[b]),'labels '+labels[a].t+' / '+labels[b].t+' overlap');
 await noClip();
 await page.getByRole('button',{name:'查看项目 ENShell',exact:true}).click();
 await page.locator('.kw-detail h2',{hasText:'ENShell'}).waitFor();await page.locator('.ks-tag',{hasText:'ENShell'}).waitFor();
 await page.getByRole('button',{name:'查看项目 ENShell',exact:true}).dragTo(page.getByLabel('分析托盘',{exact:true}));
 await page.getByRole('button',{name:'移除 ENShell',exact:true}).waitFor();
 await page.getByRole('button',{name:'查看项目 RupeeRail',exact:true}).dblclick();await page.getByRole('button',{name:'移除 RupeeRail',exact:true}).waitFor();
 await page.locator('.ks-badge').first().waitFor();
 await shot(page,'02-zone-focus-dark');
 checks.push('Clicking a zone flies to it and the breadcrumb follows; titles are readable without overlap; click selects, native drag and double-click add to the tray with numbered badges');
 await page.getByRole('button',{name:'俯视',exact:true}).click();await page.waitForTimeout(900);await noClip();await shot(page,'03-topdown-dark');
 await page.getByRole('button',{name:'等距',exact:true}).click();await page.waitForTimeout(700);
 await page.getByRole('button',{name:'返回总览',exact:true}).click();await page.locator('.kw-crumb strong',{hasText:'全部平台'}).waitFor();
 checks.push('Isometric/top-down morph keeps geometry unclipped; back button returns to the overview');
 await page.locator('.kw-seg').getByRole('button',{name:/新闻资料/}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length===15);await page.waitForTimeout(500);
 const newsZones=(await rects(page,'.ks-zname')).map(r=>r.t);assert.ok(newsZones.includes('安全')&&newsZones.includes('商业与融资'),newsZones.join(','));
 await noClip();await shot(page,'04-news-overview-dark');
 const safety=(await rects(page,'.ks-zname')).find(r=>r.t==='安全')!;await page.mouse.click(safety.x+safety.w/2,safety.y+safety.h/2);
 await page.locator('.kw-crumb strong',{hasText:'安全'}).waitFor();await page.waitForTimeout(700);await shot(page,'05-news-zone-dark');
 checks.push('15 real news items are zoned by category (安全, 商业与融资, …) as flat stacks without label collisions');
 const sideCounts=page.locator('.kw-track__counts');assert.equal(await sideCounts.locator('.is-tracking').innerText(),'3');assert.ok(await sideCounts.locator('.is-results').count());
 await page.locator('.kw-track').click();const panel=page.locator('.kt-panel');await panel.waitFor();
 assert.equal(await panel.locator('.kt-card.is-tracking').count(),3);
 const mumbai=panel.locator('.kt-card.is-results',{hasText:'ETHGlobal Mumbai 2026'});assert.match(await mumbai.innerText(),/Finalist 5/);assert.equal(await mumbai.locator('.kt-note').count(),0,'Mumbai is a tracked event, not a grouping');
 assert.ok(await panel.locator('.kt-card.is-results .kt-note').count()>=1,'unlinked results are labelled as grouped by recorded evidence');
 await page.waitForFunction(()=>!document.querySelector('.kw-track__counts .is-results'));
 await shot(page,'06-tracker-dark');
 await panel.getByRole('button',{name:/已有结果/}).click();await shot(page,'07-tracker-results-dark');
 await mumbai.getByRole('button',{name:/在项目库查看 5 个/}).click();await panel.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length===37);await page.locator('.kw-crumb strong',{hasText:'ETHGLOBAL'}).waitFor();
 const picked=await page.locator('.kw-detail h2').innerText();assert.ok(['CopeyBara','Tap2ETH','RupeeRail','Bramble','Aven'].includes(picked),picked);
 await page.waitForTimeout(600);await shot(page,'08-tracker-jump-dark');
 await page.locator('.kw-track').click();await panel.waitFor();
 await panel.locator('.kt-card',{hasText:'Solana 城市黑客松'}).getByRole('button',{name:'不再追踪',exact:true}).click();
 await panel.locator('.kt-card',{hasText:'Solana 城市黑客松'}).waitFor({state:'detached'});assert.equal(await panel.locator('.kt-card.is-tracking').count(),2);
 await page.getByRole('button',{name:'关闭追踪面板',exact:true}).click();
 checks.push('Tracker: 3 yellow cards (open, ≤3 days, judging) and green tracked + grouped results; opening clears the new-result badge; 在项目库查看 switches floor, focuses the platform zone and selects a finalist; 不再追踪 removes a card');
 await page.getByRole('button',{name:'切换到白天模式',exact:true}).click();await page.getByRole('button',{name:'返回总览',exact:true}).click();await page.waitForTimeout(700);await shot(page,'09-projects-overview-light');
 await page.locator('.kw-track').click();await panel.waitFor();await shot(page,'10-tracker-light');await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
 const box=(await page.locator('.knowledge-scene__viewport').boundingBox())!;
 const probe=page.evaluate(()=>new Promise<number[]>(r=>{const f:number[]=[];let l=performance.now();const t=(n:number)=>{f.push(n-l);l=n;if(f.length<120)requestAnimationFrame(t);else r(f);};requestAnimationFrame(t);}));
 await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7);await page.mouse.down();for(let i=0;i<90;i++)await page.mouse.move(box.x+box.width*.6-i*3,box.y+box.height*.7-i*1.5);await page.mouse.up();
 const during=(await probe).slice(3).sort((a,b)=>a-b);
 const perf={dragMedianMs:+during[Math.floor(during.length/2)].toFixed(2),dragP95Ms:+during[Math.floor(during.length*.95)].toFixed(2),svgNodes:await page.locator('.knowledge-scene__svg *').count()};
 checks.push('Drag pan frame interval median '+perf.dragMedianMs+'ms / p95 '+perf.dragP95Ms+'ms in headless Chrome (indicative only)');
 const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
 await phone.addInitScript(()=>{try{localStorage.setItem('lydia-theme','dark');sessionStorage.setItem('lydia-tracker-toast','dismissed');}catch{}});
 const mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto(origin+'/#/knowledge');await mobile.waitForFunction(()=>document.querySelectorAll('.knowledge-object').length===37);
 assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow on phone');
 await shot(mobile,'11-phone-dark');
 await mobile.getByRole('button',{name:'打开追踪 Hackathon',exact:true}).tap();await mobile.locator('.kt-panel').waitFor();await mobile.waitForTimeout(400);
 const sheet=(await mobile.locator('.kt-panel').boundingBox())!;assert.ok(Math.abs(sheet.y+sheet.height-844)<2&&sheet.width>=388,'tracker is a bottom sheet on phones');
 await shot(mobile,'12-phone-tracker-dark');
 checks.push('Phone 390px: no overflow; the bar wraps; the tracker opens as a bottom sheet from the bar button');
 await phone.close();
 assert.equal(errors.length,0,errors.join('\n'));
 const report={status:'TEST_PASSED',timestamp:new Date().toISOString(),checks,perf,errors,shots,fixture:'Temporary database. Real local Grok packages (37 projects, 15 news) imported read-only; 4 TEST_ONLY tracked events added. Headless Chrome; not real iPad/iPhone hardware.'};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
