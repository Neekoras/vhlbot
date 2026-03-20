// VHLbot — side panel logic

const SYSTEM_PROMPT = `You are VHLbot. You read the student's VHL Central page and help them with their Spanish homework.

If the page has open/unanswered questions:
- Find every question, prompt, or blank on the page.
- Answer each one directly. Correct Spanish only. Numbered list, same order as the page.
- Never say you cannot see the screen — the page text is right there.

If the page shows a graded or completed assignment:
- Read the instructions and the actual questions carefully — they are on the page, dig for them.
- Identify which answers were marked wrong (0 points, incorrect, red, etc).
- For each wrong answer: state what the question was asking, what the correct answer is, and explain WHY in one or two sentences — grammar rule, vocabulary, context.
- Do not just report the score. The student already knows the score. They need to understand the mistake.
- If the instructions or prompts are visible, use them to explain what was expected.

Secondary — student questions:
- Answer follow-ups briefly. Grammar, vocab, conjugations. Short unless detail is needed.
- Do not volunteer explanations unprompted. Answer and stop.`;

// ── State ──
let apiKey = "";
let provider = "anthropic";
let conversationHistory = [];

// ── DOM refs ──
const setupScreen = document.getElementById("setup-screen");
const mainScreen  = document.getElementById("main-screen");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn  = document.getElementById("save-key-btn");
const autofillBtn = document.getElementById("autofill-btn");
const analyzeBtn  = document.getElementById("analyze-btn");
const settingsBtn = document.getElementById("settings-btn");
const messagesEl  = document.getElementById("messages");
const userInput   = document.getElementById("user-input");
const sendBtn     = document.getElementById("send-btn");
const getKeyLink  = document.getElementById("get-key-link");

// ── Provider toggle ──
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
    apiKeyInput.style.borderColor = "#4A2A2A";
    setTimeout(() => (apiKeyInput.style.borderColor = ""), 600);
    return;
  }
  apiKey = key;
  await chrome.storage.local.set({ apiKey, provider });
  showMain();
});

apiKeyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveKeyBtn.click(); });

// ── Screens ──
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

// ── Autofill ──
autofillBtn.addEventListener("click", async () => {
  setPillActive(autofillBtn, true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL_ALL" });
  } catch (err) {
    console.error("[VHLbot]", err);
  } finally {
    setTimeout(() => setPillActive(autofillBtn, false), 1200);
  }
});

// ── Scan ──
analyzeBtn.addEventListener("click", async () => {
  setPillActive(analyzeBtn, true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" });
    const pageText = response?.content?.trim();

    if (!pageText) {
      addMessage("assistant", "Couldn't read this page. Navigate to your assignment and try again, or paste a question below.");
      return;
    }

    const userMsg = `Here is the page content. Identify any Spanish homework questions and help me understand them:\n\n---\n${pageText}\n---`;
    await sendToAssistant(userMsg, null, true);
  } catch (err) {
    addMessage("assistant", "Couldn't read this page — some sites block extensions. Paste your question below instead.");
  } finally {
    setPillActive(analyzeBtn, false);
  }
});

function setPillActive(btn, on) {
  btn.classList.toggle("active", on);
  btn.disabled = on;
}

// ── Chat ──
sendBtn.addEventListener("click", handleSend);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 88) + "px";
});

async function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  userInput.style.height = "auto";
  await sendToAssistant(text);
}

// ── Core send ──
async function sendToAssistant(userText, displayLabel = null, silent = false) {
  clearEmptyState();

  if (!silent) addMessage("user", displayLabel || userText);
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
  // Remove is-latest from all previous assistant bubbles
  if (role === "assistant") {
    messagesEl.querySelectorAll(".msg-bubble.is-latest").forEach((b) => b.classList.remove("is-latest"));
  }

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : "VHLbot";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble" + (role === "assistant" ? " is-latest" : "");
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
    <div class="empty-body">Press scanning to read your page, or type a question.</div>
  `;
  messagesEl.appendChild(el);
}

function clearEmptyState() { document.getElementById("empty-state")?.remove(); }

function setInputLocked(locked) {
  userInput.disabled = locked;
  sendBtn.disabled = locked;
  analyzeBtn.disabled = locked;
  autofillBtn.disabled = locked;
}

function scrollToBottom() {
  document.getElementById("chat-container").scrollTop = 999999;
}

// ── Markdown ──
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
  html = html.split(/\n\n+/).map((p) => {
    p = p.trim();
    if (/^<(pre|ul|ol)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");

  return html;
}
