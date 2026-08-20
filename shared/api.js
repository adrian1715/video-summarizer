"use strict";

/* ---------------------------------------------------------------------------
 * Config, storage and the Gemini call.
 *
 * Loaded as a plain script by the popup and by the background worker
 * (importScripts), after shared/i18n.js — buildPrompt() and the error paths
 * below use its t()/languageLabel(). Deliberately NOT loaded into the content
 * script: the page's world has no business holding the API key or the
 * endpoint code (shared/i18n.js, which has no secrets, is loaded there
 * instead, for the content script's own UI strings).
 * ------------------------------------------------------------------------ */

// Verified against ai.google.dev/gemini-api/docs/models (stable) and the
// video-understanding docs, which use this same model for YouTube URL input.
const MODEL = "gemini-3.6-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Thinking costs wall-clock time and output tokens, and the parts filter in
// summarizeVideo() throws the thought parts away regardless. "medium" is this
// model's default; producing a TL;DR plus a fixed bullet list is the kind of
// extraction task Google recommends "low" for. Values: minimal | low | medium |
// high — raise it if bullet quality regresses.
//
// Nesting matters: on this (legacy generateContent) endpoint it goes in
// generationConfig.thinkingConfig.thinkingLevel. The flat
// generation_config.thinking_level shape in some docs is the newer
// Interactions API and is rejected here.
const THINKING_LEVEL = "low";

// The "TL;DR:" and bullet markers are given as literal format tokens, not
// placeholders — models reliably keep instructed literal markup as-is even
// when writing the surrounding prose in another language, which is what lets
// shared/render.js's TLDR_RE keep matching regardless of summary language.
function buildPrompt(languageName) {
  return [
    "Summarize this video.",
    "",
    `Write the entire summary in ${languageName}, regardless of the video's own spoken or on-screen language. Keep the literal markers below ("TL;DR:", "- ") exactly as written.`,
    "",
    "Format your answer exactly like this, in plain markdown:",
    "TL;DR: <2-3 sentence summary of what the video covers and its conclusion>",
    "",
    "Then a blank line, then 5-7 key points as a bullet list using '- '.",
    "Each bullet should be one specific, information-dense sentence.",
    "Prefer concrete claims, numbers, and names over vague description.",
    "Do not add any other headings, preamble, or closing remarks.",
  ].join("\n");
}

// Video understanding runs over the whole video, so this is deliberately long.
// This caps the whole stream, not just the wait for headers.
const REQUEST_TIMEOUT_MS = 180000;
const MAX_CACHED = 100;

// Gemini emits SSE events far faster than anything needs to repaint, and on the
// in-page path every emission is a postMessage across a port. Coalesce them.
const STREAM_FLUSH_MS = 100;

/* ---------------------------------------------------------------------------
 * Storage helpers
 * ------------------------------------------------------------------------ */

const getApiKey = async () =>
  (await chrome.storage.local.get("apiKey")).apiKey || "";
const getCache = async () =>
  (await chrome.storage.local.get("summaries")).summaries || {};

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

async function deleteCached(videoId) {
  const cache = await getCache();
  if (!(videoId in cache)) return;
  delete cache[videoId];
  await chrome.storage.local.set({ summaries: cache });
}

/* ---------------------------------------------------------------------------
 * Gemini API
 *
 * Language detection/resolution (LANGUAGES, resolveLanguageCode(),
 * languageLabel(), t()) lives in shared/i18n.js, loaded before this file —
 * it has no secrets, so the content script uses the same copy for its own
 * UI strings. summarizeVideo() takes the resolved code, not a name: the
 * caller resolves it once (mirroring how apiKey is already fetched by the
 * caller), and everything below derives both the prompt's language name and
 * error messages from that same code, so the two can never disagree.
 * ------------------------------------------------------------------------ */

class AppError extends Error {
  constructor(title, detail) {
    super(title);
    this.title = title;
    this.detail = detail;
  }
}

