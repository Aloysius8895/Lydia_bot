import {z} from 'zod';
import {CallStore,callRoles} from '../../data/data_preprocessing/database/calls.ts';
import {Dialogue,expertNames} from '../agents/dialogue.ts';
import type {Row} from '../../data/data_preprocessing/database/store.ts';

const id=z.string().uuid(),key=z.string().min(8).max(100);
const lang=z.enum(['zh-CN','en-US']);
const sttMeta=z.object({
  provider:z.string().max(80),lang:z.string().max(20),
  processing_location:z.enum(['BROWSER_VENDOR_SERVICE_POSSIBLE','ON_DEVICE_REPORTED','UNKNOWN']),
  confidence:z.number().min(0).max(1).nullable().default(null),
  transcript_original:z.string().max(2000).nullable().default(null),
  edited:z.boolean().default(false),recognition_ms:z.number().int().min(0).max(600000).nullable().default(null),
  endpoint_ms:z.number().int().min(0).max(600000).nullable().default(null),
  final_at:z.string().datetime().nullable().default(null),
}).strict();
const turnInput=z.discriminatedUnion('input_source',[
  z.object({request_key:key,text:z.string().trim().min(1).max(2000),input_source:z.literal('TEXT')}).strict(),
  z.object({request_key:key,text:z.string().trim().min(1).max(2000),input_source:z.literal('BROWSER_STT'),stt:sttMeta}).strict(),
]);
const playback=z.object({
  status:z.enum(['PLAYED','INTERRUPTED','SKIPPED_SPEAKER_OFF','NO_VOICE','FAILED']),
  progress:z.enum(['COMPLETE','PARTIAL','NONE','UNKNOWN']),
  voice_name:z.string().max(200).nullable().default(null),voice_local:z.boolean().nullable().default(null),lang:z.string().max(20).nullable().default(null),
  start_delay_ms:z.number().int().min(0).max(600000).nullable().default(null),error:z.string().max(200).nullable().default(null),
  response_delay_ms:z.number().int().min(0).max(3600000).nullable().default(null),
  provider:z.enum(['browser','elevenlabs']).default('browser'),
  model_id:z.string().max(100).nullable().default(null),
  delivery_mode:z.enum(['browser','streaming','buffered','unknown']).default('browser'),
}).strict();

export function transcriptMarkdown(call:Row,turns:Row[],caseTitle:string){
  const lines=[`# 专家通话记录：${expertNames[call.role as keyof typeof expertNames]}（AI 方法角色）`,'',`项目：${caseTitle}`,`通话 ID：${call.id}`,`开始：${new Date(call.created_at).toISOString()}${call.ended_at?`；结束：${new Date(call.ended_at).toISOString()}`:''}`,'',
    '> 来源说明：本记录是系统用户与 AI 方法角色的对话。用户陈述为 USER_REPORTED（未核实）；AI 回答不是市场证据，也不是真人客户访谈或人口样本。',''];
  for(const t of turns){
    lines.push(`## 第 ${t.seq} 轮 · ${t.status}`,'',`**用户（${t.input_source==='BROWSER_STT'?'浏览器语音识别':'文字'}，USER_REPORTED）：** ${t.user_text}`);
    for(const c of t.corrections||[])lines.push('',`*转写更正（${c.at}，仅更正记录，未重新生成回答）：* ${c.text}`);
    if(t.reply){lines.push('',`**${t.reply.expert_name}（${t.reply.claim_label}）：** ${t.reply.display_text}`);
      if(t.reply.evidence_ids?.length)lines.push('',`证据编号：${t.reply.evidence_ids.join(', ')}`);
      if(t.reply.limitations?.length)lines.push('',`限制：${t.reply.limitations.join('；')}`);
      if(t.reply.proposed_actions?.length)lines.push('',`候选动作（未执行，需在原流程中确认）：${t.reply.proposed_actions.map((a:Row)=>a.description).join('；')}`);
      lines.push('',`朗读：${t.playback?.status||'未报告'}${t.playback?.progress?` / ${t.playback.progress}`:''}`);}
    if(t.error)lines.push('',`错误：${t.error.code} ${t.error.message}`);
    lines.push('');
  }
  return lines.join('\n');
}

