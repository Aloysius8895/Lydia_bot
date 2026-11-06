import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const here=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=createRequire(path.resolve(here,'../../business/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],measurements=[];
const url=pathToFileURL(path.join(here,'reference.html')).href;
const oldURL=pathToFileURL(path.resolve(here,'../mobile-liquid-glass-2026-11-06/reference.html')).href;
const scrollBottom=page=>page.evaluate(()=>document.querySelectorAll('.screen[data-screen=home] .home-content,.screen[data-screen=settings] .home-content').forEach(e=>e.scrollTop=e.scrollHeight));
const content=page=>page.evaluate(()=>['.expert','.user-bubble','.assistant-bubble','.task-strip','.file','.setting-row','.project-title','.metric'].map(selector=>[selector,[...document.querySelectorAll(selector)].map(e=>e.textContent.replace(/\s+/g,' ').trim())]));
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
  for(const [i,id]of ['home','chat','detail','sources','settings','dark'].entries()){
    await page.goto(url+'?screen='+id);await page.evaluate(()=>document.fonts.ready);await scrollBottom(page);
    await page.screenshot({path:path.join(here,`${String(i+1).padStart(2,'0')}-${id}.png`)});
    const layout=await page.evaluate(()=>{
      const screen=document.querySelector('.selected'),nav=screen.querySelector('.nav'),area=screen.querySelector('.home-content'),input=screen.querySelector('.composer');
      return {horizontalOverflow:document.documentElement.scrollWidth>innerWidth,navTop:nav?.getBoundingClientRect().top,contentBottom:area?.getBoundingClientRect().bottom,inputBottom:input?.getBoundingClientRect().bottom,homeIndicatorTop:screen.querySelector('.home-indicator').getBoundingClientRect().top};
    });
    if(layout.horizontalOverflow||layout.navTop&&layout.contentBottom>layout.navTop||layout.inputBottom&&layout.inputBottom>layout.homeIndicatorTop)throw new Error('Layout overlap: '+id);
    measurements.push({screen:id,...layout});
  }
  await page.goto(url);const revised=await content(page);await page.goto(oldURL);const previous=await content(page);
  if(JSON.stringify(revised)!==JSON.stringify(previous))throw new Error('Existing Lydia content changed');
  for(const id of ['home','chat']){
    await page.goto(oldURL+'?screen='+id);await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(here,`before-${id}.png`)});
  }
  await page.goto(url+'?screen=chat&call=open');await page.screenshot({path:path.join(here,'09-call-entry.png')});
  if(!await page.locator('.selected .voice-popover').isVisible())throw new Error('Call details not reachable');
  const board=await browser.newPage({viewport:{width:1440,height:1100}});await board.goto(url);await board.evaluate(()=>document.fonts.ready);await scrollBottom(board);
  await board.screenshot({path:path.join(here,'00-mobile-design-overview.png'),fullPage:true});
  const compare=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:44px 50px;background:#171717;color:#f5f0fa;font-family:'Microsoft YaHei',sans-serif;width:1100px}h1{font-size:27px;font-weight:500;margin:0 0 10px}p{font-size:12px;color:#b6a9c1;line-height:1.8}.row{display:grid;grid-template-columns:170px 390px 390px;gap:20px;align-items:start;margin-top:26px}.label{padding-top:25px}h2{font-size:16px;font-weight:500}.tile{background:#252525;border-radius:22px;overflow:hidden}.tile b{display:block;font-size:12px;font-weight:400;padding:14px;color:#c1b2ce}.crop{height:290px;position:relative;overflow:hidden}.crop img{position:absolute;width:390px;bottom:0;left:0}.after{color:#e5d3fa!important}.footer{margin-top:28px;border-top:1px solid #39313f;padding-top:16px}</style><h1>两处调整：底部减负，导航不再压住内容。</h1><p>内容保留 · 液态玻璃导航保留 · 仅设计参考</p><div class="row"><div class="label"><h2>01 / 聊天底部</h2><p>通话移到顶部电话按钮。<br>任务状态去底色，输入区独立留白。</p></div><div class="tile"><b>修改前 · 状态 / 通话 / 输入三层堆叠</b><div class="crop"><img src="before-chat.png"></div></div><div class="tile"><b class="after">修改后 · 底部主要保留输入框</b><div class="crop"><img src="02-chat.png"></div></div></div><div class="row"><div class="label"><h2>02 / 列表与导航</h2><p>内容可独立滚动。<br>列表结尾预留空间，最后一位专家完整可见。</p></div><div class="tile"><b>修改前 · Bob 下方贴近导航</b><div class="crop"><img src="before-home.png"></div></div><div class="tile"><b class="after">修改后 · 列表末尾与导航明确分开</b><div class="crop"><img src="01-home.png"></div></div></div><p class="footer">修改后首页展示已滚到列表末尾的状态。顶部通话按钮的展开效果见 09-call-entry.png。正式应用尚未修改。</p></html>`;
  await writeFile(path.join(here,'comparison.html'),compare);await board.setViewportSize({width:1100,height:960});await board.goto(pathToFileURL(path.join(here,'comparison.html')).href);await board.screenshot({path:path.join(here,'08-spacing-before-after.png'),fullPage:true});
  const report={date:'2026-11-06',status:'REFERENCE_RENDERED',applicationModified:false,contentPreserved:true,checks:['Expert/conversation/task/source/settings/project text unchanged','Content viewport ends above navigation','Input above home indicator','Call description reachable from header button'],errors,measurements};
  await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
