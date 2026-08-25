// field-matcher.js
//
// Runs inside the job-application page (as a "content script" — a script the
// extension injects into a normal web page so it can read/modify that page's DOM,
// the tree of HTML elements the browser renders).
//
// Job: for every fillable form field on the page, guess which piece of the
// user's profile it's asking for, using the field's label text, placeholder,
// name/id attributes, and (for radio buttons) the group it belongs to.

// Each entry: profile key -> keywords to look for in a field's label text.
// Order matters a little: more specific keys are listed before generic ones
// that could otherwise steal a match (e.g. "first name" before "name").
const FIELD_DEFINITIONS = [
  { key: "email", keywords: ["email", "e-mail"] },
  { key: "phone", keywords: ["phone", "mobile", "cell", "telephone"] },
  { key: "firstName", keywords: ["first name", "given name", "fname"] },
  { key: "lastName", keywords: ["last name", "surname", "family name", "lname"] },
  { key: "fullName", keywords: ["full name", "your name", "legal name", "first and last name", "first & last name"] },
  { key: "linkedin", keywords: ["linkedin"] },
  { key: "github", keywords: ["github"] },
  { key: "website", keywords: ["portfolio", "personal website", "website", "personal site"] },
  { key: "address", keywords: ["street address", "address line", "address"] },
  { key: "city", keywords: ["city", "town"] },
  { key: "zip", keywords: ["zip", "postal code", "postcode"] },
  { key: "state", keywords: ["state", "province", "region"] },
  { key: "country", keywords: ["country"] },
  { key: "authorizedToWork", keywords: ["authorized to work", "legally authorized", "eligible to work", "work authorization"] },
  { key: "needsSponsorship", keywords: ["sponsorship", "require sponsorship", "visa sponsor"] },
  { key: "gender", keywords: ["gender"] },
  { key: "raceEthnicity", keywords: ["race", "ethnicity"] },
  { key: "veteranStatus", keywords: ["veteran"] },
  { key: "disabilityStatus", keywords: ["disability"] },
  { key: "school", keywords: ["school", "university", "college"] },
  { key: "degree", keywords: ["degree"] },
  { key: "currentCompany", keywords: ["current company", "current employer", "most recent employer"] },
  { key: "currentTitle", keywords: ["current title", "current job title", "most recent title"] },
];

