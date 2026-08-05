"use strict";

/* ---------------------------------------------------------------------------
 * Background service worker.
 *
 * Exists only to serve the in-page "Summarize video" menu item. A content
 * script can't call the Gemini endpoint itself — in MV3 its fetches are
 * subject to the page's CORS rules — and keeping the call here means the API
 * key is never loaded into a youtube.com world.
 *
 * The popup still calls summarizeVideo() directly; its request is cancelled if
 * the popup closes, which remains an accepted tradeoff there.
 * ------------------------------------------------------------------------ */

importScripts("shared/video.js", "shared/api.js");

// videoId -> in-flight promise, so a double click doesn't buy two summaries.
const inFlight = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "summarize") return undefined;

  handleSummarize(msg)
    .catch((err) => fail("Unexpected error", err && err.message ? err.message : String(err)))
    .then(sendResponse);

  return true; // response is async
});

const fail = (title, detail) => ({ ok: false, error: { title, detail } });

async function handleSummarize({ videoId, title, force }) {
  if (!isVideoId(videoId)) {
    return fail("Not a YouTube video", "Couldn't work out which video that menu belongs to.");
  }

  if (!force) {
    const cached = await readCached(videoId);
    if (cached && cached.summary) return { ok: true, cached: true, entry: cached };
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return fail(
      "No API key set",
      "Click the YT Quick Summary toolbar icon, open settings (gear icon) and add your Gemini API key."
    );
  }

  if (!inFlight.has(videoId)) {
    inFlight.set(videoId, runSummarize(videoId, title, apiKey).finally(() => inFlight.delete(videoId)));
  }
  return inFlight.get(videoId);
}

async function runSummarize(videoId, title, apiKey) {
  const stopKeepAlive = keepAlive();
  try {
    const summary = await summarizeVideo(videoId, apiKey);
    const entry = { summary, timestamp: Date.now(), title: title || "", model: MODEL };
    await writeCached(videoId, entry);
    return { ok: true, cached: false, entry };
  } catch (err) {
    if (err instanceof AppError) return fail(err.title, err.detail);
    return fail("Unexpected error", err && err.message ? err.message : String(err));
  } finally {
    stopKeepAlive();
  }
}

// A worker goes idle after ~30s without an extension API call, and video
// understanding routinely takes longer than that. Poking an API on a timer is
// the documented way to hold it open for the length of the request.
function keepAlive() {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError), 20000);
  return () => clearInterval(timer);
}
