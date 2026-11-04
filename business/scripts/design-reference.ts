import http from 'node:http';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {businessRoot} from '../shared/config.ts';

// Read-only preview of the user's existing build. No legacy API middleware/model calls.
const root=path.join(businessRoot,'frontend','dist'),out=path.join(businessRoot,'test-results');
if(existsSync(path.join(businessRoot,'docs','verification','original-frontend-reference.json')))throw new Error('Original design baseline is already recorded; refusing to overwrite historical evidence.');
await mkdir(out,{recursive:true});
const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url!,'http://local').pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)||name.startsWith('/api/'))throw Error('Unavailable');res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},colorScheme:'light'});
 await page.goto(origin+'/#/bot/steve');await page.locator('.chat-header__title').waitFor();await page.screenshot({path:path.join(out,'design-reference-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/#/');await page.locator('.m-home__title').waitFor();await page.screenshot({path:path.join(out,'design-reference-mobile.png'),fullPage:true});
 const files=['src/styles.css','src/components/Avatars.jsx','src/components/Sidebar.jsx','src/components/Conversation.jsx','src/components/MobileHome.jsx','src/App.jsx'];
 const hashes=await Promise.all(files.map(async file=>({file,sha256:createHash('sha256').update(await readFile(path.join(businessRoot,'frontend',file))).digest('hex')})));
 await writeFile(path.join(businessRoot,'docs','verification','original-frontend-reference.json'),JSON.stringify({timestamp:new Date().toISOString(),status:'CAPTURED',source:'User existing frontend/dist, before RAG integration',screenshots:['../../test-results/design-reference-desktop.png','../../test-results/design-reference-mobile.png'],files:hashes,modelCalls:0},null,2));
 console.log('Original desktop/mobile design references captured; no API/model requests.');
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
