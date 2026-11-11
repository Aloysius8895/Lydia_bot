// Renders only this isolated design reference. Does not import or modify the app.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(here,'../../business/package.json'));
const {chromium}=require('playwright-core');
const url=pathToFileURL(path.join(here,'tracker.html')).href;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files']});
const errors=[],shots=[];
try{
 const run=async(name,q,vp,dsf)=>{const p=await browser.newPage({viewport:vp,deviceScaleFactor:dsf});p.on('pageerror',e=>errors.push(name+': '+e.message));p.on('requestfailed',r=>errors.push(name+': failed '+r.url()));
  await p.goto(url+'?'+q);await p.waitForFunction(()=>window.__ready);await p.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>i.onload=i.onerror=r))));await p.waitForTimeout(150);
  const overflow=await p.evaluate(()=>[...document.querySelectorAll('.list')].map(l=>({visible:l.clientHeight,content:l.scrollHeight})));
  await p.screenshot({path:path.join(here,name+'.png'),fullPage:q.includes('board')});shots.push({name,overflow});await p.close();};
 const tab={width:1280,height:890};
 await run('01-new-capture-toast-dark','state=closed',tab,2);
 await run('02-panel-open-dark','state=open',tab,2);
 await run('03-card-states-dark','state=board',{width:1280,height:890},2);
 await run('04-panel-open-light','state=open&theme=light',tab,2);
 await run('05-card-states-light','state=board&theme=light',{width:1280,height:890},2);
 await run('06-phone-sheet-dark','device=phone',{width:390,height:844},3);
}finally{await browser.close();}
const report={date:'2026-11-09',artifact:'DESIGN_REFERENCE_ONLY',applicationModified:false,greenCardsFrom:'data/data_storage/raw_imports/grok/2026-11-07_08/lydia-import-2026-11-07_08.json',yellowCards:'placeholder events labelled 示例',shots,errors};
await writeFile(path.join(here,'render-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
