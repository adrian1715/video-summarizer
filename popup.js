"use strict";

/* The config, storage, Gemini and rendering helpers this file calls live in
 * shared/ — popup.html loads them first (see shared/api.js, shared/video.js,
 * shared/render.js). They're shared with the background worker and the
 * in-page menu item so there's one copy of the prompt and the API contract. */

/* ---------------------------------------------------------------------------
 * DOM
 * ------------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const el = {
  settings: $("settings"),
  settingsToggle: $("settings-toggle"),
  settingsStatus: $("settings-status"),
  apiKey: $("api-key"),
  keyReveal: $("key-reveal"),
  keySave: $("key-save"),
  keyClear: $("key-clear"),
  cacheClear: $("cache-clear"),
  videoTitle: $("video-title"),
  videoId: $("video-id"),
  notice: $("notice"),
  summarize: $("summarize"),
  cacheBar: $("cache-bar"),
  cacheWhen: $("cache-when"),
  resummarize: $("resummarize"),
  loading: $("loading"),
  error: $("error"),
  summary: $("summary"),
};

const state = {
  videoId: null,
  title: "",
  url: "",
  busy: false,
};

/* ---------------------------------------------------------------------------
 * UI helpers
 * ------------------------------------------------------------------------ */

function show(node, visible) {
  node.classList.toggle("hidden", !visible);
}

function setNotice(text) {
  el.notice.textContent = text || "";
  show(el.notice, Boolean(text));
}

function showError(title, detail) {
  el.error.replaceChildren();

  const strong = document.createElement("strong");
  strong.textContent = title;
  el.error.append(strong);

  if (detail) {
    const d = document.createElement("div");
    d.className = "detail";
    d.textContent = detail;
    el.error.append(d);
  }

  show(el.error, true);
}

function clearError() {
  el.error.replaceChildren();
  show(el.error, false);
}

function setBusy(busy) {
  state.busy = busy;
  show(el.loading, busy);
  el.summarize.disabled = busy || !state.videoId;
  el.resummarize.disabled = busy;
  el.summarize.textContent = busy ? "Summarizing…" : "Summarize";
}

function renderSummary(text) {
  renderSummaryInto(el.summary, text);
  show(el.summary, true);
}

/* ---------------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------------ */

async function displayCached(entry) {
  renderSummary(entry.summary);
  el.cacheWhen.textContent = `Cached ${relativeTime(entry.timestamp)}`;
  show(el.cacheBar, true);
  show(el.summarize, false);
}

async function runSummarize() {
  if (state.busy || !state.videoId) return;

  const apiKey = await getApiKey();
  if (!apiKey) {
    showError("No API key set", "Add your Gemini API key in settings (gear icon, top right), then try again.");
    openSettings(true);
    el.apiKey.focus();
    return;
  }

  clearError();
  show(el.summary, false);
  show(el.cacheBar, false);
  setBusy(true);

  try {
    const text = await summarizeVideo(state.videoId, apiKey);
    const entry = { summary: text, timestamp: Date.now(), title: state.title, model: MODEL };
    await writeCached(state.videoId, entry);
    setBusy(false);
    await displayCached(entry);
  } catch (err) {
    setBusy(false);
    if (err instanceof AppError) {
      showError(err.title, err.detail);
    } else {
      showError("Unexpected error", err && err.message ? err.message : String(err));
    }
    // Leave the button available so it doubles as retry.
    show(el.summarize, true);
  }
}

function openSettings(open) {
  show(el.settings, open);
  el.settingsStatus.textContent = "";
}

/* ---------------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------------ */

async function init() {
  // Settings wiring
  el.settingsToggle.addEventListener("click", () => openSettings(el.settings.classList.contains("hidden")));

  el.keyReveal.addEventListener("click", () => {
    const hidden = el.apiKey.type === "password";
    el.apiKey.type = hidden ? "text" : "password";
    el.keyReveal.textContent = hidden ? "Hide" : "Show";
  });

  el.keySave.addEventListener("click", async () => {
    const key = el.apiKey.value.trim();
    if (!key) {
      el.settingsStatus.style.color = "var(--err-fg)";
      el.settingsStatus.textContent = "Enter a key first.";
      return;
    }
    await chrome.storage.local.set({ apiKey: key });
    el.settingsStatus.style.color = "var(--ok)";
    el.settingsStatus.textContent = "Key saved.";
    clearError();
  });

  el.keyClear.addEventListener("click", async () => {
    await chrome.storage.local.remove("apiKey");
    el.apiKey.value = "";
    el.settingsStatus.style.color = "var(--muted)";
    el.settingsStatus.textContent = "Key cleared.";
  });

  el.cacheClear.addEventListener("click", async () => {
    await chrome.storage.local.remove("summaries");
    el.settingsStatus.style.color = "var(--muted)";
    el.settingsStatus.textContent = "Cached summaries cleared.";
    show(el.summary, false);
    show(el.cacheBar, false);
    show(el.summarize, true);
  });

  el.summarize.addEventListener("click", runSummarize);
  el.resummarize.addEventListener("click", () => {
    show(el.summarize, true);
    runSummarize();
  });

  // Restore saved key into the field
  const savedKey = await getApiKey();
  if (savedKey) el.apiKey.value = savedKey;

  // Identify the current tab's video
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    /* handled below */
  }

  state.url = (tab && tab.url) || "";
  state.videoId = extractVideoId(state.url);
  state.title = cleanTitle(tab && tab.title);

  if (!state.videoId) {
    el.videoTitle.textContent = "No YouTube video here";
    el.videoId.textContent = "";
    setNotice("Open a YouTube video (youtube.com/watch, /shorts or youtu.be) and click the icon again.");
    el.summarize.disabled = true;
    if (!savedKey) openSettings(true);
    return;
  }

  el.videoTitle.textContent = state.title || "YouTube video";
  el.videoId.textContent = state.videoId;
  el.summarize.disabled = false;

  if (!savedKey) {
    setNotice("Add your Gemini API key to get started.");
    openSettings(true);
  }

  // Cached result → show instantly, no API call.
  const cached = await readCached(state.videoId);
  if (cached && cached.summary) await displayCached(cached);
}

init().catch((err) => {
  showError("Failed to start", err && err.message ? err.message : String(err));
});
