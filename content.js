"use strict";

/* ---------------------------------------------------------------------------
 * In-page entry point.
 *
 * Adds a "Summarize video" row to the three-dot menu YouTube shows on every
 * video thumbnail, and renders the result in a modal over the page — the user
 * never leaves where they were.
 *
 * The summary itself comes from background.js: a content script can't call the
 * Gemini endpoint directly (MV3 subjects its fetches to the page's CORS rules)
 * and the API key has no business being in a youtube.com world.
 *
 * Everything here is defensive about YouTube's DOM. It's a Polymer app whose
 * element names change without notice, so nothing is assumed to exist: if a
 * selector stops matching, the menu item simply doesn't appear and the popup
 * keeps working.
 * ------------------------------------------------------------------------ */

const ITEM_CLASS = "ytqs-menu-item";

// How long to wait for the dropdown after a click before giving up.
const MENU_WAIT_MS = 1500;
const MENU_POLL_MS = 50;

// Renderers that wrap one video together with its three-dot menu.
const VIDEO_CONTAINERS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "ytd-playlist-panel-video-renderer",
  "ytd-reel-item-renderer",
  "yt-lockup-view-model",
  "ytd-watch-metadata",
  "ytd-reel-video-renderer",
].join(",");

// Containers that stand for the page's own video: there's no thumbnail link
// inside them, so the address bar is the only source of the ID.
const SELF_CONTAINERS = ["ytd-watch-metadata", "ytd-reel-video-renderer"].join(
  ",",
);

const LINK_SELECTOR = [
  "a#thumbnail[href]",
  "a#video-title-link[href]",
  'a[href*="/watch?v="]',
  'a[href*="/shorts/"]',
].join(",");

const TITLE_SELECTOR = [
  "#video-title",
  "#video-title-link",
  "h3 a",
  "a.yt-lockup-metadata-view-model__title",
].join(",");

// The list the row is appended to. YouTube has more than one menu component in
// flight, so this covers the classic Polymer dropdown and the newer view-model
// sheets. The view-model entries are scoped to popup containers — an
// unscoped yt-list-view-model would match ordinary page content.
const MENU_LIST_SELECTORS = [
  "ytd-menu-popup-renderer #items",
  "ytd-menu-popup-renderer tp-yt-paper-listbox",
  "ytd-popup-container yt-list-view-model",
  "tp-yt-iron-dropdown yt-list-view-model",
].join(",");

// Where YouTube renders its popups. A press landing inside one of these is an
// interaction with a menu that is already open, not the opening of a new one —
// see noteClick().
const POPUP_HOSTS = [
  "tp-yt-iron-dropdown",
  "ytd-popup-container",
  "tp-yt-paper-dialog",
  "yt-sheet-view-model",
].join(",");

const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------------------------------------------------------------------------
 * UI language
 *
 * Resolved once at load and cached in a plain variable, so the synchronous
 * DOM-building code below (injectMenuItem, buildModal) doesn't need to become
 * async just to read a language code — by the time a user opens a menu or the
 * modal, this has long since settled. Kept fresh if the language is changed
 * in the popup's settings while this tab stays open. shared/i18n.js has no
 * secrets, unlike shared/api.js, so it's safe to load into this page's world
 * (see manifest.json and the "Deliberate omissions" note in CLAUDE.md).
 * ------------------------------------------------------------------------ */

let uiLang = "en";
resolveLanguageCode().then((lang) => (uiLang = lang));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.language) {
    resolveLanguageCode().then((lang) => (uiLang = lang));
  }
});

const tr = (key, vars) => t(uiLang, key, vars);

/* Diagnostics. Append #ytqs-debug to the YouTube URL to get a running account
 * of what the menu detection sees — YouTube's DOM is the thing most likely to
 * have moved, and this is the only way to find out where. */
const debugging = () => location.hash.includes("ytqs-debug");
const debug = (...args) => {
  if (debugging()) console.log("[YT Quick Summary]", ...args);
};

/* ---------------------------------------------------------------------------
 * DOM helpers
 * ------------------------------------------------------------------------ */

