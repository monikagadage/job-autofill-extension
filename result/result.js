const resumeOutput = document.getElementById("resume-output");
const coverLetterOutput = document.getElementById("cover-letter-output");
const coverLetterNote = document.getElementById("cover-letter-note");
const copyBtn = document.getElementById("copy-btn");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

let activeTab = "tab-resume";

chrome.storage.local.get(["lastTailoredResume", "lastCoverLetter", "lastCoverLetterError"], (data) => {
  resumeOutput.value = data.lastTailoredResume || "No tailored resume found — go back and click \"Tailor resume for this job\" again.";

  if (data.lastCoverLetter) {
    coverLetterOutput.value = data.lastCoverLetter;
    coverLetterNote.hidden = true;
  } else {
    coverLetterOutput.value = "";
    coverLetterOutput.hidden = true;
    coverLetterNote.hidden = false;
    coverLetterNote.textContent = data.lastCoverLetterError
      ? `Cover letter generation failed: ${data.lastCoverLetterError}`
      : "No cover letter found — go back and click \"Tailor resume for this job\" again.";
  }
});

function activateTab(tabId) {
  activeTab = tabId;
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  tabPanes.forEach((pane) => pane.classList.toggle("active", pane.id === tabId));
  copyBtn.textContent = tabId === "tab-cover-letter" ? "Copy cover letter" : "Copy resume";
}

tabButtons.forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));
activateTab("tab-resume");

copyBtn.addEventListener("click", async () => {
  const output = activeTab === "tab-cover-letter" ? coverLetterOutput : resumeOutput;
  if (!output.value) return;
  await navigator.clipboard.writeText(output.value);
  const original = activeTab === "tab-cover-letter" ? "Copy cover letter" : "Copy resume";
  copyBtn.textContent = "Copied!";
  copyBtn.classList.add("copied");
  setTimeout(() => {
    copyBtn.textContent = original;
    copyBtn.classList.remove("copied");
  }, 1800);
});
