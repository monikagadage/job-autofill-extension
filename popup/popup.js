import { loadProfiles, getActiveProfile, setActiveProfile } from "../lib/profile-store.js";
import { logApplication, findRecentApplicationsForCompany } from "../lib/history-store.js";

const CONTENT_FILES = [
  "content/field-matcher.js",
  "content/site-adapters/greenhouse.js",
  "content/site-adapters/lever.js",
  "content/site-adapters/linkedin.js",
  "content/combobox-filler.js",
  "content/repeater-filler.js",
  "content/content.js",
  "content/job-info.js",
];

const statusEl = document.getElementById("status");
const fillBtn = document.getElementById("fill-btn");
const tailorBtn = document.getElementById("tailor-btn");
const profileSelect = document.getElementById("profile-select");
const runLogBody = document.getElementById("run-log-body");
const copyLogBtn = document.getElementById("copy-log-btn");
const dupWarningEl = document.getElementById("dup-warning");

let lastFieldLog = null;

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab found.");
  if (!/^https?:\/\//.test(tab.url || "")) {
    throw new Error("This only works on a regular http(s) page — open the job application first.");
  }
  return tab;
}

async function injectContentScripts(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
}

async function getProfile() {
  const { profile } = await getActiveProfile();
  if (!profile || (!profile.firstName && !profile.email)) {
    throw new Error("The active profile is empty. Click \"Edit profile / API key\" below and fill it in first.");
  }
  return profile;
}

// --- Profile switcher -------------------------------------------------

async function populateProfileSelect() {
  const { profiles, activeProfileId } = await loadProfiles();
  profileSelect.innerHTML = "";
  for (const [id, profile] of Object.entries(profiles)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = profile.name || "(unnamed profile)";
    profileSelect.appendChild(option);
  }
  profileSelect.value = activeProfileId;
}

profileSelect.addEventListener("change", async () => {
  await setActiveProfile(profileSelect.value);
  setStatus(`Switched to "${profileSelect.selectedOptions[0].textContent}".`);
});

// --- Field detection log ------------------------------------------------

const CONFIDENCE_LABEL = { high: "high confidence", medium: "medium confidence", low: "low confidence", none: "" };

function renderRunLog(fieldLog) {
  lastFieldLog = fieldLog;
  copyLogBtn.disabled = !fieldLog || !fieldLog.length;

  if (!fieldLog || !fieldLog.length) {
    runLogBody.innerHTML = '<p class="hint">No fields detected on this page.</p>';
    return;
  }

  runLogBody.innerHTML = "";
  fieldLog.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "run-log-entry";

    const filledBadge = `<span class="run-log-badge ${entry.filled ? "filled" : "skipped"}">${entry.filled ? "filled" : "skipped"}</span>`;
    const confidenceBadge = entry.confidence && entry.confidence !== "none"
      ? `<span class="run-log-badge confidence-${entry.confidence}">${CONFIDENCE_LABEL[entry.confidence]}</span>`
      : "";

    const matchedText = entry.matched ? `→ ${entry.matched}` : "→ no match";
    const reasonText = entry.reason ? `<div class="run-log-meta">${entry.reason}</div>` : "";

    row.innerHTML = `
      <div class="run-log-field">${escapeHtml(entry.field)} ${filledBadge}${confidenceBadge}</div>
      <div class="run-log-meta">${escapeHtml(matchedText)}</div>
      ${reasonText}
    `;
    runLogBody.appendChild(row);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function logToPlainText(fieldLog) {
  return fieldLog
    .map((e) => {
      const bits = [e.field, e.filled ? "[filled]" : "[skipped]"];
      if (e.matched) bits.push(`-> ${e.matched}`);
      if (e.confidence && e.confidence !== "none") bits.push(`(${e.confidence})`);
      if (e.reason) bits.push(`— ${e.reason}`);
      return bits.join(" ");
    })
    .join("\n");
}

copyLogBtn.addEventListener("click", async () => {
  if (!lastFieldLog || !lastFieldLog.length) return;
  await navigator.clipboard.writeText(logToPlainText(lastFieldLog));
  copyLogBtn.textContent = "Copied!";
  setTimeout(() => (copyLogBtn.textContent = "Copy log"), 1500);
});

async function restoreLastRunLog() {
  const { lastRunLog } = await chrome.storage.local.get(["lastRunLog"]);
  if (lastRunLog && lastRunLog.entries) renderRunLog(lastRunLog.entries);
}

async function saveRunLog(entries, tab) {
  await chrome.storage.local.set({
    lastRunLog: { entries, url: tab.url, timestamp: Date.now() },
  });
}

// --- Application history --------------------------------------------------
// Logs one entry after a successful "Fill this page" or "Tailor resume"
// run, so the extension has a record of what you actually worked on (see
// lib/history-store.js). Best-effort: content/job-info.js's detection is
// unverified against live postings (see DESIGN.md), and a failure here
// should never take away the fill/tailor result the user already got, so
// errors are swallowed after a console warning.
async function logHistoryEntry(tab) {
  try {
    const [{ result: jobInfo }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__jobAutofillJobInfo.extractJobInfo(),
    });
    if (jobInfo) await logApplication(jobInfo);
  } catch (error) {
    console.warn("Job Autofill: couldn't log application history.", error);
  }
}

