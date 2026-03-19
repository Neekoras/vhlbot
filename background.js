// Service worker — handles Claude API calls and side panel toggle

const SPANISH_SYSTEM_PROMPT = `You are a Spanish homework assistant.
The student is completing a Spanish assignment. Given the question or prompt, respond with ONLY the correct Spanish answer — nothing else.
No explanations, no labels, no punctuation outside the answer itself unless it's part of the answer (like ¿ or ¡).
If the question asks to translate to Spanish, give the Spanish translation.
If the question asks to conjugate a verb, give just the conjugated form.
If it asks to fill in a blank, give just the word or phrase that fills the blank.
Be concise. Answer only.`;

const TUTOR_SYSTEM_PROMPT = `You are HW Assistant, a friendly and encouraging AI tutor helping students understand their homework.

When given page content:
1. Identify the key questions, problems, or concepts present.
2. Explain them clearly in plain language the student can understand.
3. Guide the student toward understanding — do NOT just give away answers outright. Help them think through the problem step by step.
4. Use analogies and examples where helpful.
5. Be warm, patient, and supportive — never condescending.
6. If math is involved, show the steps.
7. If the content has no homework/questions, say so and offer to help if they paste a question.

Keep responses focused and not overly long. Use bullet points or numbered steps when it aids clarity.`;

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CALL_CLAUDE") {
    callClaude(message.payload)
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

async function handleFillSpanish(question) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("No API key saved — open the HW Assistant panel to set one up.");

  return callClaude({
    apiKey,
    systemPrompt: SPANISH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: question }],
    maxTokens: 200,
  });
}

async function callClaude({ apiKey, messages, systemPrompt, maxTokens = 1024 }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-calls": "true",
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
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}
