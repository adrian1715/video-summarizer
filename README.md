# YT Quick Summary

A Chrome extension that summarizes any public YouTube video with Google's Gemini
API — a TL;DR plus 5–7 key points, usually in well under a minute of reading.

It uses **your own** Gemini API key (BYOK). There is no server, no account, no
sign-up, and nothing is sent anywhere except Google's API.

You can summarize a video two ways:

- **From the toolbar** — open a YouTube video, click the extension icon, hit
  **Summarize**.
- **Without opening the video** — click the **⋮** (three-dot) menu on any video
  thumbnail and choose **Summarize**. The summary opens in a panel over the page.

Every summary is cached, so opening the same video again is instant and free.

---

## Table of contents

- [YT Quick Summary](#yt-quick-summary)
  - [Table of contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Install](#install)
  - [Get your Gemini API key](#get-your-gemini-api-key)
  - [Add the key to the extension](#add-the-key-to-the-extension)
  - [How to use it](#how-to-use-it)
    - [Option A — the toolbar popup (summarize what you're watching)](#option-a--the-toolbar-popup-summarize-what-youre-watching)
    - [Option B — the three-dot menu (summarize without leaving the page)](#option-b--the-three-dot-menu-summarize-without-leaving-the-page)
    - [What a summary looks like](#what-a-summary-looks-like)
  - [History and cached summaries](#history-and-cached-summaries)
  - [What it costs](#what-it-costs)
  - [Privacy](#privacy)
  - [Troubleshooting](#troubleshooting)
  - [Which videos work](#which-videos-work)
  - [Updating](#updating)
  - [Uninstalling](#uninstalling)
  - [For developers](#for-developers)
  - [License](#license)

---

## Requirements

- **Google Chrome** (or any Chromium browser: Edge, Brave, Vivaldi, Opera) —
  version 88 or newer, i.e. anything that supports Manifest V3.
- **A free Google account**, to create a Gemini API key.
- An internet connection. That's it — there's nothing to compile or install
  besides the extension folder itself.

---

## Install

The extension isn't on the Chrome Web Store; you load it from this folder.

1. **Download the code.**

   Either clone it:

   ```bash
   git clone https://github.com/adrian1715/video-summarizer.git
   ```

   …or click **Code → Download ZIP** on GitHub and unzip it somewhere permanent.

   > ⚠️ Don't delete or move the folder afterwards. Chrome loads the extension
   > from that exact path every time it starts.

2. **Open the extensions page.** Type `chrome://extensions` in the address bar
   and press Enter.

3. **Turn on Developer mode** — the toggle in the top-right corner.

4. **Click "Load unpacked"** and select the folder you just downloaded (the one
   containing `manifest.json`).

5. **Pin it.** Click the puzzle-piece icon in the toolbar, then the pin next to
   **YT Quick Summary** so the icon stays visible.

Chrome will warn that the extension can "read and change your data on
youtube.com". That permission is what lets it add the **Summarize** row to
YouTube's three-dot menus — see [Privacy](#privacy).

---

## Get your Gemini API key

1. Go to **<https://aistudio.google.com/apikey>**.
2. Sign in with your Google account.
3. Click **Create API key**, then copy it. It looks like `AIzaSy…`.

The free tier is enough for normal personal use. Keep the key private — anyone
who has it can spend against your quota.

---

## Add the key to the extension

1. Click the **YT Quick Summary** icon in the toolbar.
2. Click the **⚙️ gear** in the top-right of the popup.
   (If you haven't set a key yet, the popup opens straight to this screen.)
3. Paste your key into the **Gemini API key** field.
4. Click **Save key**. You should see "Key saved."

Use **Show** to check what you pasted, and **Clear** to remove the key from the
browser at any time.

---

## How to use it

### Option A — the toolbar popup (summarize what you're watching)

1. Open a YouTube video — `youtube.com/watch…`, a Short, or a `youtu.be` link.
2. Click the **YT Quick Summary** icon.
3. Click **Summarize**.

The popup shows a spinner while Gemini watches the video, then renders the
summary. Gemini processes the _whole_ video, so a long one can take a while —
the request gives up after 3 minutes.

> **Keep the popup open while it works.** Chrome closes the popup the moment you
> click elsewhere, and that cancels the request in progress. Use Option B if you
> want to keep browsing while it runs.

If the video was already summarized before, the summary appears **immediately**
and no API call is made. A **Re-summarize** link under it forces a fresh run.

### Option B — the three-dot menu (summarize without leaving the page)

1. Hover any video thumbnail — on the home page, in search results, in the
   sidebar next to a video you're watching, or the **⋮** on the watch page
   itself.
2. Click the **⋮** menu.
3. Choose **Summarize** (it's the first row).

A panel opens over the page with the summary. Because the work happens in the
background, you can close the panel and keep browsing; the result is still saved
and will be there next time. Press **Esc** or click outside the panel to close
it.

> **First time only:** after installing or reloading the extension, refresh any
> YouTube tabs that were already open. Chrome doesn't inject the menu row into
> tabs that existed before the extension loaded — that's the usual reason the
> row "isn't there".

### What a summary looks like

```
TL;DR: A 2–3 sentence overview of what the video covers and what it concludes.

- 5 to 8 bullets, each one specific, information-dense sentence
- Concrete claims, numbers and names rather than vague description
- …
```

---

## History and cached summaries

Every summary is stored in your browser, so nothing gets re-summarized (or
re-billed) by accident.

- **View history** — from the main popup screen, or from Settings. Shows every
  saved summary, newest first, with the video title and when it was made.
- **Search** — the box at the top of the history filters by title, summary text,
  or video ID.
- **Open one** — click any row to read the full summary. From there you can
  **Open on YouTube**, or **Delete** just that entry (click **Delete** twice —
  the first click arms it, so a stray click can't wipe something).
- **Clear everything** — Settings → **Clear cached summaries**.

The cache holds the **100 most recent** summaries; past that, the oldest are
dropped automatically.

---

## What it costs

You're billed by Google against your own API key, under whatever tier that key
is on. On the free tier:

- YouTube video input is capped at **8 hours of video per day**.
- Exceeding it produces a "Rate limit or quota exceeded" message. Wait, or check
  your quota in Google AI Studio.

Because results are cached, re-opening a video you've already summarized costs
nothing.

---

## Privacy

- **Your API key** is stored in `chrome.storage.local` — this browser profile
  only. It's sent in a request header to `generativelanguage.googleapis.com` and
  nowhere else. It is never put in a URL, and never leaves your machine except
  in that call to Google.
- **Summaries** are stored locally too, and never uploaded anywhere.
- **No backend, no analytics, no telemetry, no accounts.** The extension makes
  exactly one kind of outbound request: the Gemini call.
- **No third-party requests at all** — not even video thumbnails, which is why
  the history list is text-only by design.
- **The YouTube permission** exists solely to add the **Summarize** row to the
  three-dot menu and to draw the summary panel. The page's own scripts never see
  your API key: the key lives in the extension's background worker, not in the
  YouTube page.
- **What Google sees:** the video's URL and the summarization prompt. Google's
  handling of that is governed by their
  [Gemini API terms](https://ai.google.dev/gemini-api/terms).

---

## Troubleshooting

| What you see                                                | What's wrong                                                                      | Fix                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **"No API key set"**                                        | No key saved yet                                                                  | Toolbar icon → gear → paste key → **Save key**                                                                          |
| **"Invalid API key"**                                       | Key is wrong or was revoked                                                       | Create a fresh key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and save it again                |
| **"API key rejected"** / **"API not enabled for this key"** | Key isn't a Gemini API key, or the API isn't enabled on that Google Cloud project | Make a key from **Google AI Studio**, not from a random Cloud console project                                           |
| **"Gemini couldn't read this video"**                       | The video isn't publicly accessible                                               | See [Which videos work](#which-videos-work)                                                                             |
| **"Rate limit or quota exceeded"**                          | Past the free tier's 8 hours of video per day                                     | Wait, or check quota in AI Studio                                                                                       |
| **"Timed out"**                                             | No response in 3 minutes                                                          | Very long videos can exceed this — retry, or try a shorter one                                                          |
| **"Model not found"**                                       | Google renamed or retired the model                                               | Update the extension; if you're comfortable editing code, change `MODEL` in `shared/api.js`                             |
| **"No YouTube video here"**                                 | The active tab isn't a video page                                                 | Open a `watch`, `shorts` or `youtu.be` URL and click the icon again                                                     |
| **The ⋮ menu has no "Summarize" row**                       | The YouTube tab predates the extension load                                       | **Refresh the YouTube tab.** If it's still missing, reload the extension at `chrome://extensions`, then refresh the tab |
| **"Network error"**                                         | No connection, or something blocking the request                                  | Check your connection, VPN, or corporate proxy                                                                          |

Everything the extension shows also includes Google's own error message
underneath, which is usually the fastest clue.

---

## Which videos work

**Public videos only.** These do **not** work, and fail on Google's side:

- Private videos
- Unlisted videos
- Age-restricted videos
- Region-blocked videos
- Members-only videos
- Live streams still in progress

Captions are **not** required — Gemini watches the video itself, so videos with
no subtitles work fine.

---

## Updating

If you cloned the repo:

```bash
git pull
```

Then go to `chrome://extensions` and click the **reload** icon (↻) on the
YT Quick Summary card. Finally, **refresh any open YouTube tabs**.

Your saved key and cached summaries survive updates.

---

## Uninstalling

Right-click the toolbar icon → **Remove from Chrome**. That deletes the stored
key and all cached summaries along with it. Deleting your API key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) is a good idea
too if you don't plan to use it elsewhere.

---

## For developers

Plain HTML/CSS/JS, no build step, no dependencies, no bundler. Edit a file and
reload the extension.

```
manifest.json     Manifest V3 declaration
popup.html/css/js The toolbar popup: current video, history, settings
content.js        Injects the "Summarize" row + the on-page panel (youtube.com)
content.css       Fallback styling for the injected row
background.js     Service worker; the only caller of Gemini for the in-page path
shared/video.js   YouTube URL/ID parsing
shared/render.js  Minimal markdown → DOM renderer
shared/api.js     Model config, storage, and the Gemini call
icons/            Toolbar icons
```

**Checks available without any tooling:**

```bash
for f in popup.js content.js background.js shared/*.js; do node --check "$f"; done
node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"
```

**Reloading during development:** popup changes take effect when you reopen the
popup. Changes to `content.js` or `background.js` need an extension reload at
`chrome://extensions` **and** a refresh of the YouTube tab.

**Debugging the in-page menu row:** the content script logs `content script
ready` once per page load — if that line is missing, the tab needs a refresh.
Append `#ytqs-debug` to a YouTube URL for verbose logging of click detection and
menu injection. Service worker logs are behind the **"service worker"** link on
the extension's card, not in the page console.

**API surface:** the Gemini call is isolated in `summarizeVideo()`
(`shared/api.js`), using `POST v1beta/models/{model}:generateContent` with the
YouTube watch URL passed as `file_data.file_uri`. Model is `gemini-3.6-flash`;
check <https://ai.google.dev/gemini-api/docs/models> before changing it.

There are no automated tests — end-to-end verification needs a real API key and
a real video, so it's manual by nature.

---

## License

Personal-use project. No warranty; you're responsible for your own API usage
and costs.
