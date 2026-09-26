"use strict";

/* The config, storage, i18n, Gemini and rendering helpers this file calls
 * live in shared/ — popup.html loads them first (see shared/api.js,
 * shared/video.js, shared/render.js, shared/i18n.js). They're shared with the
 * background worker and the in-page menu item so there's one copy of the
 * prompt, the API contract and the string table. */

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
  language: $("language-select"),
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
  lang: "en", // resolved UI language code; set for real early in init()
  noticeKey: null, // i18n key behind the current #notice text, if any (see setNotice)
  cachedTimestamp: null, // timestamp behind the current cache-bar text, if shown
};

/* ---------------------------------------------------------------------------
 * i18n
 *
 * tr() is the one call site everything else uses; state.lang is the only
 * thing that changes when the user picks a language in settings. Static
 * markup is translated by walking data-i18n* attributes (applyTranslations());
 * text set dynamically from JS goes through tr() directly at the call site.
 * ------------------------------------------------------------------------ */

const tr = (key, vars) => t(state.lang, key, vars);

function applyTranslations() {
  document
    .querySelectorAll("[data-i18n]")
    .forEach((node) => (node.textContent = tr(node.dataset.i18n)));
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach((node) => (node.placeholder = tr(node.dataset.i18nPlaceholder)));
  document
    .querySelectorAll("[data-i18n-title]")
    .forEach((node) => (node.title = tr(node.dataset.i18nTitle)));
  document
    .querySelectorAll("[data-i18n-aria]")
    .forEach((node) => node.setAttribute("aria-label", tr(node.dataset.i18nAria)));
}

/* ---------------------------------------------------------------------------
 * UI helpers
 * ------------------------------------------------------------------------ */

function show(node, visible) {
  node.classList.toggle("hidden", !visible);
}

