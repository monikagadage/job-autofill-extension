// Unit tests for content/field-matcher.js's DOM heuristics: label-for
// associations, aria-label, placeholder-only fields, the nearby-div-text
// fallback (Lever's pattern), and radio group matching. field-matcher.js
// isn't written as a module — it just attaches window.__jobAutofill as a
// side effect, the same way it does when Chrome injects it as a content
// script — so it's `require()`d for that side effect and then exercised
// through that global, against HTML fixtures built by hand to match each
// pattern described in the README.

require("../content/field-matcher.js");
const { fillPage } = window.__jobAutofill;

function baseProfile(overrides = {}) {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "555-0100",
    linkedin: "linkedin.com/in/ada",
    github: "github.com/ada",
    website: "ada.dev",
    city: "London",
    country: "United Kingdom",
    authorizedToWork: "Yes",
    needsSponsorship: "No",
    education: [],
    experience: [],
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("label-for association", () => {
  test("fills a text input whose id is referenced by a <label for>", () => {
    document.body.innerHTML = `
      <label for="first_name">First Name</label>
      <input type="text" id="first_name" />
    `;
    const result = fillPage(baseProfile());
    expect(document.getElementById("first_name").value).toBe("Ada");
    expect(result.filled).toContain("firstName");
  });

  test("does not clobber a field the applicant already typed into", () => {
    document.body.innerHTML = `
      <label for="first_name">First Name</label>
      <input type="text" id="first_name" value="Already typed" />
    `;
    fillPage(baseProfile());
    expect(document.getElementById("first_name").value).toBe("Already typed");
  });
});

describe("aria-label", () => {
  test("fills a field with no <label> at all, matched via aria-label", () => {
    document.body.innerHTML = `<input type="text" aria-label="LinkedIn Profile" />`;
    const result = fillPage(baseProfile());
    expect(document.querySelector("input").value).toBe("linkedin.com/in/ada");
    expect(result.filled).toContain("linkedin");
  });
});

describe("placeholder-only fields", () => {
  test("falls back to placeholder text when there's no label or aria-label", () => {
    document.body.innerHTML = `<input type="text" placeholder="Your GitHub URL" />`;
    const result = fillPage(baseProfile());
    expect(document.querySelector("input").value).toBe("github.com/ada");
    expect(result.filled).toContain("github");
  });
});

describe("nearby-div-text fallback (Lever-style custom questions)", () => {
  test("reads a sibling div's text as the question when there's no real label", () => {
    document.body.innerHTML = `
      <li>
        <div class="application-label">What is your personal website?</div>
        <div class="application-field"><input type="text" /></div>
      </li>
    `;
    const result = fillPage(baseProfile());
    expect(document.querySelector("input").value).toBe("ada.dev");
    expect(result.filled).toContain("website");
  });

  test("does not leak label text from an unrelated question elsewhere on the page", () => {
    document.body.innerHTML = `
      <li>
        <div class="application-label">What is your city?</div>
        <div class="application-field"><input type="text" id="city-field" /></div>
      </li>
      <li>
        <div class="application-label">What is your personal website?</div>
        <div class="application-field"><input type="text" id="website-field" /></div>
      </li>
    `;
    fillPage(baseProfile());
    expect(document.getElementById("city-field").value).toBe("London");
    expect(document.getElementById("website-field").value).toBe("ada.dev");
  });
});

describe("radio groups", () => {
  test("matches a fieldset/legend group question, then the Yes/No option within it", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Are you legally authorized to work in this country?</legend>
        <label><input type="radio" name="work_auth" value="yes" /> Yes</label>
        <label><input type="radio" name="work_auth" value="no" /> No</label>
      </fieldset>
    `;
    const result = fillPage(baseProfile({ authorizedToWork: "Yes" }));
    expect(document.querySelector('input[value="yes"]').checked).toBe(true);
    expect(document.querySelector('input[value="no"]').checked).toBe(false);
    expect(result.filled).toContain("authorizedToWork");
  });

  test("picks the No option when the profile value is No", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Will you now or in the future require visa sponsorship?</legend>
        <label><input type="radio" name="sponsorship" value="yes" /> Yes</label>
        <label><input type="radio" name="sponsorship" value="no" /> No</label>
      </fieldset>
    `;
    fillPage(baseProfile({ needsSponsorship: "No" }));
    expect(document.querySelector('input[value="no"]').checked).toBe(true);
    expect(document.querySelector('input[value="yes"]').checked).toBe(false);
  });

  test("only processes each radio group once even with many options", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Are you legally authorized to work in this country?</legend>
        <input type="radio" name="work_auth" value="yes" />
        <input type="radio" name="work_auth" value="no" />
        <input type="radio" name="work_auth" value="unsure" />
      </fieldset>
    `;
    const result = fillPage(baseProfile());
    // "authorizedToWork" should appear at most once in filled, not once per radio.
    expect(result.filled.filter((k) => k === "authorizedToWork").length).toBe(1);
  });
});

describe("select fields", () => {
  test("fills a <select> by matching visible option text, not just value", () => {
    document.body.innerHTML = `
      <label for="country">Country</label>
      <select id="country">
        <option value="">Select...</option>
        <option value="GB">United Kingdom</option>
        <option value="US">United States</option>
      </select>
    `;
    const result = fillPage(baseProfile({ country: "United Kingdom" }));
    expect(document.getElementById("country").value).toBe("GB");
    expect(result.filled).toContain("country");
  });
});

describe("file inputs", () => {
  test("never sets a file input's value, and reports it as skipped", () => {
    document.body.innerHTML = `
      <label for="resume">Resume</label>
      <input type="file" id="resume" />
    `;
    const result = fillPage(baseProfile());
    expect(result.skippedFileFields).toEqual(["Resume"]);
    expect(result.filled).toHaveLength(0);
  });
});

describe("checkboxes", () => {
  test("are never auto-filled (too ambiguous to guess safely)", () => {
    document.body.innerHTML = `
      <label><input type="checkbox" id="subscribe" /> Subscribe to newsletter</label>
    `;
    fillPage(baseProfile());
    expect(document.getElementById("subscribe").checked).toBe(false);
  });
});

describe("per-field run log", () => {
  test("records a high-confidence entry for a real <label> match", () => {
    document.body.innerHTML = `
      <label for="email">Email</label>
      <input type="email" id="email" />
    `;
    const { log } = fillPage(baseProfile());
    const entry = log.find((e) => e.matched === "email");
    expect(entry).toBeDefined();
    expect(entry.filled).toBe(true);
    expect(entry.confidence).toBe("high");
  });

  test("records a low-confidence entry for a nearby-text-only match", () => {
    document.body.innerHTML = `
      <li>
        <div class="application-label">What is your personal website?</div>
        <div class="application-field"><input type="text" /></div>
      </li>
    `;
    const { log } = fillPage(baseProfile());
    const entry = log.find((e) => e.matched === "website");
    expect(entry).toBeDefined();
    expect(entry.confidence).toBe("low");
  });

  test("records why an unrecognized field wasn't filled", () => {
    document.body.innerHTML = `<input type="text" placeholder="Favorite color" />`;
    const { log } = fillPage(baseProfile());
    expect(log).toHaveLength(1);
    expect(log[0].matched).toBeNull();
    expect(log[0].filled).toBe(false);
    expect(log[0].reason).toMatch(/no keyword match/i);
  });

  test("records why a recognized field with no saved profile value wasn't filled", () => {
    document.body.innerHTML = `<label for="gender">Gender</label><input type="text" id="gender" />`;
    const { log } = fillPage(baseProfile({ gender: "" }));
    const entry = log.find((e) => e.matched === "gender");
    expect(entry.filled).toBe(false);
    expect(entry.reason).toMatch(/no value saved/i);
  });
});

describe("flattenProfile", () => {
  test("pulls the most recent education/experience entry into flat keys", () => {
    const { flattenProfile } = window.__jobAutofill;
    const flat = flattenProfile(
      baseProfile({
        education: [{ school: "MIT", degree: "B.S." }],
        experience: [{ company: "Analytical Engines Ltd", title: "Engineer" }],
      })
    );
    expect(flat.school).toBe("MIT");
    expect(flat.currentCompany).toBe("Analytical Engines Ltd");
    expect(flat.fullName).toBe("Ada Lovelace");
  });
});
