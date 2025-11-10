let apiKey = localStorage.getItem("OPENAI_API_KEY") || "";

document.getElementById("saveKey").onclick = () => {
  const value = document.getElementById("apiKey").value.trim();
  if (value) {
    apiKey = value;
    localStorage.setItem("OPENAI_API_KEY", apiKey);
    alert("API key saved (in your browser only).");
  }
};

const chatContainer = document.getElementById("chatContainer");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  appendMessage("user", text);
  userInput.value = "";

  appendMessage("assistant", "Thinking...");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: text }]
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No response";
    updateLastAssistantMessage(reply);
  } catch (err) {
    updateLastAssistantMessage("Error: " + err.message);
  }
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.classList.add("message", role);
  div.textContent = text;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateLastAssistantMessage(text) {
  const all = chatContainer.getElementsByClassName("assistant");
  const last = all[all.length - 1];
  if (last) last.textContent = text;
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

sendBtn.onclick = sendMessage;
userInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});