// Google's own error.message (`msg` below) always arrives in English — we
// don't control that, so it's appended untranslated to the human-authored,
// translated part of the detail, exactly where the original English text
// used to splice it in.
function describeApiError(status, body, lang) {
  const apiErr = body && body.error ? body.error : {};
  const msg = apiErr.message || "";
  const reason = apiErr.status || "";
  const lower = msg.toLowerCase();

  if (status === 400 && /api key not valid|api_key_invalid/i.test(msg)) {
    return [t(lang, "invalidApiKeyTitle"), t(lang, "invalidApiKeyDetail")];
  }
  if (
    status === 400 &&
    /(unsupported|cannot be accessed|not accessible|invalid.*(youtube|file_uri|video))/i.test(
      msg,
    )
  ) {
    return [
      t(lang, "unsupportedVideoTitle"),
      t(lang, "unsupportedVideoDetail") + " " + msg,
    ];
  }
  if (status === 400) {
    return [
      t(lang, "requestRejectedTitle"),
      msg || t(lang, "requestRejectedFallback"),
    ];
  }
  if (status === 401 || status === 403) {
    if (/generative ?language|api has not been used|disabled/i.test(lower)) {
      return [t(lang, "apiNotEnabledTitle"), msg];
    }
    return [
      t(lang, "apiKeyRejectedTitle"),
      msg || t(lang, "apiKeyRejectedFallback"),
    ];
  }
  if (status === 404) {
    return [
      t(lang, "modelNotFoundTitle"),
      t(lang, "modelNotFoundDetail", { model: MODEL }) + " " + msg,
    ];
  }
  if (status === 429) {
    return [
      t(lang, "rateLimitTitle"),
      t(lang, "rateLimitDetail") + " " + msg,
    ];
  }
  if (status >= 500) {
    return [
      t(lang, "serverErrorTitle"),
      t(lang, "serverErrorDetail", {
        status,
        reasonPart: reason ? " " + reason : "",
      }) +
        " " +
        msg,
    ];
  }
  return [
    t(lang, "requestFailedTitle", { status }),
    msg || reason || t(lang, "requestFailedFallback"),
  ];
}

const BLOCK_REASON_KEYS = {
  SAFETY: "blockSafety",
  RECITATION: "blockRecitation",
  PROHIBITED_CONTENT: "blockProhibited",
  BLOCKLIST: "blockBlocklist",
  MAX_TOKENS: "blockMaxTokens",
};

const blockReasonMessage = (lang, reason) =>
  BLOCK_REASON_KEYS[reason] ? t(lang, BLOCK_REASON_KEYS[reason]) : null;

/* One line per API call, so the minute this takes can be attributed rather than
 * guessed at. promptTokenCount is dominated by the video itself (~300 tokens per
 * second of video at default media resolution); thoughtsTokenCount is reasoning
 * that is billed as output and then dropped before it reaches the UI.
 *
 * "to first text" is the number streaming exists to move. The total won't shift
 * much — it's the same work on Google's side — but first text should be small.
 *
 * Popup summaries log to the popup's own console (right-click the popup →
 * Inspect). In-page ones log to the worker's, behind the "service worker" link
 * on the extension's card in chrome://extensions. */
function logTiming(videoId, elapsedMs, usage, firstTextMs) {
  const u = usage || {};
  const n = (v) => (typeof v === "number" ? v : "?");
  const secs = (ms) =>
    typeof ms === "number" ? `${(ms / 1000).toFixed(1)}s` : "—";

  console.log(
    `[YT Quick Summary] ${videoId}: ${secs(elapsedMs)} total · ` +
      `${secs(firstTextMs)} to first text · ` +
      `prompt ${n(u.promptTokenCount)} · thoughts ${n(u.thoughtsTokenCount)} · ` +
      `output ${n(u.candidatesTokenCount)} · total ${n(u.totalTokenCount)} · ` +
      `thinking ${THINKING_LEVEL}`,
  );
}

function connectionError(err, gotPartialText, lang) {
  if (err.name === "AbortError") {
    return new AppError(
      t(lang, "timedOutTitle"),
      t(lang, "timedOutDetail", {
        seconds: Math.round(REQUEST_TIMEOUT_MS / 1000),
      }),
    );
  }
  if (gotPartialText) {
    return new AppError(
      t(lang, "connectionLostTitle"),
      t(lang, "connectionLostDetail", { message: err.message }),
    );
  }
  return new AppError(
    t(lang, "networkErrorTitle"),
    t(lang, "networkErrorDetail", { message: err.message }),
  );
}

/* Reads an `alt=sse` body, handing each decoded event object to `onEvent`.
 *
 * SSE frames are separated by a blank line and carry one or more `data:` lines.
 * A frame can straddle two network chunks, so whatever follows the last
 * separator stays buffered until more bytes arrive. */
