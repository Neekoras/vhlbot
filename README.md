# VHLbot

A Chrome extension that auto-fills Spanish homework answers directly into text boxes on VHL Central and similar platforms. Built for students who want instant answers without switching tabs.

---

## How it works

VHLbot runs silently in the background on every page. It detects text input fields, reads the surrounding question context, and places a small **✨ button** next to each one. When clicked, it sends the question to Claude AI and types the correct Spanish answer into the box — no copy-pasting, no switching windows.

It also includes a side panel with a full chat interface for explanations, follow-up questions, and scanning entire pages for homework content.

---

## Features

- **Inline fill buttons** — a ✨ button appears next to every text input on the page
- **Auto-answer** — detects the question from labels, aria attributes, or surrounding DOM text, then fills the correct Spanish response
- **Framework-aware input filling** — dispatches native `input` and `change` events so React/Vue/Angular forms register the change
- **MutationObserver** — watches for dynamically added inputs (Google Classroom, Quizlet, etc.) and injects buttons automatically
- **Side panel chat** — ask follow-up questions or get full page explanations
- **Page scanner** — reads the entire page and identifies all homework questions at once
- **Conversation history** — multi-turn chat that remembers context within a session
- **Local key storage** — your API key is stored in Chrome's local storage and never leaves your browser except to call the Anthropic API

---

## Installation

> VHLbot is not on the Chrome Web Store. Load it manually as an unpacked extension.

**Step 1 — Clone the repo**

```bash
git clone https://github.com/Neekoras/vhlbot.git
cd vhlbot
```

**Step 2 — Load in Chrome**

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `vhlbot` folder

The extension icon will appear in your toolbar.

**Step 3 — Add your API key**

1. Click the VHLbot icon to open the side panel
2. Go to https://console.anthropic.com/settings/keys and create a free key
3. Paste it into the setup screen and click **Save & continue**

You're ready.

---

## Usage

### Auto-fill (main feature)

1. Navigate to your VHL Central assignment or any Spanish homework page
2. Look for the **✨** buttons that appear next to each text box
3. Click ✨ — the answer is filled in automatically
4. The button flashes ✅ when done

If a button shows ❌, the question context couldn't be read or the API call failed. See Troubleshooting below.

### Side panel chat

Click the VHLbot toolbar icon to open the side panel.

| Action | What it does |
|---|---|
| **SCAN PAGE** | Reads the current page and explains all Spanish questions found |
| **Type in the input** | Ask a follow-up question or paste a question manually |
| **Enter** | Send message |
| **Shift + Enter** | New line |
| **⚙ gear icon** | Reset your API key |

---

## Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Manifest V3 |
| UI | Side Panel API |
| AI | Claude claude-sonnet-4-6 (Anthropic) |
| Fonts | Playfair Display, DM Mono, DM Sans |
| Styling | Vanilla CSS — no frameworks |
| Scripting | Vanilla JS — no bundler |

---

## File structure

```
vhlbot/
├── manifest.json        Chrome extension manifest (MV3)
├── background.js        Service worker — API calls, side panel toggle
├── content.js           Injected into every page — detects inputs, injects ✨ buttons
├── content.css          Styles for injected fill buttons
├── sidepanel.html       Side panel markup
├── sidepanel.css        Side panel styles
├── sidepanel.js         Side panel logic — chat, scan, state
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## How answers are generated

The background service worker calls the Anthropic API directly from the browser using the `anthropic-dangerous-direct-browser-calls` header required for browser-side API access.

For inline fill buttons, VHLbot uses a strict system prompt:

> "Respond with ONLY the correct Spanish answer. No explanations, no labels, no punctuation outside the answer itself."

For the chat/scan panel, VHLbot uses a tutor-mode prompt that explains concepts and walks through reasoning without just handing over answers.

---

## Troubleshooting

**✨ buttons don't appear**
- Make sure the extension is enabled at `chrome://extensions`
- Reload the page after installing
- Some pages use iframes for inputs — buttons won't appear inside cross-origin iframes

**❌ on button click**
- Check that your API key is saved (open the side panel — if you see the setup screen, re-enter it)
- Make sure you have Anthropic API credits at https://console.anthropic.com

**Answer filled but site didn't register it**
- Most modern frameworks are supported via native event dispatching
- If the site still doesn't register the change, click inside the box and press a key to trigger its own listeners

**SCAN PAGE returns nothing**
- Some sites block content scripts from reading the DOM (heavy SPAs, PDF viewers)
- Copy and paste the question into the chat input instead

---

## Privacy

- Your API key is stored locally in `chrome.storage.local` — it never touches any server other than `api.anthropic.com`
- Page content is only sent to the Anthropic API when you click ✨ or SCAN PAGE — the extension does not passively send data
- No analytics, no tracking, no external services

---

## License

MIT
