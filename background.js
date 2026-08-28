// background.js
//
// The extension's "service worker" — a background script with no visible
// window, started on demand and shut down when idle. This is the only place
// that talks to the Claude API, so your API key never has to be handed to
// the job-application page's own JavaScript.

import { tailorResume, generateCoverLetter } from "./lib/claude-api.js";
import { getActiveProfile } from "./lib/profile-store.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TAILOR_RESUME") return false;

  (async () => {
    try {
      const { anthropicApiKey } = await chrome.storage.local.get(["anthropicApiKey"]);
      const { profile } = await getActiveProfile();
      const tailored = await tailorResume({
        apiKey: anthropicApiKey,
        resumeText: profile?.resumeText,
        jobDescription: message.jobDescription,
      });

      // Second Claude call, same job description + resume context. Kept
      // independent of the first: if it fails (rate limit, network blip),
      // the tailored resume the user already got still comes back
      // successfully — coverLetterError just means that tab in the result
      // page shows the failure instead of text.
      let coverLetter = null;
      let coverLetterError = null;
      try {
        coverLetter = await generateCoverLetter({
          apiKey: anthropicApiKey,
          resumeText: profile?.resumeText,
          jobDescription: message.jobDescription,
          applicantName: [profile?.firstName, profile?.lastName].filter(Boolean).join(" "),
        });
      } catch (error) {
        coverLetterError = error.message;
      }

      sendResponse({ ok: true, tailored, coverLetter, coverLetterError });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true; // tells Chrome to keep the message channel open for the async sendResponse above
});
