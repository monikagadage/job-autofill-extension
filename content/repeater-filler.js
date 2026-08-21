// repeater-filler.js
//
// Handles "repeatable entry" sections — Work Experience and Education on
// Workday, and likely similar sections on other sites built the same way.
// Each starts empty with an "Add"/"Add Another" button that reveals one
// entry's worth of fields every time it's clicked.
//
// This is fundamentally different from field-matcher.js's single pass over
// the page: it has to click buttons and wait for new fields to render
// before it can fill them, has to fill several entries in sequence (one
// per job/degree in the saved profile), and — for Education specifically —
// some of those fields are the custom combobox/typeahead widgets that
// combobox-filler.js handles, which are themselves async.

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Turns free text like "Jun 2023", "06/2023", or "Present" into
// { month, year } (month as 1-12) or { current: true }.
function parseMonthYear(text) {
  if (!text) return null;
  if (/present|current/i.test(text)) return { current: true };

  let match = text.match(/([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (match) {
    const idx = MONTH_NAMES.findIndex((name) => name.startsWith(match[1].toLowerCase().slice(0, 3)));
    return { month: idx >= 0 ? idx + 1 : null, year: match[2] };
  }

  match = text.match(/(\d{1,2})[/-](\d{4})/);
  if (match) return { month: parseInt(match[1], 10), year: match[2] };

  match = text.match(/(\d{4})/);
  if (match) return { month: null, year: match[1] };

  return null;
}

// One config per repeatable section: what its heading looks like (bounded
// by the next section's heading, so an "Add" button from one section
// doesn't get grabbed for another), and how to recognize one entry's
// fields (a label pair that's unique to that section).
const SECTION_CONFIGS = {
  workExperience: {
    profileListKey: "experience",
    heading: /^work experience$/i,
    nextHeading: /^education$/i,
    anchorLabel: /\bjob title\b/,
    pairLabel: /\bcompany\b/,
  },
  education: {
    profileListKey: "education",
    heading: /^education$/i,
    nextHeading: /^languages$/i,
    anchorLabel: /\bschool\b|\buniversity\b/,
    pairLabel: /\bdegree\b/,
  },
};

// Finds the "Add"/"Add Another" button that belongs to a section whose
// heading matches headingRegex — bounded so it doesn't grab a button
// belonging to a different section that happens to share the same button
// text. Uses DOM position (compareDocumentPosition) rather than assuming a
// specific nesting depth, since that varies by site.
function findSectionAddButton(headingRegex, nextHeadingRegex) {
  const textNodes = Array.from(document.querySelectorAll("*")).filter(
    (el) => el.children.length === 0 && el.textContent && el.textContent.trim()
  );
  const heading = textNodes.find((el) => headingRegex.test(el.textContent.trim()));
  if (!heading) return null;

  const nextHeading = nextHeadingRegex
    ? textNodes.find((el) => nextHeadingRegex.test(el.textContent.trim()))
    : null;

  const candidates = Array.from(document.querySelectorAll("button")).filter((b) =>
    /^add( another)?$/i.test(b.textContent.trim())
  );

  const afterHeading = candidates.filter(
    (b) => heading.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
  );
  const bounded = nextHeading
    ? afterHeading.filter((b) => nextHeading.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING)
    : afterHeading;

  // As entries are added the button moves to the end of the growing list,
  // so the last matching button is always the "current" add button.
  return bounded[bounded.length - 1] || null;
}

// Finds each existing entry's fields by pairing the section's two anchor
// fields (e.g. Job Title + Company, or School + Degree), then walking up
// to their smallest shared ancestor — that ancestor is treated as the
// entry's scope. Label-based, not id-based, so it isn't tied to a
// particular site's id scheme.
function getEntryBlocks(config) {
  const { getFieldLabelText, isVisible } = window.__jobAutofill;
  const fields = Array.from(document.querySelectorAll("input, textarea, select, button")).filter(isVisible);

  const anchorFields = fields.filter((el) => config.anchorLabel.test(getFieldLabelText(el)));
  const pairFields = fields.filter((el) => config.pairLabel.test(getFieldLabelText(el)));

  const blocks = [];
  for (const anchor of anchorFields) {
    const pair = pairFields.find(
      (el) => anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    if (!pair) continue;

    let scope = anchor.parentElement;
    for (let i = 0; i < 12 && scope && !scope.contains(pair); i++) {
      scope = scope.parentElement;
    }
    // Only count it if the walk actually found a container with both
    // fields — pushing a too-narrow scope that silently excludes the pair
    // field (and everything else in the entry) is worse than skipping it.
    if (scope && scope.contains(pair)) blocks.push(scope);
  }
  return blocks;
}

async function ensureEntryCount(config, desiredCount) {
  for (let i = 0; i < desiredCount; i++) {
    if (getEntryBlocks(config).length > i) continue;

    const addButton = findSectionAddButton(config.heading, config.nextHeading);
    if (!addButton) break;

    const before = getEntryBlocks(config).length;
    addButton.click();

    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (getEntryBlocks(config).length > before) break;
      await delay(150);
    }
  }
  return getEntryBlocks(config);
}

function collectDateGroups(block) {
  const { isVisible } = window.__jobAutofill;
  const inputs = Array.from(block.querySelectorAll('input[aria-label="Month" i], input[aria-label="Year" i]')).filter(isVisible);
  return inputs.map((el) => ({
    el,
    part: el.getAttribute("aria-label").toLowerCase(),
    idLower: (el.id || el.name || "").toLowerCase(),
  }));
}

function fillDateGroups(block, { startDate, endDate }, isCurrent) {
  const { setNativeValue } = window.__jobAutofill;
  const groups = collectDateGroups(block);
  if (!groups.length) return;

  let startGroup = groups.filter((g) => /start|from/.test(g.idLower));
  let endGroup = groups.filter((g) => /end|\bto\b/.test(g.idLower));

  // If id/name gives no hint (some sites don't expose it), fall back to
  // DOM order: first pair is start, second pair is end.
  if (!startGroup.length && !endGroup.length && groups.length >= 2) {
    startGroup = groups.slice(0, 2);
    endGroup = groups.slice(2, 4);
  }

  const startMonthEl = startGroup.find((g) => g.part === "month")?.el;
  const startYearEl = startGroup.find((g) => g.part === "year")?.el;
  const endMonthEl = endGroup.find((g) => g.part === "month")?.el;
  const endYearEl = endGroup.find((g) => g.part === "year")?.el;

  const start = parseMonthYear(startDate);
  if (start && !start.current) {
    if (startMonthEl && start.month) setNativeValue(startMonthEl, String(start.month).padStart(2, "0"));
    if (startYearEl && start.year) setNativeValue(startYearEl, String(start.year));
  }

  if (!isCurrent) {
    const end = parseMonthYear(endDate);
    if (end && !end.current) {
      if (endMonthEl && end.month) setNativeValue(endMonthEl, String(end.month).padStart(2, "0"));
      if (endYearEl && end.year) setNativeValue(endYearEl, String(end.year));
    }
  }
}

function fillWorkExperienceBlock(block, exp) {
  const { getFieldLabelText, setNativeValue, isVisible } = window.__jobAutofill;
  const fields = Array.from(block.querySelectorAll("input, textarea, select")).filter(isVisible);

  let titleField, companyField, locationField, descriptionField, currentCheckbox;

  fields.forEach((el) => {
    const label = getFieldLabelText(el);
    if (el.getAttribute("aria-label") === "Month" || el.getAttribute("aria-label") === "Year") return;

    if (el.type === "checkbox") {
      if (/currently work|current(ly)? (role|position|job)/.test(label)) currentCheckbox = el;
      return;
    }
    if (!titleField && /\bjob title\b/.test(label)) { titleField = el; return; }
    if (!companyField && /\bcompany\b/.test(label)) { companyField = el; return; }
    if (!locationField && /\blocation\b/.test(label)) { locationField = el; return; }
    if (!descriptionField && el.tagName === "TEXTAREA" && /description|responsibilit|summary/.test(label)) {
      descriptionField = el;
    }
  });

  const filled = [];
  if (titleField && exp.title) { setNativeValue(titleField, exp.title); filled.push("title"); }
  if (companyField && exp.company) { setNativeValue(companyField, exp.company); filled.push("company"); }
  if (locationField && exp.location) { setNativeValue(locationField, exp.location); filled.push("location"); }
  if (descriptionField && exp.bullets && exp.bullets.length) {
    setNativeValue(descriptionField, exp.bullets.join("\n"));
    filled.push("description");
  }

  const isCurrent = !exp.endDate || /present|current/i.test(exp.endDate);
  if (currentCheckbox && isCurrent && !currentCheckbox.checked) currentCheckbox.click();

  fillDateGroups(block, exp, isCurrent);
  if (exp.startDate) filled.push("startDate");
  if (exp.endDate && !isCurrent) filled.push("endDate");

  return filled;
}

// Education's fields are a different mix: School and Field of Study are
// live-search typeaheads (server-backed, so they can legitimately come
// back with no match on a given site — best-effort, same caveat as
// Lever's location field), and Degree is a closed listbox-button.
async function fillEducationBlock(block, edu) {
  const { getFieldLabelText, isVisible } = window.__jobAutofill;
  const { selectFromListboxButton, fillTypeahead } = window.__jobAutofillCombobox;
  const fields = Array.from(block.querySelectorAll("input, textarea, select, button")).filter(isVisible);

  let schoolField, degreeButton, fieldOfStudyField;

  fields.forEach((el) => {
    if (el.tagName === "BUTTON" && el.getAttribute("aria-haspopup") === "listbox") {
      if (!degreeButton) degreeButton = el;
      return;
    }
    const label = getFieldLabelText(el);
    if (!schoolField && /\bschool\b|\buniversity\b/.test(label)) { schoolField = el; return; }
    if (!fieldOfStudyField && /field of study|\bmajor\b/.test(label)) { fieldOfStudyField = el; return; }
  });

  const filled = [];
  if (schoolField && edu.school) {
    const matched = await fillTypeahead(schoolField, edu.school);
    filled.push(matched ? "school" : "school (typed only — no matching suggestion found)");
  }
  if (degreeButton && edu.degree) {
    if (await selectFromListboxButton(degreeButton, edu.degree)) filled.push("degree");
  }
  if (fieldOfStudyField && edu.field) {
    const matched = await fillTypeahead(fieldOfStudyField, edu.field);
    filled.push(matched ? "field of study" : "field of study (typed only — no matching suggestion found)");
  }

  fillDateGroups(block, edu, false);
  if (edu.startDate) filled.push("startDate");
  if (edu.endDate) filled.push("endDate");

  return filled;
}

async function fillRepeatableSection(config, entries, fillBlockFn) {
  if (!entries.length) return { entriesFilled: 0, entriesAdded: 0 };

  const before = getEntryBlocks(config).length;
  const blocks = await ensureEntryCount(config, entries.length);
  const entriesAdded = Math.max(0, blocks.length - before);

  let entriesFilled = 0;
  for (let i = 0; i < blocks.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const filled = await fillBlockFn(blocks[i], entry);
    if (filled.length) entriesFilled++;
  }

  return { entriesFilled, entriesAdded };
}

// Main entry points: add as many entries as needed (via the Add/Add
// Another button) and fill each one from the profile, most recent first —
// matching both how the profile is stored and how these forms expect
// entries to be ordered.
async function fillWorkExperience(profile) {
  return fillRepeatableSection(SECTION_CONFIGS.workExperience, profile.experience || [], (block, exp) =>
    Promise.resolve(fillWorkExperienceBlock(block, exp))
  );
}

async function fillEducation(profile) {
  return fillRepeatableSection(SECTION_CONFIGS.education, profile.education || [], fillEducationBlock);
}

window.__jobAutofillRepeater = { fillWorkExperience, fillEducation };
