import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {once} from 'node:events';
import {z} from 'zod';
import {Store,type Row} from '../../data/data_preprocessing/database/store.ts';
import {CallStore,callRoles} from '../../data/data_preprocessing/database/calls.ts';
import {expertNames} from '../agents/dialogue.ts';
import {AppError,assert} from '../shared/config.ts';
import {voiceGreeting} from '../shared/voice-copy.ts';

const voiceId=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const model=z.enum(['eleven_flash_v2_5','eleven_multilingual_v2']);
const configSchema=z.object({provider:z.enum(['browser','elevenlabs']).default('browser'),voice_id:voiceId.or(z.literal('')).default(''),
  model_id:model.default('eleven_flash_v2_5'),role_voices:z.object(Object.fromEntries(callRoles.map(r=>[r,voiceId.optional()]))).strict().default({})}).strict();
const selection=z.object({voice_id:voiceId.optional(),model_id:model.optional()}).strict();
const previewSchema=selection.extend({lang:z.enum(['zh-CN','en-US']).default('zh-CN'),kind:z.enum(['preview','greeting']).default('preview'),role:z.enum(callRoles).default('steve')}).strict();
const listResponse=z.object({voices:z.array(z.object({voice_id:voiceId,name:z.string().max(300),category:z.string().max(100).optional(),
  verified_languages:z.array(z.object({language:z.string().max(30)})).optional()})).max(150),has_more:z.boolean(),next_page_token:z.string().max(1000).nullable().optional()});
const MAX_AUDIO=8*1024*1024;

