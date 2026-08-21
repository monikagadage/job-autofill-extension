const output = document.getElementById("resume-output");
const copyBtn = document.getElementById("copy-btn");

chrome.storage.local.get(["lastTailoredResume"], (data) => {
  output.value = data.lastTailoredResume || "No tailored resume found — go back and click \"Tailor resume for this job\" again.";
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.value);
  copyBtn.textContent = "Copied!";
  copyBtn.classList.add("copied");
  setTimeout(() => {
    copyBtn.textContent = "Copy to clipboard";
    copyBtn.classList.remove("copied");
  }, 1800);
});
