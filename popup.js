"use strict";

/* ---------------------------------------------------------------------------
 * Config
 * ------------------------------------------------------------------------ */

// Verified against ai.google.dev/gemini-api/docs/models (stable) and the
// video-understanding docs, which use this same model for YouTube URL input.
const MODEL = "gemini-3.6-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const PROMPT = [
  "Summarize this video.",
  "",
  "Format your answer exactly like this, in plain markdown:",
  "TL;DR: <2-3 sentence summary of what the video covers and its conclusion>",
  "",
  "Then a blank line, then 5-8 key points as a bullet list using '- '.",
  "Each bullet should be one specific, information-dense sentence.",
  "Prefer concrete claims, numbers, and names over vague description.",
  "Do not add any other headings, preamble, or closing remarks.",
].join("\n");

// Video understanding runs over the whole video, so this is deliberately long.
const REQUEST_TIMEOUT_MS = 180000;
const MAX_CACHED = 100;

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
 * Storage helpers
 * ------------------------------------------------------------------------ */

const getApiKey = async () => (await chrome.storage.local.get("apiKey")).apiKey || "";
const getCache = async () => (await chrome.storage.local.get("summaries")).summaries || {};

async function readCached(videoId) {
  const cache = await getCache();
  return cache[videoId] || null;
}

async function writeCached(videoId, entry) {
  const cache = await getCache();
  cache[videoId] = entry;

  // Keep storage bounded: drop the oldest entries past the cap.
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHED) {
    keys
      .sort((a, b) => (cache[a].timestamp || 0) - (cache[b].timestamp || 0))
      .slice(0, keys.length - MAX_CACHED)
      .forEach((k) => delete cache[k]);
  }

  await chrome.storage.local.set({ summaries: cache });
}

/* ---------------------------------------------------------------------------
 * Video ID extraction
 * ------------------------------------------------------------------------ */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractVideoId(rawUrl) {
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m|music)\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return ID_RE.test(id) ? id : null;
  }

  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  // Standard watch URL.
  const v = url.searchParams.get("v");
  if (v && ID_RE.test(v)) return v;

  // /shorts/ID, /live/ID, /embed/ID
  const m = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

const cleanTitle = (t) => (t || "").replace(/\s*[-–]\s*YouTube\s*$/i, "").trim();

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

function relativeTime(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/* ---------------------------------------------------------------------------
 * Minimal markdown rendering
 *
 * The model returns simple markdown. Rather than pull in a parser dependency,
 * this handles the handful of constructs we actually ask for, and builds real
 * DOM nodes (never innerHTML) so model output can't inject markup.
 * ------------------------------------------------------------------------ */

function inlineInto(parent, text) {
  // Split on **bold** and `code`, keeping delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.append(strong);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      parent.append(code);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function toBlocks(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let list = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushPara();
      flushList();
      continue;
    }

    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list) list = { type: "ul", items: [] };
      list.items.push(bullet[1]);
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: heading[1] });
      continue;
    }

    // A short line that is entirely bold reads as a section heading.
    const boldOnly = line.match(/^\*\*(.+)\*\*:?$/);
    if (boldOnly && boldOnly[1].length < 60) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: boldOnly[1].replace(/:$/, "") });
      continue;
    }

    flushList();
    para.push(line);
  }

  flushPara();
  flushList();
  return blocks;
}

const TLDR_RE = /^\*{0,2}TL;?DR\*{0,2}\s*:?\s*/i;

function renderSummary(text) {
  el.summary.replaceChildren();
  const blocks = toBlocks(text);

  blocks.forEach((block, i) => {
    if (block.type === "p") {
      // The first paragraph is the TL;DR — give it the callout treatment.
      if (i === 0 || TLDR_RE.test(block.text)) {
        const box = document.createElement("div");
        box.className = "tldr";

        const label = document.createElement("span");
        label.className = "tldr-label";
        label.textContent = "TL;DR";
        box.append(label);

        const p = document.createElement("p");
        p.style.margin = "0";
        inlineInto(p, block.text.replace(TLDR_RE, ""));
        box.append(p);

        el.summary.append(box);
        return;
      }

      const p = document.createElement("p");
      inlineInto(p, block.text);
      el.summary.append(p);
      return;
    }

    if (block.type === "h") {
      const h = document.createElement("h3");
      h.textContent = block.text;
      el.summary.append(h);
      return;
    }

    const ul = document.createElement("ul");
    for (const item of block.items) {
      const li = document.createElement("li");
      inlineInto(li, item);
      ul.append(li);
    }
    el.summary.append(ul);
  });

  show(el.summary, true);
}

