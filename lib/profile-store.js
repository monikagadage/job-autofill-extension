// lib/profile-store.js
//
// Shared storage helpers for multi-profile support. A "profile" bundles
// everything specific to one flavor of job search (e.g. "Backend roles" vs
// "Frontend roles") — personal info, education, experience, skills, resume
// text. The Claude API key is intentionally NOT part of a profile: it's one
// credential for the whole extension, shared across every profile.
//
// Storage shape in chrome.storage.local:
//   profiles: { [profileId]: ProfileRecord }   — ProfileRecord has a `name`
//                                                 field plus everything
//                                                 options.js used to store
//                                                 directly under `profile`.
//   activeProfileId: string                    — which profile "Fill this
//                                                 page" / "Tailor resume"
//                                                 use right now.
//   anthropicApiKey: string                    — unchanged, still global.
//
// Older installs only have a single `profile` object with no id.
// loadProfiles() migrates that into the shape above automatically, once,
// the first time it's called after an update — nothing is lost, and every
// caller (options page, popup, background service worker) goes through
// this module so the migration only needs to be written once.

const LEGACY_PROFILE_KEY = "profile";
const PROFILES_KEY = "profiles";
const ACTIVE_ID_KEY = "activeProfileId";

function makeProfileId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyProfile(name) {
  return {
    name,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    country: "",
    linkedin: "",
    github: "",
    website: "",
    authorizedToWork: "",
    needsSponsorship: "",
    gender: "",
    raceEthnicity: "",
    veteranStatus: "",
    disabilityStatus: "",
    skills: [],
    resumeText: "",
    education: [],
    experience: [],
  };
}

// Reads { profiles, activeProfileId }, migrating a legacy single `profile`
// (or starting fresh with one empty "Default" profile on a brand-new
// install) the first time it's called. Safe to call repeatedly — once
// `profiles` exists in storage this is just a plain read.
export async function loadProfiles() {
  const data = await chrome.storage.local.get([PROFILES_KEY, ACTIVE_ID_KEY, LEGACY_PROFILE_KEY]);

  if (data[PROFILES_KEY] && Object.keys(data[PROFILES_KEY]).length) {
    const profiles = data[PROFILES_KEY];
    const activeProfileId = profiles[data[ACTIVE_ID_KEY]] ? data[ACTIVE_ID_KEY] : Object.keys(profiles)[0];
    return { profiles, activeProfileId };
  }

  const id = makeProfileId();
  const migrated = data[LEGACY_PROFILE_KEY]
    ? { name: "Default", ...data[LEGACY_PROFILE_KEY] }
    : emptyProfile("Default");
  const profiles = { [id]: migrated };
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles, [ACTIVE_ID_KEY]: id });
  return { profiles, activeProfileId: id };
}

export async function getActiveProfile() {
  const { profiles, activeProfileId } = await loadProfiles();
  return { id: activeProfileId, profile: profiles[activeProfileId] };
}

export async function saveProfile(id, profileData) {
  const { profiles } = await loadProfiles();
  profiles[id] = profileData;
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
}

export async function createProfile(name) {
  const { profiles } = await loadProfiles();
  const id = makeProfileId();
  profiles[id] = emptyProfile(name || "New profile");
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles, [ACTIVE_ID_KEY]: id });
  return id;
}

export async function deleteProfile(id) {
  const { profiles, activeProfileId } = await loadProfiles();
  const ids = Object.keys(profiles);
  if (ids.length <= 1) throw new Error("Can't delete your only profile.");

  delete profiles[id];
  const patch = { [PROFILES_KEY]: profiles };
  if (activeProfileId === id) patch[ACTIVE_ID_KEY] = Object.keys(profiles)[0];
  await chrome.storage.local.set(patch);
  return patch[ACTIVE_ID_KEY] || activeProfileId;
}

export async function setActiveProfile(id) {
  await chrome.storage.local.set({ [ACTIVE_ID_KEY]: id });
}
