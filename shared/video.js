"use strict";

/* ---------------------------------------------------------------------------
 * YouTube URL / title helpers.
 *
 * Loaded as a plain script by the popup, the background worker
 * (importScripts) and the content script — no module syntax, so the
 * declarations below land in each context's global scope.
 * ------------------------------------------------------------------------ */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const isVideoId = (id) => typeof id === "string" && ID_RE.test(id);

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
