{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\froman\fcharset0 Times-Roman;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;}
{\*\expandedcolortbl;;\cssrgb\c0\c0\c0;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\fs24 \cf0 \expnd0\expndtw0\kerning0
\outl0\strokewidth0 \strokec2 const STORE = \{\
\
\});\
\
sendBtn.addEventListener('click', async ()=>\{\
const content = userInput.value.trim();\
if(!content) return;\
const t = activeThread();\
t.messages.push(\{ role:'user', content, ts: Date.now() \});\
if(t.title==='New chat') setThreadTitleFromFirstUserMessage(t);\
userInput.value = '';\
saveData();\
renderThread();\
\
try\{\
const reply = await callOpenAI(t.messages);\
t.messages.push(\{ role:'assistant', content: reply, ts: Date.now() \});\
saveData();\
renderThread();\
\}catch(err)\{\
t.messages.push(\{ role:'assistant', content: `\uc0\u9888 \u65039  $\{err.message || err\}`, ts: Date.now() \});\
saveData();\
renderThread();\
\}\
\});\
\
// ------------------ OpenAI call (simple, non-streaming) ------------------\
async function callOpenAI(messages)\{\
const apiKey = state.apiKey;\
if(!apiKey) throw new Error('No API key set. Add one in Settings.');\
const model = state.model || DEFAULTS.model;\
\
// Convert to OpenAI chat format\
const openaiMsgs = messages.map(m=>(\{ role: m.role, content: m.content \}));\
\
const res = await fetch('https://api.openai.com/v1/chat/completions',\{\
method:'POST',\
headers:\{\
'Content-Type':'application/json',\
'Authorization': `Bearer $\{apiKey\}`\
\},\
body: JSON.stringify(\{\
model,\
messages: openaiMsgs,\
temperature: 0.7\
\})\
\});\
\
if(!res.ok)\{\
const text = await res.text();\
throw new Error(`API error $\{res.status\}: $\{text\}`);\
\}\
\
const data = await res.json();\
const content = data?.choices?.[0]?.message?.content?.trim() ?? '(no content)';\
return content;\
\}\
\
// ------------------ Init ------------------\
(function init()\{\
// Blur the app until gate resolves\
setLockedUI(true);\
openGate();\
\})();\
}