// Static verification for the new LinkedIn Easy Apply adapter
// (content/site-adapters/linkedin.js). There's no live posting to test
// against in this environment (see the adapter's own header comment and
// the README's LinkedIn section for that caveat) — this instead traces the
// adapter's logic against a hand-written fixture modeled on LinkedIn Easy
// Apply's documented DOM conventions: a `.jobs-easy-apply-modal` wrapper,
// and per-posting-hashed input ids that still end in stable suffixes like
// "-firstName" / "-phoneNumber-nationalNumber".

require("../content/field-matcher.js");
require("../content/site-adapters/linkedin.js");

const { setNativeValue, flattenProfile } = window.__jobAutofill;
const linkedinAdapter = window.__jobAutofillSiteAdapters.linkedin;

const profile = flattenProfile({
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "555-0100",
  education: [],
  experience: [],
});

beforeEach(() => {
  document.body.innerHTML = "";
});

test("does nothing when no Easy Apply modal is open", () => {
  document.body.innerHTML = `<input id="some-random-firstName-field" />`;
  const filled = linkedinAdapter.fill(profile, setNativeValue);
  expect(filled).toEqual([]);
  expect(document.querySelector("input").value).toBe("");
});

test("fills first name, last name, and phone by their stable id suffixes inside the modal", () => {
  document.body.innerHTML = `
    <div class="jobs-easy-apply-modal">
      <input id="single-line-text-form-component-formElement-urn-li-jobPosting-1234-firstName" />
      <input id="single-line-text-form-component-formElement-urn-li-jobPosting-1234-lastName" />
      <input id="single-line-text-form-component-formElement-urn-li-jobPosting-1234-phoneNumber-nationalNumber" />
    </div>
  `;

  const filled = linkedinAdapter.fill(profile, setNativeValue);

  expect(filled).toHaveLength(3);
  expect(
    document.getElementById("single-line-text-form-component-formElement-urn-li-jobPosting-1234-firstName").value
  ).toBe("Ada");
  expect(
    document.getElementById("single-line-text-form-component-formElement-urn-li-jobPosting-1234-lastName").value
  ).toBe("Lovelace");
  expect(
    document.getElementById(
      "single-line-text-form-component-formElement-urn-li-jobPosting-1234-phoneNumber-nationalNumber"
    ).value
  ).toBe("555-0100");
});

test("does not clobber a field that already has a value", () => {
  document.body.innerHTML = `
    <div class="jobs-easy-apply-modal">
      <input id="x-firstName" value="Already there" />
    </div>
  `;
  linkedinAdapter.fill(profile, setNativeValue);
  expect(document.getElementById("x-firstName").value).toBe("Already there");
});

test("recognizes the alternate data-test-modal-id modal wrapper", () => {
  document.body.innerHTML = `
    <div data-test-modal-id="easy-apply-modal">
      <input id="y-firstName" />
    </div>
  `;
  const filled = linkedinAdapter.fill(profile, setNativeValue);
  expect(filled).toHaveLength(1);
  expect(document.getElementById("y-firstName").value).toBe("Ada");
});
