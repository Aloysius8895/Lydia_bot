import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {remoteSpeech} from '../remote-voice.js';
import '../voice-settings.css';

const experts=[['steve','Steve'],['teresa','Teresa'],['april','April'],['bob','Bob'],['ash','Ash']];
export default function VoiceSettings(){
  const [config,setConfig]=useState(null),[provider,setProvider]=useState('browser'),[voice,setVoice]=useState(''),[model,setModel]=useState('eleven_flash_v2_5');
  const [roles,setRoles]=useState({}),[key,setKey]=useState(''),[voices,setVoices]=useState([]),[next,setNext]=useState(null),[query,setQuery]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[previewing,setPreviewing]=useState(false),[mode,setMode]=useState('');
  const speech=useRef(null),alive=useRef(true),lock=useRef(false);
  function apply(c){setConfig(c);setProvider(c.provider);setVoice(c.voice_id);setModel(c.model_id);setRoles(c.role_voices||{});}
  useEffect(()=>{alive.current=true;api('/api/voice/tts/settings').then(c=>{if(alive.current)apply(c);}).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;speech.current?.stop();};},[]);
  const settings=()=>({provider,voice_id:voice,model_id:model,role_voices:roles});
  async function run(fn){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{await fn();}catch(e){if(alive.current)setError(e.message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function loadVoices(append=false){
    const params=new URLSearchParams({search:query});if(append&&next)params.set('next_page_token',next);
    const result=await api(`/api/voice/tts/voices?${params}`);if(!alive.current)return;
    setVoices(old=>[...new Map([...(append?old:[]),...result.voices].map(v=>[v.voice_id,v])).values()]);setNext(result.has_more?result.next_page_token:null);
  }
  function saveKey(){return run(async()=>{
    const saved=await api('/api/voice/tts/settings','POST',{provider:config.provider,voice_id:config.voice_id,model_id:config.model_id,role_voices:config.role_voices||{},api_key:key});
    if(!alive.current)return;setKey('');setConfig(saved);await loadVoices();setMessage('API Key 已保存到本机后端，账户音色已读取。');
  });}
  function save(){return run(async()=>{const saved=await api('/api/voice/tts/settings','POST',settings());if(alive.current){apply(saved);setMessage('语音设置已保存。重新接通时生效，也可在通话卡片中切换。');window.dispatchEvent(new Event('lydia-voice-settings-changed'));}});}
  function clear(){return run(async()=>{speech.current?.stop();const saved=await api('/api/voice/tts/settings','POST',{...settings(),provider:'browser',clear_key:true});if(alive.current){apply(saved);setVoices([]);setMessage('本机保存的 Key 已删除，已切回浏览器声音。');window.dispatchEvent(new Event('lydia-voice-settings-changed'));}});}
  function preview(role=null){
    speech.current?.stop();setError('');setMode('');setPreviewing(true);
    const selected=role?(roles[role]||voice):voice;
    const audio=remoteSpeech('/api/voice/tts/preview',{lang:'zh-CN',voice_id:selected,model_id:model,role:role||'steve',kind:'preview'},{onMode:value=>{if(alive.current)setMode(value);}});speech.current=audio;
    audio.promise.then(result=>{if(!alive.current||speech.current!==audio)return;speech.current=null;setPreviewing(false);if(result.status==='FAILED')setError(result.error);});
  }
  const options=()=>voices.map(v=><option key={v.voice_id} value={v.voice_id}>{v.name} · {v.category}</option>);
  const selectedKnown=voices.some(v=>v.voice_id===voice);
  return <div className="voice-settings">
    <section className="set-section"><h3 className="set-section__title">专家声音</h3>
      <p className="set-muted">Claude CLI 继续负责讨论与回答。这里只更换朗读声音，语音识别保持原样。</p>
      <label>语音服务<select aria-label="语音服务" value={provider} onChange={e=>setProvider(e.target.value)}><option value="browser">浏览器 / Windows 声音</option><option value="elevenlabs">ElevenLabs 云端声音</option></select></label>
      <p className="set-muted">ElevenLabs 会接收需要朗读的文字，合成与试听使用你的账户额度；不会自动购买套餐，也不会在失败时自动重试。</p>
    </section>
    <section className="set-section"><h3 className="set-section__title">ElevenLabs 连接</h3>
      <p className="set-muted">{config?.key_configured?`Key 已配置 · ${config.key_source==='environment'?'后端环境变量':'本机加密保存'}`:'尚未配置 API Key'}。Key 不会回传到页面或保存在浏览器。</p>
      <label>ElevenLabs API Key<input type="password" autoComplete="new-password" maxLength={512} value={key} onChange={e=>setKey(e.target.value)} placeholder="仅在需要新增或替换时填写" /></label>
      <div className="voice-settings__buttons"><button type="button" className="set-btn" disabled={busy||!config||key.trim().length<10} onClick={saveKey}>保存 Key 并读取音色</button>
        {config?.key_source==='local_encrypted_store'&&<button type="button" className="set-btn" disabled={busy} onClick={clear}>删除本机 Key</button>}</div>
      <p className="set-muted"><a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">在 ElevenLabs 创建 API Key</a> · 需要 TTS 和音色读取权限。建议在服务商设置 Key 的额度上限。</p>
    </section>
    <section className="set-section"><h3 className="set-section__title">音色与模型</h3>
      <div className="voice-settings__search"><input aria-label="搜索 ElevenLabs 音色" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索账户中的音色" /><button type="button" className="set-btn" disabled={busy||!config?.key_configured} onClick={()=>run(()=>loadVoices())}>读取音色</button></div>
      <label>默认 ElevenLabs 音色<select aria-label="默认 ElevenLabs 音色" value={voice} onChange={e=>setVoice(e.target.value)}><option value="">请选择账户音色</option>{voice&&!selectedKnown&&<option value={voice}>已保存音色 · {voice}</option>}{options()}</select></label>
      {next&&<button type="button" className="set-btn" disabled={busy} onClick={()=>run(()=>loadVoices(true))}>加载更多音色</button>}
      <label>语音模型<select aria-label="语音模型" value={model} onChange={e=>setModel(e.target.value)}><option value="eleven_flash_v2_5">Flash v2.5 · 通话优先</option><option value="eleven_multilingual_v2">Multilingual v2 · 长文本表现优先</option></select></label>
      <p className="set-muted">可选择账户里创建的授权克隆音色。这个接入不上传声样本、不代为克隆，也不下载 ElevenLabs 的声音模型。</p>
      {experts.map(([id,name])=><label key={id}>{name} 的音色<select aria-label={`${name} 的音色`} value={roles[id]||''} onChange={e=>setRoles(old=>{const result={...old};if(e.target.value)result[id]=e.target.value;else delete result[id];return result;})}><option value="">跟随默认音色</option>{roles[id]&&!voices.some(v=>v.voice_id===roles[id])&&<option value={roles[id]}>已保存 · {roles[id]}</option>}{options()}</select></label>)}
      <div className="voice-settings__buttons"><button type="button" className="set-btn" disabled={!config?.key_configured||!voice||busy} onClick={()=>preview()}>试听所选音色（使用额度）</button>
        {previewing&&<button type="button" className="set-btn" onClick={()=>{speech.current?.stop();setPreviewing(false);}}>停止试听</button>}</div>
      {mode&&<p className="set-muted">{mode==='streaming'?'此浏览器使用流式播放。':'此浏览器使用完整缓冲后播放。'}</p>}
    </section>
    <button type="button" className="set-btn" disabled={busy||!config||(provider==='elevenlabs'&&(!voice||!config.key_configured))} onClick={save}>保存语音设置</button>
    {message&&<p role="status">{message}</p>}{error&&<p className="voice-settings__error" role="alert">{error}</p>}
  </div>;
}
