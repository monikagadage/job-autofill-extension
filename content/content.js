// content.js
//
// Entry point injected into the job-application tab. Ties together the
// generic field-matcher and any site-specific adapter for the current
// hostname, then exposes two functions the popup calls (via
// chrome.scripting.executeScript) to actually do work on the page.

async function fillCurrentPage(profile) {
  const hostname = window.location.hostname;
  const adapters = window.__jobAutofillSiteAdapters || {};
  const { fillPage, flattenProfile, setNativeValue } = window.__jobAutofill;

  let adapterFilled = [];
  const adapter = Object.values(adapters).find((a) => hostname.includes(a.hostnameMatch));
  if (adapter) {
    adapterFilled = adapter.fill(flattenProfile(profile), setNativeValue);
  }

  const generic = fillPage(profile);

  // Custom button-triggered dropdowns (Country, State on Workday) and
  // repeatable "Work Experience"/"Education" sections both need clicking
  // and waiting for the page to react, so they run as separate async steps
  // after the flat single-pass fill above.
  let comboboxFilled = 0;
  if (window.__jobAutofillCombobox) {
    comboboxFilled = await window.__jobAutofillCombobox.fillPageComboboxes(profile);
  }

  let experienceResult = { entriesFilled: 0, entriesAdded: 0 };
  let educationResult = { entriesFilled: 0, entriesAdded: 0 };
  if (window.__jobAutofillRepeater) {
    experienceResult = await window.__jobAutofillRepeater.fillWorkExperience(profile);
    educationResult = await window.__jobAutofillRepeater.fillEducation(profile);
  }

  return {
    filledCount: adapterFilled.length + generic.filled.length + comboboxFilled,
    filledKeys: [...adapterFilled, ...generic.filled],
    skippedFileFields: generic.skippedFileFields,
    experienceEntriesFilled: experienceResult.entriesFilled,
    experienceEntriesAdded: experienceResult.entriesAdded,
    educationEntriesFilled: educationResult.entriesFilled,
    educationEntriesAdded: educationResult.entriesAdded,
  };
}

// Best-effort extraction of the job description text on the current page,
// used as context for the "tailor resume" feature. Tries common containers
// first (most ATS pages wrap the posting in one of these), falls back to
// the whole page's visible text.
function extractJobDescription() {
  const selectors = [
    '[class*="job-description" i]',
    '[class*="jobdescription" i]',
    '[data-testid*="description" i]',
    "#content",
    "main",
    "article",
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el && el.innerText ? el.innerText.trim() : "";
    if (text.length > 200) return text.slice(0, 12000);
  }
  return document.body.innerText.trim().slice(0, 12000);
}

window.__jobAutofillContent = { fillCurrentPage, extractJobDescription };
