// content/job-info.js
//
// Runs inside the job-application page, like field-matcher.js and the site
// adapters. Best-effort extraction of "what job is this page for" —
// company name, job title, and which ATS platform it's on — used for two
// things: logging an entry to the application history after a successful
// fill/tailor run, and the popup's duplicate-application warning (checking
// the detected company against history before you fill).
//
// UNVERIFIED against live postings, the same way content/site-adapters/
// linkedin.js is (see DESIGN.md) — built from each ATS's documented
// URL/DOM conventions and traced against constructed HTML fixtures
// (__tests__/job-info.test.js), not real pages. ATS detection (from
// hostname) is solid. Company/title text extraction is a heuristic chain
// with graceful fallbacks down to "" — callers must handle an empty
// company/title (lib/history-store.js falls back to "Unknown company" /
// "Unknown title"; the popup's duplicate check simply skips when company
// is empty).

function detectAtsPlatform(hostname) {
  if (hostname.includes("greenhouse.io")) return "Greenhouse";
  if (hostname.includes("lever.co")) return "Lever";
  if (hostname.includes("linkedin.com")) return "LinkedIn";
  if (hostname.includes("myworkdayjobs.com")) return "Workday";
  return "Other";
}

function humanizeSlug(slug) {
  return (slug || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function textOfFirst(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "";
    if (text) return text;
  }
  return "";
}

function metaContent(name) {
  const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  return el ? (el.getAttribute("content") || "").trim() : "";
}

// Greenhouse and Lever URLs both put the company slug as the first path
// segment: job-boards.greenhouse.io/{company}/jobs/{id},
// jobs.lever.co/{company}/{id}.
function companySlugFromPath(pathname) {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return "";
  try {
    return humanizeSlug(decodeURIComponent(segment));
  } catch {
    return humanizeSlug(segment);
  }
}

// Workday tenants are subdomains: {company}.wd1.myworkdayjobs.com (or
// sometimes {company}.myworkdayjobs.com directly) — the first label is the
// company slug either way.
function companyFromWorkdaySubdomain(hostname) {
  const first = hostname.split(".")[0];
  return first ? humanizeSlug(first) : "";
}

// Many ATS <title> tags read "Job Title at Company Name" or
// "Company Name - Job Title" / "Company Name | Job Title" — used only as a
// last resort once selector- and URL-based signals come up empty.
function companyFromTitle(title) {
  const atMatch = title.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].trim();
  const parts = title.split(/\s[-|]\s/);
  if (parts.length > 1) return parts[0].trim();
  return "";
}

function titleFromDocumentTitle(title) {
  const atMatch = title.match(/^(.+?)\s+\bat\b/i);
  if (atMatch) return atMatch[1].trim();
  const parts = title.split(/\s[-|]\s/);
  if (parts.length > 1) return parts[parts.length - 1].trim();
  return title.trim();
}

function extractCompany(atsPlatform, hostname, pathname) {
  if (atsPlatform === "Greenhouse" || atsPlatform === "Lever") {
    const fromPath = companySlugFromPath(pathname);
    if (fromPath) return fromPath;
  }
  if (atsPlatform === "Workday") {
    const fromSubdomain = companyFromWorkdaySubdomain(hostname);
    if (fromSubdomain) return fromSubdomain;
  }
  if (atsPlatform === "LinkedIn") {
    const fromLinkedIn = textOfFirst([
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name",
    ]);
    if (fromLinkedIn) return fromLinkedIn;
  }

  const ogSiteName = metaContent("og:site_name");
  if (ogSiteName) return ogSiteName;

  return companyFromTitle(document.title || "");
}

function extractJobTitle() {
  const fromHeading = textOfFirst([
    ".app-title", // Greenhouse
    ".posting-headline h2", // Lever
    ".jobs-unified-top-card__job-title", // LinkedIn
    "[data-automation-id='jobPostingHeader']", // Workday
    "h1",
  ]);
  if (fromHeading) return fromHeading;

  const ogTitle = metaContent("og:title");
  if (ogTitle) return ogTitle;

  return titleFromDocumentTitle(document.title || "");
}

function extractJobInfo() {
  const { hostname, pathname, href } = window.location;
  const atsPlatform = detectAtsPlatform(hostname);
  return {
    company: extractCompany(atsPlatform, hostname, pathname),
    jobTitle: extractJobTitle(),
    atsPlatform,
    url: href,
  };
}

window.__jobAutofillJobInfo = { extractJobInfo, detectAtsPlatform };
