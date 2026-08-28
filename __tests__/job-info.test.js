// Unit tests for content/job-info.js's extraction heuristics: ATS
// detection from hostname, company name from URL slug/subdomain/selectors,
// and job title from common per-ATS headings, with fallbacks down to
// parsing document.title. Same require()-for-side-effect pattern as
// __tests__/field-matcher.test.js — job-info.js isn't a module, it attaches
// window.__jobAutofillJobInfo the same way a real content-script injection
// would.

require("../content/job-info.js");
const { extractJobInfo, detectAtsPlatform } = window.__jobAutofillJobInfo;

// jsdom's window.location is read-only by default; this is the standard
// workaround for tests that need to simulate being on a different page.
function setLocation(url) {
  delete window.location;
  window.location = new URL(url);
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "";
  document.querySelectorAll("meta").forEach((el) => el.remove());
  setLocation("https://example.com/");
});

describe("detectAtsPlatform", () => {
  test.each([
    ["job-boards.greenhouse.io", "Greenhouse"],
    ["jobs.lever.co", "Lever"],
    ["www.linkedin.com", "LinkedIn"],
    ["acme.wd1.myworkdayjobs.com", "Workday"],
    ["careers.random-company.com", "Other"],
  ])("%s -> %s", (hostname, expected) => {
    expect(detectAtsPlatform(hostname)).toBe(expected);
  });
});

describe("Greenhouse", () => {
  test("reads the company from the URL's first path segment and title from .app-title", () => {
    setLocation("https://job-boards.greenhouse.io/acme-corp/jobs/4724060009");
    document.body.innerHTML = `<h1 class="app-title">Backend Engineer</h1>`;
    const info = extractJobInfo();
    expect(info.atsPlatform).toBe("Greenhouse");
    expect(info.company).toBe("Acme Corp");
    expect(info.jobTitle).toBe("Backend Engineer");
  });
});

describe("Lever", () => {
  test("reads the company from the URL's first path segment and title from .posting-headline h2", () => {
    setLocation("https://jobs.lever.co/globex/1234-5678");
    document.body.innerHTML = `<div class="posting-headline"><h2>Staff Engineer</h2></div>`;
    const info = extractJobInfo();
    expect(info.atsPlatform).toBe("Lever");
    expect(info.company).toBe("Globex");
    expect(info.jobTitle).toBe("Staff Engineer");
  });
});

describe("Workday", () => {
  test("reads the company from the subdomain and title from the automation-id heading", () => {
    setLocation("https://acme.wd1.myworkdayjobs.com/External/job/R-12345");
    document.body.innerHTML = `<div data-automation-id="jobPostingHeader">Site Reliability Engineer</div>`;
    const info = extractJobInfo();
    expect(info.atsPlatform).toBe("Workday");
    expect(info.company).toBe("Acme");
    expect(info.jobTitle).toBe("Site Reliability Engineer");
  });
});

describe("LinkedIn", () => {
  test("reads the company from the top-card selector", () => {
    setLocation("https://www.linkedin.com/jobs/view/1234567890");
    document.body.innerHTML = `
      <div class="jobs-unified-top-card__company-name">Initech</div>
      <h1>Product Manager</h1>
    `;
    const info = extractJobInfo();
    expect(info.atsPlatform).toBe("LinkedIn");
    expect(info.company).toBe("Initech");
    expect(info.jobTitle).toBe("Product Manager");
  });
});

describe("generic fallbacks", () => {
  test("falls back to a plain <h1> for the job title on an unrecognized ATS", () => {
    setLocation("https://careers.random-company.com/postings/42");
    document.body.innerHTML = `<h1>Data Analyst</h1>`;
    const info = extractJobInfo();
    expect(info.atsPlatform).toBe("Other");
    expect(info.jobTitle).toBe("Data Analyst");
  });

  test("reads company from og:site_name when no ATS-specific signal is available", () => {
    setLocation("https://careers.random-company.com/postings/42");
    document.head.innerHTML += `<meta property="og:site_name" content="Random Company Inc" />`;
    const info = extractJobInfo();
    expect(info.company).toBe("Random Company Inc");
  });

  test("parses 'Job Title at Company Name' from document.title as a last resort", () => {
    setLocation("https://careers.random-company.com/postings/42");
    document.title = "Data Analyst at Random Company Inc";
    const info = extractJobInfo();
    expect(info.company).toBe("Random Company Inc");
    expect(info.jobTitle).toBe("Data Analyst");
  });

  test("parses 'Company Name - Job Title' from document.title as a last resort", () => {
    setLocation("https://careers.random-company.com/postings/42");
    document.title = "Random Company Inc - Data Analyst";
    const info = extractJobInfo();
    expect(info.company).toBe("Random Company Inc");
    expect(info.jobTitle).toBe("Data Analyst");
  });

  test("returns empty strings rather than throwing when nothing is detectable", () => {
    setLocation("https://careers.random-company.com/postings/42");
    const info = extractJobInfo();
    expect(info.company).toBe("");
    expect(info.jobTitle).toBe("");
  });
});
