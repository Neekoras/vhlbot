// VHLbot — side panel logic

const SYSTEM_PROMPT = `You are VHLbot, a Spanish homework assistant embedded in the student's browser. You have direct access to the page — either as extracted text or a screenshot. You are already looking at the assignment.

Rules:
- Never ask the student to describe the screen, paste content, or share anything. You have it already.
- Never say "I can see" or "based on what you shared." Just answer.
- Never say you cannot see or access the page.

When given page content or a screenshot:
- Find every Spanish question, prompt, blank, or exercise on the page.
- Answer each one. Correct Spanish only. Number them in page order.
- If the page is graded, find every item marked wrong. For each: what was asked, the correct answer, one sentence explaining why.
- Do not report scores back. The student sees the score. Give them the understanding.

When the student types a follow-up:
- Answer directly. Grammar, vocab, conjugations — brief unless detail is needed.
- Do not volunteer explanations they didn't ask for.`;

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
    await restoreChat();
    showMain();
  } else {
    showSetup();
  }
})();

async function saveChat() {
  await chrome.storage.session.set({
    chatHistory: conversationHistory,
    chatHTML: messagesEl.innerHTML,
  });
}

async function restoreChat() {
  const saved = await chrome.storage.session.get(["chatHistory", "chatHTML"]);
  if (saved.chatHTML) {
    messagesEl.innerHTML = saved.chatHTML;
    conversationHistory = saved.chatHistory || [];
  }
}

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
  provider = "anthropic";
  conversationHistory = [];
  messagesEl.innerHTML = "";
  apiKeyInput.value = "";
  selectProvider("anthropic");
  chrome.storage.local.remove("apiKey");
  chrome.storage.session.remove(["chatHistory", "chatHTML"]);
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

    // Inject the content script if it isn't loaded yet (e.g. after extension reload)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    }).catch(() => {}); // already injected = harmless error

    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" });
    const pageText = response?.content?.trim();

    // If DOM gave us very little, fall back to a screenshot
    const domTooThin = !pageText || pageText.length < 200;

    if (domTooThin) {
      const screenshotResult = await chrome.runtime.sendMessage({
        type: "SCAN_SCREENSHOT",
        payload: { apiKey, provider },
      });
      if (!screenshotResult.ok) throw new Error(screenshotResult.error);
      // response already added by background — just push to history
      conversationHistory.push({ role: "assistant", content: screenshotResult.result });
      addMessage("assistant", screenshotResult.result);
      saveChat();
      return;
    }

    const userMsg = `Here is the full text content of the student's VHL Central page. Read it carefully — find the instructions, the questions, and any scores or feedback.\n\n---\n${pageText}\n---`;
    await sendToAssistant(userMsg, null, true);
  } catch (err) {
    addMessage("assistant", `Scan failed: ${err.message}. Try refreshing the VHL page and clicking Scanning again.`);
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

  if (!silent) {
    addMessage("user", displayLabel || userText);
    saveChat();
  }
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
    saveChat();
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
  html = html.replace(/((<li>[^\n]+<\/li>\n?)+)/g, "<ol>$1</ol>");
  // Hide ordered lists before wrapping bullet items to avoid double-wrapping
  const olBlocks = [];
  html = html.replace(/<ol>[\s\S]*?<\/ol>/g, (m) => { olBlocks.push(m); return `\x00OL${olBlocks.length - 1}\x00`; });
  html = html.replace(/^[-•] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((<li>[^\n]+<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/\x00OL(\d+)\x00/g, (_, i) => olBlocks[+i]);
  html = html.split(/\n\n+/).map((p) => {
    p = p.trim();
    if (/^<(pre|ul|ol)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");

  return html;
}
