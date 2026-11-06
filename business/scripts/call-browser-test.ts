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
app=await createApp({dataDir:path.join(temp,'pg'),casesDir:path.join(temp,'exports'),origin,voiceAPIKey:''});
const cloudRequests:{url:string;body:any}[]=[];
app.voiceTTS.fetcher=(async(url:string,init:RequestInit)=>{
  assert.equal(new Headers(init.headers).get('xi-api-key'),'TEST_ONLY_CLOUD_KEY_42');
  cloudRequests.push({url,body:init.body?JSON.parse(init.body as string):null});
  if(url.includes('/v2/voices'))return Response.json({voices:[{voice_id:'TEST_ONLY_CLOUD_VOICE',name:'TEST_ONLY Cloud Voice',category:'generated'},{voice_id:'TEST_ONLY_TERESA_VOICE',name:'TEST_ONLY Teresa Voice',category:'cloned'}],has_more:false});
  return new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}});
})as typeof fetch;
app.cli.options.noOverageConfirmed=true;
(app.cli as any).auth=async()=>({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'TEST_ONLY'});
let gate:Promise<void>|null=null,cliCalls=0,malformedNext=false;
const prompts:string[]=[];
app.cli.process=async(_a:string[],input:string)=>{cliCalls++;prompts.push(input);if(gate)await gate;const role=/你是 (.+?) 方法角色/.exec(input)?.[1]||'?';
  if(malformedNext){malformedNext=false;return {stdout:JSON.stringify({type:'result',subtype:'success',result:'{"spoken_text":"invalid "quotes""}'}),exit:0};}
  return {stdout:JSON.stringify({type:'result',subtype:'success',structured_output:{spoken_text:`TEST_ONLY ${role} 口语回答：先验证最小诊所的提醒流程。你们现在怎么提醒？`,display_text:`TEST_ONLY ${role} 文字回答（TO_VALIDATE）：先验证最小诊所的提醒流程。`,claims:[{statement:'先验证提醒流程',claim_label:'TO_VALIDATE',basis:'METHOD',evidence_ids:[]}],limitations:['TEST_ONLY 无市场证据'],follow_up_question:'你们现在怎么提醒？',proposed_actions:[{kind:'START_RESEARCH',description:'TEST_ONLY 另开需求研究'}],project_documents_used:[]}}),exit:0};};

