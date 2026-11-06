import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Browser-independent JS is also executed directly in Node for lifecycle tests.
import {ContinuousInput} from '../frontend/src/call-controller.js';
// @ts-ignore See above.
import {CallSession} from '../frontend/src/call-session.js';

function clock(){
  let time=0,id=0;const jobs=new Map<number,{at:number;fn:()=>void}>();
  return {now:()=>time,schedule:(fn:()=>void,ms:number)=>{jobs.set(++id,{at:time+ms,fn});return id;},unschedule:(key:number)=>jobs.delete(key),
    tick(ms:number){const end=time+ms;for(;;){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();}time=end;},jobs};
}
function input(){
  const timer=clock(),sessions:any[]=[],utterances:any[]=[],drafts:string[]=[],errors:string[]=[],states:string[]=[];let interrupts=0,aborts=0;
  const ctl=new ContinuousInput({...timer,lang:'zh-CN',recognizer:(callbacks:any)=>{sessions.push(callbacks);return {start:()=>callbacks.onStart(),stop:()=>{},abort:()=>aborts++};},
    onDraft:(s:string)=>drafts.push(s),onUtterance:(s:string,meta:any)=>utterances.push({s,meta}),onState:(s:string)=>states.push(s),onError:(s:string)=>errors.push(s),onInterrupt:()=>interrupts++});
  ctl.start();
  const part=(id:number,text:string,final=true)=>sessions.at(-1).onSegment({id,text,final,confidence:.9});
  return {ctl,timer,sessions,utterances,drafts,errors,states,part,interrupts:()=>interrupts,aborts:()=>aborts};
}
test('continuous endpointing aggregates pauses/revisions and handles 12 turns without clicking or restarting',()=>{
  const t=input();t.part(0,'预算',false);t.timer.tick(600);t.part(0,'预算不到五千',true);t.timer.tick(700);t.part(1,'不想做硬件',true);t.timer.tick(1099);
  assert.equal(t.utterances.length,0);t.timer.tick(1);assert.equal(t.utterances[0].s,'预算不到五千不想做硬件');
  t.part(0,'预算不到五千',true);t.timer.tick(1200);assert.equal(t.utterances.length,1,'replayed final is not resent');
  for(let i=2;i<13;i++){t.part(i,`下一句${i}`);t.timer.tick(1200);}
  assert.equal(t.utterances.length,12);assert.equal(t.sessions.length,1);t.timer.tick(600000);assert.equal(t.utterances.length,12,'silence never calls the model');
});
test('activity postpones endpoints, while provisional text is never silently submitted',()=>{
  const t=input();t.part(0,'让我想想',false);t.timer.tick(1000);t.ctl.activity(true);t.timer.tick(1000);assert.equal(t.utterances.length,0);
  t.part(0,'让我想想，还是五千',true);t.timer.tick(1100);assert.equal(t.utterances[0].s,'让我想想，还是五千');
  t.part(1,'未定稿',false);t.timer.tick(5200);assert.equal(t.utterances.length,1);assert.equal(t.ctl.running,false);assert.ok(t.drafts.includes('未定稿'));assert.match(t.errors.at(-1)!,/最终文字/);
});
test('output echo and brief acknowledgements do not interrupt; a correction does and keeps its prefix',()=>{
  const t=input();t.ctl.setOutput('先验证小诊所的提醒流程，你们现在怎么提醒？');
  t.part(0,'先验证小诊所的提醒流程');t.part(1,'嗯');t.timer.tick(1200);assert.equal(t.interrupts(),0);assert.equal(t.utterances.length,0);
  t.part(2,'等等，我说的是另一个预算',false);assert.equal(t.interrupts(),1);t.part(2,'等等，我说的是另一个预算',true);t.timer.tick(1100);
  assert.equal(t.utterances[0].s,'等等，我说的是另一个预算');
});
test('recognition end recovers without resetting drafts; repeated network failure is bounded',()=>{
  const t=input();t.part(0,'原问题');const old=t.sessions[0];old.onEnd();t.timer.tick(500);assert.equal(t.sessions.length,2);
  old.onSegment({id:1,text:'迟到结果',final:true});t.timer.tick(1100);assert.equal(t.utterances[0].s,'原问题');
  for(let i=0;i<4;i++){t.sessions.at(-1).onError('网络失败','network');t.timer.tick(4000);}
  assert.equal(t.ctl.running,false);assert.ok(t.sessions.length<=5);t.timer.tick(30000);assert.ok(t.sessions.length<=5);
});
test('mute/end fence recognition, endpoint timers and restart timers',()=>{
  const t=input();t.part(0,'不能自动提交');const old=t.sessions[0];t.ctl.mute();old.onEnd();old.onSegment({id:0,text:'迟到',final:true});t.timer.tick(20000);
  assert.equal(t.utterances.length,0);assert.equal(t.sessions.length,1);assert.equal(t.aborts(),1);t.ctl.start();t.part(0,'新输入');t.ctl.stop();t.timer.tick(10000);assert.equal(t.utterances.length,0);
});

