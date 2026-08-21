// combobox-filler.js
//
// Handles two custom-widget patterns that show up on Workday (and likely
// other sites built the same way) wherever a plain <select> would normally
// go:
//
//  1. A button that opens a floating list of options
//     (<button aria-haspopup="listbox">Select One</button>) — used for
//     Country, State, Degree, etc. Selecting a value means clicking the
//     button, waiting for the option list to render, then clicking the
//     option whose text matches.
//
//  2. A text input that runs a live, server-backed search as you type
//     (School, Field of Study) — selecting a value means typing into it
//     and clicking a matching suggestion once results come back. Unlike
//     the button case this can legitimately come back empty (the value
//     just isn't in that site's lookup table), so this is best-effort:
//     if no suggestion appears, the typed text is left in the field
//     rather than treated as a failure.
//
// Both need real waiting (the option list/suggestions render after a
// delay), so both are async — different from field-matcher.js's
// synchronous single pass.

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A page-wide [role="option"] query risks mixing in options from a
// different, stray-open panel — tried scoping this to the trigger's own
// panel via aria-controls, but that id can be stale for a moment right
// after the click that opens a fresh panel, which is worse (finds zero or
// the wrong options). Global search plus explicitly closing anything else
// first (see selectFromListboxButton/fillTypeahead) is the more reliable
// combination in practice.
function getOpenOptions() {
  const { isVisible } = window.__jobAutofill;
  return Array.from(document.querySelectorAll('[role="option"]')).filter(isVisible);
}

async function waitForOptions(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const options = getOpenOptions();
    if (options.length) return options;
    await delay(120);
  }
  return getOpenOptions();
}

// Some sites render a placeholder row ("Select One", "No Items.") as a
// real [role="option"] rather than excluding it from the list — never treat
// those as a real match.
const PLACEHOLDER_OPTION_TEXT = /^(select one|no items\.?|search)$/i;

function pickBestOption(options, targetText) {
  const target = targetText.trim().toLowerCase();
  if (!target) return null;
  let exact = null;
  let startsWith = null;
  let contains = null;
  for (const opt of options) {
    const text = opt.textContent.trim().toLowerCase();
    if (!text || PLACEHOLDER_OPTION_TEXT.test(text)) continue;
    if (text === target) { exact = opt; break; }
    if (!startsWith && text.startsWith(target)) startsWith = opt;
    if (!contains && text.includes(target)) contains = opt;
  }
  return exact || startsWith || contains;
}

// Case 1: button[aria-haspopup="listbox"] — a closed, fixed set of options
// (Country, State, Degree, Phone Device Type, ...).
async function selectFromListboxButton(button, targetText) {
  if (!targetText) return false;
  // A previous fill in the same pass (or a field the user had open before
  // clicking "Fill this page") can leave another panel open — close it
  // first so its options don't bleed into this one's global-search results.
  // The delay matters: firing both clicks in the same tick lets React
  // batch them into one update, which can silently undo the open click.
  document.body.click();
  await delay(100);
  button.click();
  const options = await waitForOptions();
  const match = pickBestOption(options, targetText);
  if (match) {
    match.click();
    return true;
  }
  // No match found (e.g. the profile value doesn't appear in this site's
  // list) — close the dropdown rather than leaving it open over the page.
  button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return false;
}

// Case 2: a text input backed by a live search (School, Field of Study).
// Best-effort: the typed text always ends up in the field either way, and
// this additionally clicks a matching suggestion when the search returns
// one, which is what these sites actually require to treat the field as
// filled in rather than just visually filled in.
async function fillTypeahead(input, targetText) {
  if (!targetText) return false;
  document.body.click();
  await delay(100);
  const { setNativeValue } = window.__jobAutofill;
  setNativeValue(input, targetText);
  const options = await waitForOptions(1800);
  const match = pickBestOption(options, targetText);
  if (match) {
    match.click();
    return true;
  }
  return false;
}

// Flat, page-level combobox fields (Country, State) — as opposed to the
// ones nested inside a repeated Education/Experience entry, which
// repeater-filler.js drives directly since it already knows which entry
// it's filling.
const PAGE_COMBOBOX_FIELDS = [
  { key: "country", startsWith: /^country\b/i },
  { key: "state", startsWith: /^(state|province|region)\b/i },
];

function getComboboxLabel(button) {
  const ariaLabel = button.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();
  return window.__jobAutofill.getFieldLabelText(button);
}

async function fillPageComboboxes(profile) {
  const { flattenProfile, isVisible } = window.__jobAutofill;
  const values = flattenProfile(profile);
  const buttons = Array.from(document.querySelectorAll('button[aria-haspopup="listbox"]')).filter(isVisible);

  let filled = 0;
  for (const button of buttons) {
    const label = getComboboxLabel(button);
    const def = PAGE_COMBOBOX_FIELDS.find((d) => d.startsWith.test(label));
    if (!def) continue;

    const value = values[def.key];
    if (!value) continue;

    const currentText = button.textContent.trim().toLowerCase();
    if (currentText && currentText !== "select one" && currentText !== "search") continue; // don't clobber an existing selection

    const ok = await selectFromListboxButton(button, value);
    if (ok) filled++;
  }
  return filled;
}

window.__jobAutofillCombobox = { selectFromListboxButton, fillTypeahead, fillPageComboboxes, waitForOptions, pickBestOption };
