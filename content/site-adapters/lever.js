// Adapter for jobs.lever.co application forms.
//
// Verified against a live Lever posting. Unlike Greenhouse, Lever's core
// fields use plain `name` attributes (no id, no aria-label): name="name"
// (a single full-name field, not split first/last), name="email",
// name="phone", name="org" (current company), name="location" (a
// typeahead widget - filling the text is best-effort; Lever may still want
// you to click a dropdown suggestion for it to fully register).
// Custom questions use generated names like cards[uuid][field0] with no
// id/aria-label at all - the question text lives in a sibling
// ".application-label" div, which field-matcher.js's nearby-container
// fallback already reads, so those fall through to the generic pass.
function fillLever(profile, setNativeValue) {
  const filled = [];
  const map = {
    'input[name="name"]': [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    'input[name="email"]': profile.email,
    'input[name="phone"]': profile.phone,
    'input[name="org"]': profile.currentCompany,
    'input[name="location"]': profile.city,
  };
  for (const [selector, value] of Object.entries(map)) {
    if (!value) continue;
    const el = document.querySelector(selector);
    if (el && !el.value) {
      setNativeValue(el, value);
      filled.push(selector);
    }
  }
  return filled;
}

window.__jobAutofillSiteAdapters = window.__jobAutofillSiteAdapters || {};
window.__jobAutofillSiteAdapters.lever = { hostnameMatch: "lever.co", fill: fillLever };
