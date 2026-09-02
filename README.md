# job-autofill — a field-matching engine for job application forms

[![CI](https://github.com/monikagadage/job-autofill-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/monikagadage/job-autofill-extension/actions/workflows/ci.yml)

A Chrome extension (Manifest V3) that fills job application forms from a
stored profile and, optionally, uses Claude to reframe a resume toward a
specific posting. The core is a **DOM field-matching engine**: a generic
heuristic matcher that scores every input on a page against known profile
fields and reports a confidence tier and a reason for each, plus
**pluggable per-ATS adapters** for the cases where generic heuristics
aren't enough (Workday's multi-step wizard, Lever, Greenhouse, LinkedIn).

No build step, no runtime dependencies. 60 Jest tests over the matcher,
adapters, and the Claude client.

## How the matching works

| Layer | File | What it does |
|---|---|---|
| **Generic matcher** | `content/field-matcher.js` | For each visible input: gather signals (label text, `name`/`id`/`placeholder`/`aria-label`, surrounding text), match against a synonym map for each profile field, and emit `{field, confidence: high\|medium\|low, reason}`. Low-confidence matches are shown but not filled. |
| **Site adapters** | `content/site-adapters/*.js` | Override or extend the generic pass for a specific ATS with known selectors (Greenhouse, Lever, LinkedIn). Selected by URL match; absent one, the generic matcher runs alone. |
| **Special fillers** | `content/combobox-filler.js`, `repeater-filler.js` | Handle button-triggered dropdowns / comboboxes (Workday Country & State — open, type, pick from the listbox) and repeating sections like work-history rows. Multi-step forms (Workday, LinkedIn) are filled a step at a time: re-click **Fill this page** on each screen. |
| **Detection log** | popup | Every field scanned, what it matched, the tier, and why it was or wasn't filled — so a wrong fill is diagnosable. |

See [DESIGN.md](DESIGN.md) for the scoring rules and the per-ATS caveats.

## Load it in Chrome

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Click the extension icon → **Edit profile / API key**. Autofill alone
   needs no key; resume tailoring needs a [Claude API key](https://console.anthropic.com/settings/keys).

## Features

- **Autofill** — **Fill this page** scans visible fields and fills what it
  recognizes from the active profile.
- **Multiple profiles** — separate profiles (e.g. "Backend", "Frontend"),
  each with its own info/resume/experience; the API key is shared.
  Single-profile installs migrate automatically.
- **Resume tailoring** — **Tailor resume for this job** pulls the job
  description off the page and returns a reframed resume + a short cover
  letter, each in its own tab. Claude is instructed to reframe only what's
  already in the saved resume, not invent experience.
- **Application history** — every Fill/Tailor logs `{company, title, URL,
  ATS, timestamp}` locally; filter, sort, and mark
  applied/interviewing/rejected/offer.
- **Duplicate-application warning** — non-blocking heads-up if the detected
  company matches an entry from the last 90 days.

## ATS support

| Site | Status |
| --- | --- |
| Greenhouse (`job-boards.greenhouse.io`) | Verified against a live posting |
| Lever (`jobs.lever.co`) | Verified against a live posting |
| Workday (`*.myworkdayjobs.com`) | Verified against a live posting |
| LinkedIn Easy Apply (`linkedin.com/jobs`) | **Unverified** — built from documented DOM conventions, not tested live |

## Known limitations

- File-upload fields can't be set by any extension — the popup lists which
  it skipped.
- The Claude API key is stored unencrypted in `chrome.storage.local`.
- The LinkedIn adapter and company/title detection (`content/job-info.js`)
  are unverified against live postings; a miss logs "Unknown company" or
  suppresses the duplicate warning — it never blocks filling.

## Develop

```bash
npm install
npm test        # 60 Jest tests, jsdom, global.fetch mocked — no network
```

Tests cover `field-matcher.js`'s heuristics, the LinkedIn adapter,
`job-info.js`'s company/title/ATS detection, `history-store.js`, and
`claude-api.js`'s request shape + error handling. `test-page/sample-application.html`
is a local fake form for trying **Fill this page** risk-free. Babel/Jest
are dev-only — the extension itself has no build step.
