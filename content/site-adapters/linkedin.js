// Adapter for LinkedIn Easy Apply (linkedin.com/jobs).
//
// UNVERIFIED against a live posting — unlike greenhouse.js and lever.js,
// which were checked against real applications, this one is built from
// LinkedIn Easy Apply's well-documented DOM conventions (the same id/class
// patterns referenced by several public LinkedIn auto-apply tools), because
// getting a live Easy Apply modal open and mid-application to test against
// wasn't possible in this environment. Treat the selectors below as a
// reasonable starting point, not a confirmed-working integration — check
// the popup's "Field detection log" the first time you use this on a real
// posting, and expect to adjust selectors if LinkedIn has changed markup
// since.
//
// Structurally this is the odd one out among the adapters: Greenhouse and
// Lever are full page loads with one application form. LinkedIn Easy Apply
// is a multi-step modal dialog (Contact info -> Resume -> Additional
// questions -> Review) that gets injected into the DOM on top of the job
// listing page when you click "Easy Apply", and each step replaces the
// previous one's fields. That means:
//   - This adapter only has something to do once the modal is actually
//     open — if it isn't (you're just browsing listings), fill() finds
//     nothing and returns immediately, same as it would on any other page.
//   - Like the other adapters, click "Fill this page" again on each step
//     as you reach it — nothing here advances the modal for you.
//   - Most Easy Apply fields (name, email, address, EEO/voluntary
//     disclosure radios) render with a real <label for> or aria-label
//     LinkedIn generates for accessibility, so the generic matcher in
//     field-matcher.js already handles them without any help from this
//     file. What it doesn't reliably handle is the phone number field
//     (see below), which is why that's the one thing mapped here.
//
// Phone number: Easy Apply's "Mobile phone number" input's id is
// per-session/per-posting (LinkedIn generates ids like
// "...formElement-urn-li-jobPosting-1234...-phoneNumber-nationalNumber"),
// but the "-phoneNumber-nationalNumber" / "-firstName" / "-lastName"
// suffixes themselves are stable across postings and sessions — the same
// suffix-match convention several open-source LinkedIn Easy Apply bots key
// off of. Matching on the suffix (rather than requiring an exact id) is
// what makes this survive the per-posting id changing.
function findEasyApplyModal() {
  return document.querySelector(
    '.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"], .jobs-easy-apply-content'
  );
}

function fillLinkedIn(profile, setNativeValue) {
  const filled = [];
  const modal = findEasyApplyModal();
  if (!modal) return filled; // no Easy Apply dialog open right now — nothing for this adapter to do

  const map = {
    'input[id$="-firstName"]': profile.firstName,
    'input[id$="-lastName"]': profile.lastName,
    'input[id$="phoneNumber-nationalNumber"], input[name="phoneNumber"]': profile.phone,
  };

  for (const [selector, value] of Object.entries(map)) {
    if (!value) continue;
    const el = modal.querySelector(selector);
    if (el && !el.value) {
      setNativeValue(el, value);
      filled.push(selector);
    }
  }

  return filled;
}

window.__jobAutofillSiteAdapters = window.__jobAutofillSiteAdapters || {};
window.__jobAutofillSiteAdapters.linkedin = {
  hostnameMatch: "linkedin.com",
  fill: fillLinkedIn,
  // Exposed for tests / debugging only — not part of the adapter contract
  // the other site-adapters follow.
  _findEasyApplyModal: findEasyApplyModal,
};
