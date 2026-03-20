// VHLbot — side panel logic

const SYSTEM_PROMPT = `You are VHLbot, a focused Spanish homework assistant.

When given page content:
1. Identify the Spanish questions or exercises present.
2. Explain the concept clearly and help the student understand — don't just hand over answers.
3. Walk through the reasoning step by step.
4. Be direct and concise. No filler. No excessive encouragement.
5. If there are no Spanish questions, say so briefly and offer to help if they paste one.

Use short paragraphs or numbered steps. Avoid walls of text.`;

// ── State ──
let apiKey = "";
let provider = "anthropic"; // "anthropic" | "replicate"
let conversationHistory = [];

// ── DOM refs ──
const setupScreen  = document.getElementById("setup-screen");
const mainScreen   = document.getElementById("main-screen");
const apiKeyInput  = document.getElementById("api-key-input");
const saveKeyBtn   = document.getElementById("save-key-btn");
const analyzeBtn   = document.getElementById("analyze-btn");
const settingsBtn  = document.getElementById("settings-btn");
const messagesEl   = document.getElementById("messages");
const userInput    = document.getElementById("user-input");
const sendBtn      = document.getElementById("send-btn");

// ── Provider toggle ──
const getKeyLink = document.getElementById("get-key-link");

const PROVIDER_META = {
  anthropic: { placeholder: "sk-ant-...", href: "https://console.anthropic.com/settings/keys" },
  replicate:  { placeholder: "r8_...",    href: "https://replicate.com/account/api-tokens" },
};

function selectProvider(selected) {
  provider = selected;
  document.querySelectorAll(".provider-opt").forEach((b) => {
    b.classList.toggle("active", b.dataset.provider === selected);
  });
  apiKeyInput.placeholder = PROVIDER_META[selected].placeholder;
  getKeyLink.href = PROVIDER_META[selected].href;
}

document.querySelectorAll(".provider-opt").forEach((btn) => {
  btn.addEventListener("click", () => selectProvider(btn.dataset.provider));
});

// ── Init ──
(async () => {
  const stored = await chrome.storage.local.get(["apiKey", "provider"]);
  if (stored.apiKey) {
    apiKey = stored.apiKey;
    provider = stored.provider || "anthropic";
    showMain();
  } else {
    showSetup();
  }
})();

// ── Setup ──
saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  const validKey = (provider === "replicate" && key.startsWith("r8_")) ||
                   (provider === "anthropic" && key.startsWith("sk-ant-"));
  if (!validKey) {
    apiKeyInput.style.borderColor = "#c0392b";
    setTimeout(() => (apiKeyInput.style.borderColor = ""), 800);
    return;
  }
  apiKey = key;
  await chrome.storage.local.set({ apiKey, provider });
  showMain();
});

apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveKeyBtn.click();
});

// ── Screen switching ──
function showSetup() {
  setupScreen.classList.remove("hidden");
  mainScreen.classList.add("hidden");
}

function showMain() {
  setupScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  if (messagesEl.children.length === 0) renderEmptyState();
}

settingsBtn.addEventListener("click", () => {
  apiKey = "";
  conversationHistory = [];
  messagesEl.innerHTML = "";
  chrome.storage.local.remove("apiKey");
  showSetup();
});

// ── Scan page ──
analyzeBtn.addEventListener("click", async () => {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "SCANNING";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" });
    const pageText = response?.content?.trim();

    if (!pageText) {
      addMessage("assistant", "Couldn't read this page. Navigate to your assignment and try again, or paste a question below.");
      return;
    }

    const userMsg = `Here is the page content. Identify any Spanish homework questions and help me understand them:\n\n---\n${pageText}\n---`;
    await sendToAssistant(userMsg, "Scanning page for Spanish questions...");
  } catch (err) {
    addMessage("assistant", `Couldn't read this page — some sites block extensions. Paste your question below instead.`);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "SCAN PAGE";
  }
});

// ── Chat input ──
sendBtn.addEventListener("click", handleSend);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Auto-resize textarea
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 96) + "px";
});

async function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  userInput.style.height = "auto";
  await sendToAssistant(text);
}

// ── Core send ──
async function sendToAssistant(userText, displayLabel = null) {
  clearEmptyState();

  addMessage("user", displayLabel || userText);
  conversationHistory.push({ role: "user", content: userText });

  const typingEl = addTyping();
  setInputLocked(true);

  try {
    const result = await chrome.runtime.sendMessage({
      type: "CALL_CLAUDE",
      payload: { apiKey, provider, systemPrompt: SYSTEM_PROMPT, messages: conversationHistory },
    });

    typingEl.remove();
    if (!result.ok) throw new Error(result.error);

    conversationHistory.push({ role: "assistant", content: result.result });
    addMessage("assistant", result.result);
  } catch (err) {
    typingEl.remove();
    addMessage("assistant", `Error: ${err.message}`);
  } finally {
    setInputLocked(false);
    userInput.focus();
  }
}

// ── UI helpers ──
function addMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : "VHLbot";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = renderMarkdown(text);

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function addTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant";

  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = "VHLbot";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble typing-indicator";
  bubble.innerHTML = "<span></span><span></span><span></span>";

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function renderEmptyState() {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.id = "empty-state";
  el.innerHTML = `
    <div class="icon-tile">V</div>
    <div class="empty-title">VHLbot</div>
    <div class="empty-body">Click Scan Page to read your assignment, or type a question below.</div>
  `;
  messagesEl.appendChild(el);
}

function clearEmptyState() {
  document.getElementById("empty-state")?.remove();
}

function setInputLocked(locked) {
  userInput.disabled = locked;
  sendBtn.disabled = locked;
  analyzeBtn.disabled = locked;
}

function scrollToBottom() {
  document.getElementById("chat-container").scrollTop = 999999;
}

// ── Markdown renderer ──
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((<li>.*<\/li>\n?)+)/g, "<ol>$1</ol>");
  html = html.replace(/^[-•] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((<li>.*<\/li>\n?)+)/g, (m) => m.startsWith("<ol>") ? m : `<ul>${m}</ul>`);
  html = html
    .split(/\n\n+/)
    .map((p) => {
      p = p.trim();
      if (/^<(pre|ul|ol)/.test(p)) return p;
      return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}