function humanize(text) {
  return (text || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

function textOf(el) {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

// Gathers every plausible source of label text for a standalone field
// (text/email/tel/url inputs, textareas, single selects), tagged with which
// kind of source each piece came from. Order matters a little here too —
// it's the same priority the old flat getFieldLabelText() used, and it also
// doubles as a confidence ranking for the run log (see matchConfidence()
// below): a real <label> or aria-label is a much stronger signal that a
// field means what we think it means than a guessed nearby-div fallback is.
function getLabelSources(el) {
  const sources = [];

  if (el.id) {
    document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach((l) => {
      const text = textOf(l);
      if (text) sources.push({ source: "label", text });
    });
  }
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) {
    const text = textOf(wrappingLabel);
    if (text) sources.push({ source: "label", text });
  }

  if (el.getAttribute("aria-label")) {
    sources.push({ source: "aria-label", text: el.getAttribute("aria-label") });
  }

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    labelledBy.split(/\s+/).forEach((id) => {
      const ref = document.getElementById(id);
      const text = textOf(ref);
      if (text) sources.push({ source: "aria-labelledby", text });
    });
  }

  if (el.placeholder) sources.push({ source: "placeholder", text: el.placeholder });
  if (el.name) sources.push({ source: "name/id", text: humanize(el.name) });
  if (el.id) sources.push({ source: "name/id", text: humanize(el.id) });

  const containerText = getNearbyContainerLabelText(el);
  if (containerText) sources.push({ source: "nearby-text", text: containerText });

  return sources;
}

// Gathers every plausible source of label text for a standalone field
// (text/email/tel/url inputs, textareas, single selects).
function getFieldLabelText(el) {
  return getLabelSources(el).map((s) => s.text).join(" ").toLowerCase();
}

// Confidence for the run log: which *kind* of source first produced the
// match determines how much to trust it. A real label/aria-label naming the
// field is "high" confidence; a placeholder or humanized name/id attribute
// is "medium" (it's the field's own attribute, but not necessarily written
// for humans); the nearby-div-text fallback is "low" — it's a heuristic
// guess about which nearby text is the question, and it's the fallback of
// last resort for exactly that reason.
function matchConfidence(sources, key) {
  if (!key) return "none";
  const def = FIELD_DEFINITIONS.find((d) => d.key === key);
  if (!def) return "none";
  for (const { source, text } of sources) {
    const lower = text.toLowerCase();
    if (def.keywords.some((kw) => lower.includes(kw))) {
      if (source === "label" || source === "aria-label" || source === "aria-labelledby") return "high";
      if (source === "placeholder" || source === "name/id") return "medium";
      return "low"; // nearby-text
    }
  }
  return "medium"; // matched, but not attributable to one source (shouldn't normally happen)
}

// Short human-readable description of a field for the run log, e.g.
// `input[email] #email` or `select "authorizedToWork"`.
function describeField(el) {
  const tag = el.tagName.toLowerCase();
  const kind = el.type ? `[${el.type}]` : "";
  const idOrName = el.id || el.name;
  return idOrName ? `${tag}${kind} ${idOrName}` : `${tag}${kind}`;
}

// Many custom application forms (Lever's custom questions, and plenty of
// others) don't use a real <label> at all — the question text sits in a
// plain sibling <div> next to the field, e.g.
//   <li><div class="application-label">What is your LinkedIn?</div>
//       <div class="application-field"><input ...></div></li>
// This walks a few levels up from the field, and at each level looks only
// at elements immediately *before* our branch in that level (a preceding
// sibling, or something nested inside one) whose class name suggests it's
// a label/question. Deliberately narrow: searching a whole ancestor's
// entire subtree (e.g. via querySelectorAll from a shared container) picks
// up unrelated label text from other, far-away questions on the same page.
function getNearbyContainerLabelText(el) {
  let node = el;
  for (let depth = 0; depth < 4 && node && node !== document.body; depth++) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      const isLabelish = /label|question/i.test(sibling.className || "");
      const candidate = isLabelish ? sibling : sibling.querySelector('[class*="label" i], [class*="question" i]');
      if (candidate) {
        const text = textOf(candidate);
        if (text && text.length > 1 && text.length < 200) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return "";
}

// For a radio/checkbox, the *question* it belongs to (e.g. "Are you
// authorized to work?") usually lives on an ancestor fieldset/legend or a
// nearby heading, not on the input itself. Returns { text, source } — the
// source is used the same way getLabelSources()'s tags are, to rate
// confidence for the run log.
function getGroupLabelSource(el) {
  const fieldset = el.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend) return { text: textOf(legend).toLowerCase(), source: "label" };
  }

  const group = el.closest('[role="radiogroup"], [role="group"]');
  if (group) {
    if (group.getAttribute("aria-label")) {
      return { text: group.getAttribute("aria-label").toLowerCase(), source: "aria-label" };
    }
    const heading = group.querySelector("h1,h2,h3,h4,h5,h6,legend,.label,label");
    if (heading) return { text: textOf(heading).toLowerCase(), source: "label" };
  }

  const containerText = getNearbyContainerLabelText(el);
  if (containerText) return { text: containerText.toLowerCase(), source: "nearby-text" };

  return { text: humanize(el.name).toLowerCase(), source: "name/id" };
}

function getGroupLabelText(el) {
  return getGroupLabelSource(el).text;
}

// The label for one specific radio option (e.g. "Yes" vs "No"), as opposed
// to the group question.
function getOptionLabelText(el) {
  const parts = [];
  if (el.id) {
    document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach((l) => parts.push(textOf(l)));
  }
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) parts.push(textOf(wrappingLabel));
  if (el.value) parts.push(el.value);
  return parts.join(" ").toLowerCase();
}

