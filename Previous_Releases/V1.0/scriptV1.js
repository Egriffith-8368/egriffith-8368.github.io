// Encryption helpers using SubtleCrypto AES-GCM
async function getKeyMaterial(password) {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
}

async function deriveKey(password, salt, usage = ["encrypt", "decrypt"]) {
  const keyMaterial = await getKeyMaterial(password);
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return array.buffer;
}

async function encryptData(password, data) {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(data)
  );
  // Store salt + iv + ciphertext (all base64 encoded and joined by ".")
  return (
    arrayBufferToBase64(salt.buffer) +
    "." +
    arrayBufferToBase64(iv.buffer) +
    "." +
    arrayBufferToBase64(encrypted)
  );
}

async function decryptData(password, encryptedData) {
  if (!encryptedData) return "";
  const [saltB64, ivB64, cipherB64] = encryptedData.split(".");
  if (!saltB64 || !ivB64 || !cipherB64) throw new Error("Invalid encrypted data format.");
  const salt = new Uint8Array(base64ToArrayBuffer(saltB64));
  const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
  const cipher = base64ToArrayBuffer(cipherB64);
  const key = await deriveKey(password, salt);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    cipher
  );
  return new TextDecoder().decode(decrypted);
}

// API key management: prompt for passphrase as needed
let apiKey = "";
let hasDecrypted = false;

// Optionally, auto load and ask for passphrase if encrypted key exists
document.getElementById("saveKey").onclick = async () => {
  const value = document.getElementById("apiKey").value.trim();
  if (value) {
    // Ask user for passphrase (not stored)
    const passphrase = prompt("Enter a passphrase to encrypt your API key. You'll need this to use the key later:");
    if (!passphrase) {
      alert("No passphrase entered. Key not saved.");
      return;
    }
    const encrypted = await encryptData(passphrase, value);
    localStorage.setItem("OPENAI_API_KEY", encrypted);
    apiKey = value; // Allow in-memory use
    hasDecrypted = true;
    alert("Encrypted API key saved in your browser. Remember your passphrase!");
  }
};

const chatContainer = document.getElementById("chatContainer");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

async function sendMessage() {
  // Decrypt apiKey if necessary
  if (!apiKey) {
    const encrypted = localStorage.getItem("OPENAI_API_KEY");
    if (encrypted) {
      let passphrase = prompt("Enter your passphrase to decrypt your API key:");
      if (!passphrase) {
        updateLastAssistantMessage("No passphrase provided. Cannot send message.");
        return;
      }
      try {
        apiKey = await decryptData(passphrase, encrypted);
        hasDecrypted = true;
      } catch (e) {
        updateLastAssistantMessage("Failed to decrypt API key: " + e.message);
        return;
      }
    } else {
      updateLastAssistantMessage("No API key stored. Please set your key first.");
      return;
    }
  }

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
