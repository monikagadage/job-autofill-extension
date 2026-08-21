// Adapter for job-boards.greenhouse.io application forms.
//
// Verified against a live Greenhouse posting: core identity fields have
// stable ids (#first_name, #last_name, #email, #phone, #country), but every
// custom question (LinkedIn, "why do you want this role", etc.) gets a
// dynamically generated id like #question_4724060009 that changes per job
// posting. Those don't have stable selectors — but they DO carry a real
// aria-label with the question text, which the generic matcher in
// field-matcher.js already reads. So this adapter only needs to grab the
// few stable core fields; everything else falls through to the generic pass.
function fillGreenhouse(profile, setNativeValue) {
  const filled = [];
  const map = {
    "#first_name": profile.firstName,
    "#last_name": profile.lastName,
    "#email": profile.email,
    "#phone": profile.phone,
    "#country": profile.country,
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
window.__jobAutofillSiteAdapters.greenhouse = { hostnameMatch: "greenhouse.io", fill: fillGreenhouse };
