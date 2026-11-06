// Renders only this isolated design artifact. Does not import or modify the app.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(here,'../../business/package.json'));
const {chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[];
try{
  const board=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});board.on('pageerror',e=>errors.push(e.message));
  const url=pathToFileURL(path.join(here,'reference.html')).href;
  await board.goto(url);await board.evaluate(()=>document.fonts.ready);await board.screenshot({path:path.join(here,'00-mobile-design-overview.png'),fullPage:true});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
  const measurements=[];
  for(const [i,id]of ['home','chat','detail','sources','settings','dark'].entries()){
    await page.goto(url+'?screen='+id);await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(here,`${String(i+1).padStart(2,'0')}-${id}.png`)});
    const layout=await page.evaluate(()=>{const d=document.querySelector('.selected .device');return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,deviceWidth:d.clientWidth,deviceHeight:d.clientHeight};});
    measurements.push({screen:id,...layout});
  }
  await page.goto(url);
  const proposed=await page.locator('.device').evaluateAll(items=>items.map(item=>item.textContent.replace(/\s+/g,' ').trim()));
  const navs=await page.locator('.nav').first().evaluate(nav=>[0,1,2].map(index=>{const clone=nav.cloneNode(true);[...clone.children].forEach((item,i)=>item.classList.toggle('active',i===index));return clone.outerHTML;}));
  await page.goto(pathToFileURL(path.resolve(here,'../mobile-web-pattern-2026-11-06/reference.html')).href);
  const existing=await page.locator('.device').evaluateAll(items=>items.map(item=>item.textContent.replace(/\s+/g,' ').trim()));
  const contentPreserved=JSON.stringify(proposed)===JSON.stringify(existing);
  if(!contentPreserved)throw new Error('Lydia reference screen content changed');
  const base=(await readFile(path.join(here,'reference.html'),'utf8')).match(/<style>([\s\S]*?)<\/style>/)[1];
  const style=(await readFile(path.join(here,'style.css'),'utf8'))+'\n'+(await readFile(path.join(here,'glass.css'),'utf8'));
  const navigation=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Lydia navigation states</title><style>${base}\n${style}\nbody{padding:45px;width:900px;height:540px;background:#171717}.nav-study{display:flex;align-items:center;gap:35px;margin-top:23px}.nav-study>span{width:180px;font-size:13px;color:#a69bad}.nav-study .nav{position:relative;inset:auto;width:390px;flex:none;margin:0;box-shadow:none}.eyebrow{margin-bottom:12px}h1{font-size:26px;font-weight:500;margin:0 0 24px}</style><div class="eyebrow">LYDIA / LIQUID GLASS NAVIGATION</div><h1>液态透明玻璃，三个选中状态。</h1>${navs.map((nav,i)=>`<div class="nav-study"><span>0${i+1} / ${['会话','项目','设置'][i]}选中</span>${nav}</div>`).join('')}<p style="color:#95889e;font-size:11px;margin-top:35px">仅改变视觉样式 · 导航名称与功能不变 · 非正式应用</p></html>`;
  await writeFile(path.join(here,'navigation.html'),navigation);
  await board.setViewportSize({width:900,height:540});await board.setContent(navigation);await board.screenshot({path:path.join(here,'07-navigation-states.png')});
  const report={date:'2026-11-06',artifact:'DESIGN_REFERENCE_ONLY',applicationModified:false,productionDataUsed:false,contentPreserved,comparison:'All six device text contents exactly match previous reference',reference:'User screenshots: white capsule navigation and charcoal/pastel visual style',dimensions:'390x844 CSS px; single-screen exports at 2x',errors,measurements};
  await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}
