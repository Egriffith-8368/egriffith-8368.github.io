
/*
  ChatGPT-like single-page chat with:
  - Simple password gate (replaces previous API key encryption scheme)
  - API key + chats stored in localStorage (behind password gate)
  - Sidebar showing the last 3 conversations
  - Clean, minimal UI similar to chat.openai.com

  SECURITY NOTE: This is a *simple* password gate. Data is still stored in localStorage.
  If you want real encryption, you could add WebCrypto AES-GCM using the password as a key derivation seed.
*/

// ------------------ Constants & Storage Keys ------------------
const STORE = {
  PASSWORD_SET: "chatapp.password.set",
  PASSWORD_HASH: "chatapp.password.hash", // for basic check (not strong)
  DATA: "chatapp.data" // contains { apiKey, model, threads: [...], activeThreadId }
};

const DEFAULTS = {
  model: "gpt-4o-mini"
};

// ------------------ Basic hashing (non-cryptographic) ------------------
function hashString(str){
  // Simple DJB2 hash for quick equality check; NOT cryptographically secure.
  let h = 5381;
  for(let i=0;i<str.length;i++) h = ((h<<5)+h) + str.charCodeAt(i);
  return String(h >>> 0);
}

// ------------------ State ------------------
let unlocked = false;
let state = {
  apiKey: "",
  model: DEFAULTS.model,
  threads: [],
  activeThreadId: null
};

// ------------------ DOM ------------------
const gateEl = document.getElementById("gate");
const gateInput = document.getElementById("gateInput");
const gateBtn = document.getElementById("gateBtn");
const gateMessage = document.getElementById("gateMessage");
const gateHint = document.getElementById("gateHint");

const recentList = document.getElementById("recentList");
const newChatBtn = document.getElementById("newChatBtn");

const apiKeyInput = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const modelSelect = document.getElementById("modelSelect");
const resetPasswordBtn = document.getElementById("resetPasswordBtn");

const chatEl = document.getElementById("chat");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");
const threadTitleEl = document.getElementById("threadTitle");

const tpl = document.getElementById("msgTemplate");

// ------------------ Helpers ------------------
function loadData(){
  const raw = localStorage.getItem(STORE.DATA);
  if(!raw) return;
  try{ state = JSON.parse(raw); }catch{ /* ignore */ }
}

function saveData(){
  localStorage.setItem(STORE.DATA, JSON.stringify(state));
}

function ensureThread(){
  if(state.activeThreadId && state.threads.find(t=>t.id===state.activeThreadId)) return;
  const id = crypto.randomUUID();
  const thread = { id, title: "New chat", createdAt: Date.now(), messages: [] };
  state.threads.unshift(thread); // most recent first
  state.activeThreadId = id;
  saveData();
}

function setThreadTitleFromFirstUserMessage(thread){
  const firstUser = thread.messages.find(m=>m.role==='user');
  if(firstUser){
    thread.title = (firstUser.content || 'New chat').slice(0,60);
  }
}

function activeThread(){
  return state.threads.find(t=>t.id===state.activeThreadId);
}

function formatTime(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}

function elFromTemplate(role, text){
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.avatar').setAttribute('data-role', role);
  node.querySelector('[data-field="roleLabel"]').textContent = role === 'user' ? 'You' : 'Assistant';
  node.querySelector('[data-field="time"]').textContent = formatTime(Date.now());
  const textEl = node.querySelector('[data-field="text"]');
  textEl.textContent = text;
  return node;
}

