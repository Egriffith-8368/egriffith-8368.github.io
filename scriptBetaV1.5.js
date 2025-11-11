// ------------------ Constants & Storage Keys ------------------
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