async function readSseStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const separator = /\r?\n\r?\n/;
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let match;
    while ((match = separator.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);

      const payload = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");

      if (!payload || payload === "[DONE]") continue;

      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue; // one unparseable frame isn't worth failing the run over
      }
      onEvent(event);
    }
  }
}

/* Streams the summary.
 *
 * `lang` is a resolved language code (e.g. "es") from resolveLanguageCode()
 * (shared/i18n.js) — resolved by the caller, not in here, mirroring how
 * apiKey is already fetched by the caller rather than read from storage
 * inside this function. It drives both the prompt (via languageLabel()) and
 * every translated error message this call can throw.
 *
 * `onChunk` is optional and receives the full text so far, coalesced to
 * STREAM_FLUSH_MS; the finished text is also returned, so a caller can use
 * either or both. Moving from :generateContent to :streamGenerateContent
 * changes nothing about the request, the tokens or the cost — only when the
 * first characters become renderable. */
async function summarizeVideo(videoId, apiKey, lang, onChunk) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  let usage = null;
  let firstTextAt = 0;

  // Every exit runs this exactly once, so no path escapes untimed.
  const settle = () => {
    clearTimeout(timer);
    logTiming(
      videoId,
      Date.now() - startedAt,
      usage,
      firstTextAt ? firstTextAt - startedAt : undefined,
    );
  };

  let res;
  try {
    res = await fetch(`${API_BASE}/${MODEL}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(languageLabel(lang)) },
              { file_data: { file_uri: watchUrl } },
            ],
          },
        ],
        generationConfig: {
          thinkingConfig: { thinkingLevel: THINKING_LEVEL },
        },
      }),
    });
  } catch (err) {
    settle();
    throw connectionError(err, false, lang);
  }

  // A rejected request answers with an ordinary JSON error body, not a stream.
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* non-JSON body falls back to the raw text below */
    }
    usage = body && body.usageMetadata;
    settle();

    const [title, detail] = describeApiError(res.status, body, lang);
    throw new AppError(title, detail || raw.slice(0, 400));
  }
  if (!res.body) {
    settle();
    throw new AppError(
      t(lang, "unreadableResponseTitle"),
      t(lang, "unreadableResponseDetail"),
    );
  }

  let text = "";
  let blockReason = null;
  let finishReason = null;
  let lastFlush = 0;

  const flush = (force) => {
    if (!onChunk || !text) return;
    const now = Date.now();
    if (!force && now - lastFlush < STREAM_FLUSH_MS) return;
    lastFlush = now;
    onChunk(text);
  };

  try {
    await readSseStream(res.body, (event) => {
      // Google can report a failure mid-stream, having already sent a 200.
      if (event.error) {
        const [title, detail] = describeApiError(
          event.error.code || 500,
          event,
          lang,
        );
        throw new AppError(title, detail);
      }

      // Usage arrives cumulatively; the last one seen is the total.
      if (event.usageMetadata) usage = event.usageMetadata;
      if (event.promptFeedback && event.promptFeedback.blockReason) {
        blockReason = event.promptFeedback.blockReason;
      }

      const candidate = (event.candidates || [])[0];
      if (!candidate) return;
      if (candidate.finishReason) finishReason = candidate.finishReason;

      // Gemini 3.x thinking models emit reasoning parts — keep only real text.
      const parts = (candidate.content && candidate.content.parts) || [];
      for (const part of parts) {
        if (typeof part.text !== "string" || part.thought === true) continue;
        if (!firstTextAt) firstTextAt = Date.now();
        text += part.text;
      }

      flush(false);
    });
  } catch (err) {
    settle();
    if (err instanceof AppError) throw err;
    throw connectionError(err, Boolean(text), lang);
  }
  settle();

  if (blockReason) {
    throw new AppError(
      t(lang, "requestBlockedTitle"),
      blockReasonMessage(lang, blockReason) ||
        t(lang, "blockedGeneric", { reason: blockReason }),
    );
  }

  text = text.trim();
  if (!text) {
    throw new AppError(
      t(lang, "noSummaryTitle"),
      blockReasonMessage(lang, finishReason) ||
        t(lang, "noSummaryGeneric", {
          suffix: finishReason ? ` (finishReason: ${finishReason})` : "",
        }),
    );
  }

  // So the last streamed render matches the text that gets cached.
  flush(true);
  return text;
}