function bestKeyForText(labelText) {
  let best = null;
  let bestLen = 0;
  for (const def of FIELD_DEFINITIONS) {
    for (const kw of def.keywords) {
      if (labelText.includes(kw) && kw.length > bestLen) {
        best = def.key;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

// Turns a saved profile into a flat lookup of key -> display string,
// so matching logic doesn't need to know about nested education/experience arrays.
function flattenProfile(profile) {
  const latestEdu = (profile.education || [])[0] || {};
  const latestExp = (profile.experience || [])[0] || {};
  return {
    email: profile.email,
    phone: profile.phone,
    firstName: profile.firstName,
    lastName: profile.lastName,
    fullName: [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    linkedin: profile.linkedin,
    github: profile.github,
    website: profile.website,
    address: profile.address,
    city: profile.city,
    zip: profile.zip,
    state: profile.state,
    country: profile.country,
    authorizedToWork: profile.authorizedToWork,
    needsSponsorship: profile.needsSponsorship,
    gender: profile.gender,
    raceEthnicity: profile.raceEthnicity,
    veteranStatus: profile.veteranStatus,
    disabilityStatus: profile.disabilityStatus,
    school: latestEdu.school,
    degree: latestEdu.degree,
    currentCompany: latestExp.company,
    currentTitle: latestExp.title,
  };
}

function isVisible(el) {
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
}

// React (and other frameworks) track an element's value via a property
// setter they've overridden. Setting `el.value = x` directly gets silently
// ignored by React because it doesn't see its own setter being called.
// Calling the *native* setter first, then firing an input event, is the
// standard workaround.
function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA"
    ? window.HTMLTextAreaElement.prototype
    : el.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor.set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillSelect(el, desiredValue) {
  const target = desiredValue.toLowerCase();
  for (const option of el.options) {
    const optText = option.textContent.trim().toLowerCase();
    if (optText === target || optText.includes(target)) {
      setNativeValue(el, option.value);
      return true;
    }
  }
  return false;
}

function fillRadioGroup(radios, desiredValue) {
  const target = desiredValue.toLowerCase();
  for (const radio of radios) {
    const optionText = getOptionLabelText(radio);
    if (optionText === target || optionText.includes(target)) {
      radio.click();
      return true;
    }
  }
  return false;
}

// Scans the whole page and fills every field it can confidently match.
// Returns a summary: how many fields were filled, which ones (by key) it
// recognized but skipped (e.g. file inputs), and a per-field `log` — one
// entry per candidate field the scan looked at, recording what it matched
// to, how confident that match was, whether it actually got filled, and
// why not when it didn't. That log is what the popup's "Field detection
// log" renders — it's the tool for answering "why didn't this field fill".
function fillPage(profile) {
  const values = flattenProfile(profile);
  const filled = [];
  const skippedFileFields = [];
  const log = [];
  const seenRadioGroups = new Set();

  const candidates = document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]), textarea, select'
  );

  candidates.forEach((el) => {
    if (!isVisible(el) || el.disabled) return;

    if (el.type === "radio") {
      if (seenRadioGroups.has(el.name)) return;
      seenRadioGroups.add(el.name);
      const group = getGroupLabelSource(el);
      const key = bestKeyForText(group.text);
      const field = describeField(el);

      if (!key) {
        log.push({ field, matched: null, confidence: "none", filled: false, reason: "no keyword match in the question text" });
        return;
      }
      const confidence = matchConfidence([group], key);
      const value = values[key];
      if (!value) {
        log.push({ field, matched: key, confidence, filled: false, reason: "no value saved in the active profile for this field" });
        return;
      }
      const radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
      const ok = fillRadioGroup(Array.from(radios), value);
      if (ok) filled.push(key);
      log.push({
        field,
        matched: key,
        confidence,
        filled: ok,
        reason: ok ? undefined : `no radio option's label matched profile value "${value}"`,
      });
      return;
    }

    if (el.type === "checkbox") return; // too varied/ambiguous to auto-fill safely

    const sources = getLabelSources(el);
    const labelText = sources.map((s) => s.text).join(" ").toLowerCase();
    const key = bestKeyForText(labelText);
    const field = describeField(el);

    if (!key) {
      log.push({ field, matched: null, confidence: "none", filled: false, reason: "no keyword match in label/aria-label/placeholder/name" });
      return;
    }

    const confidence = matchConfidence(sources, key);
    const value = values[key];
    if (value === undefined || value === null || value === "") {
      log.push({ field, matched: key, confidence, filled: false, reason: "no value saved in the active profile for this field" });
      return;
    }

    if (el.tagName === "SELECT") {
      const ok = fillSelect(el, String(value));
      if (ok) filled.push(key);
      log.push({ field, matched: key, confidence, filled: ok, reason: ok ? undefined : "no <option> text matched the profile value" });
    } else {
      if (el.value) {
        log.push({ field, matched: key, confidence, filled: false, reason: "field already had a value — left as-is" });
        return;
      }
      setNativeValue(el, String(value));
      filled.push(key);
      log.push({ field, matched: key, confidence, filled: true });
    }
  });

  document.querySelectorAll('input[type=file]').forEach((el) => {
    if (!isVisible(el)) return;
    // A short label for the status message only — deliberately skips the
    // nearby-container fallback used for matching, since for a file input
    // that fallback exists to catch questions with no real label, and here
    // it would just add noise to a user-facing message.
    const label = el.id
      ? textOf(document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
      : "";
    const name = label || humanize(el.name || el.id) || "file upload";
    skippedFileFields.push(name);
    log.push({ field: describeField(el), matched: null, confidence: "none", filled: false, reason: "file inputs can't be filled by extensions" });
  });

  return { filled, skippedFileFields, log };
}

// Exposed on window so content.js, the site adapters, and experience-filler.js
// (each loaded as a separate injected script, but sharing the same page
// "world") can call them.
window.__jobAutofill = {
  fillPage,
  flattenProfile,
  setNativeValue,
  getFieldLabelText,
  getLabelSources,
  textOf,
  humanize,
  isVisible,
};
