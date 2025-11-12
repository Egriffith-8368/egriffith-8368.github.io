console.log('script.js loaded');

/*
  Hardened password gate + DOM-ready mounting
  - Wraps everything in DOMContentLoaded so elements exist before we bind
  - Defensive localStorage helpers (with error messaging)
  - Clear gate dismissal + UI unblur on success
*/

// ------------------ Constants ------------------
const STORE = {
  PASSWORD_SET: "chatapp.password.set",
  PASSWORD_HASH: "chatapp.password.hash",
  DATA: "chatapp.data"
};
const DEFAULTS = { model: "gpt-4o-mini" };

// ------------------ Helpers ------------------
function hashString(str){
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h<<5)+h) + str.charCodeAt(i);
  return String(h >>> 0);
}

function safeGet(key){
  try { return localStorage.getItem(key); } catch (e) { console.error('localStorage get failed', e); return null; }
}
function safeSet(key, val){
  try { localStorage.setItem(key, val); return true; } catch (e) { console.error('localStorage set failed', e); return false; }
}
function safeRemove(key){
  try { localStorage.removeItem(key); } catch (e) { console.error('localStorage remove failed', e); }
}

// ------------------ State ------------------
let unlocked = false;
let state = { apiKey: "", model: DEFAULTS.model, threads: [], activeThreadId: null };

// DOM refs (assigned in init)
let gateEl, gateInput, gateBtn, gateMessage, gateHint,
    recentList, newChatBtn,
    apiKeyInput, saveKeyBtn, modelSelect, resetPasswordBtn,
    chatEl, userInput, sendBtn, clearBtn, exportBtn, threadTitleEl,
    tpl, appEl;

function loadData(){
  const raw = safeGet(STORE.DATA); if(!raw) return;
  try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') state = Object.assign(state, parsed); } catch {}
}
function saveData(){ safeSet(STORE.DATA, JSON.stringify(state)); }

function ensureThread(){
  if (state.activeThreadId && state.threads.find(t=>t.id===state.activeThreadId)) return;
  const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  state.threads.unshift({ id, title:'New chat', createdAt: Date.now(), messages: [] });
  state.activeThreadId = id; saveData();
}
function setThreadTitleFromFirstUserMessage(thread){
  const firstUser = thread.messages.find(m=>m.role==='user');
  if (firstUser) thread.title = (firstUser.content||'New chat').slice(0,60);
}
function activeThread(){ return state.threads.find(t=>t.id===state.activeThreadId); }
function formatTime(ts){ return new Date(ts).toLocaleString(); }
function elFromTemplate(role, text){
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.avatar').setAttribute('data-role', role);
  node.querySelector('[data-field="roleLabel"]').textContent = role==='user'?'You':'Assistant';
  node.querySelector('[data-field="time"]').textContent = formatTime(Date.now());
  node.querySelector('[data-field="text"]').textContent = text;
  return node;
}
function renderThread(){
  const thread = activeThread(); if(!thread) return;
  chatEl.innerHTML = ''; threadTitleEl.textContent = thread.title || 'New chat';
  for (const m of thread.messages) chatEl.appendChild(elFromTemplate(m.role, m.content));
  chatEl.scrollTop = chatEl.scrollHeight;
}
function renderRecent(){
  recentList.innerHTML = ''; const last3 = state.threads.slice(0,3);
  for (const t of last3){
    const li = document.createElement('li'); li.className='conv-item';
    li.innerHTML = `<div style="flex:1; min-width:0"><div class="conv-title">${t.title||'New chat'}</div><div class="conv-date">${new Date(t.createdAt).toLocaleDateString()}</div></div>`;
    li.onclick = ()=>{ state.activeThreadId = t.id; saveData(); renderThread(); renderRecent(); };
    recentList.appendChild(li);
  }
}
function setLockedUI(locked){
  if (!appEl || !gateEl) return;
  appEl.style.filter = locked ? 'blur(8px)' : 'none';
  appEl.style.pointerEvents = locked ? 'none' : 'auto';
  gateEl.classList.toggle('hidden', !locked);
}

