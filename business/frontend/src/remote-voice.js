import {apiResponse} from './api.js';

/** Authenticated streamed MP3. No credential, text or audio is saved in browser storage. */
export function remoteSpeech(route,body,{onStart,onMode}={}) {
  const abort=new AbortController(),audio=new Audio();let source,buffer,url,reader,settle,finished=false,started=false,startTimer;
  const maxTimer=setTimeout(()=>finish({status:'FAILED',progress:started?'UNKNOWN':'NONE',error:'语音播放超时'}),180000);
  const promise=new Promise(resolve=>{settle=resolve;});
  function finish(result){
    if(finished)return;finished=true;clearTimeout(maxTimer);clearTimeout(startTimer);abort.abort();
    void reader?.cancel().catch(()=>{});audio.onplaying=audio.onended=audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();
    if(url)URL.revokeObjectURL(url);settle(result);
  }
  function fail(e){if(!finished)finish({status:'FAILED',progress:started?'UNKNOWN':'NONE',error:e?.message||'语音播放失败'});}
  audio.onplaying=()=>{if(!started&&!finished){started=true;clearTimeout(startTimer);onStart?.();}};
  audio.onended=()=>finish({status:'PLAYED',progress:'COMPLETE'});
  audio.onerror=()=>fail(new Error('浏览器无法播放返回的音频，可在语音设置中选择浏览器声音。'));
  startTimer=setTimeout(()=>fail(new Error('语音生成或自动播放未启动，请手动试听或重新接通。')),30000);
  // Invoke play on the first append; report onStart only on a real playing event.
  let playRequested=false;
  const play=()=>{if(!playRequested&&!finished){playRequested=true;void audio.play().catch(fail);}};
  async function append(bytes){
    if(finished)throw new Error('已停止播放');
    await new Promise((resolve,reject)=>{
      const cleanup=()=>{buffer.removeEventListener('updateend',done);buffer.removeEventListener('error',error);abort.signal.removeEventListener('abort',error);};
      const done=()=>{cleanup();resolve();},error=()=>{cleanup();reject(new Error('音频流已停止或解码失败'));};
      buffer.addEventListener('updateend',done,{once:true});buffer.addEventListener('error',error,{once:true});abort.signal.addEventListener('abort',error,{once:true});
      try{buffer.appendBuffer(bytes);}catch(e){cleanup();reject(e);}
    });
    play();
  }
  void (async()=>{
    const response=await apiResponse(route,'POST',body,{signal:abort.signal});
    if(finished)return;
    if(!/^audio\/mpeg/i.test(response.headers.get('content-type')||''))throw new Error('语音服务未返回 MP3 音频');
    reader=response.body.getReader();let size=0;
    if(window.MediaSource?.isTypeSupported?.('audio/mpeg')){
      onMode?.('streaming');source=new MediaSource();url=URL.createObjectURL(source);audio.src=url;
      await new Promise((resolve,reject)=>{
        const cleanup=()=>{source.removeEventListener('sourceopen',open);abort.signal.removeEventListener('abort',stop);};
        const open=()=>{cleanup();resolve();},stop=()=>{cleanup();reject(new Error('已停止播放'));};
        source.addEventListener('sourceopen',open,{once:true});abort.signal.addEventListener('abort',stop,{once:true});
      });
      if(finished)return;
      buffer=source.addSourceBuffer('audio/mpeg');buffer.mode='sequence';
      for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8*1024*1024)throw new Error('语音流超过大小限制');await append(chunk.value);}
      if(!size)throw new Error('语音服务返回空音频');if(!finished&&source.readyState==='open')source.endOfStream();
    }else{
      onMode?.('buffered');const chunks=[];
      for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8*1024*1024)throw new Error('音频超过大小限制');chunks.push(chunk.value);}
      if(finished)return;if(!size)throw new Error('语音服务返回空音频');
      url=URL.createObjectURL(new Blob(chunks,{type:'audio/mpeg'}));audio.src=url;play();
    }
  })().catch(fail);
  return {promise,stop(){finish({status:'INTERRUPTED',progress:started?'UNKNOWN':'NONE'});}};
}
