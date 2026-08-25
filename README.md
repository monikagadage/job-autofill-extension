# Job Application Autofill + Resume Tailoring

A Chrome extension for your own job hunt: fills application forms from a
profile you fill in once, and (optionally) asks Claude to reframe your
resume toward a specific job posting.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right toggle).
3. Click **Load unpacked**, and select this folder (`job-autofill-extension`).
4. Click the extension's icon in the toolbar, then **Edit profile / API key**
   to fill in your info. Resume tailoring also needs a Claude API key from
   [console.anthropic.com](https://console.anthropic.com/settings/keys) —
   autofill alone doesn't need one.

## Features

- **Autofill** — click **Fill this page** to scan visible form fields and
  fill what it recognizes from your active profile, using a generic
  DOM-based field matcher plus site-specific adapters (see below).
- **Multiple profiles** — keep separate profiles (e.g. "Backend roles",
  "Frontend roles") each with their own info, resume, and experience;
  switch the active one from the popup or options page. The Claude API key
  is shared across all profiles. Existing single-profile installs migrate
  automatically.
- **Field detection log** — after a fill, expand **Field detection log** in
  the popup to see every field scanned, what it matched to, a confidence
  tier (high/medium/low), and why a field was or wasn't filled.
- **Resume tailoring** — click **Tailor resume for this job** to grab the
  job description off the current page and get back a version of your base
  resume reframed toward it (opens in a new tab with a copy button).

See [DESIGN.md](DESIGN.md) for how the field-matching algorithm, adapters,
and tailoring flow work.

## Site support

| Site | Status |
| --- | --- |
| Greenhouse (`job-boards.greenhouse.io`) | Verified against a live posting |
| Lever (`jobs.lever.co`) | Verified against a live posting |
| Workday (`*.myworkdayjobs.com`) | Verified against a live posting |
| LinkedIn Easy Apply (`linkedin.com/jobs`) | **Unverified** — built from documented DOM conventions, not tested against a live posting |

Per-site DOM details, the Workday step-by-step wizard walkthrough, and
LinkedIn's caveats are in [DESIGN.md](DESIGN.md#known-limitations--unverified).

## Known limitations

- File uploads (resume/cover letter attachments) can never be filled by any
  browser extension — the popup lists which file fields it skipped.
- Your Claude API key is stored unencrypted in `chrome.storage.local`.
- Resume tailoring only reframes what's already in your saved resume text;
  Claude is instructed not to invent experience.
- The LinkedIn adapter is unverified — see [DESIGN.md](DESIGN.md).

## Testing without a real job site

`test-page/sample-application.html` is a local fake application form. Open
it directly in Chrome to try "Fill this page" risk-free.

## Running the tests

```
npm install   # one-time, installs Jest + jsdom as devDependencies
npm test
```

21 Jest tests cover `content/field-matcher.js`'s DOM heuristics and the
LinkedIn adapter, run against jsdom (see `test/jest.setup.js` for the
polyfills that requires). This is dev-only tooling — the extension itself
has no build step and no runtime dependencies.