// ------------------ Password Gate ------------------
function openGate(){
  const isSet = safeGet(STORE.PASSWORD_SET) === '1';
  setLockedUI(true); if (gateInput) gateInput.value = '';
  gateMessage.textContent = isSet ? 'Enter your password to unlock and view your last 3 chats.' : 'Create a simple password to unlock this app. (Not encryption — just a gate)';
  gateHint.textContent = '';
}
function tryUnlock(){
  const pass = (gateInput.value||'').trim();
  if (!pass){ gateHint.textContent = 'Password required'; return; }
  const isSet = safeGet(STORE.PASSWORD_SET) === '1';
  if (!isSet){
    // First-time set
    if (!safeSet(STORE.PASSWORD_HASH, hashString(pass)) || !safeSet(STORE.PASSWORD_SET, '1')){
      gateHint.textContent = 'Could not save password (storage blocked). Check browser privacy settings.'; return;
    }
    unlocked = true;
  } else {
    const ok = safeGet(STORE.PASSWORD_HASH) === hashString(pass);
    if (!ok){ gateHint.textContent = 'Incorrect password'; return; }
    unlocked = true;
  }
  // Dismiss gate and hydrate
  setLockedUI(false); gateHint.textContent='';
  loadData(); ensureThread(); hydrateUI();
}
function resetPassword(){
  if(!confirm('Reset the password? This does not delete chats or API key.')) return;
  safeRemove(STORE.PASSWORD_SET); safeRemove(STORE.PASSWORD_HASH); openGate();
}

// ------------------ UI Hydration ------------------
function hydrateUI(){
  apiKeyInput.value = state.apiKey || '';
  modelSelect.value = state.model || DEFAULTS.model;
  renderRecent(); renderThread();
}

// ------------------ OpenAI call ------------------
async function callOpenAI(messages){
  const apiKey = state.apiKey; if(!apiKey) throw new Error('No API key set. Add one in Settings.');
  const model = state.model || DEFAULTS.model;
  const openaiMsgs = messages.map(m=>({ role:m.role, content:m.content }));
  const res = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: openaiMsgs, temperature: 0.7 })
  });
  if(!res.ok){ throw new Error(`API error ${res.status}: ${await res.text()}`); }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? '(no content)';
}

// ------------------ Init ------------------
function mountEventHandlers(){
  gateBtn?.addEventListener('click', tryUnlock);
  gateInput?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryUnlock(); });
  resetPasswordBtn?.addEventListener('click', resetPassword);
  newChatBtn?.addEventListener('click', ()=>{
    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    state.threads.unshift({ id, title:'New chat', createdAt: Date.now(), messages: [] });
    state.activeThreadId = id; saveData(); renderRecent(); renderThread(); userInput?.focus();
  });

  // Save API key + model
  saveKeyBtn?.addEventListener('click', ()=>{
    state.apiKey = (apiKeyInput.value || '').trim();
    state.model = modelSelect.value || DEFAULTS.model;
    saveData();
    const prev = saveKeyBtn.textContent;
    saveKeyBtn.textContent = 'Saved';
    setTimeout(()=>{ try { saveKeyBtn.textContent = prev; } catch(e){} }, 1500);
  });

  // Clear current chat
  clearBtn?.addEventListener('click', ()=>{
    const t = activeThread();
    if(!t) return;
    if(!confirm('Clear messages in this chat?')) return;
    t.messages = [];
    t.title = 'New chat';
    saveData();
    renderThread();
    renderRecent();
  });

  // Export current chat to JSON file
  exportBtn?.addEventListener('click', ()=>{
    const t = activeThread();
    if(!t) return;
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${t.id || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  userInput?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendBtn?.click(); } });
  sendBtn?.addEventListener('click', async ()=>{
    const content = (userInput.value||'').trim(); if(!content) return; const t = activeThread();
    t.messages.push({ role:'user', content, ts:Date.now() }); if(t.title==='New chat') setThreadTitleFromFirstUserMessage(t);
    userInput.value=''; saveData(); renderThread();
    try{
      const reply = await callOpenAI(t.messages);
      t.messages.push({ role:'assistant', content:reply, ts:Date.now() }); saveData(); renderThread();
    } catch(err){
      t.messages.push({ role:'assistant', content:`⚠️ ${err.message||err}`, ts:Date.now() }); saveData(); renderThread();
    }
  });
}

function init(){
  // Query DOM once DOMContentLoaded fires
  appEl = document.querySelector('.app');
  gateEl = document.getElementById('gate');
  gateInput = document.getElementById('gateInput');
  gateBtn = document.getElementById('gateBtn');
  gateMessage = document.getElementById('gateMessage');
  gateHint = document.getElementById('gateHint');
  recentList = document.getElementById('recentList');
  newChatBtn = document.getElementById('newChatBtn');
  apiKeyInput = document.getElementById('apiKeyInput');
  saveKeyBtn = document.getElementById('saveKeyBtn');
  modelSelect = document.getElementById('modelSelect');
  resetPasswordBtn = document.getElementById('resetPasswordBtn');
  chatEl = document.getElementById('chat');
  userInput = document.getElementById('userInput');
  sendBtn = document.getElementById('sendBtn');
  clearBtn = document.getElementById('clearBtn');
  exportBtn = document.getElementById('exportBtn');
  threadTitleEl = document.getElementById('threadTitle');
  tpl = document.getElementById('msgTemplate');

  mountEventHandlers();
  // Blur the app and show gate
  setLockedUI(true); openGate();
}

window.addEventListener('DOMContentLoaded', init);
