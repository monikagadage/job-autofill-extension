const CONTENT_FILES = [
  "content/field-matcher.js",
  "content/site-adapters/greenhouse.js",
  "content/site-adapters/lever.js",
  "content/combobox-filler.js",
  "content/repeater-filler.js",
  "content/content.js",
];

const statusEl = document.getElementById("status");
const fillBtn = document.getElementById("fill-btn");
const tailorBtn = document.getElementById("tailor-btn");

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
  const { profile } = await chrome.storage.local.get(["profile"]);
  if (!profile || (!profile.firstName && !profile.email)) {
    throw new Error("No profile saved yet. Click \"Edit profile / API key\" below and fill it in first.");
  }
  return profile;
}

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
