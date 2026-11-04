const $=s=>document.querySelector(s);
const state={csrf:null,configured:false,active:null,cases:[],snapshot:null,tab:'chat',health:null,polling:false};
const phaseLabels={SCOPED:'范围已建立',RESEARCHING:'研究中',AWAITING_SELECTION:'等待你选择缺口',MODELING:'商业模式阶段'};
const statusLabels={QUEUED:'排队中',RUNNING:'研究中',PAUSED:'已暂停',FAILED:'未通过',COMPLETED:'已完成',CANCELLED:'已取消'};
const claimLabels={SOURCE_SUPPORTED:'来源支持',RESEARCH_INFERENCE:'研究推断',TO_VALIDATE:'待验证假设'};
const team=[['steve','SB','Steve Blank','客户发现与验证'],['teresa','TT','Teresa Torres','用户问题与机会'],['april','AD','April Dunford','替代方案与定位'],['bob','BM','Bob Moesta','购买动机与企业要求'],['ash','AM','Ash Maurya','商业模式与最小验证']];
function el(tag,props={},children=[]){const n=document.createElement(tag);for(const [k,v]of Object.entries(props)){if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(k==='class')n.className=v;else n.setAttribute(k,v);}for(const c of children)n.append(typeof c==='string'?document.createTextNode(c):c);return n;}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',6000);}
async function api(path,method='GET',data){
  let r;try{r=await fetch(path,{method,headers:{...(data?{'content-type':'application/json'}:{}),...(state.csrf?{'x-csrf-token':state.csrf}:{})},body:data?JSON.stringify(data):undefined,credentials:'same-origin',cache:'no-store'});$('#offline').hidden=true;}
  catch{if(!$('#workspace').hidden)$('#offline').hidden=false;throw new Error('无法连接电脑上的研究服务');}
  const j=await r.json();if(!r.ok){if(r.status===401){state.csrf=null;await showAuth();}throw new Error(j.error?.message||'请求未成功');}return j;
}
function guarded(fn){return async event=>{const submit=event?.type==='submit'?event.currentTarget.querySelector('button[type=submit]'):null;if(submit?.disabled)return;if(submit)submit.disabled=true;try{await fn(event);}catch(e){toast(e.message);}finally{if(submit)submit.disabled=false;}};}
async function showAuth(){
  $('#workspace').hidden=true;$('#auth-screen').hidden=false;
  const s=await api('/api/auth/status');state.configured=s.configured;state.csrf=s.csrf;
  if(s.authenticated){await enter();return;}
  $('#auth-description').textContent=s.configured?'登录你的个人研究空间，继续上次的项目。':s.local?'先在这台电脑上设置个人访问密码（至少 12 字符）。手机之后使用相同密码登录。':'请先在运行服务的电脑上完成首次密码设置。';
  $('#auth-form').hidden=!s.configured&&!s.local;$('#auth-submit').textContent=s.configured?'进入研究空间':'设置密码并进入';$('#password').minLength=s.configured?1:12;$('#password').autocomplete=s.configured?'current-password':'new-password';
}
async function enter(){
  $('#auth-screen').hidden=true;$('#workspace').hidden=false;state.cases=await api('/api/cases');
  if(!state.active&&state.cases.length)state.active=state.cases[0].id;
  renderProjects();if(state.active)await refresh();else render();
  loadHealth().catch(()=>{});
}
function renderProjects(){
  $('#project-count').textContent=state.cases.length;
  $('#project-list').replaceChildren(...state.cases.map(c=>el('button',{class:`project-button ${state.active===c.id?'active':''}`,text:`◇  ${c.title}`,onclick:guarded(async()=>{state.active=c.id;state.tab='chat';$('#sidebar').classList.remove('open');await refresh();})})));
}
async function refresh(){if(!state.active)return;state.snapshot=await api(`/api/cases/${state.active}`);render();}
async function loadHealth(){state.health=await api('/api/health');$('#health-button').textContent=state.health.skills.every(s=>s.status==='LOADED')?'本机已连接':'连接与待办';renderTeam();if(state.tab==='settings')render();}
function renderTeam(){
  $('#team-list').replaceChildren(...team.map(([role,initial,name,task])=>el('div',{class:'team-item'},[el('span',{class:'team-initial',text:initial}),el('div',{class:'team-copy'},[el('span',{text:name}),el('small',{text:task})]),el('span',{class:'team-state',text:state.health?.skills.find(s=>s.role===role)?.status==='LOADED'?'已读入':'待加载'})])));
}
function welcome(){
  const box=el('div',{class:'welcome'},[el('p',{class:'eyebrow',text:'RESEARCH BEFORE YOU BUILD'}),el('h2',{text:state.active?'先看清问题，再决定做什么。':'一个 idea，背后一整个团队。'}),el('p',{text:state.active?state.snapshot.case.brief:'把你的 hackathon idea 或比赛 brief 发给我。我们一起了解谁遇到问题、现有方案做到哪里，以及企业为什么可能采用你的产品。'})]);
  for(const [n,title,desc]of [['01','从事实开始','把公开线索、我们的解释和待验证假设分开。'],['02','看到企业的采用条件','同时调查谁使用、谁付款，以及产品需要做到什么。'],['03','选择权留给你','先交付缺口清单；你明确选择后，再讨论最小方案。']])box.append(el('div',{class:'welcome-rule'},[el('span',{text:n}),el('div',{},[el('strong',{text:title}),el('p',{text:desc})])]));
  if(!state.active)box.append(el('button',{class:'primary',text:'＋ 创建第一个研究项目',onclick:()=>$('#new-dialog').showModal()}));return box;
}
function message(name,content,user=false){return el('article',{class:`message ${user?'user':''}`},[el('div',{class:'message-head'},[el('span',{class:'mini-avatar',text:user?'YOU':'SB'}),el('span',{text:name})]),el('div',{class:'message-body',text:content})]);}
function taskCard(t){
  const card=el('div',{class:'task-card'},[el('strong',{text:`${statusLabels[t.status]} · ${t.kind==='research'?'需求研究':t.kind==='model'?'商业模式':'顾问问答'}`})]);
  if(t.checkpoint?.current)card.append(el('p',{text:`当前步骤：${t.checkpoint.current}`}));
  if(t.checkpoint?.collection)card.append(el('p',{text:`联网采集：${t.checkpoint.collection.status}。已读资料与未确认线索会分开处理。`}));
  if(t.error)card.append(el('p',{text:t.error.message}));
  if(t.status==='PAUSED')card.append(el('button',{text:'恢复此任务',onclick:guarded(async()=>{await api(`/api/tasks/${t.id}/resume`,'POST',{});await refresh();})}));
  if(['QUEUED','RUNNING','PAUSED'].includes(t.status))card.append(el('button',{text:'取消任务',onclick:guarded(async()=>{await api(`/api/tasks/${t.id}/cancel`,'POST',{});await refresh();})}));
  return card;
}
function renderChat(){
  const s=state.snapshot;if(!s||!s.tasks.length)return [welcome()];const nodes=[];
  for(const t of s.tasks){nodes.push(message('你',t.input.message,true));nodes.push(taskCard(t));const a=s.artifacts.findLast(a=>a.task_id===t.id&&a.kind==='summary');if(a)nodes.push(message('Steve · 团队汇总',a.content));}
  return nodes;
}
function header(title,action){return el('div',{class:'section-header'},[el('h2',{text:title}),...(action?[action]:[])]);}
function empty(text){return el('div',{class:'empty',text});}
function renderEvidence(){
  const s=state.snapshot;if(!s)return [empty('先创建一个项目，再添加资料。')];
  const search=el('form',{class:'search-form',onsubmit:guarded(async e=>{e.preventDefault();const q=new FormData(e.currentTarget).get('query');const r=await api(`/api/cases/${state.active}/retrieve`,'POST',{query:q});const box=$('#retrieval-results');box.replaceChildren(el('p',{class:'muted',text:`${r.mode} · ${r.reason}`}));for(const m of r.matches)box.append(el('div',{class:'card'},[el('h3',{text:`${m.source_id} · ${m.title}`}),el('p',{text:m.content})]));if(!r.matches.length)box.append(empty('没有找到足够相关的片段。'));})},[el('input',{name:'query',required:'',placeholder:'检索本项目的原文证据…','aria-label':'检索证据'}),el('button',{type:'submit',text:'检索'})]);
  return [header('来源与证据',el('button',{text:'＋ 添加资料',onclick:()=>$('#source-dialog').showModal()})),el('p',{class:'muted',text:'上传资料和公开网页未经独立核实。来源表达了什么，与事实是否成立分开判断。'}),search,el('div',{id:'retrieval-results'}),...s.evidence.map(e=>{
    const c=el('article',{class:'card'},[el('span',{class:'badge',text:`${e.source_id} · v${e.version}`}),el('span',{class:`badge ${!e.active?'warning':''}`,text:e.active?'当前版本':'历史版本'}),el('h3',{text:e.title}),el('p',{text:e.content.slice(0,550)}),el('p',{class:'muted',text:`发布日期：${e.meta.published_at||'未知'} · 地区：${e.meta.region||'未确认'} · ${e.meta.embedding_status||'未索引'}`})]);
    if(e.url){const a=el('a',{href:e.url,target:'_blank',rel:'noopener noreferrer',text:'查看原始来源 ↗'});if(/^https?:\/\//.test(e.url))c.append(a);}
    c.append(el('details',{},[el('summary',{text:'查看完整正文与限制'}),el('pre',{text:e.content}),el('p',{text:e.meta.limitations||'来源限制尚待补充'})]));return c;
  }),...(s.fetch_attempts||[]).filter(a=>a.status==='FAILED').map(a=>el('div',{class:'card'},[el('span',{class:'badge warning',text:'正文未读取 · 不计证据'}),el('p',{text:a.url}),el('p',{text:a.details.code||'FETCH_FAILED'})])),...(!s.evidence.length?[empty('暂无市场证据。添加来源后，再判断需求。')]:[])];
}
function renderGaps(){const s=state.snapshot;return [header('有证据的缺口，等你判断'),el('p',{class:'muted',text:'“继续研究”不会自动选定方向。明确选择具体 Gap 后，才进入商业模式。'}),...(s?.gaps||[]).map(g=>el('article',{class:'card'},[el('span',{class:'badge',text:g.id}),el('span',{class:'badge',text:claimLabels[g.data.claim_label]||'待验证'}),el('h3',{text:g.data.name}),el('p',{text:g.data.problem}),el('p',{text:`使用者：${g.data.users}\n可能付款方：${g.data.payer}\n证据：${(g.data.evidence_ids||[]).join('、')||'暂无'}\n首先验证：${g.data.first_validation_question}`}),el('details',{},[el('summary',{text:'查看场景、替代方案与限制'}),el('pre',{text:JSON.stringify(g.data,null,2)})]),el('div',{class:'card-actions'},[el('button',{class:'primary',text:s.case.selected_gap_id===g.id?'已选择此缺口':'选择这个 Gap',onclick:guarded(async()=>{if(!confirm(`确认选择 ${g.id}「${g.data.name}」进入商业模式阶段？`))return;await api(`/api/cases/${state.active}/selection`,'POST',{gap_id:g.id,confirmed:true,user_message:`我明确选择 ${g.id}：${g.data.name}`});await refresh();toast('已记录你的选择，可以开始商业模式任务。');})})])])),...(!s?.gaps.length?[empty('目前没有缺口候选。研究未完成或证据不足时，不生成看似真实的清单。')]:[])];}
function renderRequirements(){const s=state.snapshot;return [header('企业采用产品，需要什么？'),el('p',{class:'muted',text:'从业务问题、使用任务到产品与采购要求。具体数值没有依据时保持未知。'}),...(s?.requirements||[]).map(r=>el('article',{class:'card'},[el('span',{class:'badge',text:r.id}),el('span',{class:'badge',text:claimLabels[r.data.claim_label]||'待验证'}),el('h3',{text:r.data.statement}),el('p',{text:`提出方：${r.data.company_or_segment} / ${r.data.requesting_role}\n范围：${r.data.scope}\n验收方式：${r.data.acceptance_criterion}\n依据：${(r.data.evidence_ids||[]).join('、')||'尚待验证'}`}),el('details',{},[el('summary',{text:'查看要求记录'}),el('pre',{text:JSON.stringify(r.data,null,2)})])])),...(!s?.requirements.length?[empty('暂无企业要求。需求推断不会被自动写成企业的明确采购条件。')]:[])];}
function renderSettings(){
  const h=state.health;if(!h)return [empty('正在检查连接…')];
  const card=el('div',{class:'card'},[el('h3',{text:'你的电脑，你的研究空间'}),el('p',{text:'Claude CLI 使用你的订阅联网推理；资料检索、embedding 与数据库在电脑上运行。RAG 片段会随请求发送到 Claude。'})]);
  const pairs=[['数据库',h.database],['Claude 登录',h.cli.authMethod?`${h.cli.authMethod} · ${h.cli.subscriptionType}`:h.cli.message||'待确认'],['本地 embedding',h.embedding.status],['额外付费 API 预算','USD 0'],['额外用量关闭确认',h.subscriptionNoOverageConfirmed?'已记录':'待你确认']];
  for(const [a,b]of pairs)card.append(el('div',{class:'setting-row'},[el('span',{text:a}),el('strong',{text:b})]));
  if(!h.subscriptionNoOverageConfirmed)card.append(el('button',{text:'我已在 Claude 官方设置关闭额外用量',onclick:guarded(async()=>{await api('/api/settings/subscription','POST',{confirmed:true});await loadHealth();toast('已记录确认；额度用尽将暂停。');})}));
  const nodes=[header('连接与设置',el('button',{text:'重新检查',onclick:guarded(loadHealth)})),card];
  if(state.active)nodes.push(el('div',{class:'card'},[el('h3',{text:'导出当前项目'}),el('p',{text:'在电脑案件目录保存版本快照，并下载一份含所有报告文件的 JSON 包。'}),el('button',{text:'导出研究报告',onclick:guarded(async()=>{const result=await api(`/api/cases/${state.active}/export`,'POST',{});const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`crew-report-${state.active}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已保存版本快照并开始下载。');})})]));
  for(const s of h.skills)nodes.push(el('div',{class:'card'},[el('h3',{text:`${team.find(t=>t[0]===s.role)?.[2]||'流程主控'} · ${s.status==='LOADED'?'已读入':'待恢复技能'}`}),el('p',{text:s.message||`显式注入方法上下文；${s.files?.length||0} 个文件已读取并记录版本。`})]));
  nodes.push(el('div',{class:'card'},[el('h3',{text:'添加到手机主屏幕'}),el('p',{text:'先配置手机信任的 HTTPS，并让手机能连接电脑。在浏览器菜单选择“添加到主屏幕／安装应用”。电脑需要保持运行；当前电脑网页测试不代表手机安装已通过。'})]));
  return nodes;
}
function render(){
  const s=state.snapshot,c=state.cases.find(c=>c.id===state.active);$('#project-title').textContent=c?.title||'开始一个新项目';$('#phase').textContent=s?phaseLabels[s.case.phase]:'尚未开始';
  $('#evidence-count').textContent=s?.evidence.filter(e=>e.active).length||0;$('#gap-count').textContent=s?.gaps.length||0;$('#requirement-count').textContent=s?.requirements.length||0;
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  const content=$('#content'),bottom=content.scrollHeight-content.scrollTop-content.clientHeight<80;
  const views={chat:renderChat,evidence:renderEvidence,gaps:renderGaps,requirements:renderRequirements,settings:renderSettings};content.replaceChildren(...views[state.tab]());
  $('#composer-area').hidden=state.tab!=='chat';if(state.tab==='chat'&&bottom)content.scrollTop=content.scrollHeight;renderProjects();renderTeam();
}
$('#auth-form').addEventListener('submit',guarded(async e=>{e.preventDefault();const button=$('#auth-submit');button.disabled=true;try{const password=$('#password').value;if(!state.configured)await api('/api/auth/setup','POST',{password});const s=await api('/api/auth/login','POST',{password});state.csrf=s.csrf;$('#password').value='';await enter();}finally{button.disabled=false;}}));
$('#new-project').onclick=()=>$('#new-dialog').showModal();
$('#menu').onclick=()=>$('#sidebar').classList.toggle('open');
document.addEventListener('pointerdown',event=>{if(window.innerWidth<=650&&!$('#sidebar').contains(event.target)&&!$('#menu').contains(event.target))$('#sidebar').classList.remove('open');});
$('#health-button').onclick=guarded(async()=>{state.tab='settings';render();await loadHealth();});
$('#logout').onclick=guarded(async()=>{await api('/api/auth/logout','POST',{});state.active=null;state.snapshot=null;state.health=null;navigator.serviceWorker?.controller?.postMessage('CLEAR_PRIVATE_CACHE');await showAuth();});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
$('#new-form').addEventListener('submit',guarded(async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const c=await api('/api/cases','POST',data);state.active=c.id;state.tab='chat';state.cases=await api('/api/cases');$('#new-dialog').close();e.target.reset();$('#sidebar').classList.remove('open');await refresh();}));
$('#chat-form').addEventListener('submit',guarded(async e=>{e.preventDefault();const message=$('#message').value.trim();if(!message)return;if(!state.active){$('#new-form [name=brief]').value=message;$('#new-dialog').showModal();return;}await api(`/api/cases/${state.active}/tasks`,'POST',{kind:$('#task-kind').value,message,request_key:crypto.randomUUID()});$('#message').value='';await refresh();}));
$('#add-source').onclick=()=>state.active?$('#source-dialog').showModal():toast('先创建一个研究项目');
$('#source-file').addEventListener('change',guarded(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>500000||!/^.*\.(txt|md|json|csv)$/i.test(file.name))throw new Error('请选择 500 KB 内的文本资料');const text=await file.text();if(text.length>150000)throw new Error('正文超过 150000 字符');$('#source-form [name=content]').value=text;$('#source-form [name=title]').value=file.name;}));
$('#source-form').addEventListener('submit',guarded(async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(data.url)await api(`/api/cases/${state.active}/sources`,'POST',{url:data.url});else{if(!data.title||!data.content)throw new Error('请填写资料标题与正文');await api(`/api/cases/${state.active}/documents`,'POST',{title:data.title,content:data.content,collection:data.collection});}$('#source-dialog').close();e.target.reset();state.tab='evidence';await refresh();toast('资料已保存；来源内容仍需核实。');}));
setInterval(async()=>{if(state.polling||$('#workspace').hidden||!state.active||state.tab!=='chat')return;const active=state.snapshot?.tasks.some(t=>['QUEUED','RUNNING'].includes(t.status));if(!active)return;state.polling=true;try{await refresh();}catch{}finally{state.polling=false;}},2000);
window.addEventListener('online',()=>{if(state.active)refresh().catch(()=>{});});window.addEventListener('offline',()=>$('#offline').hidden=false);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
showAuth().catch(e=>{$('#auth-description').textContent=e.message;});