// `key` is remembered so a later language change can retranslate whatever's
// currently showing (see applyLanguageChange()) instead of freezing it in
// whatever language was active when it was first set.
function setNotice(key) {
  state.noticeKey = key;
  el.notice.textContent = key ? tr(key) : "";
  show(el.notice, Boolean(key));
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

function renderSummarizeText() {
  el.summarize.textContent = tr(state.busy ? "summarizing" : "summarize");
}

function renderVideoTitle() {
  el.videoTitle.textContent = state.videoId
    ? state.title || tr("youtubeVideoFallback")
    : tr("noVideoTitle");
}

function setBusy(busy) {
  state.busy = busy;
  show(el.loading, busy);
  el.summarize.disabled = busy || !state.videoId;
  el.resummarize.disabled = busy;
  renderSummarizeText();
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

// "main" keeps the brand name as its title, deliberately untranslated — it's
// a product name, not a UI string.
function viewTitleFor(view) {
  if (view === "main") return "YouTube Quick Summary";
  return tr({ settings: "settings", history: "history", entry: "summaryViewTitle" }[view]);
}

function setView(view) {
  state.view = view;

  show(el.main, view === "main");
  show(el.settings, view === "settings");
  show(el.history, view === "history");
  show(el.entry, view === "entry");

  // Back sits where the brand dot does, so only one of them shows at a time.
  show(el.back, view !== "main");
  show(el.brandDot, view === "main");
  el.viewTitle.textContent = viewTitleFor(view);

  if (view !== "settings") el.settingsStatus.textContent = "";
}

function goBack() {
  // The entry view is reached from the list; everything else from main.
  setView(state.view === "entry" ? "history" : "main");
}

/* ---------------------------------------------------------------------------
 * Language
 * ------------------------------------------------------------------------ */

// "Auto" is a real option, not just the absence of one — its label names the
// system language it resolves to, so picking it back after choosing an
// explicit language isn't a leap of faith. Native-script labels (Español,
// 日本語, …) come from LANGUAGES/languageNativeLabel in shared/i18n.js, so a
// speaker of that language recognizes their own entry regardless of which
// language the popup currently renders in.
function populateLanguageOptions() {
  el.language.replaceChildren();

  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = tr("autoDetected", {
    lang: languageNativeLabel(systemLanguageCode()),
  });
  el.language.append(auto);

  for (const { code, native } of LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = native;
    el.language.append(opt);
  }
}

// Everything that (a) was translated into markup ahead of time, or (b) is
// live UI chrome derived from current state, gets redone in the new
// language. What's deliberately left alone: text that resulted from a
// completed action — an error already on screen, a "Key saved." status line
// — stays as it was when that action finished, the same way a cached summary
// keeps the language it was made in. Only the next action picks up the
// change.
async function applyLanguageChange(code) {
  await chrome.storage.local.set({ language: code });
  state.lang = await resolveLanguageCode();

  populateLanguageOptions();
  el.language.value = code;

  applyTranslations();
  el.viewTitle.textContent = viewTitleFor(state.view);
  renderSummarizeText();
  renderVideoTitle();
  armDelete(state.deleteArmed);
  if (state.noticeKey) setNotice(state.noticeKey);
  if (state.cachedTimestamp && !el.cacheBar.classList.contains("hidden")) {
    el.cacheWhen.textContent = tr("cachedRelative", {
      time: relativeTime(state.cachedTimestamp, state.lang),
    });
  }
  if (state.view === "history") renderHistoryList();
  if (state.view === "entry" && state.entryId) openEntry(state.entryId);

  el.settingsStatus.style.color = "var(--ok)";
  el.settingsStatus.textContent = tr("languageSaved");
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
    title.textContent = entry.title || tr("untitledVideo");
    btn.append(title);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    // Entries cached before a field existed still have to render.
    meta.textContent = `${entry.timestamp ? relativeTime(entry.timestamp, state.lang) : tr("unknownDate")} · ${entry.id}`;
    btn.append(meta);

    btn.addEventListener("click", () => openEntry(entry.id));
    li.append(btn);
    el.historyList.append(li);
  }

  // The search box is noise when there's nothing to search.
  show(el.historySearch, state.entries.length > 0);
  show(el.historyEmpty, visible.length === 0);
  el.historyEmpty.textContent = state.entries.length
    ? tr("noMatches")
    : tr("noSummariesYet");
}

async function openHistory() {
  await loadEntries();
  renderHistoryList();
  el.historyList.scrollTop = 0;
  setView("history");
}

function armDelete(armed) {
  state.deleteArmed = armed;
  el.entryDelete.textContent = tr(armed ? "deleteConfirm" : "delete");
}

function openEntry(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;

  state.entryId = id;
  armDelete(false);

  el.entryTitle.textContent = entry.title || tr("untitledVideo");
  el.entryMeta.textContent = `${entry.timestamp ? tr("cachedRelative", { time: relativeTime(entry.timestamp, state.lang) }) : tr("cachedUnknownTime")} · ${id}`;
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
  state.cachedTimestamp = entry.timestamp;
  el.cacheWhen.textContent = tr("cachedRelative", {
    time: relativeTime(entry.timestamp, state.lang),
  });
  show(el.cacheBar, true);
  show(el.summarize, false);
}

async function runSummarize() {
  if (state.busy || !state.videoId) return;

  const apiKey = await getApiKey();
  if (!apiKey) {
    // The error stays on main for when they navigate back; settings gets its
    // own line, since it's the view they're about to be looking at.
    showError(tr("noApiKeyTitle"), tr("noApiKeyDetailPopup"));
    setView("settings");
    el.settingsStatus.style.color = "var(--err-fg)";
    el.settingsStatus.textContent = tr("addApiKeyToSummarize");
    el.apiKey.focus();
    return;
  }

  clearError();
  show(el.summary, false);
  show(el.cacheBar, false);
  setBusy(true);

  try {
    /* Streamed: the spinner gives way to text as soon as the first characters
     * arrive, and the article re-renders in place as more lands. state.busy
     * stays true throughout, so the buttons remain disabled until it's done. */
    let streaming = false;
    const text = await summarizeVideo(state.videoId, apiKey, state.lang, (partial) => {
      if (!streaming) {
        streaming = true;
        show(el.loading, false);
        show(el.summary, true);
      }
      renderSummaryInto(el.summary, partial);
    });

    const entry = { summary: text, timestamp: Date.now(), title: state.title, model: MODEL };
    await writeCached(state.videoId, entry);
    setBusy(false);
    await displayCached(entry);
  } catch (err) {
    setBusy(false);
    if (err instanceof AppError) {
      showError(err.title, err.detail);
    } else {
      showError(tr("unexpectedError"), err && err.message ? err.message : String(err));
    }
    // Leave the button available so it doubles as retry.
    show(el.summarize, true);
  }
}

/* ---------------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------------ */

async function init() {
  // Resolved before anything renders, so the very first paint — including the
  // markup's own baked-in English text via applyTranslations() — is already
  // in the right language.
  state.lang = await resolveLanguageCode();
  applyTranslations();

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
    el.keyReveal.textContent = tr(hidden ? "hide" : "show");
  });

  el.keySave.addEventListener("click", async () => {
    const key = el.apiKey.value.trim();
    if (!key) {
      el.settingsStatus.style.color = "var(--err-fg)";
      el.settingsStatus.textContent = tr("enterKeyFirst");
      return;
    }
    await chrome.storage.local.set({ apiKey: key });
    el.settingsStatus.style.color = "var(--ok)";
    el.settingsStatus.textContent = tr("keySaved");
    clearError();
  });

  el.keyClear.addEventListener("click", async () => {
    await chrome.storage.local.remove("apiKey");
    el.apiKey.value = "";
    el.settingsStatus.style.color = "var(--muted)";
    el.settingsStatus.textContent = tr("keyCleared");
  });

  populateLanguageOptions();
  el.language.value = await getLanguagePref();
  el.language.addEventListener("change", () => applyLanguageChange(el.language.value));

  el.cacheClear.addEventListener("click", async () => {
    await chrome.storage.local.remove("summaries");
    state.entries = [];
    state.cachedTimestamp = null;
    el.settingsStatus.style.color = "var(--muted)";
    el.settingsStatus.textContent = tr("cacheCleared");
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
  renderVideoTitle();

  if (!state.videoId) {
    el.videoId.textContent = "";
    setNotice("noVideoNotice");
    el.summarize.disabled = true;
    if (!savedKey) setView("settings");
    return;
  }

  el.videoId.textContent = state.videoId;
  el.summarize.disabled = false;

  if (!savedKey) {
    setNotice("addApiKeyNotice");
    setView("settings");
  }

  // Cached result → show instantly, no API call.
  const cached = await readCached(state.videoId);
  if (cached && cached.summary) await displayCached(cached);
}

init().catch((err) => {
  showError(tr("failedToStart"), err && err.message ? err.message : String(err));
});
