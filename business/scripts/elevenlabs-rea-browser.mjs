// Dedicated public, logged-out observation target. No user browser profile or credentials.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('../audio/elevenlabs/evidence');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--remote-debugging-port=9335','--remote-debugging-address=127.0.0.1']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
try{await page.goto('https://elevenlabs.io/app/create-voice/instant',{waitUntil:'domcontentloaded',timeout:60000});}catch(e){console.log('Navigation: '+e.message.slice(0,160));}
await page.screenshot({path:path.join(out,'instant-voice-page.png'),fullPage:false});
await writeFile(path.join(out,'public-page-observation.json'),JSON.stringify({url:page.url(),title:await page.title(),observedText:(await page.locator('body').innerText()).slice(0,9000),profile:'dedicated logged-out headless Chrome; no uploads, login, synthesis or account changes'},null,2));
console.log(JSON.stringify({ready:true,cdp:'http://127.0.0.1:9335',url:page.url()}));
process.stdin.resume();await new Promise(resolve=>{browser.once('disconnected',resolve);process.stdin.once('data',resolve);process.once('SIGINT',resolve);});await browser.close().catch(()=>{});
