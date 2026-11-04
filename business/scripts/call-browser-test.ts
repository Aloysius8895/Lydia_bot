// Browser test for the expert call UI. TEST TYPE: automated Chrome headless with Chrome's fake media device,
// an injected FAKE SpeechRecognition and a FAKE speechSynthesis, and a stubbed CLI process. It proves UI states,
// cleanup and routing only. It is NOT real microphone capture, real recognition, audible playback or real inference.
import {chromium,type Page} from 'playwright-core';
import http from 'node:http';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.ts';
import {businessRoot} from '../shared/config.ts';

const out=path.resolve(businessRoot,'..','audio','results');await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'lydia-call-browser-'));
let app:Awaited<ReturnType<typeof createApp>>;
const server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${(server.address() as any).port}`;
app=await createApp({dataDir:path.join(temp,'pg'),casesDir:path.join(temp,'exports'),origin});
app.cli.options.noOverageConfirmed=true;
(app.cli as any).auth=async()=>({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'TEST_ONLY'});
let gate:Promise<void>|null=null,cliCalls=0;
const prompts:string[]=[];
app.cli.process=async(_a:string[],input:string)=>{cliCalls++;prompts.push(input);if(gate)await gate;const role=/你是 (.+?) 方法角色/.exec(input)?.[1]||'?';
  return {stdout:JSON.stringify({type:'result',subtype:'success',structured_output:{spoken_text:`TEST_ONLY ${role} 口语回答：先验证最小诊所的提醒流程。你们现在怎么提醒？`,display_text:`TEST_ONLY ${role} 文字回答（TO_VALIDATE）：先验证最小诊所的提醒流程。`,claims:[{statement:'先验证提醒流程',claim_label:'TO_VALIDATE',basis:'METHOD',evidence_ids:[]}],limitations:['TEST_ONLY 无市场证据'],follow_up_question:'你们现在怎么提醒？',proposed_actions:[{kind:'START_RESEARCH',description:'TEST_ONLY 另开需求研究'}],project_documents_used:[]}}),exit:0};};

const fakes=()=>{
  // TEST_ONLY fakes, injected before page scripts.
  const w=window as any;w.__spoken=[];w.__recStarted=0;w.__recAborted=0;w.__cancelled=0;w.__speakMs=200;
  class FakeRecognition{lang='';continuous=false;interimResults=false;maxAlternatives=1;onresult:any;onend:any;onerror:any;
    start(){w.__recStarted++;w.__rec=this;setTimeout(()=>this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:'我们的客户',confidence:0}],{isFinal:false})]}),40);}
    stop(){setTimeout(()=>{this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:w.__fakeTranscript||'我们的客户是小诊所，预算五千',confidence:0.9}],{isFinal:true})]});this.onend?.();},40);}
    abort(){w.__recAborted++;}}
  if(!w.__noRecognition){w.SpeechRecognition=FakeRecognition;w.webkitSpeechRecognition=FakeRecognition;}else{delete w.SpeechRecognition;delete w.webkitSpeechRecognition;}
  const voice={name:'TEST_ONLY 中文本机音色',lang:'zh-CN',localService:true,voiceURI:'test-zh',default:true};
  const synth={_u:null as any,getVoices:()=>[voice],addEventListener(){},removeEventListener(){},
    speak(u:any){w.__spoken.push(u.text);this._u=u;setTimeout(()=>u.onstart?.(),10);u._t=setTimeout(()=>{if(this._u===u){this._u=null;u.onend?.();}},w.__speakMs);},
    cancel(){w.__cancelled++;const u=this._u;if(u){clearTimeout(u._t);this._u=null;u.onerror?.({error:'interrupted'});}}};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  w.SpeechSynthesisUtterance=class{text:string;lang='';voice:any=null;onstart:any;onend:any;onerror:any;onboundary:any;constructor(t:string){this.text=t;}};
  const real=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async(c:any)=>{if(w.__denyMic)throw new DOMException('TEST_ONLY denied','NotAllowedError');return real!(c);};
};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const context=await browser.newContext({viewport:{width:1440,height:960},colorScheme:'light',acceptDownloads:true});
await context.addInitScript(fakes);
const page=await context.newPage();
const errors:string[]=[],consoleErrors:string[]=[],checks:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const card=(p:Page=page)=>p.getByRole('region',{name:/的语音通话$/});
const latestCall=async(caseId:string)=>(await app.store.one('SELECT * FROM call_sessions WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1',[caseId]))!;
const turnsOf=async(callId:string)=>app.store.rows('SELECT * FROM call_turns WHERE call_id=$1 ORDER BY seq',[callId]);
async function until(fn:()=>Promise<boolean>,label:string,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('timeout: '+label);}
try{
  await page.goto(origin);await page.locator('#auth-form').waitFor();await page.locator('#password').fill('TEST_ONLY-Call-browser-password-42');await page.locator('#auth-submit').click();await page.locator('.sidebar').waitFor();
  const p1=(await app.store.createCase('TEST_ONLY · 诊所提醒','TEST_ONLY 合成：诊所预约提醒'))!,p2=(await app.store.createCase('TEST_ONLY · 另一个项目','TEST_ONLY 隔离'))!;
  await page.goto(`${origin}/#/bot/teresa?case=${p1.id}`);await page.reload();await page.locator('.research-toolbar').waitFor();
  await page.waitForFunction(id=>document.querySelector<HTMLSelectElement>('.research-toolbar select[aria-label="当前研究项目"]')?.value===id,p1.id);

  // Entry placement: same row as project picker / task type / phase tag, at the right end.
  const entry=page.getByRole('button',{name:'与 Teresa Torres 语音通话',exact:true});await entry.waitFor();
  const [bEntry,bSelect,bBar]=await Promise.all([entry.boundingBox(),page.locator('select[aria-label="研究任务类型"]').boundingBox(),page.locator('.research-toolbar').boundingBox()]);
  assert.ok(bEntry&&bSelect&&bBar);assert.ok(Math.abs((bEntry.y+bEntry.height/2)-(bSelect.y+bSelect.height/2))<4,'phone button on the same row');assert.ok(bBar.x+bBar.width-(bEntry.x+bEntry.width)<=26,'phone button right-aligned');
  checks.push('phone entry sits at the right end of the project / 需求研究 / phase row');

  await entry.click();await card().waitFor();
  assert.ok((await card().innerText()).includes('Teresa Torres'));assert.ok((await card().innerText()).includes('TEST_ONLY · 诊所提醒'));
  await card().getByText('未接通',{exact:false}).waitFor();assert.equal(await card().getByLabel('通话时长').innerText(),'--:--','no timer before a session exists');
  await card().getByText('web-speech:SpeechRecognition',{exact:false}).waitFor();assert.ok((await card().innerText()).includes('可能由浏览器厂商的在线服务处理'));
  for(const name of ['关闭朗读','接通 Teresa Torres','开始说话','通话记录'])assert.equal(await card().getByRole('button',{name,exact:true}).count(),1,name);
  assert.equal(await card().getByRole('button',{name:'开始说话',exact:true}).isDisabled(),true,'mic disabled before connecting');
  for(const width of [1388,1440,1920]){await page.setViewportSize({width,height:width===1920?1080:960});
    const cols=await page.evaluate(()=>[document.querySelector('.sidebar')!,document.querySelector('main.main')!,document.querySelector('.research-panel')!].map(e=>e.getBoundingClientRect().width/innerWidth));
    for(const [i,expected] of [.27,.42,.31].entries())assert.ok(Math.abs(cols[i]-expected)<.005,`pane ${i} at ${width}`);
    const box=await card().boundingBox(),main=await page.locator('main.main').boundingBox();assert.ok(box&&main&&box.x>=main.x&&box.x+box.width<=main.x+main.width&&box.width>=320&&box.width<=360);}
  await page.setViewportSize({width:1440,height:960});assert.ok(await page.locator('.sidebar nav[aria-label="Bots"]').isVisible());
  checks.push('card 320–360px inside chat column; 27/42/31 panes and expert list unchanged at 1388/1440/1920');

  await card().getByRole('button',{name:'接通 Teresa Torres',exact:true}).click();await card().getByText('已接通',{exact:false}).waitFor();
  const call1=await latestCall(p1.id);assert.equal(call1.role,'teresa');assert.equal(call1.status,'ACTIVE');
  await page.waitForTimeout(1100);assert.notEqual(await card().getByLabel('通话时长').innerText(),'--:--');
  await page.screenshot({path:path.join(out,'call-desktop-connected.png'),fullPage:true});
  // Voice turn: start → end → editable caption → send → reply → speech.
  await card().getByRole('button',{name:'开始说话',exact:true}).click();await card().getByRole('button',{name:'结束本轮说话',exact:true}).waitFor();
  await card().getByText('正在听',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>(window as any).__recStarted),1);
  await card().getByRole('button',{name:'结束本轮说话',exact:true}).click();
  const draft=card().getByLabel(/识别文字/);await draft.waitFor();await until(async()=>(await draft.inputValue()).includes('预算五千'),'final transcript in caption');
  await draft.fill((await draft.inputValue())+'（每月）');checks.push('mic start/stop produces an editable caption; nothing is sent before the user presses 发送');
  assert.equal((await turnsOf(call1.id)).length,0);
  await card().getByRole('button',{name:'发送',exact:true}).click();
  await card().getByText('TEST_ONLY Teresa Torres 文字回答',{exact:false}).waitFor({timeout:20000});
  await until(async()=>(await page.evaluate(()=>(window as any).__spoken.length))===1,'spoken');
  assert.ok((await page.evaluate(()=>(window as any).__spoken[0])).includes('Teresa Torres 口语回答'));
  await until(async()=>(await turnsOf(call1.id))[0]?.playback?.status==='PLAYED','playback recorded');
  let [t1]=await turnsOf(call1.id);assert.equal(t1.role,'teresa');assert.equal(t1.input_source,'BROWSER_STT');assert.equal(t1.stt.edited,true);assert.equal(t1.stt.provider,'web-speech:SpeechRecognition');assert.equal(t1.stt.processing_location,'BROWSER_VENDOR_SERVICE_POSSIBLE');assert.ok(t1.user_text.endsWith('（每月）'));
  assert.ok(prompts.at(-1)!.includes('teresa-torres-opportunity/SKILL.md'));
  await card().getByText('候选动作（未执行',{exact:false}).waitFor();assert.equal((await app.store.snapshot(p1.id)).tasks.length,0,'proposed research is not started');
  checks.push('voice turn → Teresa skill → reply text + fake speech; playback outcome and edited STT metadata persisted; proposed action not executed');

  // Interrupt playback by pressing the mic, then hang up while listening.
  await page.evaluate(()=>{(window as any).__speakMs=8000;});
  await card().locator('#call-draft').fill('TEST_ONLY 第二句，文字输入');await card().getByRole('button',{name:'发送',exact:true}).click();
  await card().getByText('正在朗读',{exact:false}).waitFor({timeout:20000});
  await card().getByRole('button',{name:'开始说话',exact:true}).click();await card().getByRole('button',{name:'结束本轮说话',exact:true}).waitFor();
  await until(async()=>(await turnsOf(call1.id))[1]?.playback?.status==='INTERRUPTED','interrupted playback recorded');
  assert.equal((await turnsOf(call1.id))[1].input_source,'TEXT');
  await card().getByRole('button',{name:'挂断',exact:true}).click();await card().getByText('通话已结束',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).__recAborted),1,'recognizer aborted on hang-up');
  await until(async()=>(await latestCall(p1.id)).status==='ENDED','call ended in DB');
  checks.push('mic press interrupts speech (INTERRUPTED recorded, not claimed as heard); hang-up aborts recognition and ends the call');

  // Hang up while the expert is thinking: the late answer is discarded and never spoken.
  let release!:()=>void;gate=new Promise<void>(r=>release=r);const spokenBefore=await page.evaluate(()=>(window as any).__spoken.length);
  await card().getByRole('button',{name:'重新拨打 Teresa Torres',exact:true}).click();await card().getByText('已接通',{exact:false}).waitFor();
  const call2=await latestCall(p1.id);await card().getByLabel(/输入文字或使用麦克风/).fill('TEST_ONLY 慢回答');await card().getByRole('button',{name:'发送',exact:true}).click();
  await card().getByText('思考中',{exact:false}).first().waitFor({timeout:15000});await card().getByRole('button',{name:'取消本轮',exact:true}).waitFor();
  await card().getByRole('button',{name:'挂断',exact:true}).click();release();gate=null;await page.waitForTimeout(800);
  assert.equal((await turnsOf(call2.id))[0].status,'CANCELLED');assert.equal((await turnsOf(call2.id))[0].reply,null);assert.equal(await page.evaluate(()=>(window as any).__spoken.length),spokenBefore);
  checks.push('hang-up during THINKING cancels the turn; the late result is discarded and not played');

  // Records: view, export, delete.
  await card().getByRole('button',{name:'通话记录',exact:true}).click();await card().locator('.call-records li').first().waitFor();
  assert.equal(await card().locator('.call-records > ul > li').count(),2);
  const dl=page.waitForEvent('download');await card().getByRole('button',{name:'导出',exact:true}).last().click();const md=await readFile((await (await dl).path())!,'utf8');
  assert.ok(md.includes('不是真人客户访谈'));assert.ok(md.includes('（每月）'));
  page.once('dialog',d=>void d.accept());await card().getByRole('button',{name:'删除',exact:true}).first().click();
  await until(async()=>(await app.store.rows('SELECT id FROM call_sessions WHERE case_id=$1',[p1.id])).length===1,'record deleted');
  await card().getByRole('button',{name:'返回通话',exact:true}).click();
  checks.push('call records list, Markdown export with source note, and delete');

  // Switching project ends the active call and closes the card.
  await card().getByRole('button',{name:'重新拨打 Teresa Torres',exact:true}).click();await card().getByText('已接通',{exact:false}).waitFor();const call3=await latestCall(p1.id);
  await page.locator('.research-toolbar select[aria-label="当前研究项目"]').selectOption(p2.id);
  await until(async()=>(await card().count())===0,'card closed on project switch');await until(async()=>(await app.store.one('SELECT status FROM call_sessions WHERE id=$1',[call3.id]))!.status==='ENDED','ended on project switch');
  assert.equal((await app.store.rows('SELECT id FROM call_sessions WHERE case_id=$1',[p2.id])).length,0);
  checks.push('switching project hangs up and does not carry the call into the other project');

  await page.goto(`${origin}/#/room/team?case=${p2.id}`);await page.locator('.research-toolbar').waitFor();
  assert.equal(await page.getByRole('button',{name:'团队房间不能拨打，请从专家列表选择一位专家',exact:true}).isDisabled(),true);
  checks.push('team room has no dialable single expert');

  // Mobile layout.
  await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/#/bot/steve?case=${p2.id}`);await page.locator('.research-toolbar').waitFor();
  await page.getByRole('button',{name:'与 Steve Blank 语音通话',exact:true}).click();await card().waitFor();await card().getByRole('button',{name:'接通 Steve Blank',exact:true}).click();await card().getByText('已接通',{exact:false}).waitFor();
  const mbox=await card().boundingBox();assert.ok(mbox&&mbox.x>=0&&mbox.x+mbox.width<=390&&mbox.width<=374);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'call-mobile-connected.png'),fullPage:true});
  await card().getByRole('button',{name:'收起通话卡片（不会挂断）',exact:true}).click();assert.equal((await latestCall(p2.id)).status,'ACTIVE','collapse is not hang-up');
  await card().getByRole('button',{name:'展开通话卡片',exact:true}).click();
  checks.push('390px mobile card fits without horizontal scroll; collapse does not hang up (viewport emulation, not a real phone)');

  // Logout ends the open call.
  const call4=await latestCall(p2.id);await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Settings',exact:true}).first().click();await page.getByRole('dialog',{name:'Settings'}).getByRole('button',{name:'退出登录',exact:true}).click();
  await page.locator('#auth-form').waitFor();await until(async()=>(await app.store.one('SELECT status FROM call_sessions WHERE id=$1',[call4.id]))!.status==='ENDED','ended on logout');
  checks.push('logout ends the active call');

  // Degradation in a separate page: microphone denied, then no SpeechRecognition at all.
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin);await p.locator('#auth-form').waitFor();await p.locator('#password').fill('TEST_ONLY-Call-browser-password-42');await p.locator('#auth-submit').click();await p.locator('.sidebar').waitFor();
  await p.goto(`${origin}/#/bot/bob?case=${p1.id}`);await p.locator('.research-toolbar').waitFor();
  await p.evaluate(()=>{(window as any).__denyMic=true;});
  await p.getByRole('button',{name:'与 Bob Moesta 语音通话',exact:true}).click();await card(p).getByRole('button',{name:'接通 Bob Moesta',exact:true}).click();await card(p).getByText('已接通',{exact:false}).waitFor();
  await card(p).getByRole('button',{name:'开始说话',exact:true}).click();await card(p).getByText('麦克风权限被拒绝',{exact:false}).waitFor();
  assert.equal(await p.evaluate(()=>(window as any).__recStarted),0,'recognition never starts without permission');
  await card(p).getByLabel(/输入文字或使用麦克风/).fill('TEST_ONLY 文字降级');await card(p).getByRole('button',{name:'发送',exact:true}).click();await card(p).getByText('TEST_ONLY Bob Moesta 文字回答',{exact:false}).waitFor({timeout:20000});
  await card(p).getByRole('button',{name:'挂断并关闭通话卡片',exact:true}).click();
  await p.addInitScript(()=>{const w=window as any;w.__noRecognition=true;delete w.SpeechRecognition;delete w.webkitSpeechRecognition;});await p.reload();await p.locator('.research-toolbar').waitFor();
  await p.getByRole('button',{name:'与 Bob Moesta 语音通话',exact:true}).click();await card(p).getByText('当前未配置可用的语音识别',{exact:false}).waitFor();
  await card(p).getByRole('button',{name:'接通 Bob Moesta',exact:true}).click();await card(p).getByText('已接通',{exact:false}).waitFor();
  assert.equal(await card(p).getByRole('button',{name:'开始说话',exact:true}).isDisabled(),true);await card(p).getByText('麦克风不可用：当前未配置可用的语音识别',{exact:false}).waitFor();
  await p.screenshot({path:path.join(out,'call-no-recognition.png'),fullPage:true});await p.close();
  checks.push('mic denied and missing SpeechRecognition both show explicit messages; text path still works');

  assert.equal(errors.length,0,errors.join('\n'));assert.equal(consoleErrors.filter(e=>!/status of 40[19]|Failed to load resource/.test(e)).length,0,consoleErrors.join('\n'));
  const report={timestamp:new Date().toISOString(),status:'TEST_PASSED',testType:'AUTOMATED_MOCK',fixture:'Chrome headless + --use-fake-device-for-media-stream; injected FAKE SpeechRecognition and FAKE speechSynthesis; stubbed Claude CLI process; temporary database',
    browser:'installed Chrome headless',checks,cliCalls,realModelCalls:0,realMicrophone:'NOT_RUN',realRecognition:'NOT_RUN',audiblePlayback:'NOT_RUN',phone:'NOT_RUN',pageErrors:errors,consoleErrors,
    limitations:['Fake recognition/speech prove UI state, cleanup and persistence only','No real audio was captured, recognised or played','Mobile is viewport emulation, not a real phone over trusted HTTPS']};
  await writeFile(path.join(out,'call-browser-evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:path.join(out,'call-browser-failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'call-browser-evaluation.json'),JSON.stringify({timestamp:new Date().toISOString(),status:'FAILED',testType:'AUTOMATED_MOCK',checks,error:(error as Error).message,pageErrors:errors,consoleErrors},null,2));throw error;}
finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
