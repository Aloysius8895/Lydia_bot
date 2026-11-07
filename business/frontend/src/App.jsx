import { useEffect, useMemo, useRef, useState } from 'react';
import { bots as seedBots, rooms as seedRooms } from './data.js';
import { api, setCsrf } from './api.js';
import { useHashRoute, useMediaQuery, useTheme } from './hooks.js';
import Sidebar from './components/Sidebar.jsx';
import Conversation from './components/Conversation.jsx';
import MobileHome from './components/MobileHome.jsx';
import MobileNav from './components/MobileNav.jsx';
import ResearchPanel from './components/ResearchPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import ProjectsPage from './components/ProjectsPage.jsx';
import { AuthScreen, NewProject, ProjectPicker, TaskProgress } from './components/ResearchForms.jsx';
import CallCard from './components/CallCard.jsx';
import Icon from './components/Icon.jsx';
import { BotAvatar } from './components/Avatars.jsx';
import KnowledgeWorkspace from './components/KnowledgeWorkspace.jsx';

const phases = { SCOPED: '范围已建立', RESEARCHING: '研究中', AWAITING_SELECTION: '等待选择缺口', MODELING: '商业模式阶段' };
export default function App() {
  const requestedRoute = useHashRoute(), isMobile = useMediaQuery('(max-width: 760px)');
  const lastRoute = useRef(requestedRoute.kind === 'knowledge' ? (isMobile ? {kind:'home'} : {kind:'bot',id:'steve'}) : requestedRoute);
  const lastHash = useRef(isMobile ? '#/' : '#/bot/steve');
  const inKnowledge = requestedRoute.kind === 'knowledge';
  if (!inKnowledge) { lastRoute.current = requestedRoute; lastHash.current = window.location.hash || '#/'; }
  const route = inKnowledge ? lastRoute.current : requestedRoute;
  const [theme, toggleTheme] = useTheme();
  const [auth, setAuth] = useState(null), [cases, setCases] = useState([]), [active, setActive] = useState('');
  const [snapshot, setSnapshot] = useState(null), [health, setHealth] = useState(null), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [query, setQuery] = useState(''), [kind, setKind] = useState('research');
  const [workspaceTab, setWorkspaceTab] = useState('project'), [panelSignal, setPanelSignal] = useState(0), [globalPanel, setGlobalPanel] = useState(false), [settings, setSettings] = useState(() => { const section=new URLSearchParams(window.location.search).get('settings'); return ['crawl','phone'].includes(section) ? section : null; });
  const mutation = useRef(false), activeRef = useRef(''), generation = useRef(0);
  const [callOpen, setCallOpen] = useState(false), callControl = useRef(null);
  useEffect(() => {
    if (!isMobile) return;
    const viewport = window.visualViewport;
    const resize = () => document.documentElement.style.setProperty('--mobile-height', `${Math.round(viewport?.height || window.innerHeight)}px`);
    resize(); viewport?.addEventListener('resize', resize); window.addEventListener('resize', resize);
    return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); document.documentElement.style.removeProperty('--mobile-height'); };
  }, [isMobile]);
  const requestedCase = useRef(new URLSearchParams(window.location.hash.split('?')[1] || '').get('case'));
  const botsById = useMemo(() => Object.fromEntries(seedBots.map(b => [b.id, b])), []);
  const bots = useMemo(() => seedBots.map(bot => ({ ...bot, preview: bot.role })), []);
  const advisor = botsById.steve;
  const room = route.kind === 'room' ? seedRooms.find(r => r.id === route.id) : null;
  const method = botsById[route.id] || advisor;
  const rooms = seedRooms.map(r => ({ ...r, preview: 'Steve coordinates your research team' }));
  const hasConversation = route.kind === 'bot' || Boolean(room) || (!isMobile && route.kind === 'home');
  // The dialled expert is the one selected in the expert list (#/bot/<id>); the team room has no single expert to call.
  const callBot = room ? null : method;
  // Switching project or expert unmounts the card, which hangs up and drops late callbacks.
  useEffect(() => { setCallOpen(false); }, [active, route.kind, route.id]);

  function resetSession() {
    generation.current++; setCsrf(null); activeRef.current = ''; setActive(''); setCases([]); setSnapshot(null); setHealth(null); setGlobalPanel(false); setSettings(null);
    setAuth(s => ({ ...(s || {}), authenticated: false }));
  }
  useEffect(() => {
    let ignore = false;
    api('/api/auth/status').then(s => { if (!ignore) { setCsrf(s.csrf); setAuth(s); } }).catch(e => { if (!ignore) setNotice(e.message); });
    window.addEventListener('lydia-auth-expired', resetSession);
    return () => { ignore = true; window.removeEventListener('lydia-auth-expired', resetSession); };
  }, []);
  useEffect(() => {
    if (!auth?.authenticated) return;
    let ignore = false;
    api('/api/cases').then(list => { if (!ignore) { setCases(list); setActive(id => list.some(c => c.id === id) ? id : list.some(c => c.id === requestedCase.current) ? requestedCase.current : (list[0]?.id || '')); } }).catch(e => { if (!ignore) setNotice(e.message); });
    api('/api/health').then(value => { if (!ignore) setHealth(value); }).catch(e => { if (!ignore) setNotice(e.message); });
    return () => { ignore = true; };
  }, [auth?.authenticated]);
  useEffect(() => {
    activeRef.current = active; setSnapshot(null); setKind('research');
    if (!active || !auth?.authenticated) return;
    let ignore = false, timer;
    async function poll() {
      try { const value = await api(`/api/cases/${active}`); if (!ignore) setSnapshot(value); }
      catch (e) { if (!ignore) setNotice(e.message); }
      finally { if (!ignore) timer = setTimeout(poll, 2200); }
    }
    void poll(); return () => { ignore = true; clearTimeout(timer); };
  }, [active, auth?.authenticated]);
  useEffect(() => {
    if (!inKnowledge && !isMobile && route.kind === 'home') window.location.replace('#/bot/steve');
  }, [isMobile, route.kind, inKnowledge]);
  useEffect(() => {
    const selectFromLink = () => { const id = new URLSearchParams(window.location.hash.split('?')[1] || '').get('case'); if (id && cases.some(c => c.id === id)) { activeRef.current = id; setActive(id); } };
    window.addEventListener('hashchange', selectFromLink);
    return () => window.removeEventListener('hashchange', selectFromLink);
  }, [cases]);
  useEffect(() => {
    if (active && auth?.authenticated) {
      const base = window.location.hash.split('?')[0] || (isMobile ? '#/' : '#/bot/steve');
      window.history.replaceState(null, '', `${base}?case=${encodeURIComponent(active)}`);
    }
  }, [active, auth?.authenticated, route.kind, route.id, isMobile]);

  async function perform(fn) {
    if (mutation.current) return false;
    mutation.current = true; setBusy(true); setNotice('');
    try { return (await fn()) ?? true; } catch (e) { setNotice(e.message); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  async function refresh(id = activeRef.current) {
    if (!id) return;
    const value = await api(`/api/cases/${id}`);
    if (activeRef.current === id) setSnapshot(value);
  }
  async function login(password) {
    return perform(async () => {
      if (!auth.configured) { await api('/api/auth/setup', 'POST', { password }); setAuth(value => ({ ...value, configured: true })); }
      const value = await api('/api/auth/login', 'POST', { password }); setCsrf(value.csrf);
      setAuth({ ...auth, authenticated: true, configured: true }); return true;
    });
  }
  function createProject(data) {
    return perform(async () => {
      const project = await api('/api/cases', 'POST', data);
      setCases(list => [project, ...list]); setActive(project.id); activeRef.current = project.id;
      setWorkspaceTab('project'); window.location.hash = `#/projects?case=${encodeURIComponent(project.id)}`; return project;
    });
  }
  function openWorkspace(tab) { setWorkspaceTab(tab); setPanelSignal(value => value + 1); if (!hasConversation) setGlobalPanel(true); }
  function selectProject(id) { if (!cases.some(c => c.id === id)) return; activeRef.current = id; setActive(id); }
  function openProjects() { setGlobalPanel(false); window.location.hash = '#/projects' + (activeRef.current ? '?case=' + encodeURIComponent(activeRef.current) : ''); }
  function openKnowledge() { setSettings(null); setGlobalPanel(false); void callControl.current?.hangup?.(); setCallOpen(false); window.location.hash = '#/knowledge' + (activeRef.current ? '?case=' + encodeURIComponent(activeRef.current) : ''); }
  function returnFromKnowledge() { window.location.hash = lastHash.current; }
  async function researchIdea(id) { const list=await api('/api/cases'); setCases(list); activeRef.current=id; setActive(id); window.location.hash='#/bot/steve?case='+encodeURIComponent(id); }
  function discussProject(id) { selectProject(id); setGlobalPanel(false); window.location.hash = '#/bot/steve?case=' + encodeURIComponent(id); }
  const addProjectSource = (id, type, data) => perform(async () => { if (!cases.some(c => c.id === id)) throw Error('请选择有效项目'); await api(`/api/cases/${id}/${type}`, 'POST', data); await refresh(id); return true; });
  function send(text) {
    return perform(async () => {
      let id = activeRef.current;
      if (!id) {
        const project = await api('/api/cases', 'POST', { title: text.slice(0, 70), brief: text, region: '马来西亚' });
        id = project.id; activeRef.current = id; setCases(list => [project, ...list]); setActive(id);
      }
      if (kind === 'model' && !snapshot?.case.selected_gap_id) throw new Error('请先在缺口页明确选择一个 Gap，再开始商业模式。');
      await api(`/api/cases/${id}/tasks`, 'POST', { kind, message: text, request_key: crypto.randomUUID() });
      await refresh(id); return true;
    });
  }
  const taskAction = (id, action) => perform(async () => { await api(`/api/tasks/${id}/${action}`, 'POST', {}); await refresh(); });
  const addSource = (type, data) => addProjectSource(activeRef.current, type, data);
  const retrieve = query => perform(() => api(`/api/cases/${activeRef.current}/retrieve`, 'POST', { query }));
  const selectGap = gap => perform(async () => { await api(`/api/cases/${activeRef.current}/selection`, 'POST', { gap_id: gap.id, confirmed: true, user_message: `我明确选择 ${gap.id}：${gap.data.name}` }); await refresh(); });
  const reloadHealth = () => perform(async () => { const value = await api('/api/health'); setHealth(value); });
  const confirmSubscription = () => perform(async () => { await api('/api/settings/subscription', 'POST', { confirmed: true }); setHealth(await api('/api/health')); });
  const logout = () => perform(async () => { await callControl.current?.hangup?.(); setCallOpen(false); await api('/api/auth/logout', 'POST', {}); resetSession(); window.navigator.serviceWorker?.controller?.postMessage('CLEAR_PRIVATE_CACHE'); if(auth?.passwordless) window.location.reload(); });
  const exportProject = () => perform(async () => {
    const result = await api(`/api/cases/${activeRef.current}/export`, 'POST', {});
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `lydia-report-${activeRef.current}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const messages = (snapshot?.tasks || []).flatMap(task => {
    const result = [{ id: task.id, from: 'me', text: task.input.message }];
    const summary = snapshot.artifacts.findLast(a => a.task_id === task.id && a.kind === 'summary');
    if (summary) result.push({ id: summary.id, from: 'steve', text: summary.content });
    return result;
  });
  const running = snapshot?.tasks.find(t => ['QUEUED', 'RUNNING'].includes(t.status));
  function openCall() {
    if (!active) { setNotice('请先在 Projects 选择或创建项目，再拨打专家电话。'); return; }
    setCallOpen(true);
  }
  const mobileSettings = () => setSettings(isMobile ? 'index' : 'account');
  const mobileNavigation = activeTab => <MobileNav active={activeTab} onHome={() => { setSettings(null); window.location.hash = '#/'; }} onProjects={() => { setSettings(null); openProjects(); }} onSettings={() => setSettings('index')} />;
  const picker = <ProjectPicker cases={cases} active={active} onChange={setActive} />;
  const renderPanel = onClose => <ResearchPanel key={active || 'empty'} snapshot={snapshot} cases={cases} active={active} onProjectChange={setActive} method={method} tab={workspaceTab} onTab={setWorkspaceTab} onClose={onClose} onOpenSettings={() => setSettings('account')} busy={busy} onAddSource={addSource} onRetrieve={retrieve} onSelectGap={selectGap} />;
  const settingsModal = settings && <SettingsModal isMobile={isMobile} mobileNavigation={mobileNavigation('设置')} passwordless={auth?.passwordless} section={settings} onSection={setSettings} onClose={() => setSettings(null)} theme={theme} onToggleTheme={toggleTheme} health={health} busy={busy} active={active} onReloadHealth={reloadHealth} onConfirmSubscription={confirmSubscription} onExport={exportProject} onLogout={logout} />;
  const notification = notice && <div className="app-notice" role="alert"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>;
  if (!auth) return <><div hidden={inKnowledge} className="app-loading">Connecting to Lydia… <button className="pill" onClick={() => window.location.reload()}>重新连接</button></div>{notification}</>;
  if (!auth.authenticated) return <><AuthScreen status={auth} onLogin={login} busy={busy} theme={theme} onToggleTheme={toggleTheme} />{notification}</>;
  let main;
  if (route.kind === 'new') main = <NewProject isMobile={isMobile} busy={busy} onCreate={createProject} />;
  else if (route.kind === 'projects') main = <ProjectsPage cases={cases} active={active} snapshot={snapshot} query={query} onQuery={setQuery} onSelect={selectProject} onDiscuss={discussProject} onAdd={addProjectSource} busy={busy} onSettings={mobileSettings} />;
  else if (hasConversation) main = <Conversation key={`${active}:${room ? 'team' : 'advisor'}`} bot={advisor} room={room} messages={messages} botsById={botsById} pending={running ? { from: 'steve', streaming: false } : null} isMobile={isMobile} onSend={send} onStop={() => running && taskAction(running.id, 'cancel')} onClear={() => { window.location.hash = '#/new'; }} onAction={(_, text) => send(text)} busy={busy} openPanelSignal={panelSignal} renderPanel={renderPanel} onAttachment={() => openWorkspace('sources')}
    toolbar={<div className="research-toolbar"><ProjectPicker cases={cases} active={active} onChange={setActive} compact /><select aria-label="研究任务类型" value={kind} onChange={e => setKind(e.target.value)}><option value="research">需求研究</option><option value="question">顾问问答</option><option value="model" disabled={!snapshot?.case.selected_gap_id}>商业模式</option></select><span className="phase-tag">{phases[snapshot?.case.phase] || '新 idea'}</span><button type="button" className="call-entry" aria-label={callBot ? `与 ${callBot.name} 语音通话` : '团队房间不能拨打，请从专家列表选择一位专家'} title={callBot ? `与 ${callBot.name} 持续语音通话（可打断）` : '团队房间不能拨打，请从专家列表选择一位专家'} aria-pressed={callOpen} disabled={!callBot} onClick={() => { if (!active) { setNotice('请先在 Projects 选择或创建项目，再拨打专家电话。'); return; } setCallOpen(true); }}><Icon name="call" size={18} /></button></div>}
    headerAction={isMobile && <button type="button" className="icon-btn mobile-call-entry" aria-label={callBot ? `与 ${callBot.name} 语音通话` : '团队房间不能拨打，请从专家列表选择一位专家'} aria-pressed={callOpen} disabled={!callBot} onClick={openCall}><Icon name="call" size={18} /></button>}
    voiceDock={!isMobile && callBot && !callOpen ? <div className="voice-dock"><BotAvatar color={callBot.color} size={32} /><div className="voice-dock__text"><strong>语音通话</strong><span>与 {callBot.name} 继续讨论</span></div><span className="voice-dock__decoration" aria-hidden="true"><Icon name="mic" size={20} /></span><button type="button" className="voice-dock__start" onClick={openCall}>开始通话<Icon name="call" size={16} /></button></div> : null}
    overlay={callOpen && callBot && active ? <CallCard key={`${active}:${callBot.id}`} bot={callBot} caseId={active} caseTitle={cases.find(c => c.id === active)?.title || ''} isMobile={isMobile} controlRef={callControl} onClose={() => setCallOpen(false)} /> : null}
    progress={<TaskProgress tasks={snapshot?.tasks || []} busy={busy} onTaskAction={taskAction} />} />;
  else main = <MobileHome bots={bots} rooms={rooms} botsById={botsById} query={query} onQuery={setQuery} projectPicker={picker} theme={theme} onToggleTheme={toggleTheme} onOpenProjects={openProjects} onSettings={mobileSettings} onOpenWorkspace={openWorkspace} onOpenCrawl={() => setSettings('crawl')} onOpenKnowledge={openKnowledge} />;
  return <><div hidden={inKnowledge} className={`app${isMobile ? ' app--mobile' : ''}`}>{!isMobile && <Sidebar bots={bots} rooms={rooms} botsById={botsById} route={route} query={query} onQuery={setQuery} theme={theme} onToggleTheme={toggleTheme} onOpenProjects={openProjects} onSettings={(section = 'account') => setSettings(section)} onOpenWorkspace={openWorkspace} onOpenCrawl={() => setSettings('crawl')} onOpenKnowledge={openKnowledge} />}{main}{globalPanel && !hasConversation && renderPanel(() => setGlobalPanel(false))}</div>{!inKnowledge && isMobile && !hasConversation && route.kind !== 'new' && !settings && mobileNavigation(route.kind === 'projects' ? '项目' : '会话')}{inKnowledge && <KnowledgeWorkspace activeCase={active} theme={theme} onToggleTheme={toggleTheme} onReturn={returnFromKnowledge} onOpenCrawl={() => setSettings('crawl')} onResearch={researchIdea} />}{settingsModal}{notification}</>;
}