// --- Duplicate-application warning ---------------------------------------
// Runs as soon as the popup opens (before the user clicks "Fill this
// page"), so the warning is visible ahead of the action it's warning
// about, not just logged alongside it. Non-blocking by design — it never
// disables the Fill/Tailor buttons, just surfaces what history already
// knows. Silently does nothing on a tab it can't inspect (chrome:// pages,
// no active tab, etc.) or when job-info.js can't detect a company name.
async function checkDuplicateWarning() {
  try {
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/job-info.js"] });
    const [{ result: jobInfo }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__jobAutofillJobInfo.extractJobInfo(),
    });
    if (!jobInfo || !jobInfo.company) {
      dupWarningEl.hidden = true;
      return;
    }
    const matches = await findRecentApplicationsForCompany(jobInfo.company);
    if (!matches.length) {
      dupWarningEl.hidden = true;
      return;
    }
    const mostRecent = matches[0];
    const date = new Date(mostRecent.timestamp).toLocaleDateString();
    dupWarningEl.textContent =
      `⚠ You already applied to ${jobInfo.company} on ${date} ` +
      `(status: ${mostRecent.status}). Filling this page will log another entry.`;
    dupWarningEl.hidden = false;
  } catch (error) {
    dupWarningEl.hidden = true; // non-blocking — a detection failure just means no warning shows
  }
}

// --- Fill / tailor actions ----------------------------------------------

fillBtn.addEventListener("click", async () => {
  fillBtn.disabled = true;
  setStatus("Filling…");
  try {
    const [tab, profile] = await Promise.all([getActiveTab(), getProfile()]);
    await injectContentScripts(tab.id);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (p) => window.__jobAutofillContent.fillCurrentPage(p),
      args: [profile],
    });

    let message = `Filled ${result.filledCount} field${result.filledCount === 1 ? "" : "s"}.`;
    if (result.experienceEntriesFilled) {
      message += ` Filled ${result.experienceEntriesFilled} work experience ${result.experienceEntriesFilled === 1 ? "entry" : "entries"}`;
      message += result.experienceEntriesAdded ? ` (added ${result.experienceEntriesAdded}).` : ".";
    }
    if (result.educationEntriesFilled) {
      message += ` Filled ${result.educationEntriesFilled} education ${result.educationEntriesFilled === 1 ? "entry" : "entries"}`;
      message += result.educationEntriesAdded ? ` (added ${result.educationEntriesAdded}).` : ".";
    }
    if (result.skippedFileFields.length) {
      message += `\nCouldn't attach files (browsers block that) — do these manually: ${result.skippedFileFields.join(", ")}.`;
    }
    setStatus(message, result.filledCount ? "success" : "");

    renderRunLog(result.fieldLog);
    await saveRunLog(result.fieldLog, tab);
    await logHistoryEntry(tab);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    fillBtn.disabled = false;
  }
});

tailorBtn.addEventListener("click", async () => {
  tailorBtn.disabled = true;
  setStatus("Reading job description…");
  try {
    const tab = await getActiveTab();
    await injectContentScripts(tab.id);

    const [{ result: jobDescription }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__jobAutofillContent.extractJobDescription(),
    });

    setStatus("Asking Claude to tailor your resume…");
    const response = await chrome.runtime.sendMessage({ type: "TAILOR_RESUME", jobDescription });

    if (!response.ok) throw new Error(response.error);

    await chrome.storage.local.set({ lastTailoredResume: response.tailored, lastTailoredAt: Date.now() });
    await chrome.tabs.create({ url: chrome.runtime.getURL("result/result.html") });
    setStatus("Done — opened in a new tab.", "success");
    await logHistoryEntry(tab);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    tailorBtn.disabled = false;
  }
});

document.getElementById("open-options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-history").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html#history") });
});

populateProfileSelect();
restoreLastRunLog();
checkDuplicateWarning();