/** Official TTS adapter. Credentials never leave the backend; no arbitrary upstream URLs/text. */
export class VoiceTTS {
  store:Store;calls:CallStore;keyFile:string;envKey:string;fetcher:typeof fetch;
  active=new Map<AbortController,{callId?:string;turnId?:string}>();private requests:number[]=[];
  constructor(store:Store,calls:CallStore,keyFile:string,envKey=process.env.ELEVENLABS_API_KEY||'',fetcher:typeof fetch=fetch){
    Object.assign(this,{store,calls,keyFile,envKey,fetcher});this.store=store;this.calls=calls;this.keyFile=keyFile;this.envKey=envKey;this.fetcher=fetcher;
  }
  async master(create=false){
    if(create){await mkdir(path.dirname(this.keyFile),{recursive:true});
      try{await writeFile(this.keyFile,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}}
    const key=await readFile(this.keyFile);assert(key.length===32,'VOICE_SECRET_UNAVAILABLE','本机语音凭据文件不可用，请重新配置');return key;
  }
  async secret(){
    if(this.envKey)return this.envKey;
    const saved=await this.store.setting('voice_tts_secret');if(!saved)return '';
    try{const decipher=createDecipheriv('aes-256-gcm',await this.master(),Buffer.from(saved.iv,'base64'));decipher.setAuthTag(Buffer.from(saved.tag,'base64'));
      return Buffer.concat([decipher.update(Buffer.from(saved.data,'base64')),decipher.final()]).toString('utf8');}
    catch{throw new AppError('VOICE_SECRET_UNAVAILABLE','无法读取本机保存的语音凭据，请重新填写 API Key',503);}
  }
  async status(){
    const config=configSchema.parse((await this.store.setting('voice_tts_config'))||{});
    return {...config,key_configured:!!(this.envKey||await this.store.setting('voice_tts_secret')),key_source:this.envKey?'environment':await this.store.setting('voice_tts_secret')?'local_encrypted_store':'none',
      processing_location:config.provider==='elevenlabs'?'ELEVENLABS_CLOUD':'BROWSER_DEPENDENT',real_audio_verification:'PENDING_USER_TEST'};
  }
  async save(raw:unknown){
    const b=configSchema.extend({api_key:z.string().trim().min(10).max(512).regex(/^[\x21-\x7e]+$/).optional(),clear_key:z.boolean().optional()}).strict().parse(raw);
    assert(!(b.api_key&&b.clear_key),'INPUT_INVALID','不能同时保存和删除 API Key');
    // Validate the entire proposed setting before changing any persisted credential.
    const hasKey=!!(this.envKey||b.api_key||(!b.clear_key&&await this.store.setting('voice_tts_secret')));
    assert(b.provider!=='elevenlabs'||hasKey,'VOICE_KEY_REQUIRED','请先填写 ElevenLabs API Key');
    assert(b.provider!=='elevenlabs'||!!b.voice_id,'VOICE_ID_REQUIRED','请选择默认 ElevenLabs 音色');
    let encrypted:Row|undefined;
    if(b.api_key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await this.master(true),iv),data=Buffer.concat([cipher.update(b.api_key,'utf8'),cipher.final()]);
      encrypted={iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};}
    await this.store.db.transaction(async tx=>{
      if(encrypted)await tx.query('INSERT INTO settings(key,data) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET data=$2',['voice_tts_secret',encrypted]);
      if(b.clear_key)await tx.query('DELETE FROM settings WHERE key=$1',['voice_tts_secret']);
      const config=configSchema.parse({provider:b.provider,voice_id:b.voice_id,model_id:b.model_id,role_voices:b.role_voices});
      await tx.query('INSERT INTO settings(key,data) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET data=$2',['voice_tts_config',config]);
    });
    this.abortAll();return this.status();
  }
  private async upstream(route:string,options:RequestInit,signal:AbortSignal){
    const key=await this.secret();assert(key,'VOICE_KEY_REQUIRED','尚未配置 ElevenLabs API Key',409);
    let r:Response;
    try{r=await this.fetcher(`https://api.elevenlabs.io${route}`,{...options,redirect:'error',signal,headers:{'xi-api-key':key,...options.headers}});}
    catch{throw new AppError(signal.aborted?'VOICE_CANCELLED':'VOICE_NETWORK',signal.aborted?'语音请求已停止':'无法连接 ElevenLabs，请检查网络',503);}
    if(!r.ok){await r.body?.cancel().catch(()=>{});
      const code=r.status===401?'VOICE_KEY_INVALID':r.status===403?'VOICE_PERMISSION':r.status===402?'VOICE_QUOTA':r.status===429?'VOICE_RATE_LIMIT':'VOICE_PROVIDER_ERROR';
      const message=r.status===401?'ElevenLabs API Key 无效':r.status===403?'API Key 或当前套餐没有此音色/模型的权限':r.status===402?'ElevenLabs 账户额度不足':r.status===429?'ElevenLabs 请求受限，请稍后手动重试':'ElevenLabs 未能生成语音，请检查音色和模型配置';
      throw new AppError(code,message,r.status===429?429:502);
    }
    return r;
  }
  async voices(url:URL){
    const search=z.string().max(150).parse(url.searchParams.get('search')||''),token=z.string().max(1000).parse(url.searchParams.get('next_page_token')||'');
    const query=new URLSearchParams({page_size:'50'});if(search)query.set('search',search);if(token)query.set('next_page_token',token);
    const r=await this.upstream(`/v2/voices?${query}`,{},AbortSignal.timeout(15000));
    const chunks:Uint8Array[]=[];let bytes=0;const reader=r.body?.getReader();assert(reader,'VOICE_RESPONSE_INVALID','音色列表为空',502);
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;assert(bytes<=2*1024*1024,'VOICE_RESPONSE_LIMIT','音色列表过大，未加载',502);chunks.push(chunk.value);}}finally{await reader.cancel().catch(()=>{});}
    const text=Buffer.concat(chunks).toString('utf8');
    let data;try{data=listResponse.parse(JSON.parse(text));}catch{throw new AppError('VOICE_RESPONSE_INVALID','ElevenLabs 音色列表格式不可用',502);}
    return {...data,voices:data.voices.map(v=>({voice_id:v.voice_id,name:v.name,category:v.category||'unknown',languages:v.verified_languages?.map(l=>l.language)||[]}))};
  }
  abortAll(){for(const abort of this.active.keys())abort.abort();}
  abortCall(id:string){for(const [abort,scope]of this.active)if(scope.callId===id)abort.abort();}
  async stream(req:IncomingMessage,res:ServerResponse,text:string,role:string,raw:unknown,scope:{callId?:string;turnId?:string}={},preview=false){
    const picked=selection.parse(raw),config=await this.status();
    assert(!req.aborted&&!res.destroyed,'VOICE_CANCELLED','语音请求已停止',409);
    assert(preview||config.provider==='elevenlabs','VOICE_PROVIDER_DISABLED','请先在语音设置中启用 ElevenLabs',409);
    const id=picked.voice_id||config.role_voices[role]||config.voice_id;assert(id,'VOICE_ID_REQUIRED','请选择 ElevenLabs 音色',409);
    assert(text.length>0&&text.length<=2000,'VOICE_TEXT_LIMIT','朗读内容长度不符合要求');
    assert(this.active.size<2,'VOICE_BUSY','已有语音请求正在处理，请先停止播放',409);
    assert(!scope.turnId||![...this.active.values()].some(v=>v.turnId===scope.turnId),'VOICE_BUSY','本条回答已在生成语音',409);
    this.requests=this.requests.filter(t=>Date.now()-t<60000);assert(this.requests.length<30,'VOICE_RATE_LIMIT','语音请求过于频繁，请稍后重试',429);this.requests.push(Date.now());
    const abort=new AbortController();this.active.set(abort,scope);
    const onClose=()=>{if(!res.writableFinished)abort.abort();};res.once('close',onClose);
    const timeout=setTimeout(()=>abort.abort(),90000);
    try{
      if(scope.callId){const call=await this.calls.call((await this.calls.turnById(scope.turnId!))!.case_id,scope.callId);assert(call.status==='ACTIVE','CALL_ENDED','通话已结束',409);}
      assert(!abort.signal.aborted&&!req.aborted&&!res.destroyed,'VOICE_CANCELLED','语音请求已停止',409);
      const r=await this.upstream(`/v1/text-to-speech/${encodeURIComponent(id)}/stream?output_format=mp3_44100_128`,{method:'POST',headers:{'content-type':'application/json',accept:'audio/mpeg'},
        body:JSON.stringify({text,model_id:picked.model_id||config.model_id})},abort.signal);
      assert(r.body&&/^(audio\/mpeg|audio\/mp3|application\/octet-stream)/i.test(r.headers.get('content-type')||''),'VOICE_AUDIO_INVALID','语音服务未返回 MP3 音频',502);
      res.statusCode=200;res.setHeader('content-type','audio/mpeg');res.setHeader('cache-control','no-store');res.setHeader('X-Voice-Provider','elevenlabs');
      let size=0;const reader=r.body.getReader();
      try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;assert(size<=MAX_AUDIO,'VOICE_RESPONSE_LIMIT','本次语音超过大小限制',502);if(abort.signal.aborted)throw new AppError('VOICE_CANCELLED','语音已停止',409);
        if(!res.write(chunk.value))await once(res,'drain',{signal:abort.signal});}
        assert(size>0,'VOICE_AUDIO_INVALID','语音服务返回空音频',502);res.end();
      }finally{await reader.cancel().catch(()=>{});}
    }finally{clearTimeout(timeout);abort.abort();this.active.delete(abort);res.removeListener('close',onClose);}
  }
  async handle(p:string,method:string,url:URL,body:()=>Promise<unknown>,req:IncomingMessage,res:ServerResponse){
    if(p==='/api/voice/tts/settings'){
      if(method==='GET')return {data:await this.status()};
      if(method==='POST')return {data:await this.save(await body())};
    }
    if(p==='/api/voice/tts/voices'&&method==='GET')return {data:await this.voices(url)};
    if(p==='/api/voice/tts/preview'&&method==='POST'){
      const b=previewSchema.parse(await body()),text=b.kind==='greeting'?voiceGreeting(expertNames[b.role],b.lang):b.lang==='zh-CN'?'你好，我是你的研究伙伴。我们一起把这个项目想清楚。':'Hello. Let us think through your project together.';
      await this.stream(req,res,text,b.role,{voice_id:b.voice_id,model_id:b.model_id},{},true);return {streamed:true};
    }
    const m=/^\/api\/cases\/([^/]+)\/calls\/([^/]+)\/turns\/([^/]+)\/audio$/.exec(p);
    if(m&&method==='POST'){
      const [caseId,callId,turnId]=m.slice(1).map(v=>z.string().uuid().parse(v));
      const call=await this.calls.call(caseId,callId),turn=await this.calls.turn(caseId,callId,turnId);
      assert(call.status==='ACTIVE','CALL_ENDED','通话已结束',409);assert(turn.status==='COMPLETED'&&turn.reply?.spoken_text,'TURN_NOT_COMPLETED','只能朗读已通过校验的专家回答',409);
      await this.stream(req,res,turn.reply.spoken_text,call.role,await body(),{callId,turnId});return {streamed:true};
    }
    return null;
  }
}
