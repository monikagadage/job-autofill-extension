// lib/history-store.js
//
// Local application-history store: one entry per successful "Fill this
// page" or "Tailor resume" run, so the extension has a record of what you
// actually worked on. Before this, the extension had no memory at all of
// what you'd applied to. Same chrome.storage.local pattern as
// lib/profile-store.js — every reader/writer goes through this module so
// the popup and options page can't drift out of sync.
//
// Storage shape in chrome.storage.local:
//   applicationHistory: { [entryId]: HistoryEntry }
//
// HistoryEntry = {
//   id, company, jobTitle, url, atsPlatform, timestamp,
//   status: "applied" | "interviewing" | "rejected" | "offer",
//   statusUpdatedAt,
// }

const HISTORY_KEY = "applicationHistory";
export const APPLICATION_STATUSES = ["applied", "interviewing", "rejected", "offer"];
const DEFAULT_DUPLICATE_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function makeEntryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadHistory() {
  const data = await chrome.storage.local.get([HISTORY_KEY]);
  return data[HISTORY_KEY] || {};
}

// Logs one entry. Called from popup.js right after a fill/tailor run
// succeeds — the caller supplies whatever content/job-info.js's
// extractJobInfo() could detect on the page; missing fields fall back to
// clear placeholders rather than blank cells in the history view.
export async function logApplication({ company, jobTitle, url, atsPlatform } = {}) {
  const history = await loadHistory();
  const id = makeEntryId();
  const now = Date.now();
  const entry = {
    id,
    company: (company || "").trim() || "Unknown company",
    jobTitle: (jobTitle || "").trim() || "Unknown title",
    url: url || "",
    atsPlatform: atsPlatform || "Other",
    timestamp: now,
    status: "applied",
    statusUpdatedAt: now,
  };
  history[id] = entry;
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return entry;
}

export async function updateApplicationStatus(id, status) {
  if (!APPLICATION_STATUSES.includes(status)) {
    throw new Error(`Unknown status "${status}".`);
  }
  const history = await loadHistory();
  if (!history[id]) throw new Error("No such history entry.");
  history[id] = { ...history[id], status, statusUpdatedAt: Date.now() };
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history[id];
}

export async function deleteApplication(id) {
  const history = await loadHistory();
  delete history[id];
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

// Powers the duplicate-application warning in the popup: is there already
// a recent entry for this company? Deliberately a strict, case-insensitive,
// trimmed exact match rather than fuzzy matching — a near-match on "Acme"
// vs "Acme Corp" missing a real duplicate is a better failure mode for a
// non-blocking warning than false-flagging an unrelated company that
// happens to share a word. "Recent" defaults to 90 days so reapplying to
// the same company much later doesn't trigger a stale warning.
export async function findRecentApplicationsForCompany(company, windowDays = DEFAULT_DUPLICATE_WINDOW_DAYS) {
  const target = (company || "").trim().toLowerCase();
  if (!target) return [];
  const history = await loadHistory();
  const cutoff = Date.now() - windowDays * DAY_MS;
  return Object.values(history)
    .filter((entry) => entry.company.trim().toLowerCase() === target && entry.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp);
}
