// Renders only this isolated design reference. Does not import or modify the app.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(here,'../../business/package.json'));
const {chromium}=require('playwright-core');
const url=pathToFileURL(path.join(here,'reference.html')).href;
const shots=[
 ['01-projects-overview-dark','theme=dark'],
 ['02-projects-zone-dark','theme=dark&focus=ethglobal'],
 ['03-news-overview-dark','theme=dark&floor=news'],
 ['04-news-zone-dark','theme=dark&floor=news&focus=security'],
 ['05-topdown-dark','theme=dark&view=top'],
 ['06-projects-overview-light','theme=light'],
 ['07-news-zone-light','theme=light&floor=news&focus=business_finance&select=Anthropic IPO 估值承压'],
 ['08-alt-color-by-topic-dark','theme=dark&color=topic'],
];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],report={date:'2026-11-09',artifact:'DESIGN_REFERENCE_ONLY',applicationModified:false,viewport:'1280x890 (iPad landscape, as in user screenshot) @2x; phone 390x844 @3x',shots:[],errors};
try{
 const page=await browser.newPage({viewport:{width:1280,height:890},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
 for(const [name,q] of shots){await page.goto(url+'?'+q);await page.waitForFunction(()=>window.__ready);await page.waitForTimeout(250);await page.screenshot({path:path.join(here,name+'.png')});report.shots.push(name);}
 // drag-pan smoothness probe: frame intervals while panning (headless Chrome, indicative only)
 await page.goto(url+'?theme=dark');await page.waitForFunction(()=>window.__ready);
 await page.evaluate(()=>{window.__f=[];let l=performance.now();const t=n=>{window.__f.push(n-l);l=n;if(window.__f.length<200)requestAnimationFrame(t);};requestAnimationFrame(t);});
 await page.mouse.move(640,450);await page.mouse.down();for(let i=0;i<120;i++)await page.mouse.move(640-i*3,450-i*1.5);await page.mouse.up();
 for(let i=0;i<20;i++)await page.mouse.wheel(0,-40);
 const f=await page.evaluate(()=>window.__f.slice(5));f.sort((a,b)=>a-b);
 report.panProbe={frames:f.length,medianMs:+f[Math.floor(f.length/2)].toFixed(2),p95Ms:+f[Math.floor(f.length*.95)].toFixed(2)};
 const svgNodes=await page.evaluate(()=>document.querySelectorAll('#world *').length);report.svgNodes=svgNodes;
 const phone=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});phone.on('pageerror',e=>errors.push(e.message));
 for(const [name,q] of [['09-phone-projects-dark','theme=dark&device=phone'],['10-phone-news-zone-dark','theme=dark&device=phone&floor=news&focus=security']]){await phone.goto(url+'?'+q);await phone.waitForFunction(()=>window.__ready);await phone.waitForTimeout(250);await phone.screenshot({path:path.join(here,name+'.png')});report.shots.push(name);}
}finally{await browser.close();}
await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
