// Service worker — handles Claude / Replicate API calls and side panel toggle

const SPANISH_SYSTEM_PROMPT = `You are a Spanish homework assistant.
The student is completing a Spanish assignment. Given the question or prompt, respond with ONLY the correct Spanish answer — nothing else.
No explanations, no labels, no punctuation outside the answer itself unless it's part of the answer (like ¿ or ¡).
If the question asks to translate to Spanish, give the Spanish translation.
If the question asks to conjugate a verb, give just the conjugated form.
If it asks to fill in a blank, give just the word or phrase that fills the blank.
Be concise. Answer only.`;

const TUTOR_SYSTEM_PROMPT = `You are VHLbot, a focused Spanish homework assistant.
When given page content, identify the Spanish questions or exercises present and help the student understand them.
Walk through the reasoning step by step. Be direct and concise.`;

chrome.action.onClicked.addListener((tab) => {
  const url = tab.url || "";
  if (url.includes("vhlcentral.com")) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CALL_CLAUDE") {
    handleChat(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "FILL_SPANISH") {
    handleFillSpanish(message.question)
      .then((answer) => sendResponse({ ok: true, answer }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

function resolveProvider(storedProvider, apiKey) {
  // Always trust the key prefix — it's unambiguous
  if (apiKey && apiKey.startsWith("r8_")) return "replicate";
  if (apiKey && apiKey.startsWith("sk-ant-")) return "anthropic";
  return storedProvider || "anthropic";
}

async function handleFillSpanish(question) {
  const { apiKey, provider: storedProvider } = await chrome.storage.local.get(["apiKey", "provider"]);
  if (!apiKey) throw new Error("No API key saved — open the VHLbot panel to set one up.");

  const provider = resolveProvider(storedProvider, apiKey);
  const messages = [{ role: "user", content: question }];

  if (provider === "replicate") {
    return callReplicate({ apiKey, systemPrompt: SPANISH_SYSTEM_PROMPT, messages, maxTokens: 200 });
  }
  return callClaude({ apiKey, systemPrompt: SPANISH_SYSTEM_PROMPT, messages, maxTokens: 200 });
}

async function handleChat({ apiKey, provider: payloadProvider, systemPrompt, messages }) {
  const provider = resolveProvider(payloadProvider, apiKey);
  if (provider === "replicate") {
    return callReplicate({ apiKey, systemPrompt, messages });
  }
  return callClaude({ apiKey, systemPrompt, messages });
}

// ── Anthropic ──
async function callClaude({ apiKey, messages, systemPrompt, maxTokens = 1024 }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── Replicate ──
async function callReplicate({ apiKey, messages, systemPrompt, maxTokens = 1024 }) {
  // Claude on Replicate takes the last user message as `prompt`
  const prompt = messages[messages.length - 1].content;

  // Create prediction
  const createRes = await fetch("https://api.replicate.com/v1/models/anthropic/claude-4.5-sonnet/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: {
        prompt,
        system_prompt: systemPrompt,
        max_tokens: maxTokens,
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.detail || `Replicate HTTP ${createRes.status}`);
  }

  const prediction = await createRes.json();

  // Poll until done
  return pollReplicate(apiKey, prediction.id);
}

async function pollReplicate(apiKey, id) {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 800));

    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!res.ok) throw new Error(`Replicate poll HTTP ${res.status}`);

    const data = await res.json();

    if (data.status === "succeeded") {
      // output is an array of string chunks
      return Array.isArray(data.output) ? data.output.join("") : data.output;
    }

    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(data.error || "Replicate prediction failed");
    }
  }

  throw new Error("Replicate timed out");
}
