"use strict";

/* ---------------------------------------------------------------------------
 * Background service worker.
 *
 * Exists only to serve the in-page "Summarize video" menu item. A content
 * script can't call the Gemini endpoint itself — in MV3 its fetches are
 * subject to the page's CORS rules — and keeping the call here means the API
 * key is never loaded into a youtube.com world.
 *
 * The content script connects a port rather than sending a one-shot message,
 * because the summary now arrives in pieces: { type: "chunk", text } as it
 * streams, then exactly one { type: "done", result } carrying the same result
 * shape the one-shot reply used to.
 *
 * The popup still calls summarizeVideo() directly; its request is cancelled if
 * the popup closes, which remains an accepted tradeoff there.
 * ------------------------------------------------------------------------ */

importScripts("shared/video.js", "shared/i18n.js", "shared/api.js");

// Must match PORT_NAME in content.js — the two can't share a constant, since
// shared/api.js is deliberately never loaded into the page's world.
const PORT_NAME = "ytqs-summarize";

/* videoId -> in-flight run, so a double click doesn't buy two summaries.
 * `text` is what has streamed so far, kept so a listener that joins late can be
 * caught up in a single message rather than starting from blank. */
const inFlight = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  let live = true;
  port.onDisconnect.addListener(() => {
    live = false;
    void chrome.runtime.lastError;
  });

  const send = (payload) => {
    if (!live) return;
    try {
      port.postMessage(payload);
    } catch {
      live = false; // tab navigated or closed mid-stream
    }
  };

  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "summarize") return;

    // Resolved once per request, same as apiKey — everything this request can
    // fail with, in-page, comes back in this language.
    resolveLanguageCode()
      .catch(() => "en")
      .then((lang) =>
        handleSummarize(msg, send, lang).catch((err) =>
          fail(
            t(lang, "unexpectedError"),
            err && err.message ? err.message : String(err),
          ),
        ),
      )
      .then((result) => send({ type: "done", result }));
  });
});

const fail = (title, detail) => ({ ok: false, error: { title, detail } });

async function handleSummarize({ videoId, title, force }, send, lang) {
  if (!isVideoId(videoId)) {
    return fail(
      t(lang, "notAYoutubeVideo"),
      t(lang, "notAYoutubeVideoDetail"),
    );
  }

  if (!force) {
    const cached = await readCached(videoId);
    if (cached && cached.summary) {
      return { ok: true, cached: true, entry: cached };
    }
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return fail(t(lang, "noApiKeyTitle"), t(lang, "noApiKeyDetailInPage"));
  }

  let run = inFlight.get(videoId);
  if (run) {
    // Joining a run already under way — catch up on what it has so far.
    if (run.text) send({ type: "chunk", text: run.text });
  } else {
    run = startRun(videoId, title, apiKey, lang);
  }

  const listener = (text) => send({ type: "chunk", text });
  run.listeners.add(listener);
  try {
    return await run.promise;
  } finally {
    run.listeners.delete(listener);
  }
}

function startRun(videoId, title, apiKey, lang) {
  const run = { text: "", listeners: new Set(), promise: null };

  run.promise = runSummarize(videoId, title, apiKey, lang, run).finally(() =>
    inFlight.delete(videoId),
  );
  inFlight.set(videoId, run);
  return run;
}

async function runSummarize(videoId, title, apiKey, lang, run) {
  const stopKeepAlive = keepAlive();
  try {
    const summary = await summarizeVideo(videoId, apiKey, lang, (text) => {
      run.text = text;
      for (const listener of run.listeners) listener(text);
    });

    const entry = {
      summary,
      timestamp: Date.now(),
      title: title || "",
      model: MODEL,
    };
    await writeCached(videoId, entry);
    return { ok: true, cached: false, entry };
  } catch (err) {
    if (err instanceof AppError) return fail(err.title, err.detail);
    return fail(
      t(lang, "unexpectedError"),
      err && err.message ? err.message : String(err),
    );
  } finally {
    stopKeepAlive();
  }
}

// A worker goes idle after ~30s without an extension API call, and video
// understanding routinely takes longer than that. Poking an API on a timer is
// the documented way to hold it open for the length of the request.
//
// A connected port would also hold it, but that isn't enough on its own: a run
// deliberately outlives its port, so closing the modal partway through still
// finishes the summary and caches it.
function keepAlive() {
  const timer = setInterval(
    () => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError),
    20000,
  );
  return () => clearInterval(timer);
}