/* ---------------------------------------------------------------------------
 * Gemini API
 * ------------------------------------------------------------------------ */

function describeApiError(status, body) {
  const apiErr = body && body.error ? body.error : {};
  const msg = apiErr.message || "";
  const reason = apiErr.status || "";
  const lower = msg.toLowerCase();

  if (status === 400 && /api key not valid|api_key_invalid/i.test(msg)) {
    return ["Invalid API key", "Check the key in settings, then save it again."];
  }
  if (status === 400 && /(unsupported|cannot be accessed|not accessible|invalid.*(youtube|file_uri|video))/i.test(msg)) {
    return [
      "Gemini couldn't read this video",
      "Private, unlisted, age-restricted, region-blocked and members-only videos aren't supported — only public ones. " + msg,
    ];
  }
  if (status === 400) {
    return ["Request rejected by the API", msg || "The API returned 400 with no detail."];
  }
  if (status === 401 || status === 403) {
    if (/generative ?language|api has not been used|disabled/i.test(lower)) {
      return ["API not enabled for this key", msg];
    }
    return ["API key rejected", msg || "The key was refused. Confirm it's a Gemini API key from Google AI Studio."];
  }
  if (status === 404) {
    return ["Model not found", `"${MODEL}" was rejected as unknown. The model may have been renamed or retired. ${msg}`];
  }
  if (status === 429) {
    return [
      "Rate limit or quota exceeded",
      "The free tier caps YouTube video input at 8 hours per day. Wait and retry, or check your quota in Google AI Studio. " + msg,
    ];
  }
  if (status >= 500) {
    return ["Google's API had a problem", `HTTP ${status}${reason ? " " + reason : ""}. This is usually transient — try again. ${msg}`];
  }
  return [`Request failed (HTTP ${status})`, msg || reason || "No detail returned."];
}

const BLOCK_REASONS = {
  SAFETY: "The response was blocked by Gemini's safety filters.",
  RECITATION: "The response was blocked because it reproduced protected content.",
  PROHIBITED_CONTENT: "The response was blocked as prohibited content.",
  BLOCKLIST: "The response was blocked by a term blocklist.",
  MAX_TOKENS: "The response hit the output token limit before finishing.",
};

async function summarizeVideo(videoId, apiKey) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_BASE}/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPT }, { file_data: { file_uri: watchUrl } }],
          },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new AppError(
        "Timed out",
        `No response after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. Long videos can exceed this — try a shorter one, or retry.`
      );
    }
    throw new AppError("Network error", `Couldn't reach Google's API. Check your connection. (${err.message})`);
  }
  clearTimeout(timer);

  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* non-JSON body handled below */
  }

  if (!res.ok) {
    const [title, detail] = describeApiError(res.status, body);
    throw new AppError(title, detail || raw.slice(0, 400));
  }
  if (!body) {
    throw new AppError("Unreadable response", "The API returned a non-JSON body.");
  }

  const blockReason = body.promptFeedback && body.promptFeedback.blockReason;
  if (blockReason) {
    throw new AppError("Request blocked", BLOCK_REASONS[blockReason] || `Blocked: ${blockReason}`);
  }

  const candidate = (body.candidates || [])[0];
  if (!candidate) {
    throw new AppError("Empty response", "The API returned no candidates. Try again.");
  }

  // Gemini 3.x thinking models can emit reasoning parts — keep only real text.
  const parts = (candidate.content && candidate.content.parts) || [];
  const text = parts
    .filter((p) => typeof p.text === "string" && p.thought !== true)
    .map((p) => p.text)
    .join("")
    .trim();

  if (!text) {
    const fr = candidate.finishReason;
    throw new AppError("No summary returned", BLOCK_REASONS[fr] || `The model returned no text${fr ? ` (finishReason: ${fr})` : ""}.`);
  }

  return text;
}

class AppError extends Error {
  constructor(title, detail) {
    super(title);
    this.title = title;
    this.detail = detail;
  }
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