function renderThread(){
  const thread = activeThread();
  chatEl.innerHTML = '';
  threadTitleEl.textContent = thread.title || 'New chat';
  for(const m of thread.messages){
    chatEl.appendChild(elFromTemplate(m.role, m.content));
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

function renderRecent(){
  recentList.innerHTML = '';
  const last3 = state.threads.slice(0,3);
  for(const t of last3){
    const li = document.createElement('li');
    li.className = 'conv-item';
    li.innerHTML = `<div style="flex:1; min-width:0">
        <div class="conv-title">${t.title || 'New chat'}</div>
        <div class="conv-date">${new Date(t.createdAt).toLocaleDateString()}</div>
      </div>`;
    li.onclick = ()=>{ state.activeThreadId = t.id; saveData(); renderThread(); renderRecent(); };
    recentList.appendChild(li);
  }
}

function setLockedUI(locked){
  gateEl.classList.toggle('hidden', !locked);
  document.querySelector('.app').style.filter = locked ? 'blur(8px)' : 'none';
  document.querySelector('.app').style.pointerEvents = locked ? 'none' : 'auto';
}

// ------------------ Password Gate ------------------
function openGate(){
  const isSet = localStorage.getItem(STORE.PASSWORD_SET) === '1';
  setLockedUI(true);
  gateEl.classList.remove('hidden');
  gateInput.value = '';
  if(isSet){
    gateMessage.textContent = 'Enter your password to unlock and view your last 3 chats.';
  }else{
    gateMessage.textContent = 'Create a simple password to unlock this app. (Not encryption — just a gate)';
  }
}

function tryUnlock(){
  const pass = gateInput.value.trim();
  if(!pass){ gateHint.textContent = 'Password required'; return; }

  const isSet = localStorage.getItem(STORE.PASSWORD_SET) === '1';
  if(!isSet){
    // First-time set
    localStorage.setItem(STORE.PASSWORD_HASH, hashString(pass));
    localStorage.setItem(STORE.PASSWORD_SET, '1');
    unlocked = true;
  }else{
    const ok = localStorage.getItem(STORE.PASSWORD_HASH) === hashString(pass);
    if(!ok){ gateHint.textContent = 'Incorrect password'; return; }
    unlocked = true;
  }

  gateHint.textContent = '';
  gateEl.classList.add('hidden');
  setLockedUI(false);
  // After unlock, render
  loadData();
  ensureThread();
  hydrateUI();
}

function resetPassword(){
  if(!confirm('Reset the password? This does not delete chats or API key.')) return;
  localStorage.removeItem(STORE.PASSWORD_SET);
  localStorage.removeItem(STORE.PASSWORD_HASH);
  openGate();
}

// ------------------ UI Hydration ------------------
function hydrateUI(){
  apiKeyInput.value = state.apiKey || '';
  modelSelect.value = state.model || DEFAULTS.model;
  renderRecent();
  renderThread();
}

// ------------------ Events ------------------

gateBtn.addEventListener('click', tryUnlock);

gateInput.addEventListener('keydown', (e)=>{
  if(e.key==='Enter') tryUnlock();
});

newChatBtn.addEventListener('click', ()=>{
  const id = crypto.randomUUID();
  state.threads.unshift({ id, title:'New chat', createdAt: Date.now(), messages: [] });
  state.activeThreadId = id;
  saveData();
  renderRecent();
  renderThread();
  userInput.focus();
});

saveKeyBtn.addEventListener('click', ()=>{
  state.apiKey = apiKeyInput.value.trim();
  state.model = modelSelect.value;
  saveData();
  saveKeyBtn.textContent = 'Saved';
  setTimeout(()=> saveKeyBtn.textContent='Save', 900);
});

resetPasswordBtn.addEventListener('click', resetPassword);

clearBtn.addEventListener('click', ()=>{
  const t = activeThread();
  if(!t) return;
  if(!confirm('Clear messages in this chat?')) return;
  t.messages = [];
  t.title = 'New chat';
  saveData();
  renderThread();
});

exportBtn.addEventListener('click', ()=>{
  const t = activeThread();
  if(!t) return;
  const blob = new Blob([JSON.stringify(t, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(t.title||'chat').replace(/[^a-z0-9-_]/gi,'_')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

// Textarea enter handling
userInput.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    sendBtn.click();
  }
});

sendBtn.addEventListener('click', async ()=>{
  const content = userInput.value.trim();
  if(!content) return;
  const t = activeThread();
  t.messages.push({ role:'user', content, ts: Date.now() });
  if(t.title==='New chat') setThreadTitleFromFirstUserMessage(t);
  userInput.value = '';
  saveData();
  renderThread();

  try{
    const reply = await callOpenAI(t.messages);
    t.messages.push({ role:'assistant', content: reply, ts: Date.now() });
    saveData();
    renderThread();
  }catch(err){
    t.messages.push({ role:'assistant', content: `⚠️ ${err.message || err}`, ts: Date.now() });
    saveData();
    renderThread();
  }
});

// ------------------ OpenAI call (simple, non-streaming) ------------------
async function callOpenAI(messages){
  const apiKey = state.apiKey;
  if(!apiKey) throw new Error('No API key set. Add one in Settings.');
  const model = state.model || DEFAULTS.model;

  // Convert to OpenAI chat format
  const openaiMsgs = messages.map(m=>({ role: m.role, content: m.content }));

  const res = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: openaiMsgs,
      temperature: 0.7
    })
  });

  if(!res.ok){
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim() ?? '(no content)';
  return content;
}

// ------------------ Init ------------------
(function init(){
  // Blur the app until gate resolves
  setLockedUI(true);
  openGate();
})();
