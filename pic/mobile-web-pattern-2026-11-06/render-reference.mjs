// Renders only this isolated design artifact. Does not import or modify the app.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
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
  const report={date:'2026-11-06',artifact:'DESIGN_REFERENCE_ONLY',applicationModified:false,productionDataUsed:false,reference:'../implemented/desktop-light.png',dimensions:'390x844 CSS px; single-screen exports at 2x',errors,measurements};
  await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}
