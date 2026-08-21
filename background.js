// background.js
//
// The extension's "service worker" — a background script with no visible
// window, started on demand and shut down when idle. This is the only place
// that talks to the Claude API, so your API key never has to be handed to
// the job-application page's own JavaScript.

import { tailorResume } from "./lib/claude-api.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TAILOR_RESUME") return false;

  (async () => {
    try {
      const { profile, anthropicApiKey } = await chrome.storage.local.get(["profile", "anthropicApiKey"]);
      const tailored = await tailorResume({
        apiKey: anthropicApiKey,
        resumeText: profile?.resumeText,
        jobDescription: message.jobDescription,
      });
      sendResponse({ ok: true, tailored });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true; // tells Chrome to keep the message channel open for the async sendResponse above
});
