// chrome.storage.local is a small key-value database built into the browser,
// scoped to this extension only. Unlike localStorage it works from the
// background service worker too, and survives until you clear extension data.

const form = document.getElementById("profile-form");
const educationList = document.getElementById("education-list");
const experienceList = document.getElementById("experience-list");
const educationTemplate = document.getElementById("education-entry-template");
const experienceTemplate = document.getElementById("experience-entry-template");
const saveStatus = document.getElementById("save-status");

function addEntry(listEl, template, values = {}) {
  const node = template.content.cloneNode(true);
  const entry = node.querySelector(".entry");
  entry.querySelectorAll("[data-field]").forEach((el) => {
    const field = el.dataset.field;
    if (field === "bullets" && Array.isArray(values.bullets)) {
      el.value = values.bullets.join("\n");
    } else if (values[field] !== undefined) {
      el.value = values[field];
    }
  });
  entry.querySelector(".remove-btn").addEventListener("click", () => entry.remove());
  listEl.appendChild(entry);
}

function collectEntries(listEl) {
  return Array.from(listEl.querySelectorAll(".entry")).map((entry) => {
    const record = {};
    entry.querySelectorAll("[data-field]").forEach((el) => {
      const field = el.dataset.field;
      record[field] = field === "bullets"
        ? el.value.split("\n").map((line) => line.trim()).filter(Boolean)
        : el.value.trim();
    });
    return record;
  });
}

document.getElementById("add-education").addEventListener("click", () => addEntry(educationList, educationTemplate));
document.getElementById("add-experience").addEventListener("click", () => addEntry(experienceList, experienceTemplate));

function loadProfile() {
  chrome.storage.local.get(["profile", "anthropicApiKey"], (data) => {
    const profile = data.profile || {};

    for (const [key, value] of Object.entries(profile)) {
      const field = form.elements.namedItem(key);
      if (field && typeof value === "string") field.value = value;
    }

    if (Array.isArray(profile.skills)) {
      form.elements.namedItem("skills").value = profile.skills.join(", ");
    }

    (profile.education || []).forEach((entry) => addEntry(educationList, educationTemplate, entry));
    (profile.experience || []).forEach((entry) => addEntry(experienceList, experienceTemplate, entry));

    if (data.anthropicApiKey) {
      form.elements.namedItem("apiKey").value = data.anthropicApiKey;
    }
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const profile = {
    firstName: formData.get("firstName")?.trim() || "",
    lastName: formData.get("lastName")?.trim() || "",
    email: formData.get("email")?.trim() || "",
    phone: formData.get("phone")?.trim() || "",
    address: formData.get("address")?.trim() || "",
    city: formData.get("city")?.trim() || "",
    state: formData.get("state")?.trim() || "",
    zip: formData.get("zip")?.trim() || "",
    country: formData.get("country")?.trim() || "",
    linkedin: formData.get("linkedin")?.trim() || "",
    github: formData.get("github")?.trim() || "",
    website: formData.get("website")?.trim() || "",
    authorizedToWork: formData.get("authorizedToWork") || "",
    needsSponsorship: formData.get("needsSponsorship") || "",
    gender: formData.get("gender") || "",
    raceEthnicity: formData.get("raceEthnicity")?.trim() || "",
    veteranStatus: formData.get("veteranStatus") || "",
    disabilityStatus: formData.get("disabilityStatus") || "",
    skills: (formData.get("skills") || "").split(",").map((s) => s.trim()).filter(Boolean),
    resumeText: formData.get("resumeText") || "",
    education: collectEntries(educationList),
    experience: collectEntries(experienceList),
  };

  const apiKey = formData.get("apiKey")?.trim() || "";

  chrome.storage.local.set({ profile, anthropicApiKey: apiKey }, () => {
    saveStatus.textContent = "Saved.";
    setTimeout(() => (saveStatus.textContent = ""), 2500);
  });
});

loadProfile();