export class CallAPI {
  calls:CallStore;dialogue:Dialogue;
  constructor(calls:CallStore,dialogue:Dialogue){this.calls=calls;this.dialogue=dialogue;}
  capabilities(cliStatus:Row){
    return {
      server:{stt:{status:'NOT_CONFIGURED',reason:'未配置后端或本地音频转写（未发现 whisper/ffmpeg）；第一版不接收音频上传'},tts:{status:'NOT_CONFIGURED',reason:'朗读在浏览器内进行'},paid_voice_services:false,cloud_voice_api:false},
      client_required:['microphone_permission','speech_recognition','speech_synthesis_voices'],
      inference:{backend:'claude_cli',shared_serial_queue:true,streaming:false,cli:cliStatus},
      transport:'HTTP_POLLING',duplex:'CONTINUOUS_CLIENT_SERIAL_INFERENCE',
      continuous_call:{implementation:'CLIENT_ENDPOINTING_AND_BARGE_IN',verification:'PENDING_REAL_DEVICE_TEST',echo_cancellation:'DEVICE_DEPENDENT_NOT_VERIFIED'},
      languages:{supported_for_selection:['zh-CN','en-US'],malay:'NOT_TESTED'},
      max_turn_characters:2000,roles:callRoles.map(r=>({role:r,name:expertNames[r],verification:'PENDING_REAL_TEST'})),
    };
  }
  async handle(p:string,method:string,body:()=>Promise<any>):Promise<{data:unknown;status?:number}|null>{
    const m=/^\/api\/cases\/([^/]+)\/calls(?:\/([^/]+)(?:\/(end|export|turns)(?:\/([^/]+)(?:\/(cancel|playback|correction))?)?)?)?$/.exec(p);
    if(!m)return null;
    const caseId=id.parse(m[1]),callId=m[2]?id.parse(m[2]):null,sub=m[3],turnId=m[4]?id.parse(m[4]):null,action=m[5];
    const store=this.calls.store;
    if(!callId){
      if(method==='GET')return {data:await this.calls.listCalls(caseId)};
      if(method==='POST'){const b=z.object({role:z.enum(callRoles),request_key:key,lang:lang.default('zh-CN')}).strict().parse(await body());
        return {data:await this.calls.createCall(caseId,b.role,b.request_key,{lang:b.lang,expert_name:expertNames[b.role]}),status:201};}
      return null;
    }
    if(!sub){
      if(method==='GET')return {data:await this.calls.detail(caseId,callId)};
      if(method==='DELETE'){const r=await this.calls.deleteCall(caseId,callId);this.dialogue.abortTurns(r.cancelled);return {data:r};}
      return null;
    }
    if(sub==='end'&&method==='POST'&&!turnId){const r=await this.calls.endCall(caseId,callId);this.dialogue.abortTurns(r.cancelled);return {data:r};}
    if(sub==='export'&&method==='GET'&&!turnId){const d=await this.calls.detail(caseId,callId),c=await store.getCase(caseId);return {data:{filename:`lydia-call-${callId}.md`,markdown:transcriptMarkdown(d.call,d.turns,c.title),...d}};}
    if(sub!=='turns')return null;
    if(!turnId&&method==='POST'){
      const b=turnInput.parse(await body());
      const r=await this.calls.addTurn(caseId,callId,{request_key:b.request_key,text:b.text,input_source:b.input_source,stt:b.input_source==='BROWSER_STT'?b.stt:{}});
      if(!r.duplicate)this.dialogue.start(r.turn.id);
      return {data:{turn:r.turn,duplicate:r.duplicate,queue:this.dialogue.status(r.turn.id)},status:202};
    }
    if(!turnId)return null;
    if(!action&&method==='GET'){const t=await this.calls.turn(caseId,callId,turnId);return {data:{turn:t,queue:this.dialogue.status(turnId)}};}
    if(action==='cancel'&&method==='POST'){await this.calls.turn(caseId,callId,turnId);await this.dialogue.cancel(turnId);return {data:{turn:await this.calls.turn(caseId,callId,turnId)}};}
    if(action==='playback'&&method==='POST'){const b=playback.parse(await body());return {data:{turn:await this.calls.recordPlayback(caseId,callId,turnId,b)}};}
    if(action==='correction'&&method==='POST'){const b=z.object({text:z.string().trim().min(1).max(2000)}).strict().parse(await body());return {data:{turn:await this.calls.correct(caseId,callId,turnId,b.text)}};}
    return null;
  }
}
