// Design artifact only. No application imports or backend calls.
document.querySelectorAll('.chat-shell').forEach(shell=>{
  const voice=shell.querySelector('.voice'),header=shell.querySelector('.topbar');
  const button=voice.querySelector('button');
  button.setAttribute('aria-label','开始通话');button.setAttribute('title','语音通话 · 与 Steve 继续讨论');button.setAttribute('aria-expanded','false');
  header.insertBefore(voice,header.lastElementChild);
  const popup=document.createElement('div');popup.className='voice-popover';popup.hidden=true;
  popup.innerHTML=`<div class="voice-intro">${voice.querySelector('.avatar').outerHTML}<div><strong>语音通话</strong><small>与 Steve 继续讨论</small></div></div><button class="voice-confirm">开始通话 ${button.querySelector('svg').outerHTML}</button><p class="voice-note">此处是设计参考，不会接通真实通话。</p>`;
  header.append(popup);
  button.addEventListener('click',()=>{popup.hidden=!popup.hidden;button.setAttribute('aria-expanded',String(!popup.hidden));});
});
const params=new URLSearchParams(location.search);
if(params.get('call')==='open')document.querySelector('.selected .voice>button')?.click();