const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
function dialogue(){
  const timer=clock(),requests:any[]=[],turns:any[]=[],speeches:any[]=[],errors:string[]=[],phases:string[]=[];let next=0,postGate:ReturnType<typeof deferred<void>>|null=null;
  const rows=new Map<string,any>();
  const session=new CallSession({...timer,call:{id:'test-call'},key:()=>`TEST_ONLY_key_${++next}`,outputOptions:()=>({speakerOn:true,voice:{name:'TEST',localService:true},lang:'zh-CN',caps:{stt:{provider:'TEST',location:'UNKNOWN'},tts:{available:true}}}),
    request:async(path:string,method='GET',body:any)=>{
      requests.push({path,method,body});
      if(path==='/turns'){
        const prior=[...rows.values()].find(t=>t.request_key===body.request_key);if(prior)return {turn:prior};
        const row={...body,id:`turn-${rows.size+1}`,status:'QUEUED',stt:body.stt||{},reply:{spoken_text:'专家回答'}};rows.set(row.id,row);if(postGate)await postGate.promise;return {turn:{...row}};
      }
      const id=path.split('/')[2],row=rows.get(id);
      if(path.endsWith('/cancel'))row.status='CANCELLED';
      if(path.endsWith('/playback'))row.playback=body;
      return {turn:{...row}};
    },speak:(text:string)=>{const done=deferred<any>();const speech={text,promise:done.promise,stop:()=>done.resolve({status:'INTERRUPTED',progress:'UNKNOWN'}),done};speeches.push(speech);return speech;},
    onTurn:(t:any)=>turns.push(t),onPhase:(s:string)=>phases.push(s),onError:(e:string)=>errors.push(e),onOutput:()=>{}});
  return {session,timer,requests,rows,speeches,errors,phases,gate:()=>{postGate=deferred<void>();return postGate;}};
}
test('latest intent waits for an in-flight POST, cancels its turn, and includes original plus all corrections',async()=>{
  const t=dialogue(),gate=t.gate();t.session.submit('原始预算五千');await flush();t.session.submit('不是硬件');t.session.submit('只做网页');gate.resolve();await flush();
  const posts=t.requests.filter(r=>r.path==='/turns');assert.equal(posts.length,2);assert.equal(posts[1].body.text,'原始预算五千\n不是硬件\n只做网页');
  assert.equal(t.rows.get('turn-1').status,'CANCELLED');assert.equal(t.requests.findIndex(r=>r.path.endsWith('/cancel'))<t.requests.findLastIndex(r=>r.path==='/turns'),true);
  t.session.close();t.timer.tick(30000);await flush();assert.equal(t.speeches.length,0);
});
test('user speech holds completed output until final intent replaces it; stale polls never speak',async()=>{
  const t=dialogue();t.session.submit('问题一');await flush();t.session.setUserSpeaking(true);t.rows.get('turn-1').status='COMPLETED';t.timer.tick(500);await flush();assert.equal(t.speeches.length,0);
  t.session.submit('补充一');await flush();t.session.setUserSpeaking(false);t.timer.tick(1000);await flush();assert.equal(t.speeches.length,0);
  t.rows.get('turn-2').status='COMPLETED';t.timer.tick(500);await flush();assert.equal(t.speeches.length,1);
  t.session.interrupt();await flush();assert.equal(t.rows.get('turn-2').playback.status,'INTERRUPTED');
  t.session.close();t.timer.tick(30000);await flush();assert.equal(t.speeches.length,1);
});
test('ambiguous POST retry uses original idempotency key and does not create another turn',async()=>{
  const timer=clock(),requests:any[]=[],rows=new Map();let fail=true;
  const session=new CallSession({...timer,request:async(p:string,_m:string,b:any)=>{requests.push(b);if(p==='/turns'){if(!rows.has(b.request_key))rows.set(b.request_key,{id:'one',status:'QUEUED'});if(fail){fail=false;throw Error('TEST lost response');}return {turn:rows.get(b.request_key)};}return {turn:{id:'one',status:'QUEUED'}};},
    key:()=> 'TEST_ONLY_uncertain',outputOptions:()=>({}),onPhase:()=>{},onError:()=>{},onOutput:()=>{}});
  session.submit('只提交一次');await flush();session.retry();await flush();assert.equal(rows.size,1);assert.equal(requests[0].request_key,requests[1].request_key);session.close();
});

test('duplicate voice results during an unanswered turn do not cancel or requeue it',async()=>{
  const t=dialogue(),metadata={confidence:.9};
  t.session.submit('解释项目的大纲',metadata);await flush();
  assert.equal(t.session.submit('解释项目的大纲？',metadata),false);await flush();
  assert.equal(t.requests.filter(r=>r.path==='/turns').length,1);assert.equal(t.rows.get('turn-1').status,'QUEUED');
  t.session.submit('只解释第二点',metadata);await flush();
  assert.equal(t.session.submit('只解释第二点',metadata),false);await flush();
  assert.equal(t.requests.filter(r=>r.path==='/turns').length,2);t.session.close();
});

test('a failed answer stops thinking, retains the question, and explicit retry creates one fresh turn',async()=>{
  const t=dialogue();t.session.submit('解释项目大纲',{confidence:.9});await flush();
  t.rows.get('turn-1').status='FAILED';t.rows.get('turn-1').error={code:'CLI_SCHEMA_MISSING',message:'CLI 未返回结构化答案'};
  t.timer.tick(500);await flush();assert.equal(t.phases.at(-1),'answer_error');assert.equal(t.speeches.length,0);
  t.timer.tick(10000);await flush();assert.equal(t.requests.filter(r=>r.path==='/turns').length,1,'no automatic model retry');
  t.session.retryWatch();await flush();
  const posts=t.requests.filter(r=>r.path==='/turns');assert.equal(posts.length,2);assert.equal(posts[1].body.text,posts[0].body.text);assert.notEqual(posts[1].body.request_key,posts[0].body.request_key);
  t.rows.get('turn-2').status='COMPLETED';t.timer.tick(500);await flush();assert.equal(t.speeches.length,1);t.session.close();
});
