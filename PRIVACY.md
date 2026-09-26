# Privacy Policy — YouTube Quick Summary

*Last updated: August 2026*

YouTube Quick Summary is a Chrome extension that summarizes YouTube videos using Google's Gemini API and the user's own API key. This policy explains what data the extension handles.

## What data is collected

- **Your Gemini API key.** Entered by you, stored locally in your browser (`chrome.storage.local`). It is sent only to Google's Gemini API, as an authentication header on your own requests, and nowhere else.
- **Video URLs you choose to summarize.** Sent to Google's Gemini API so it can analyze and summarize the video. Also stored locally in your browser as your summary history.
- **Generated summaries.** Stored locally in your browser so previously summarized videos load instantly without another API call.

No data is sent to the developer or to any server other than Google's Gemini API (`generativelanguage.googleapis.com`). The extension has no backend, no analytics, and no third-party trackers.

## How data is used

All data collected exists solely to provide the extension's core function: generating and displaying a summary of a YouTube video you choose to summarize, and letting you revisit past summaries without re-querying the API.

## Data sharing

The only party your data is ever sent to is Google, via the Gemini API, and only the minimum needed to generate a summary (your API key, for authentication; the video URL and a summarization prompt, as the request itself). Google's handling of that data is governed by [Google's Gemini API Terms](https://ai.google.dev/gemini-api/terms). We do not sell, rent, or otherwise share your data with any other third party.

## Data retention and deletion

Your API key and summary history remain in your browser's local storage until you delete them. You can clear cached summaries or your API key at any time from the extension's settings, or remove all data by uninstalling the extension.

## Changes to this policy

If how this extension handles data changes, this policy will be updated accordingly.

## Contact

Questions about this policy can be sent via [the GitHub repository](https://github.com/adrian1715/video-summarizer).
