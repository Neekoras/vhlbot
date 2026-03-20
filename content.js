// Content script — injects ✨ fill buttons next to every text input on the page

const INJECTED_ATTR = "data-hwa-injected";
const BTN_CLASS = "hwa-fill-btn";

// ── Boot ──
injectButtons();

// Watch for dynamically added inputs (Google Forms, etc.)
new MutationObserver(() => injectButtons()).observe(document.body, {
  childList: true,
  subtree: true,
});

// ── Inject a fill button next to every un-tagged text input / textarea ──
function injectButtons() {
  const inputs = document.querySelectorAll(
    `input[type="text"]:not([${INJECTED_ATTR}]),
     input[type="search"]:not([${INJECTED_ATTR}]),
     input:not([type]):not([${INJECTED_ATTR}]),
     textarea:not([${INJECTED_ATTR}])`
  );

  inputs.forEach((input) => {
    // Skip hidden, read-only, or already-handled inputs
    if (input.offsetParent === null) return;
    if (input.readOnly || input.disabled) return;

    input.setAttribute(INJECTED_ATTR, "1");

    // Wrap input + button in a relative-positioned span so we can overlay the button
    const wrapper = document.createElement("span");
    wrapper.className = "hwa-wrapper";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement("button");
    btn.className = BTN_CLASS;
    btn.title = "Fill with Spanish answer";
    btn.textContent = "✨";
    wrapper.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFill(input, btn);
    });
  });
}

// ── Extract the question text surrounding a given input ──
function getQuestionContext(input) {
  // Priority order: aria-label → <label for=""> → placeholder → surrounding DOM text

  if (input.getAttribute("aria-label")) return input.getAttribute("aria-label");

  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) return label.textContent.trim();
  }

  // Walk up ancestors collecting preceding sibling text (max 4 levels)
  let el = input.parentElement;
  for (let i = 0; i < 4; i++) {
    if (!el) break;
    const text = getPrecedingSiblingText(el, i === 0 ? input : null);
    if (text.length > 8) return text.slice(0, 400);
    el = el.parentElement;
  }

  if (input.placeholder) return input.placeholder;

  return null;
}

// Return the meaningful text content of siblings that come BEFORE `stopAt` inside `parent`
function getPrecedingSiblingText(parent, stopAt) {
  const parts = [];
  for (const child of parent.childNodes) {
    if (child === stopAt) break;
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent.trim();
      if (t) parts.push(t);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      if (["script", "style", "button"].includes(tag)) continue;
      const t = child.innerText?.trim() || child.textContent?.trim();
      if (t) parts.push(t);
    }
  }
  return parts.join(" ").trim();
}

// ── Handle the fill button click ──
async function handleFill(input, btn) {
  const question = getQuestionContext(input);
  if (!question) {
    flashBtn(btn, "❓ No question found");
    return;
  }

  btn.textContent = "⏳";
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "FILL_SPANISH",
      question,
    });

    if (!response.ok) throw new Error(response.error);

    const answer = response.answer.trim();
    fillInput(input, answer);
    flashBtn(btn, "✅");
  } catch (err) {
    flashBtn(btn, "❌");
    console.error("[HW Assistant]", err);
  } finally {
    btn.disabled = false;
    setTimeout(() => (btn.textContent = "✨"), 2000);
  }
}

// ── Programmatically fill an input so React/Vue/etc. frameworks detect the change ──
function fillInput(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value"
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  // Trigger events so form frameworks pick up the change
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  // Visual flash to confirm fill
  input.style.transition = "background 0.3s";
  input.style.background = "#1a3a2a";
  setTimeout(() => (input.style.background = ""), 800);
}

// ── Button flash helper ──
function flashBtn(btn, text) {
  btn.textContent = text;
}

// ── Listen for page-content requests from the panel ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTENT") {
    sendResponse({ content: extractPageContent() });
  }
  if (message.type === "AUTOFILL_ALL") {
    autofillAll();
    sendResponse({ ok: true });
  }
});

async function autofillAll() {
  const wrappers = document.querySelectorAll(".hwa-wrapper");
  for (const wrapper of wrappers) {
    const input = wrapper.querySelector("input, textarea");
    const btn = wrapper.querySelector("." + BTN_CLASS);
    if (input && btn && !btn.disabled) {
      await handleFill(input, btn);
    }
  }
}

function extractPageContent() {
  const clone = document.body.cloneNode(true);
  for (const el of clone.querySelectorAll(
    "script, style, nav, footer, header, [aria-hidden='true'], .hwa-wrapper"
  )) {
    el.remove();
  }
  const main =
    clone.querySelector("main") ||
    clone.querySelector('[role="main"]') ||
    clone.querySelector("article") ||
    clone;

  return (main.innerText || main.textContent || "")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6000);
}