function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function icon(path, size) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");

  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("fill", "currentColor");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

const LIST_ICON = "M3 6h18v2H3V6Zm0 5h12v2H3v-2Zm0 5h18v2H3v-2Z";
const CLOSE_ICON =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z";

/* ---------------------------------------------------------------------------
 * Working out which video a click belongs to
 * ------------------------------------------------------------------------ */

function videoFromClick(event) {
  const path =
    typeof event.composedPath === "function"
      ? event.composedPath()
      : [event.target];

  for (const node of path) {
    if (!(node instanceof Element)) continue;
    const container = node.closest(VIDEO_CONTAINERS);
    if (container) return videoFromContainer(container);
  }
  return null;
}

function videoFromContainer(container) {
  // For the page's own video the address bar is authoritative — a /watch link
  // in the description or a chapter would otherwise win.
  if (container.matches(SELF_CONTAINERS)) {
    const own = extractVideoId(location.href);
    return own ? { videoId: own, title: cleanTitle(document.title) } : null;
  }

  const link = container.querySelector(LINK_SELECTOR);
  const videoId = link ? extractVideoId(link.href) : null;
  if (!videoId) return null;

  const titleNode = container.querySelector(TITLE_SELECTOR);
  const title = titleNode
    ? titleNode.getAttribute("title") || titleNode.textContent
    : "";
  return { videoId, title: cleanTitle(title) };
}

/* ---------------------------------------------------------------------------
 * The menu item
 *
 * YouTube reuses a single dropdown for every video on the page, so the item is
 * removed on each click and re-added, carrying the ID of the video whose menu
 * is opening. That also means a menu opened from somewhere else — the account
 * menu, a sort control — never keeps a stale item around.
 * ------------------------------------------------------------------------ */

let pending = null;
let pollTimer = null;

function removeMenuItem() {
  restoreClamps();
  document.querySelectorAll("." + ITEM_CLASS).forEach((node) => node.remove());
}

function openMenuList() {
  for (const list of document.querySelectorAll(MENU_LIST_SELECTORS)) {
    if (list.getClientRects().length) return list;
  }
  return null;
}

function waitForMenu() {
  clearInterval(pollTimer);
  const startedAt = Date.now();

  pollTimer = setInterval(() => {
    if (!pending) {
      clearInterval(pollTimer);
      return;
    }
    if (Date.now() - startedAt > MENU_WAIT_MS) {
      clearInterval(pollTimer);
      // Expected whenever the click wasn't a menu click at all (a thumbnail,
      // say), so this is diagnostics-only.
      debug("no menu appeared within", MENU_WAIT_MS + "ms.", {
        video: pending.videoId,
        matched: [...document.querySelectorAll(MENU_LIST_SELECTORS)].map(
          describeNode,
        ),
        popupContainer: [
          ...document.querySelectorAll("ytd-popup-container > *"),
        ].map(describeNode),
      });
      return;
    }

    const list = openMenuList();
    if (!list) return;

    clearInterval(pollTimer);
    injectMenuItem(list, pending);
  }, MENU_POLL_MS);
}

const describeNode = (node) =>
  node.tagName.toLowerCase() +
  (node.id ? "#" + node.id : "") +
  (node.getClientRects().length ? " [visible]" : " [hidden]");

function injectMenuItem(list, video) {
  const item = h(
    "div",
    // role="option": the row sits inside YouTube's own listbox.
    { class: ITEM_CLASS, role: "option", tabindex: "0" },
    h("span", { class: "ytqs-menu-icon" }, icon(LIST_ICON, 24)),
    h("span", { class: "ytqs-menu-label", text: tr("summarize") }),
  );

  item.dataset.videoId = video.videoId;
  item.dataset.videoTitle = video.title || "";

  item.addEventListener("click", activateItem);
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateItem(event);
  });

  matchNativeStyle(item, list);

  // First, not last: if the menu is too tall for the viewport to un-clamp
  // (below), the row is still the one thing that needs no scrolling.
  list.prepend(item);

  // The open animation transforms the dropdown, which would throw off the
  // measurement — so size it once now and again once it has settled.
  requestAnimationFrame(() => unclampMenu(list));
  setTimeout(() => unclampMenu(list), 250);

  debug("row added to", describeNode(list), "for", video.videoId);
}

