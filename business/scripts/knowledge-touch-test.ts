import {chromium} from 'playwright-core';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {seedKnowledge} from '../tests/knowledge-fixture.ts';
const out=path.resolve('../pic/knowledge-iso-warehouse-2026-11-09/implemented/regression');await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-touch-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
app=await createApp({origin,dataDir:path.join(temp,'pg'),crawlStorageDir:path.join(temp,'crawl'),localAutoLogin:true,startWorker:false});
await seedKnowledge(app.store,24);
(app.cli as any).auth=async()=>({loggedIn:true,subscriptionType:'TEST_ONLY'});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const checks:any[]=[],errors:string[]=[];
try{
 for(const viewport of [{width:390,height:844},{width:1024,height:900}]){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await context.addInitScript(()=>localStorage.setItem('lydia-theme','dark'));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/knowledge');await page.locator('.knowledge-object').nth(23).waitFor();
  const scene=page.locator('.knowledge-scene__viewport'),world=page.locator('.knowledge-scene__world'),client=await context.newCDPSession(page);
  const box=(await scene.boundingBox())!,cx=box.x+box.width*.52,cy=box.y+box.height*.55;
  const zoom=async()=>Number((await page.getByLabel('空间缩放比例',{exact:true}).innerText()).replace('%',''));
  // The overview button now glides the camera; wait until it settles.
  const overview=async()=>{await page.getByRole('button',{name:'查看整个书库',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="空间缩放比例"]')?.textContent==='100%');await page.waitForTimeout(80);};
  const frame=async()=>world.evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,scale:new DOMMatrix(getComputedStyle(e).transform).a};});
  const touch=async(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',points:{id:number;x:number;y:number}[])=>{await client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:7,radiusY:7,force:1}))});};
  const pinch=async(from:number,to:number)=>{
   await touch('touchStart',[{id:1,x:cx-from,y:cy},{id:2,x:cx+from,y:cy}]);
   for(let i=1;i<=6;i++){const d=from+(to-from)*i/6;await touch('touchMove',[{id:1,x:cx-d,y:cy},{id:2,x:cx+d,y:cy}]);}
   await touch('touchEnd',[]);
  };
  const before=await frame(),anchor={x:(cx-before.x)/before.scale,y:(cy-before.y)/before.scale};
  await pinch(35,80);assert.ok(await zoom()>180,'Fingers spreading must enlarge scene');
  const enlarged=await frame();assert.ok(Math.abs((cx-enlarged.x)/enlarged.scale-anchor.x)<2,'Zoom stays anchored under fingers');assert.ok(Math.abs((cy-enlarged.y)/enlarged.scale-anchor.y)<2);
  const enlargedZoom=await zoom();await pinch(80,35);assert.ok(await zoom()<enlargedZoom,'Pinching inward must shrink scene');
  await pinch(8,80);assert.equal(await zoom(),400);
  await pinch(80,2);assert.equal(await zoom(),50);
  await overview();assert.equal(await zoom(),100);
  const panBefore=await frame();
  await touch('touchStart',[{id:3,x:cx,y:cy}]);await touch('touchMove',[{id:3,x:cx+40,y:cy-20}]);await touch('touchEnd',[]);
  const panAfter=await frame();assert.ok(Math.abs(panAfter.x-panBefore.x-40)<2);assert.ok(Math.abs(panAfter.y-panBefore.y+20)<2);
  await touch('touchStart',[{id:4,x:cx-25,y:cy},{id:5,x:cx+25,y:cy}]);await touch('touchCancel',[]);
  await overview();
  const project=page.locator('.knowledge-object').first();const projectLabel=(await project.getAttribute('aria-label'))!.replace('查看项目 ','');
  await page.evaluate(()=>{(window as any).__touchEvents=[];for(const type of ['pointerdown','pointerup','pointermove','pointercancel','lostpointercapture'])document.querySelector('.knowledge-scene__viewport')!.addEventListener(type,(event:any)=>{(window as any).__touchEvents.push({type:event.type,id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target.tagName});});});
  const objectBox=(await project.boundingBox())!,px=objectBox.x+objectBox.width/2,py=objectBox.y+objectBox.height/2,oldTitle=await page.locator('.kw-detail h2').innerText();
  await touch('touchStart',[{id:6,x:px,y:py},{id:7,x:px+40,y:py}]);await touch('touchMove',[{id:6,x:px-15,y:py},{id:7,x:px+70,y:py}]);
  const beforeLift=await frame();
  // CDP touchEnd releases all contacts. Exercise one-contact release with the
  // browser PointerEvent that actual touch hardware emits for that finger.
  const secondPointer=await page.evaluate(()=>(window as any).__touchEvents.filter((e:any)=>e.type==='pointerdown').at(-1).id);
  await scene.dispatchEvent('pointerup',{pointerId:secondPointer,pointerType:'touch',clientX:px+70,clientY:py,button:0,buttons:0});
  await touch('touchMove',[{id:6,x:px+5,y:py+10}]);await touch('touchEnd',[]);
  const afterLift=await frame();assert.ok(Math.abs(afterLift.x-beforeLift.x-20)<2);assert.ok(Math.abs(afterLift.y-beforeLift.y-10)<2);
  assert.equal(await page.locator('.kw-detail h2').innerText(),oldTitle,'Pinch over project must not activate project');
  await overview();
  await project.tap();assert.equal(await page.locator('.kw-detail h2').innerText(),projectLabel);
  assert.equal(await page.evaluate(()=>window.visualViewport!.scale),1,'Scene pinch must not zoom whole page');
  const palette=await page.locator('.knowledge-workspace').evaluate(el=>{const s=getComputedStyle(el);return{background:s.getPropertyValue('--kw-bg').trim(),floor:s.getPropertyValue('--ks-floor').trim(),zone:s.getPropertyValue('--ks-zone').trim(),active:s.getPropertyValue('--kw-active').trim()};});
  assert.deepEqual(palette,{background:'#080808',floor:'#0f1215',zone:'#121519',active:'#292929'});
  // Long press lifts a material and carries it into the tray (no native drag preview, no pan).
  const traySize=()=>page.locator('.kw-tray__items>span').count(),tray=page.getByLabel('分析托盘',{exact:true});
  const carry=async(target:import('playwright-core').Locator,id:number,shotName='')=>{
   const tb=(await target.boundingBox())!,sx=tb.x+tb.width/2,sy=tb.y+tb.height/2;
   await touch('touchStart',[{id,x:sx,y:sy}]);await page.waitForTimeout(480);
   assert.equal(await page.locator('.lydia-drag-ghost.is-up').count(),1,'long press lifts a book card');
   let x=sx,y=sy;
   for(let i=0;i<40;i++){
    const t=(await tray.boundingBox())!,vh=viewport.height;
    // Tray below the fold: hold at the bottom edge and let the page auto-scroll.
    const ty=t.y+t.height/2>vh-30?vh-12:t.y+t.height/2,tx=t.x+Math.min(60,t.width/2);
    const nx=x+(tx-x)/3,ny=y+(ty-y)/3;x=nx;y=ny;await touch('touchMove',[{id,x,y}]);await page.waitForTimeout(40);
    const g=await page.locator('.lydia-drag-ghost').evaluate(e=>{const m=new DOMMatrix(getComputedStyle(e).transform);return{x:m.e,y:m.f};});assert.ok(Math.abs(g.x-(x-28))<2&&Math.abs(g.y-(y-74))<2,'card stays with the finger '+JSON.stringify({g,x,y}));
    if(await page.locator('.kw-tray.is-over').count()&&Math.hypot(tx-x,ty-y)<4)break;
   }
   assert.equal(await page.locator('.kw-tray.is-over').count(),1,'tray highlights under the finger');
   if(shotName)await page.screenshot({path:path.join(out,shotName),animations:'allow'});
   await touch('touchEnd',[]);await page.waitForTimeout(450);
   assert.equal(await page.locator('.lydia-drag-ghost').count(),0,'card is removed after the drop');
  };
  await page.evaluate(()=>{(window as any).__nativeDrag=0;document.addEventListener('dragstart',()=>(window as any).__nativeDrag++,true);});
  await overview();
  // The tray persists between sessions, so pick materials that are not already in it.
  const inTray=async()=>page.locator('.kw-tray-label').allInnerTexts();
  const fresh=async(sel:string,title:(e:import('playwright-core').Locator)=>Promise<string>)=>{const used=await inTray(),all=page.locator(sel);for(let i=0;i<await all.count();i++)if(!used.includes(await title(all.nth(i))))return all.nth(i);throw Error('no fresh material');};
  const n0=await traySize(),book=await fresh('.knowledge-object',async e=>(await e.getAttribute('aria-label'))!.replace('查看项目 ','')),cam0=await frame();
  await carry(book,8,(viewport.width<760?'phone':'tablet')+'-long-press-drag.png');
  assert.equal(await traySize(),n0+1,'book dropped from the scene lands in the tray');
  const cam1=await frame();assert.ok(Math.abs(cam1.x-cam0.x)<1&&Math.abs(cam1.scale-cam0.scale)<.001,'lifting does not pan the scene');
  assert.equal(await page.locator('.ks-item.is-lifted').count(),0);
  await page.evaluate(()=>document.querySelector('.knowledge-workspace')!.scrollTo(0,0));
  await page.getByRole('button',{name:'列表',exact:true}).tap();await page.locator('.kw-project-list article').nth(4).waitFor();
  await carry(await fresh('.kw-project-list article',e=>e.locator('.kw-list-title strong').innerText()),9);
  assert.equal(await traySize(),n0+2,'list row long press also lands in the tray');
  assert.equal(await page.evaluate(()=>(window as any).__nativeDrag),0,'touch never starts a native drag');
  await page.evaluate(()=>document.querySelector('.knowledge-workspace')!.scrollTo(0,0));
  await page.locator('.kw-toast button').click().catch(()=>{});
  await page.getByRole('button',{name:'等距',exact:true}).tap();await page.locator('.knowledge-object').nth(23).waitFor();await overview();
  await pinch(35,65);
  const name=viewport.width<760?'phone-black-pinch.png':'tablet-black-pinch.png';
  await page.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});
  checks.push({viewport,spreading:true,pinching:true,anchorStable:true,range:'50–400%',singleFingerPan:true,pinchToPanStable:true,noAccidentalSelection:true,cancelRecovery:true,tapSelection:true,pageZoomUnchanged:true,longPressDragToTray:'scene + list',palette,screenshot:name});
  await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));
 const report={status:'TEST_PASSED',timestamp:new Date().toISOString(),checks,pageErrors:errors,fixture:'Native Chromium pinch/pan via CDP; partial-contact release uses a dispatched PointerEvent because CDP touchEnd releases all contacts. Temporary database and TEST_ONLY projects. Not actual iPhone/iPad hardware.'};
 await writeFile(path.join(out,'touch-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
