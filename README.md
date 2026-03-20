# VHLbot

A Chrome extension for VHL Central that reads your Spanish homework page and answers it. Auto-fills text boxes, scans graded assignments to explain what you got wrong, and supports follow-up questions.

Only activates on `vhlcentral.com`. Invisible everywhere else.

---

## How it works

**Inline fill (✨ buttons)**
VHLbot injects a small ✨ button next to every text input on the page. Click one — it reads the question from the surrounding DOM, calls the AI, and types the correct Spanish answer directly into the box. Dispatches native input events so VHL's form handlers register the change.

**Autofill**
The AUTOFILL pill in the header runs the fill operation on every input on the page at once, in sequence.

**Scanning**
The SCANNING pill reads the full page — including same-origin iframes where VHL loads exercises — and sends the content to the AI. If the page has open questions, it answers them. If the page is already graded, it identifies what you got wrong, states the correct answer, and explains why in plain terms. Programmatically re-injects the content script if needed (e.g. after extension reload).

**Chat**
The side panel includes a chat input for follow-up questions. Grammar rules, conjugations, vocab — ask directly. Page scanning is the primary mode; chat is secondary.

---

## Features

- ✨ buttons on every text input — click to fill a single answer
- AUTOFILL — fills all inputs on the page at once
- SCANNING — reads the full page and answers open questions or explains wrong answers on graded assignments
- Iframe-aware DOM extraction — reads exercise frames, not just the outer page
- Auto-injects content script if not loaded (no page refresh needed after extension reload)
- Supports Anthropic and Replicate as AI providers — switch at setup
- Side panel only enabled on `vhlcentral.com` — disabled and hidden on all other tabs
- API key stored locally in `chrome.storage.local` — never leaves your browser except to call the AI API
- Conversation history preserved within a session

---

## Installation

VHLbot is not on the Chrome Web Store. Load it as an unpacked extension.

**1. Clone**

```bash
git clone https://github.com/Neekoras/vhlbot.git
```

**2. Load in Chrome**

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `vhlbot` folder

**3. Add your API key**

Click the VHLbot icon while on any VHL Central page. On first launch you'll see a setup screen — choose your provider and paste your key.

| Provider | Key format | Get a key |
|---|---|---|
| Anthropic | `sk-ant-...` | console.anthropic.com/settings/keys |
| Replicate | `r8_...` | replicate.com/account/api-tokens |

---

## Usage

| Action | How |
|---|---|
| Fill one answer | Click ✨ next to a text box |
| Fill all answers | Click **AUTOFILL** in the header |
| Scan the page | Click **SCANNING** in the header |
| Ask a question | Type in the chat input and press Enter |
| Reset API key | Click the gear icon |

---

## File structure

```
vhlbot/
├── manifest.json        MV3 manifest — permissions, content script rules
├── background.js        Service worker — API calls, side panel policy
├── content.js           Page script — ✨ buttons, DOM extraction, iframe reading
├── content.css          Styles for injected fill buttons
├── sidepanel.html       Side panel markup
├── sidepanel.css        Side panel styles
├── sidepanel.js         Side panel logic — chat, scan, autofill, state
└── icons/               16, 48, 128, 256px PNG icons
```

---

## AI providers

**Anthropic (default)**
Calls `claude-sonnet-4-6` directly from the browser via the Anthropic API.

**Replicate**
Routes through Replicate using `anthropic/claude-4.5-sonnet`. Same model, billed through your Replicate account. Provider is auto-detected from the key prefix — `r8_` routes to Replicate, `sk-ant-` routes to Anthropic directly.

---

## Troubleshooting

**"Scan failed" error**
Refresh the VHL page and try again. The extension re-injects the content script automatically, but the first scan after an extension reload sometimes needs a retry.

**✨ buttons don't appear**
VHL Central uses iframes for some exercise types. Buttons only appear on inputs in the main frame or same-origin frames. Cross-origin frames are inaccessible by browser security policy.

**Answer filled but VHL didn't register it**
Click inside the box and press a key. Some VHL exercise types have additional listeners beyond standard input/change events.

**Panel doesn't open**
Make sure you're on a `vhlcentral.com` URL. The side panel is disabled on all other domains.

---

## Privacy

- API key stored in `chrome.storage.local` — local only
- Page content sent to the AI API only when you click AUTOFILL or SCANNING — never passively
- No analytics, no tracking, no external services beyond the AI API

---

## License

MIT