/* ---------------------------------------------------------------------------
 * Looking native
 *
 * YouTube's menu colours come from custom properties that aren't reliably
 * resolvable from injected CSS — `--yt-spec-text-primary` silently falls back,
 * which is how the row ended up with black text on a dark menu. Reading the
 * used values off a real row instead is immune to token renames, and needs no
 * knowledge of which theme is active. content.css only holds the fallbacks.
 * ------------------------------------------------------------------------ */

const SAMPLE_ROW = [
  "ytd-menu-service-item-renderer",
  "ytd-menu-navigation-item-renderer",
  "yt-list-item-view-model",
].join(",");

// The element actually holding a row's text: a leaf with something in it.
function leafTextNode(root) {
  for (const node of root.querySelectorAll("*")) {
    if (!node.children.length && node.textContent.trim()) return node;
  }
  return null;
}

function matchNativeStyle(item, list) {
  // Hover is a state, so it can't be read off a sibling — derive it from the
  // theme the same way the modal does.
  const dark = document.documentElement.hasAttribute("dark");
  item.style.setProperty(
    "--ytqs-hover",
    dark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
  );
  item.style.color = dark ? "#f1f1f1" : "#0f0f0f";

  const sample = list.querySelector(SAMPLE_ROW);
  const label = sample && leafTextNode(sample);
  if (!label) {
    debug("no sample row to copy styling from — using theme defaults");
    return;
  }

  const text = getComputedStyle(label);
  item.style.color = text.color;
  item.style.fontFamily = text.fontFamily;
  item.style.fontSize = text.fontSize;
  item.style.fontWeight = text.fontWeight;

  // Computed values are used values in px, so unlike getBoundingClientRect()
  // they don't pick up the dropdown's open animation.
  const height = parseFloat(getComputedStyle(sample).height);
  if (height >= 20 && height <= 80) item.style.minHeight = height + "px";

  for (const node of [sample, ...sample.querySelectorAll("*")]) {
    const box = getComputedStyle(node);
    if (parseFloat(box.paddingLeft) > 0) {
      item.style.paddingLeft = box.paddingLeft;
      item.style.paddingRight = box.paddingRight;
      break;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Making room
 *
 * The dropdown is sized to fit its contents when it opens, so one extra row
 * tips it into scrolling. Growing the clamp back gets every option visible at
 * once, the way the menu behaves without us — but only as far as the viewport
 * allows, so a long menu near the bottom of the screen stays scrollable rather
 * than running off the page.
 * ------------------------------------------------------------------------ */

let clamps = [];

function restoreClamps() {
  for (const { node, prior } of clamps) node.style.maxHeight = prior;
  clamps = [];
}

function unclampMenu(list) {
  if (!list.isConnected || !list.querySelector("." + ITEM_CLASS)) return;

  restoreClamps();

  const dropdown = list.closest("tp-yt-iron-dropdown") || list.parentElement;
  if (!dropdown) return;

  const room = window.innerHeight - dropdown.getBoundingClientRect().top - 8;
  if (!(room > 0)) return;

  for (let node = list; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) {
      clamps.push({ node, prior: node.style.maxHeight });
      node.style.maxHeight = Math.min(node.scrollHeight + 2, room) + "px";
      debug("un-clamped", describeNode(node), "to", node.style.maxHeight);
    }
    if (node === dropdown) break;
  }
}

function activateItem(event) {
  event.preventDefault();
  event.stopPropagation();

  const item = event.currentTarget;
  const { videoId, videoTitle } = item.dataset;

  closeYouTubeMenu(item);
  removeMenuItem();
  openModal(videoId, videoTitle);
}

// The dropdown is a Polymer element whose close() lives in the page's world,
// out of reach from here — so ask for it the way a user would.
function closeYouTubeMenu(node) {
  const escape = () => {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    // Polymer's key handling still reads the legacy properties.
    Object.defineProperty(event, "keyCode", { get: () => 27 });
    Object.defineProperty(event, "which", { get: () => 27 });
    return event;
  };

  const dropdown = node.closest("tp-yt-iron-dropdown");
  if (dropdown) dropdown.dispatchEvent(escape());
  document.dispatchEvent(escape());
  document.dispatchEvent(
    new CustomEvent("yt-close-popups", { bubbles: true, composed: true }),
  );
}

function insidePopup(event) {
  const path =
    typeof event.composedPath === "function"
      ? event.composedPath()
      : [event.target];

  for (const node of path) {
    if (node instanceof Element && node.closest(POPUP_HOSTS)) return true;
  }
  return false;
}

function noteClick(event) {
  // Our own row handles itself; tearing it down here would race its click.
  const target = event.target;
  if (target instanceof Element && target.closest("." + ITEM_CLASS)) return;

  /* Never tear the row down mid-press on one of YouTube's own rows. Removing
   * it (and putting the menu's max-height back) lifts everything below it by a
   * row, so the row the user pressed on is somewhere else by the time they let
   * go: the browser then dispatches the click on the list rather than the row,
   * and YouTube's handler for that item never runs — which is what stopped
   * "Add to queue", "Save to Watch later" and "Save to playlist" from working.
   * Waiting for the click event costs nothing: the target is settled by then,
   * so the same teardown below is harmless, and it still lands before any new
   * menu can open. */
  if (event.type === "pointerdown" && insidePopup(event)) return;

  removeMenuItem();
  pending = videoFromClick(event);
  debug(event.type, "→", pending || "no video container in the path");
  if (pending) waitForMenu();
}

// Both events, on window, in capture: pointerdown gets us in ahead of anything
// on the page that might stop the click from propagating, and click covers
// keyboard activation of the menu button.
window.addEventListener("pointerdown", noteClick, true);
window.addEventListener("click", noteClick, true);

/* ---------------------------------------------------------------------------
 * The modal
 *
 * Lives in a shadow root so YouTube's stylesheet can't reach in and ours can't
 * leak out. Colours mirror popup.css; light/dark follows YouTube's own theme
 * (it sets `dark` on <html>) rather than the OS setting, so the modal always
 * matches the page behind it.
 * ------------------------------------------------------------------------ */

const MODAL_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: block;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

  --bg: #ffffff;
  --fg: #111418;
  --muted: #5f6672;
  --line: #e3e6ea;
  --accent: #cc0000;
  --panel: #f7f8fa;
  --err-bg: #fdeced;
  --err-fg: #a01722;
  --err-line: #f3c2c7;
}

:host([data-theme="dark"]) {
  --bg: #16181c;
  --fg: #e8eaed;
  --muted: #9aa2ad;
  --line: #2c3038;
  --accent: #ff3b30;
  --panel: #1e2126;
  --err-bg: #2a1719;
  --err-fg: #ff9aa2;
  --err-line: #4a2429;
}

:host([hidden]) { display: none; }

* { box-sizing: border-box; }
.hidden { display: none !important; }

.backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.6);
}

