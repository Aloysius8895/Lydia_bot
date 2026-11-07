import {chromium} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:4318';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1586,height:992}});
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin+'/#/knowledge');
 await page.getByRole('main',{name:'知识库工作区'}).waitFor();
 const projectCount=await page.evaluate(()=>fetch('/api/knowledge/projects').then(r=>r.json()).then(r=>r.total));
 if(projectCount===0)await page.getByText('项目书库，等待你的第一批案例',{exact:true}).waitFor();
 else await page.locator('.knowledge-object').first().waitFor();
 await page.getByText('已连接 · 每分钟同步',{exact:true}).waitFor();
 await page.screenshot({path:'../pic/hackathon-idea-lab-2026-11-08/implemented/live-empty-library.png',fullPage:true});
 await page.getByRole('button',{name:'新闻资料',exact:true}).click();
 const newsCount=await page.evaluate(()=>fetch('/api/knowledge/news').then(r=>r.json()).then(r=>r.total));
 await page.getByRole('button',{name:/添加新闻/}).click();
 await page.getByRole('dialog',{name:'添加新闻资料'}).waitFor();
 await page.getByRole('button',{name:'关闭添加新闻',exact:true}).click();
 const sync=await page.evaluate(async()=>{
  const auth=await fetch('/api/auth/status').then(r=>r.json());
  return fetch('/api/knowledge/obsidian/sync',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':auth.csrf},body:'{}'}).then(r=>r.json());
 });
 await page.screenshot({path:'../pic/hackathon-idea-lab-2026-11-08/implemented/live-news-library.png',fullPage:true});
 await page.locator('.kw-brand').click();await page.locator('.sidebar').waitFor({state:'visible'});
 const report={status:'TEST_PASSED',url:origin+'/#/knowledge',emptyLibrary:projectCount===0,projects:projectCount,news:newsCount,newsFormAvailable:true,obsidianConnected:true,obsidianSync:sync,returnToLydia:true,pageErrors:errors};
 await writeFile('../pic/hackathon-idea-lab-2026-11-08/implemented/live-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
