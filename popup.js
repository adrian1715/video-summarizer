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
  back: $("back"),
  brandDot: $("brand-dot"),
  viewTitle: $("view-title"),
  settings: $("settings"),
  settingsToggle: $("settings-toggle"),
  settingsStatus: $("settings-status"),
  apiKey: $("api-key"),
  keyReveal: $("key-reveal"),
  keySave: $("key-save"),
  keyClear: $("key-clear"),
  cacheClear: $("cache-clear"),
  main: $("main"),
  videoTitle: $("video-title"),
  videoId: $("video-id"),
  notice: $("notice"),
  summarize: $("summarize"),
  cacheBar: $("cache-bar"),
  cacheWhen: $("cache-when"),
  resummarize: $("resummarize"),
  historyOpen: $("history-open"),
  historyOpenSettings: $("history-open-settings"),
  loading: $("loading"),
  error: $("error"),
  summary: $("summary"),
  history: $("history"),
  historySearch: $("history-search"),
  historyList: $("history-list"),
  historyEmpty: $("history-empty"),
  entry: $("entry"),
  entryTitle: $("entry-title"),
  entryMeta: $("entry-meta"),
  entryOpen: $("entry-open"),
  entryDelete: $("entry-delete"),
  entrySummary: $("entry-summary"),
};

const state = {
  videoId: null,
  title: "",
  url: "",
  busy: false,
  view: "main", // main | settings | history | entry
  entries: [], // history: [{ id, summary, timestamp, title, model }], newest first
  entryId: null,
  deleteArmed: false,
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
 * Views
 *
 * Exactly one of main / settings / history / entry is visible. Settings used
 * to render above the main view, which showed the current video and its
 * Summarize button twice.
 * ------------------------------------------------------------------------ */

const VIEW_TITLES = {
  main: "YT Quick Summary",
  settings: "Settings",
  history: "History",
  entry: "Summary",
};

function setView(view) {
  state.view = view;

  show(el.main, view === "main");
  show(el.settings, view === "settings");
  show(el.history, view === "history");
  show(el.entry, view === "entry");

  // Back sits where the brand dot does, so only one of them shows at a time.
  show(el.back, view !== "main");
  show(el.brandDot, view === "main");
  el.viewTitle.textContent = VIEW_TITLES[view];

  if (view !== "settings") el.settingsStatus.textContent = "";
}

function goBack() {
  // The entry view is reached from the list; everything else from main.
  setView(state.view === "entry" ? "history" : "main");
}

/* ---------------------------------------------------------------------------
 * History
 * ------------------------------------------------------------------------ */

const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

async function loadEntries() {
  const cache = await getCache();
  state.entries = Object.entries(cache)
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function visibleEntries() {
  const q = el.historySearch.value.trim().toLowerCase();
  if (!q) return state.entries;

  return state.entries.filter(
    (e) =>
      e.id.toLowerCase().includes(q) ||
      (e.title || "").toLowerCase().includes(q) ||
      (e.summary || "").toLowerCase().includes(q)
  );
}

function renderHistoryList() {
  const visible = visibleEntries();
  el.historyList.replaceChildren();

  for (const entry of visible) {
    const li = document.createElement("li");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-item";

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = entry.title || "Untitled video";
    btn.append(title);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    // Entries cached before a field existed still have to render.
    meta.textContent = `${entry.timestamp ? relativeTime(entry.timestamp) : "unknown date"} · ${entry.id}`;
    btn.append(meta);

    btn.addEventListener("click", () => openEntry(entry.id));
    li.append(btn);
    el.historyList.append(li);
  }

  // The search box is noise when there's nothing to search.
  show(el.historySearch, state.entries.length > 0);
  show(el.historyEmpty, visible.length === 0);
  el.historyEmpty.textContent = state.entries.length
    ? "Nothing matches that search."
    : "No summaries yet. Summarize a video and it'll show up here.";
}

async function openHistory() {
  await loadEntries();
  renderHistoryList();
  el.historyList.scrollTop = 0;
  setView("history");
}

function armDelete(armed) {
  state.deleteArmed = armed;
  el.entryDelete.textContent = armed ? "Click again to delete" : "Delete";
}

function openEntry(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;

  state.entryId = id;
  armDelete(false);

  el.entryTitle.textContent = entry.title || "Untitled video";
  el.entryMeta.textContent = `${entry.timestamp ? "Cached " + relativeTime(entry.timestamp) : "Cached at an unknown time"} · ${id}`;
  renderSummaryInto(el.entrySummary, entry.summary || "");
  el.entrySummary.scrollTop = 0;

  setView("entry");
}

async function deleteEntry() {
  const id = state.entryId;
  if (!id) return;

  // A confirm() dialog can dismiss the popup, so the button arms itself first.
  if (!state.deleteArmed) {
    armDelete(true);
    setTimeout(() => {
      if (state.deleteArmed) armDelete(false);
    }, 3000);
    return;
  }

  await deleteCached(id);

  // If that was the video in the current tab, main's cached branch is stale.
  if (id === state.videoId) {
    show(el.summary, false);
    show(el.cacheBar, false);
    show(el.summarize, true);
  }

  await openHistory();
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
    // The error stays on main for when they navigate back; settings gets its
    // own line, since it's the view they're about to be looking at.
    showError("No API key set", "Add your Gemini API key in settings (gear icon, top right), then try again.");
    setView("settings");
    el.settingsStatus.style.color = "var(--err-fg)";
    el.settingsStatus.textContent = "Add your API key to summarize.";
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

/* ---------------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------------ */

async function init() {
  // The markup starts on main; say so explicitly so state.view can't drift.
  setView("main");

  // Navigation
  el.back.addEventListener("click", goBack);
  el.settingsToggle.addEventListener("click", () => setView(state.view === "settings" ? "main" : "settings"));
  el.historyOpen.addEventListener("click", openHistory);
  el.historyOpenSettings.addEventListener("click", openHistory);
  el.historySearch.addEventListener("input", renderHistoryList);
  el.historySearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.historySearch.value) {
      el.historySearch.value = "";
      renderHistoryList();
    }
  });

  el.entryOpen.addEventListener("click", () => {
    if (state.entryId) chrome.tabs.create({ url: watchUrl(state.entryId) });
  });
  el.entryDelete.addEventListener("click", deleteEntry);

  // Settings wiring
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
    state.entries = [];
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
    if (!savedKey) setView("settings");
    return;
  }

  el.videoTitle.textContent = state.title || "YouTube video";
  el.videoId.textContent = state.videoId;
  el.summarize.disabled = false;

  if (!savedKey) {
    setNotice("Add your Gemini API key to get started.");
    setView("settings");
  }

  // Cached result → show instantly, no API call.
  const cached = await readCached(state.videoId);
  if (cached && cached.summary) await displayCached(cached);
}

init().catch((err) => {
  showError("Failed to start", err && err.message ? err.message : String(err));
});