const fakes=()=>{
  // TEST_ONLY fakes, injected before page scripts.
  const w=window as any;w.__spoken=[];w.__recStarted=0;w.__recAborted=0;w.__cancelled=0;w.__speakMs=200;
  w.__audioPlays=0;w.__audioMs=250;w.__streamAudio=false;
  class FakeAudio{onplaying:any;onended:any;onerror:any;src='';timers:any[]=[];play(){w.__audioPlays++;this.timers.push(setTimeout(()=>this.onplaying?.(),10),setTimeout(()=>this.onended?.(),w.__audioMs));return Promise.resolve();}pause(){this.timers.forEach(clearTimeout);}removeAttribute(){this.src='';}load(){}}
  w.Audio=FakeAudio;
  class FakeBuffer extends EventTarget{mode='';appendBuffer(){setTimeout(()=>this.dispatchEvent(new Event('updateend')),5);}}
  class FakeMediaSource extends EventTarget{readyState='closed';static isTypeSupported(){return w.__streamAudio;}constructor(){super();setTimeout(()=>{this.readyState='open';this.dispatchEvent(new Event('sourceopen'));},10);}addSourceBuffer(){return new FakeBuffer();}endOfStream(){this.readyState='ended';}}
  Object.defineProperty(window,'MediaSource',{value:FakeMediaSource,configurable:true});const createURL=URL.createObjectURL.bind(URL);URL.createObjectURL=(value:any)=>value instanceof FakeMediaSource?'blob:TEST_ONLY_FAKE_MSE':createURL(value);
  class FakeRecognition{lang='';continuous=false;interimResults=false;maxAlternatives=1;onresult:any;onend:any;onerror:any;onstart:any;onspeechstart:any;onspeechend:any;results:any[]=[];
    start(){w.__recStarted++;w.__rec=this;setTimeout(()=>this.onstart?.(),10);}
    stop(){setTimeout(()=>this.onend?.(),10);}
    abort(){w.__recAborted++;}}
  w.__emit=(text:string,final=true)=>{const r=w.__rec;const index=r.results.length && !r.results.at(-1).isFinal?r.results.length-1:r.results.length;
    r.results[index]=Object.assign([{transcript:text,confidence:.9}],{isFinal:final});r.onresult?.({resultIndex:index,results:r.results});};
  const AudioCtx=w.AudioContext;
  if(AudioCtx)w.AudioContext=class extends AudioCtx{createAnalyser(){const a=super.createAnalyser();a.getFloatTimeDomainData=(data:Float32Array)=>data.fill(0);return a;}};
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
const emit=async(text:string,final=true)=>page.evaluate(({text,final})=>(window as any).__emit(text,final),{text,final});
try{
  await page.goto(origin);await page.locator('#auth-form').waitFor();await page.locator('#password').fill('TEST_ONLY-Call-browser-password-42');await page.locator('#auth-submit').click();await page.locator('.sidebar').waitFor();
  const p1=(await app.store.createCase('TEST_ONLY · 诊所提醒','TEST_ONLY 合成：诊所预约提醒'))!,p2=(await app.store.createCase('TEST_ONLY · 另一个项目','TEST_ONLY 隔离'))!;
  await page.goto(`${origin}/#/bot/teresa?case=${p1.id}`);await page.reload();await page.locator('.research-toolbar').waitFor();
  await page.waitForFunction(id=>document.querySelector<HTMLSelectElement>('.research-toolbar select[aria-label="当前研究项目"]')?.value===id,p1.id);
  const entry=page.getByRole('button',{name:'与 Teresa Torres 语音通话',exact:true});await entry.click();await card().waitFor();
  await card().getByText('未接通',{exact:false}).waitFor();assert.equal(await card().getByLabel('通话时长').innerText(),'--:--');
  await card().getByText('web-speech:SpeechRecognition',{exact:false}).waitFor({state:'attached'});
  for(const width of [1388,1440,1920]){await page.setViewportSize({width,height:width===1920?1080:960});
    const cols=await page.evaluate(()=>[document.querySelector('.sidebar')!,document.querySelector('main.main')!,document.querySelector('.research-panel')!].map(e=>e.getBoundingClientRect().width));
    for(const [i,expected] of [.27,.42,.31].entries())assert.ok(Math.abs(cols[i]/cols.reduce((a,b)=>a+b,0)-expected)<.005,`pane ${i} at ${width}`);
    const box=await card().boundingBox(),main=await page.locator('main.main').boundingBox();assert.ok(box&&main&&box.x>=main.x&&box.x+box.width<=main.x+main.width&&box.width>=320&&box.width<=360);}
  await page.setViewportSize({width:1440,height:960});
  checks.push('27/42/31 desktop panes and 320–360px card preserved at 1388/1440/1920');
  assert.ok((await card().boundingBox())!.height<480,'setup card remains compact');assert.equal(await card().getByLabel('朗读服务',{exact:true}).isVisible(),false);await page.screenshot({path:path.join(out,'call-compact-setup.png'),fullPage:true});
  await card().getByRole('button',{name:'接通 Teresa Torres',exact:true}).click();await card().getByRole('button',{name:'静音麦克风',exact:true}).waitFor();
  const call1=await latestCall(p1.id);assert.equal(call1.role,'teresa');assert.equal(call1.status,'ACTIVE');
  await until(async()=>(await page.evaluate(()=>(window as any).__spoken.length))===1,'one opening greeting');await page.waitForTimeout(350);
  assert.equal((await turnsOf(call1.id)).length,0,'greeting does not invoke CLI');
  await emit('我们的客户',false);await page.waitForTimeout(500);await emit('我们的客户是小诊所，预算不到五千',true);
  await page.waitForTimeout(700);assert.equal((await turnsOf(call1.id)).length,0,'short pause is aggregated');await emit('不想做硬件',true);
  await until(async()=>(await turnsOf(call1.id))[0]?.playback?.status==='PLAYED','automatic endpoint → expert → playback');
  let [first]=await turnsOf(call1.id);assert.match(first.user_text,/不到五千.*不想做硬件/);assert.equal(first.stt.edited,false);assert.ok(first.stt.endpoint_ms>=1000);assert.ok(first.stt.final_at);assert.equal(first.input_source,'BROWSER_STT');
  assert.ok(prompts.at(-1)!.includes('teresa-torres-opportunity/SKILL.md'));assert.equal((await app.store.snapshot(p1.id)).tasks.length,0);
  checks.push('no per-turn clicks: short pause aggregation, auto-submit, Teresa routing, endpoint metadata, audible-output mock report; action confirmation retained');
  // Ten additional automatic turns, with no microphone/send presses.
  for(let i=0;i<10;i++){await emit(`TEST_ONLY 自然追问第 ${i+1} 句`);await until(async()=>(await turnsOf(call1.id))[i+1]?.playback?.status==='PLAYED',`continuous turn ${i+2}`);}
  assert.equal(await page.evaluate(()=>(window as any).__recStarted),1,'one recognition session across 11 turns');
  assert.equal((await turnsOf(call1.id)).length,11);
  await page.screenshot({path:path.join(out,'call-desktop-connected.png'),fullPage:true});
  const lastPrompt=prompts.at(-1)!;assert.ok(lastPrompt.includes('earlier_compact_context'));assert.ok(lastPrompt.includes('HISTORY_NOT_EVIDENCE'));
  checks.push('11 consecutive automatic turns without clicking; earlier compact context and recent history supplied (accelerated mock, not a 10-minute real call)');
  // Recognition auto-end restores listening, without another greeting.
  const greeted=await page.evaluate(()=>(window as any).__spoken.filter((s:string)=>s.startsWith('你好')).length);
  await page.evaluate(()=>(window as any).__rec.onend());await until(async()=>(await page.evaluate(()=>(window as any).__recStarted))===2,'recognition auto restart');
  assert.equal(await page.evaluate(()=>(window as any).__spoken.filter((s:string)=>s.startsWith('你好')).length),greeted);
  checks.push('recognition end auto-recovers without greeting or context reset');
  // Realistically shaped echo and acknowledgements do not submit. Voice correction interrupts.
  await page.evaluate(()=>{(window as any).__speakMs=8000;});await emit('TEST_ONLY 请详细回答');
  await card().getByText('专家正在说',{exact:false}).waitFor({timeout:20000});
  const before=(await turnsOf(call1.id)).length;await emit('先验证最小诊所的提醒流程');await emit('嗯');await page.waitForTimeout(1300);
  assert.equal((await turnsOf(call1.id)).length,before,'echo and ack ignored');
  await emit('等等，我说的是另一个预算',false);await until(async()=>(await turnsOf(call1.id))[before-1]?.playback?.status==='INTERRUPTED','voice interruption');
  await page.evaluate(()=>{(window as any).__speakMs=200;});await emit('等等，我说的是另一个预算，只有两千',true);
  await until(async()=>(await turnsOf(call1.id))[before]?.playback?.status==='PLAYED','correction response');
  assert.equal((await turnsOf(call1.id))[before].user_text,'等等，我说的是另一个预算，只有两千');
  checks.push('voice barge-in stops old playback, preserves prefix, records interruption; echo and acknowledgements filtered');
  // Input silence while muted; unmute obtains fresh resources automatically.
  await card().getByRole('button',{name:'静音麦克风',exact:true}).click();const count=(await turnsOf(call1.id)).length;
  await emit('TEST_ONLY 静音时不应提交');await page.waitForTimeout(1400);assert.equal((await turnsOf(call1.id)).length,count);
  await card().getByRole('button',{name:'取消静音',exact:true}).click();await card().getByRole('button',{name:'静音麦克风',exact:true}).waitFor();
  checks.push('mute stops recognition and input resources; unmute resumes hands-free listening');
  // New speech while thinking supersedes the old unanswered request, without losing the question.
  let release!:()=>void;gate=new Promise<void>(r=>release=r);await emit('TEST_ONLY 原问题：应该先验证谁');
  await card().getByText('专家正在思考',{exact:false}).waitFor({timeout:20000});const old=(await turnsOf(call1.id)).at(-1)!;
  await emit('补充，只考虑马来西亚小诊所');await until(async()=>(await app.store.one('SELECT status FROM call_turns WHERE id=$1',[old.id]))!.status==='CANCELLED','old generation cancelled');
  release();gate=null;await until(async()=>{const rows=await turnsOf(call1.id);return rows.at(-1)?.playback?.status==='PLAYED'&&rows.at(-1)?.id!==old.id;},'latest intent response');
  const corrected=(await turnsOf(call1.id)).at(-1)!;assert.match(corrected.user_text,/原问题.*先验证谁[\s\S]*补充/);
  checks.push('thinking request superseded; latest response retains original question plus correction; shared CLI unchanged');
  malformedNext=true;await emit('TEST_ONLY 格式失败后应能重试');
  await card().getByText('本次回答失败',{exact:false}).waitFor({timeout:20000});
  assert.equal(await card().getByRole('button',{name:'静音麦克风',exact:true}).isEnabled(),true);
  const failedTurn=(await turnsOf(call1.id)).at(-1)!;assert.equal(failedTurn.status,'FAILED');assert.equal(failedTurn.error.code,'CLI_SCHEMA_MISSING');
  await card().getByRole('button',{name:'重试回答',exact:true}).click();
  await until(async()=>{const last=(await turnsOf(call1.id)).at(-1);return last?.id!==failedTurn.id&&last?.playback?.status==='PLAYED';},'explicit failed-answer retry');
  assert.equal((await turnsOf(call1.id)).at(-1)!.user_text,failedTurn.user_text);
  checks.push('malformed CLI output stays unspoken; failure exits thinking, microphone stays available, explicit retry creates one new answer');
  await card().getByRole('button',{name:'挂断',exact:true}).click();await until(async()=>(await latestCall(p1.id)).status==='ENDED','hangup persisted');
  const restarts=await page.evaluate(()=>(window as any).__recStarted);await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>(window as any).__recStarted),restarts);
  checks.push('hangup releases recognition and never restarts it');
  // Records and exports still work.
  await card().getByRole('button',{name:'通话记录',exact:true}).click();await card().getByRole('button',{name:'导出',exact:true}).first().waitFor();
  const dl=page.waitForEvent('download');await card().getByRole('button',{name:'导出',exact:true}).first().click();const md=await readFile((await (await dl).path())!,'utf8');assert.ok(md.includes('不是真人客户访谈'));assert.ok(md.includes('不到五千'));
  await card().getByRole('button',{name:'返回通话',exact:true}).click();
  // Project switch cleans up and cannot write into another case.
  await card().getByRole('button',{name:'重新拨打 Teresa Torres',exact:true}).click();await card().getByRole('button',{name:'静音麦克风',exact:true}).waitFor();const switched=await latestCall(p1.id);
  await page.locator('.research-toolbar select[aria-label="当前研究项目"]').selectOption(p2.id);await until(async()=>(await card().count())===0,'card closed on project switch');
  await until(async()=>(await app.store.one('SELECT status FROM call_sessions WHERE id=$1',[switched.id]))!.status==='ENDED','project switch ends call');assert.equal((await app.store.rows('SELECT id FROM call_sessions WHERE case_id=$1',[p2.id])).length,0);
  checks.push('record export preserved; project switch ends call and isolates callbacks');
  // Mobile viewport is explicitly not a phone test.
  await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/#/bot/steve?case=${p2.id}`);await page.locator('.research-toolbar').waitFor();
  const closePanel=page.getByRole('button',{name:'Close panel',exact:true});if(await closePanel.isVisible())await closePanel.click();
  await page.getByRole('button',{name:'与 Steve Blank 语音通话',exact:true}).click();
  await card().getByRole('button',{name:'接通 Steve Blank',exact:true}).click();await card().getByRole('button',{name:'静音麦克风',exact:true}).waitFor();
  const mbox=await card().boundingBox();assert.ok(mbox&&mbox.x>=0&&mbox.x+mbox.width<=390);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'call-mobile-connected.png'),fullPage:true});await card().getByRole('button',{name:'收起通话卡片（不会挂断）',exact:true}).click();assert.equal((await latestCall(p2.id)).status,'ACTIVE');
  await card().getByRole('button',{name:'展开通话卡片',exact:true}).click();
  checks.push('390px viewport and collapse preserved; not real mobile validation');
  const call4=await latestCall(p2.id);await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'Settings',exact:true}).first().click();await page.getByRole('dialog',{name:'Settings'}).getByRole('button',{name:'退出登录',exact:true}).click();
  await page.locator('#auth-form').waitFor();await until(async()=>(await app.store.one('SELECT status FROM call_sessions WHERE id=$1',[call4.id]))!.status==='ENDED','logout ends call');
  checks.push('logout ends active call');
  // Permission denial must NOT look like a connected call. Explicit text fallback remains available.
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.locator('#auth-form').waitFor();await p.locator('#password').fill('TEST_ONLY-Call-browser-password-42');await p.locator('#auth-submit').click();await p.locator('.sidebar').waitFor();
  await p.goto(`${origin}/#/bot/bob?case=${p1.id}`);await p.locator('.research-toolbar').waitFor();await p.evaluate(()=>{(window as any).__denyMic=true;});await p.getByRole('button',{name:'与 Bob Moesta 语音通话',exact:true}).click();
  await card(p).getByRole('button',{name:'接通 Bob Moesta',exact:true}).click();await card(p).getByText('麦克风权限被拒绝',{exact:false}).waitFor();assert.equal(await card(p).getByLabel('通话时长').innerText(),'--:--');assert.equal(await p.evaluate(()=>(window as any).__recStarted),0);
  await card(p).getByRole('button',{name:'使用文字通话',exact:true}).click();await card(p).getByLabel('补充文字（语音自动发送）').fill('TEST_ONLY 文字降级');await card(p).getByRole('button',{name:'发送',exact:true}).click();await card(p).getByText('TEST_ONLY Bob Moesta 文字回答',{exact:false}).waitFor({timeout:20000});
  await card(p).getByRole('button',{name:'挂断并关闭通话卡片',exact:true}).click();await p.addInitScript(()=>{const w=window as any;w.__noRecognition=true;delete w.SpeechRecognition;delete w.webkitSpeechRecognition;});await p.reload();await p.locator('.research-toolbar').waitFor();await p.getByRole('button',{name:'与 Bob Moesta 语音通话',exact:true}).click();
  await card(p).locator('.call-preferences > summary').click();await card(p).getByText('当前未配置可用的语音识别',{exact:false}).waitFor();assert.equal(await card(p).getByRole('button',{name:'接通 Bob Moesta',exact:true}).isDisabled(),true);await p.screenshot({path:path.join(out,'call-no-recognition.png'),fullPage:true});await p.close();
  checks.push('mic denial does not start connected timer; missing STT disables voice; explicit text fallback works');

  // Opt-in cloud TTS with a local provider fixture and fake media decoding, never a real key/service.
  await page.goto(`${origin}/#/bot/teresa?case=${p1.id}`);await page.reload();await page.locator('.sidebar').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).first().click();const settings=page.getByRole('dialog',{name:'Settings'});
  await settings.getByRole('button',{name:'语音',exact:true}).click();await settings.getByText('尚未配置 API Key',{exact:false}).waitFor();
  await settings.getByLabel('ElevenLabs API Key',{exact:true}).fill('TEST_ONLY_CLOUD_KEY_42');await settings.getByRole('button',{name:'保存 Key 并读取音色',exact:true}).click();
  await settings.getByText('账户音色已读取',{exact:false}).waitFor();assert.equal(await settings.getByLabel('ElevenLabs API Key',{exact:true}).inputValue(),'');
  await settings.getByLabel('默认 ElevenLabs 音色',{exact:true}).selectOption('TEST_ONLY_CLOUD_VOICE');await settings.getByLabel('Teresa 的音色',{exact:true}).selectOption('TEST_ONLY_TERESA_VOICE');
  await settings.getByRole('button',{name:'试听所选音色（使用额度）',exact:true}).click();await settings.getByText('此浏览器使用完整缓冲后播放。',{exact:true}).waitFor();
  await until(async()=>await page.evaluate(()=>(window as any).__audioPlays)>0,'cloud preview buffered playback');
  await settings.getByLabel('语音服务',{exact:true}).selectOption('elevenlabs');await settings.getByRole('button',{name:'保存语音设置',exact:true}).click();await settings.getByText('语音设置已保存',{exact:false}).waitFor();
  await page.screenshot({path:path.join(out,'elevenlabs-settings.png'),fullPage:true});
  await settings.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.reload();await page.locator('.research-toolbar').waitFor();await page.getByRole('button',{name:'与 Teresa Torres 语音通话',exact:true}).click();
  await until(async()=>await card().getByLabel('朗读服务',{exact:true}).inputValue()==='elevenlabs','cloud provider persisted');
  assert.equal(await card().getByLabel('朗读音色',{exact:true}).inputValue(),'TEST_ONLY_TERESA_VOICE');
  await page.evaluate(()=>{(window as any).__streamAudio=true;(window as any).__audioMs=8000;});
  await card().getByRole('button',{name:'接通 Teresa Torres',exact:true}).click();await card().getByRole('button',{name:'静音麦克风',exact:true}).waitFor();
  const cloudCall=await latestCall(p1.id);await until(async()=>await page.evaluate(()=>(window as any).__audioPlays)>0,'streamed greeting');
  await emit('TEST_ONLY 云端声音问题');await until(async()=>(await turnsOf(cloudCall.id))[0]?.status==='COMPLETED','cloud expert answer');
  await card().locator('.call-preferences > summary').click();await card().getByText('正在使用流式播放。',{exact:false}).waitFor();
  await until(async()=>await page.evaluate(()=>(window as any).__audioPlays)>=2,'cloud answer audio starts');
  await emit('等等，我补充一个条件',false);await until(async()=>(await turnsOf(cloudCall.id))[0]?.playback?.status==='INTERRUPTED','cloud speech interrupted');
  assert.ok(cloudRequests.some(r=>r.url.includes('TEST_ONLY_TERESA_VOICE/stream')&&r.body?.text.includes('Teresa Torres 口语回答')));
  assert.equal((await turnsOf(cloudCall.id))[0].playback.provider,'elevenlabs');assert.equal((await turnsOf(cloudCall.id))[0].playback.delivery_mode,'streaming');
  await card().getByRole('button',{name:'挂断',exact:true}).click();
  checks.push('ElevenLabs opt-in settings/key redaction and persistence, per-expert voice, buffered preview, streamed MP3 playback and voice interruption (all provider/audio fixtures)');

  assert.equal(errors.length,0,errors.join('\n'));assert.equal(consoleErrors.filter(e=>!/status of 40[19]|Failed to load resource/.test(e)).length,0,consoleErrors.join('\n'));
  const report={timestamp:new Date().toISOString(),status:'TEST_PASSED',testType:'AUTOMATED_MOCK',fixture:'Chrome headless + --use-fake-device-for-media-stream; injected FAKE SpeechRecognition and FAKE speechSynthesis; stubbed Claude CLI process; temporary database',
    browser:await browser.version(),checks,cliCalls,realModelCalls:0,realMicrophone:'NOT_RUN',realRecognition:'NOT_RUN',audiblePlayback:'NOT_RUN',phone:'NOT_RUN',pageErrors:errors,consoleErrors,
    limitations:['Fake recognition/speech prove UI state, cleanup and persistence only','No real audio was captured, recognised or played','Mobile is viewport emulation, not a real phone over trusted HTTPS']};
  await writeFile(path.join(out,'call-browser-evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:path.join(out,'call-browser-failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'call-browser-evaluation.json'),JSON.stringify({timestamp:new Date().toISOString(),status:'FAILED',testType:'AUTOMATED_MOCK',checks,error:(error as Error).message,pageErrors:errors,consoleErrors},null,2));throw error;}
finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();}
