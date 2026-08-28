// chrome.storage.local is a small key-value database built into the browser,
// scoped to this extension only. Unlike localStorage it works from the
// background service worker too, and survives until you clear extension data.
//
// Multi-profile support: everything below now reads/writes through
// lib/profile-store.js instead of a single `profile` key directly, so the
// same profile data can't drift out of sync with what the popup's switcher
// and background.js (for resume tailoring) see.

import {
  loadProfiles,
  saveProfile,
  createProfile,
  deleteProfile,
  setActiveProfile,
} from "../lib/profile-store.js";

const form = document.getElementById("profile-form");
const educationList = document.getElementById("education-list");
const experienceList = document.getElementById("experience-list");
const educationTemplate = document.getElementById("education-entry-template");
const experienceTemplate = document.getElementById("experience-entry-template");
const saveStatus = document.getElementById("save-status");
const profileSelect = document.getElementById("profile-select");
const profileNameInput = document.getElementById("profile-name");
const newProfileBtn = document.getElementById("new-profile-btn");
const deleteProfileBtn = document.getElementById("delete-profile-btn");

let currentProfileId = null;

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

function clearForm() {
  form.reset();
  educationList.innerHTML = "";
  experienceList.innerHTML = "";
}

// Renders one profile's data into the form. Doesn't touch the API key field
// — that's global, loaded/saved separately from the profile switch.
function renderProfileIntoForm(profile) {
  clearForm();
  profileNameInput.value = profile.name || "";

  for (const [key, value] of Object.entries(profile)) {
    const field = form.elements.namedItem(key);
    if (field && typeof value === "string") field.value = value;
  }

  if (Array.isArray(profile.skills)) {
    form.elements.namedItem("skills").value = profile.skills.join(", ");
  }

  (profile.education || []).forEach((entry) => addEntry(educationList, educationTemplate, entry));
  (profile.experience || []).forEach((entry) => addEntry(experienceList, experienceTemplate, entry));
}

function populateProfileSelect(profiles, activeProfileId) {
  profileSelect.innerHTML = "";
  for (const [id, profile] of Object.entries(profiles)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = profile.name || "(unnamed profile)";
    profileSelect.appendChild(option);
  }
  profileSelect.value = activeProfileId;
  deleteProfileBtn.disabled = Object.keys(profiles).length <= 1;
}

async function loadAndRenderActiveProfile() {
  const { profiles, activeProfileId } = await loadProfiles();
  currentProfileId = activeProfileId;
  populateProfileSelect(profiles, activeProfileId);
  renderProfileIntoForm(profiles[activeProfileId]);
}

async function loadApiKey() {
  const { anthropicApiKey } = await chrome.storage.local.get(["anthropicApiKey"]);
  if (anthropicApiKey) form.elements.namedItem("apiKey").value = anthropicApiKey;
}

function profileFromForm() {
  const formData = new FormData(form);
  return {
    name: profileNameInput.value.trim() || "Untitled profile",
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
}

document.getElementById("add-education").addEventListener("click", () => addEntry(educationList, educationTemplate));
document.getElementById("add-experience").addEventListener("click", () => addEntry(experienceList, experienceTemplate));

profileSelect.addEventListener("change", async () => {
  const { profiles } = await loadProfiles();
  currentProfileId = profileSelect.value;
  await setActiveProfile(currentProfileId);
  renderProfileIntoForm(profiles[currentProfileId]);
});

newProfileBtn.addEventListener("click", async () => {
  const name = prompt("Name for the new profile (e.g. \"Backend roles\"):", "New profile");
  if (name === null) return; // cancelled
  const id = await createProfile(name.trim() || "New profile");
  const { profiles } = await loadProfiles();
  currentProfileId = id;
  populateProfileSelect(profiles, id);
  renderProfileIntoForm(profiles[id]);
  saveStatus.textContent = "New profile created — fill it in and click Save.";
  setTimeout(() => (saveStatus.textContent = ""), 3000);
});

deleteProfileBtn.addEventListener("click", async () => {
  const { profiles } = await loadProfiles();
  const name = profiles[currentProfileId]?.name || "this profile";
  if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
  try {
    const newActiveId = await deleteProfile(currentProfileId);
    currentProfileId = newActiveId;
    const { profiles: remaining } = await loadProfiles();
    populateProfileSelect(remaining, newActiveId);
    renderProfileIntoForm(remaining[newActiveId]);
    saveStatus.textContent = "Deleted.";
    setTimeout(() => (saveStatus.textContent = ""), 2500);
  } catch (error) {
    alert(error.message);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const profile = profileFromForm();
  const apiKey = new FormData(form).get("apiKey")?.trim() || "";

  await saveProfile(currentProfileId, profile);
  await chrome.storage.local.set({ anthropicApiKey: apiKey });

  // Reflect a renamed profile in the switcher immediately.
  const { profiles, activeProfileId } = await loadProfiles();
  populateProfileSelect(profiles, activeProfileId);

  saveStatus.textContent = "Saved.";
  setTimeout(() => (saveStatus.textContent = ""), 2500);
});

loadAndRenderActiveProfile();
loadApiKey();

// --- Tabs (Profile / Application History) -------------------------------
// Kept in this file rather than history.js since history.js only owns the
// history tab's own content, not page-level tab chrome.

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

function activateTab(tabId) {
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  tabPanes.forEach((pane) => pane.classList.toggle("active", pane.id === tabId));
}

tabButtons.forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));

// Lets the popup's "View application history" link jump straight to this
// tab via options.html#history.
if (window.location.hash === "#history") activateTab("tab-history");