.dialog {
  display: flex;
  flex-direction: column;
  width: min(670px, 100%);
  max-height: min(78vh, 720px);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--fg);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
  font-size: 13px;
  line-height: 1.5;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--line);
}

.dot {
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.head-text { flex: 1; min-width: 0; }

.kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.title {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.close {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.close:hover { background: var(--panel); color: var(--fg); }
.close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.body { padding: 12px; overflow-y: auto; }

.loading { display: flex; align-items: center; gap: 10px; padding: 6px 2px; }

.loading-title { font-weight: 600; font-size: 12px; }
.loading-sub { font-size: 11px; color: var(--muted); }

.spinner {
  flex: none;
  width: 17px;
  height: 17px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }

.error {
  padding: 10px;
  border: 1px solid var(--err-line);
  border-radius: 7px;
  background: var(--err-bg);
  color: var(--err-fg);
  font-size: 12px;
}

.error strong { display: block; margin-bottom: 3px; }

.error .detail {
  margin-top: 6px;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 10.5px;
  opacity: 0.85;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--muted);
}

.link-btn {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.link-btn:disabled { opacity: 0.5; cursor: default; }

.summary .tldr {
  padding: 10px;
  margin-bottom: 10px;
  border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0;
  background: var(--panel);
}

.summary .tldr-label {
  display: block;
  margin-bottom: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--accent);
}

.summary h3 {
  margin: 12px 0 5px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.summary ul { margin: 0; padding-left: 17px; }
.summary li { margin-bottom: 6px; }
.summary p { margin: 0 0 8px; }

.summary code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--panel);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 11.5px;
}
`;

let modal = null;

// Each open gets a token; a response that arrives after the modal moved on to
// another video (or was closed) is dropped rather than rendered over it.
let openToken = 0;

function buildModal() {
  const host = document.createElement("div");
  host.hidden = true;
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = MODAL_CSS;

  const titleNode = h("div", { class: "title", id: "ytqs-title" });
  const close = h(
    "button",
    { class: "close", type: "button", "aria-label": tr("closeModal") },
    icon(CLOSE_ICON, 18),
  );

  const loading = h(
    "div",
    { class: "loading" },
    h("div", { class: "spinner" }),
    h(
      "div",
      {},
      h("div", { class: "loading-title", text: tr("watchingVideo") }),
      h("div", {
        class: "loading-sub",
        text: tr("watchingVideoSub"),
      }),
    ),
  );

  const error = h("div", { class: "error hidden", role: "alert" });
  const summary = h("article", { class: "summary hidden" });
  const meta = h("span", {});
  const again = h("button", {
    class: "link-btn hidden",
    type: "button",
    text: tr("resummarize"),
  });

  const dialog = h(
    "div",
    {
      class: "dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ytqs-title",
    },
    h(
      "div",
      { class: "head" },
      h("span", { class: "dot" }),
      h(
        "div",
        { class: "head-text" },
        h("div", { class: "kicker", text: "YT Quick Summary" }),
        titleNode,
      ),
      close,
    ),
    h("div", { class: "body" }, loading, error, summary),
    h("div", { class: "foot" }, meta, again),
  );

  const backdrop = h("div", { class: "backdrop" }, dialog);
  root.append(style, backdrop);
  document.documentElement.append(host);

  close.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });
  again.addEventListener("click", () => {
    if (modal.videoId) load(modal.videoId, modal.videoTitle, true);
  });

  return {
    host,
    root,
    dialog,
    titleNode,
    close,
    loading,
    error,
    summary,
    meta,
    again,
    videoId: null,
    videoTitle: "",
    returnFocus: null,
    priorOverflow: "",
  };
}

function ensureModal() {
  if (!modal || !modal.host.isConnected) modal = buildModal();
  return modal;
}

const show = (node, visible) => node.classList.toggle("hidden", !visible);

function showError(title, detail) {
  modal.error.replaceChildren(
    h("strong", { text: title }),
    detail ? h("div", { class: "detail", text: detail }) : null,
  );
  show(modal.error, true);
}

function openModal(videoId, title) {
  ensureModal();
  modal.videoId = videoId;
  modal.videoTitle = title || tr("youtubeVideoFallback");
  modal.returnFocus = document.activeElement;

  modal.titleNode.textContent = modal.videoTitle;
  modal.host.dataset.theme = document.documentElement.hasAttribute("dark")
    ? "dark"
    : "light";
  modal.host.hidden = false;

  // Keep the page from scrolling behind the dialog.
  modal.priorOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";

  modal.close.focus();
  load(videoId, modal.videoTitle, false);
}

function closeModal() {
  if (!modal || modal.host.hidden) return;

  openToken += 1; // orphan any in-flight response
  modal.host.hidden = true;
  document.documentElement.style.overflow = modal.priorOverflow || "";

  if (
    modal.returnFocus &&
    modal.returnFocus.isConnected &&
    typeof modal.returnFocus.focus === "function"
  ) {
    modal.returnFocus.focus();
  }
}

async function load(videoId, title, force) {
  const token = ++openToken;

  modal.videoId = videoId;
  show(modal.loading, true);
  show(modal.error, false);
  show(modal.summary, false);
  show(modal.again, false);
  modal.meta.textContent = "";
  modal.again.disabled = true;

  /* Swap the spinner for text the moment the first characters land, then
   * re-render in place as more arrives. The token check matters per chunk, not
   * just at the end: chunks for a video the modal has moved on from must not
   * paint over the current one. */
  let streaming = false;
  const onChunk = (text) => {
    if (token !== openToken || modal.host.hidden) return;

    if (!streaming) {
      streaming = true;
      show(modal.loading, false);
      show(modal.summary, true);
    }
    renderSummaryInto(modal.summary, text);
  };

  const res = await requestSummary(videoId, title, force, onChunk);
  if (token !== openToken || modal.host.hidden) return;

  show(modal.loading, false);
  modal.again.disabled = false;

  if (!res.ok) {
    showError(res.error.title, res.error.detail);
    show(modal.again, true);
    modal.again.textContent = tr("tryAgain");
    return;
  }

  renderSummaryInto(modal.summary, res.entry.summary);
  show(modal.summary, true);
  modal.meta.textContent = res.cached
    ? tr("cachedRelative", { time: relativeTime(res.entry.timestamp, uiLang) })
    : tr("summarizedJustNow");
  modal.again.textContent = tr("resummarize");
  show(modal.again, true);
}

// Escape closes the modal, and no keystroke reaches YouTube's global shortcuts
// (space, k, f…) while it's open.
window.addEventListener(
  "keydown",
  (event) => {
    if (!modal || modal.host.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
      return;
    }

    // Keep Tab inside the dialog — there are only ever two stops.
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();

      const stops = [modal.close, modal.again].filter(
        (node) => !node.classList.contains("hidden") && !node.disabled,
      );
      const at = stops.indexOf(modal.root.activeElement);
      const next = event.shiftKey ? at - 1 : at + 1;
      stops[((next % stops.length) + stops.length) % stops.length].focus();
      return;
    }

    if (event.target === modal.host) event.stopPropagation();
  },
  true,
);

/* ---------------------------------------------------------------------------
 * Talking to the background worker
 * ------------------------------------------------------------------------ */

// Must match PORT_NAME in background.js. The two can't share a constant:
// shared/api.js, where such things live, is deliberately never loaded here.
const PORT_NAME = "ytqs-summarize";

/* Opens a port to the worker and resolves with the final result. `onChunk` is
 * called with the full text so far as it streams — the worker sends
 * { type: "chunk" } repeatedly, then exactly one { type: "done" }.
 *
 * Any way the port can die early — worker replaced, tab suspended, extension
 * reloaded — lands on the same "refresh the page" result rather than hanging. */
function requestSummary(videoId, title, force, onChunk) {
  return new Promise((resolve) => {
    const disconnected = {
      ok: false,
      error: {
        title: tr("extensionUnavailable"),
        detail: tr("extensionUnavailableDetail"),
      },
    };

    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    let port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch {
      finish(disconnected);
      return;
    }

    port.onMessage.addListener((msg) => {
      if (!msg) return;

      if (msg.type === "chunk") {
        if (!settled) onChunk(msg.text);
        return;
      }

      if (msg.type === "done") {
        finish(msg.result || disconnected);
        try {
          port.disconnect();
        } catch {
          /* already gone */
        }
      }
    });

    // Fires if the worker goes away before sending "done"; a no-op afterwards.
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      finish(disconnected);
    });

    try {
      port.postMessage({ type: "summarize", videoId, title, force });
    } catch {
      finish(disconnected);
    }
  });
}

// One line, once per page load: content scripts don't enter tabs that were
// already open when the extension was (re)loaded, and this is the quickest way
// to tell that apart from a selector that stopped matching.
console.log(
  "[YT Quick Summary] content script ready — append #ytqs-debug to the URL for menu diagnostics",
);
