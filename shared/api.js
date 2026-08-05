"use strict";

/* ---------------------------------------------------------------------------
 * Config, storage and the Gemini call.
 *
 * Loaded as a plain script by the popup and by the background worker
 * (importScripts). Deliberately NOT loaded into the content script: the page's
 * world has no business holding the API key or the endpoint code.
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

async function deleteCached(videoId) {
  const cache = await getCache();
  if (!(videoId in cache)) return;
  delete cache[videoId];
  await chrome.storage.local.set({ summaries: cache });
}

/* ---------------------------------------------------------------------------
 * Gemini API
 * ------------------------------------------------------------------------ */

class AppError extends Error {
  constructor(title, detail) {
    super(title);
    this.title = title;
    this.detail = detail;
  }
}

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
