import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../backend/server.ts';

// Official provider boundary is simulated. No ElevenLabs account, credit or real audio is used.
let app:Awaited<ReturnType<typeof createApp>>,server:http.Server,origin='',cookie='',csrf='',temp='';
const key='TEST_ONLY_VOICE_KEY_42',voice='TEST_ONLY_VOICE_ID',requests:{url:string;init:RequestInit}[]=[];
let failure=0,hold=false,aborted=false;
const provider=(async(url:string,init:RequestInit)=>{
  requests.push({url,init});assert.ok(url.startsWith('https://api.elevenlabs.io/'));assert.equal(new Headers(init.headers).get('xi-api-key'),key);
  if(failure)return new Response(JSON.stringify({error:`TEST_ONLY not forwarded ${key}`}),{status:failure});
  if(url.includes('/v2/voices'))return Response.json({voices:[{voice_id:voice,name:'TEST_ONLY Voice',category:'cloned',preview_url:'https://not-forwarded.example/private',samples:[{private:true}],verified_languages:[{language:'zh'}]}],has_more:false,next_page_token:null});
  if(hold){aborted=false;return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([73,68,51]));init.signal?.addEventListener('abort',()=>{aborted=true;controller.error(new Error('TEST_ONLY cancelled'));},{once:true});}}),{headers:{'content-type':'audio/mpeg'}});}
  return new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}});
}) as typeof fetch;
before(async()=>{
  temp=await mkdtemp(path.join(os.tmpdir(),'lydia-tts-'));server=http.createServer((req,res)=>void app.handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(server.address()as any).port}`;
  app=await createApp({dataDir:path.join(temp,'pg'),origin,startWorker:false,voiceFetch:provider,voiceAPIKey:''});
  await req('/api/auth/setup','POST',{password:'TEST_ONLY-TTS-password-42'});const login=await req('/api/auth/login','POST',{password:'TEST_ONLY-TTS-password-42'});cookie=login.r.headers.get('set-cookie')!.split(';')[0];csrf=login.j.csrf;
});
after(async()=>{app.voiceTTS.abortAll();await new Promise<void>(r=>server.close(()=>r()));await app.close();});
function request(p:string,method='GET',data?:unknown,headers:Record<string,string>={},signal?:AbortSignal){return fetch(origin+p,{method,headers:{origin,cookie,'x-csrf-token':csrf,'content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data),signal});}
async function req(p:string,method='GET',data?:unknown,headers:Record<string,string>={}){const r=await request(p,method,data,headers);return {r,j:await r.json()};}
const config=(provider='browser')=>({provider,voice_id:voice,model_id:'eleven_flash_v2_5',role_voices:{teresa:'TEST_ONLY_TERESA'}});

test('TTS is disabled by default, authenticated and protected by CSRF/origin',async()=>{
  const status=(await req('/api/voice/tts/settings')).j;assert.equal(status.provider,'browser');assert.equal(status.key_configured,false);
  assert.equal((await req('/api/voice/tts/settings','POST',config(),{'x-csrf-token':'wrong'})).r.status,403);
  assert.equal((await req('/api/voice/tts/settings','POST',config(),{origin:'https://evil.example'})).r.status,403);
  assert.equal((await req('/api/voice/tts/settings','POST',config('elevenlabs'))).j.error.code,'VOICE_KEY_REQUIRED');assert.equal(requests.length,0);
});
test('credentials persist encrypted and never appear in settings or voice responses',async()=>{
  const result=await req('/api/voice/tts/settings','POST',{...config(),api_key:key});assert.equal(result.r.status,200);assert.equal(result.j.key_configured,true);assert.equal(result.j.key_source,'local_encrypted_store');assert.equal(JSON.stringify(result.j).includes(key),false);
  const saved=await app.store.setting('voice_tts_secret');assert.equal(JSON.stringify(saved).includes(key),false);assert.equal(saved.iv.length,16);assert.equal((await readFile(path.join(temp,'voice-secrets/master.key'))).length,32);
  assert.equal(await app.voiceTTS.secret(),key);
  const listed=await req('/api/voice/tts/voices?search=TEST_ONLY');assert.equal(listed.r.status,200);assert.equal(listed.j.voices[0].voice_id,voice);assert.equal(listed.j.voices[0].category,'cloned');assert.equal(JSON.stringify(listed.j).includes('private'),false);assert.equal(JSON.stringify(listed.j).includes(key),false);
  assert.equal(new URL(requests.at(-1)!.url).searchParams.get('search'),'TEST_ONLY');
});
test('preview accepts only fixed copy, streams MP3 unchanged, and does not switch the call provider',async()=>{
  const before=requests.length;const bad=await req('/api/voice/tts/preview','POST',{text:'arbitrary private text'});assert.equal(bad.r.status,400);assert.equal(requests.length,before);
  const r=await request('/api/voice/tts/preview','POST',{lang:'zh-CN',voice_id:voice});assert.equal(r.status,200);assert.match(r.headers.get('content-type')!,/audio\/mpeg/);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[73,68,51,1,2,3]);
  const body=JSON.parse(requests.at(-1)!.init.body as string);assert.match(body.text,/研究伙伴/);assert.equal(body.model_id,'eleven_flash_v2_5');assert.equal((await req('/api/voice/tts/settings')).j.provider,'browser');
});
test('call audio uses only the owning completed turn and the selected expert voice',async()=>{
  await req('/api/voice/tts/settings','POST',config('elevenlabs'));
  const c=await app.store.createCase('TEST_ONLY','TEST_ONLY'),other=await app.store.createCase('TEST_ONLY other','TEST_ONLY');
  const call=await app.callStore.createCall(c!.id,'teresa','TEST_ONLY-voice-call');const added=await app.callStore.addTurn(c!.id,call.id,{request_key:'TEST_ONLY-voice-turn',text:'question',input_source:'TEXT',stt:{}});
  const route=`/api/cases/${c!.id}/calls/${call.id}/turns/${added.turn.id}/audio`;
  assert.equal((await req(route,'POST',{})).j.error.code,'TURN_NOT_COMPLETED');
  await app.callStore.complete(added.turn.id,{spoken_text:'TEST_ONLY 已校验的专家回答'}, {}, {});
  const before=requests.length;assert.equal((await req(route.replace(c!.id,other!.id),'POST',{})).r.status,404);assert.equal(requests.length,before);
  assert.equal((await req(route,'POST',{text:'override expert output'})).r.status,400);
  const r=await request(route,'POST',{});assert.equal(r.status,200);await r.arrayBuffer();assert.ok(requests.at(-1)!.url.includes('TEST_ONLY_TERESA/stream'));
  assert.equal(JSON.parse(requests.at(-1)!.init.body as string).text,'TEST_ONLY 已校验的专家回答');
  await app.callStore.endCall(c!.id,call.id);assert.equal((await req(route,'POST',{})).j.error.code,'CALL_ENDED');
});
test('provider failure never leaks its response or silently regenerates/falls back',async()=>{
  const before=requests.length;failure=401;
  try{const r=await req('/api/voice/tts/preview','POST',{voice_id:voice});assert.equal(r.j.error.code,'VOICE_KEY_INVALID');assert.equal(JSON.stringify(r.j).includes(key),false);assert.equal(requests.length,before+1);}finally{failure=0;}
  assert.equal((await req('/api/voice/tts/settings')).j.provider,'elevenlabs');
});
test('disconnect aborts upstream audio and releases concurrency',async()=>{
  hold=true;const abort=new AbortController();
  try{const r=await request('/api/voice/tts/preview','POST',{voice_id:voice},{},abort.signal);await r.body!.getReader().read();abort.abort();
    for(let i=0;i<100&&!aborted;i++)await new Promise(r=>setTimeout(r,20));assert.equal(aborted,true);
    for(let i=0;i<100&&app.voiceTTS.active.size;i++)await new Promise(r=>setTimeout(r,20));assert.equal(app.voiceTTS.active.size,0);
  }finally{hold=false;}
});
test('key removal disables cloud speech and leaves the browser option available',async()=>{
  const r=await req('/api/voice/tts/settings','POST',{...config(),clear_key:true});assert.equal(r.j.key_configured,false);assert.equal(await app.voiceTTS.secret(),'');assert.equal((await req('/api/voice/tts/voices')).j.error.code,'VOICE_KEY_REQUIRED');
  await req('/api/auth/logout','POST',{});assert.equal((await req('/api/voice/tts/settings')).r.status,401);
});
