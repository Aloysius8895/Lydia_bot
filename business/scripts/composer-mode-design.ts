// Design preview only: message box with a 完整研究 toggle and a model picker, rendered on the real app
// with a temporary database. The proposed markup/CSS are injected; application code is not changed.
// Usage: node --experimental-strip-types scripts/composer-mode-design.ts [out-dir]
import {chromium,type Page} from 'playwright-core';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {createApp} from '../backend/server.ts';

const out=path.resolve(process.argv[2]||'../pic/composer-mode-2026-11-09');await mkdir(out,{recursive:true});
const PROPOSED=await readFile(path.join(out,'proposed','composer-mode.css'),'utf8');
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-composer-mode-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),localAutoLogin:true,startWorker:false});
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});
const caseRow=(await app.store.createCase('TEST_ONLY 示例项目','TEST_ONLY：输入框设计预览。'))!;

type State={research:boolean;menu:boolean;text:string};
async function open(page:Page){
 await page.goto(origin+'/#/bot/steve?case='+caseRow.id);await page.getByRole('textbox',{name:'Message Steve Blank',exact:true}).waitFor();await page.waitForTimeout(600);
}
async function propose(page:Page,s:State){
 await page.addStyleTag({content:PROPOSED});
 await page.evaluate(s=>{
  const svg=(d:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const flask=svg('<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21.5h11.6a2 2 0 001.7-3L14 9V3"/><path d="M7.5 15h9"/>');
  const chevron=svg('<path d="M6 15l6-6 6 6"/>'),check='✓';
  // Proposal: the 需求研究/顾问问答 dropdown in the header goes away; the mode lives in the message box.
  document.querySelector('[aria-label="研究任务类型"]')?.remove();
  const form=document.querySelector('.grok-composer')!,tools=form.querySelector('.grok-composer__tools')!,right=form.querySelector('.grok-composer__right')!;
  const add=tools.querySelector('.composer__add')!.outerHTML;
  const menu=s.menu?`<div class="composer-menu" role="menu"><h6>模型</h6>
   <button class="row" type="button"><span>Opus 5.5<small>最强，适合复杂判断，较慢</small></span><em></em></button>
   <button class="row is-on" type="button"><span>Sonnet 5.5<small>日常推荐，速度和质量平衡</small></span><em>${check}</em></button>
   <button class="row" type="button"><span>Haiku 5.5<small>最快，适合简单问答</small></span><em></em></button>
   <h6>思考强度</h6><div class="effort"><button type="button" class="is-on">低</button><button type="button">中</button><button type="button">高</button></div>
   <p>聊天回复用这个模型；开启「完整研究」时，专家和最终复核也用它。查询扩展、排序、引用检查仍用 Haiku。</p></div>`:'';
  tools.innerHTML=add+`<button type="button" class="composer-chip${s.research?' is-on':''}" aria-pressed="${s.research}" title="开启后，这条消息会启动 5 位专家的完整研究（联网搜索 + 来源引用）">${flask}完整研究</button>
   <span class="composer-sep"></span>
   <span class="composer-menu-anchor">${menu}<button type="button" class="composer-chip composer-model" aria-haspopup="menu" aria-expanded="${s.menu}"><b>Sonnet 5.5</b><i>低</i>${chevron}</button></span>`;
  const send=right.querySelector('.composer__send')!.outerHTML;
  right.innerHTML=(s.research?'<span class="composer-note">发送后启动 <b>5 位专家</b>完整研究，约 5–15 分钟</span>':'')+send;
  const ta=form.querySelector('textarea') as HTMLTextAreaElement;
  ta.placeholder=s.research?'描述要研究的问题，例如：新加坡中小物流公司在用什么调度工具？':'和 Steve 聊聊你的想法…';
  if(s.text){ta.value=s.text;const b=form.querySelector('.composer__send') as HTMLButtonElement;if(b)b.disabled=false;}
 },s);
 await page.waitForTimeout(300);
}
async function shoot(page:Page,name:string,phone:boolean){
 await page.screenshot({path:path.join(out,name+'.png')});
 const box=await page.locator('.grok-composer-wrap').boundingBox();
 if(box&&!phone){const top=Math.max(0,box.y-330);await page.screenshot({path:path.join(out,name+'-closeup.png'),clip:{x:Math.max(0,box.x),y:top,width:box.width,height:box.y+box.height-top}});}
}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const shots:[string,'light'|'dark',boolean,State|null][]=[
  ['light-desktop-before','light',false,null],
  ['light-desktop-chat','light',false,{research:false,menu:false,text:''}],
  ['light-desktop-research-on','light',false,{research:true,menu:false,text:'帮我调查新加坡中小物流公司实际在用什么调度工具、痛点是什么'}],
  ['light-desktop-model-menu','light',false,{research:false,menu:true,text:''}],
  ['dark-desktop-before','dark',false,null],
  ['dark-desktop-chat','dark',false,{research:false,menu:false,text:''}],
  ['dark-desktop-research-on','dark',false,{research:true,menu:false,text:'帮我调查新加坡中小物流公司实际在用什么调度工具、痛点是什么'}],
  ['dark-desktop-model-menu','dark',false,{research:false,menu:true,text:''}],
  ['light-phone-before','light',true,null],
  ['light-phone-chat','light',true,{research:false,menu:false,text:''}],
  ['light-phone-research-on','light',true,{research:true,menu:false,text:'帮我调查新加坡中小物流公司的调度痛点'}],
  ['light-phone-model-menu','light',true,{research:false,menu:true,text:''}],
 ];
 for(const [name,theme,phone,state] of shots){
  const ctx=await browser.newContext(phone?{viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true}:{viewport:{width:1906,height:890}});
  await ctx.addInitScript(t=>localStorage.setItem('lydia-theme',t),theme);
  const page=await ctx.newPage();await open(page);
  if(state)await propose(page,state);
  await shoot(page,name,phone);await ctx.close();
 }
 console.log('written to',out);
}finally{await browser.close();server.close();await app.close();}
