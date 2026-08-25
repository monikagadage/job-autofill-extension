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

## Using it

- On any job application page, click the extension icon, then **Fill this
  page**. It scans visible form fields and fills what it recognizes from
  your active profile.
- Click **Tailor resume for this job** to grab the job description off the
  current page and get back a reframed version of your base resume (opens
  in a new tab with a copy button).
- After a fill, open **Field detection log** in the popup to see exactly
  what it found — see [Field detection log](#field-detection-log) below.

## Multiple profiles

If you're applying to more than one kind of role — say, both backend and
frontend positions — one profile can't hold two different resumes, skill
lists, or "current title" values at once. The extension now supports
multiple named profiles (e.g. "Backend roles", "Frontend roles"), each with
its own personal info, resume text, skills, education, and experience. The
Claude API key is the one thing shared across all of them — it's a
credential for the extension, not part of any single profile.

- **Switch profiles from the popup** — a dropdown above "Fill this page"
  lists every saved profile; picking one makes it active immediately (no
  save/reload needed) for both autofill and resume tailoring.
- **Manage profiles from the options page** — the same dropdown appears at
  the top of **Edit profile / API key**, plus **+ New profile** and
  **Delete this profile** buttons. Switching profiles there loads that
  profile's full form (personal info, education, experience, resume text,
  skills) so you can edit and save it.
- **Existing installs migrate automatically** — if you were using an
  earlier version with a single profile, the first time any part of the
  extension reads your profile it's copied into a profile named "Default"
  under the new storage shape. Nothing is lost; this happens once, silently,
  the moment you load an updated build (implemented in
  `lib/profile-store.js`, used by `options.js`, `popup.js`, and
  `background.js` so all three see the same active profile).
- You always need at least one profile — the "Delete this profile" button
  is disabled when it's the only one left.

## Field detection log

Every time you click "Fill this page," the popup's **Field detection log**
(collapsed by default — click to expand) lists every field the scan looked
at: a short description of the element, whether it matched a profile key,
how confident that match was, whether it actually got filled, and — when it
didn't — why not (no keyword match, no value saved for that key in the
active profile, the field already had something typed in, no `<option>`
text matched, etc.). This is the first place to look when a field you
expected to fill didn't.

Confidence is based on *where* the matching keyword was found, from
`content/field-matcher.js`'s perspective:

| Confidence | Matched via | Why |
| --- | --- | --- |
| High | a real `<label>`, `aria-label`, or `aria-labelledby` | The page is explicitly telling you (and screen readers) what the field is. |
| Medium | `placeholder`, or the humanized `name`/`id` attribute | A same-element attribute, but not necessarily written to be read as a sentence. |
| Low | the nearby-sibling-`<div>` fallback | A heuristic guess about which nearby text is the question — the fallback of last resort. |

The log persists across popup close/reopen (it's saved to
`chrome.storage.local` under `lastRunLog`) so you can fill a page, close the
popup to look at the form, then reopen it to check the log without
re-running the fill. A **Copy log** button copies it as plain text.

## How autofill matches fields

`content/field-matcher.js` reads each field's `<label>`, `aria-label`,
placeholder, `name`/`id`, and — for forms that put the question text in a
plain nearby `<div>` instead of a real label (common on custom-built
question cards) — nearby sibling text, and matches it against a keyword
list per profile field. Radio button groups are matched at the group level
(via `<fieldset><legend>` or the same nearby-text fallback), then the
specific "Yes"/"No" option is matched by its own label text.

`content/site-adapters/` layers more precise selectors on top for
Greenhouse (`job-boards.greenhouse.io`), Lever (`jobs.lever.co`), and
LinkedIn Easy Apply (`linkedin.com/jobs`). Greenhouse and Lever are verified
against live postings; LinkedIn is not — see the section below for why and
what that means in practice.
- **Greenhouse**: core fields (`#first_name`, `#last_name`, `#email`,
  `#phone`, `#country`) have stable ids; custom questions get a
  dynamically-generated id per posting but carry a real `aria-label`, so
  the generic matcher already handles those.
- **Lever**: core fields use plain `name` attributes (`name="name"` — a
  single full-name field, not split first/last — plus `email`, `phone`,
  `org` for current company, `location`). Custom questions have no id or
  aria-label at all; their question text lives in a sibling
  `.application-label` div, which the generic matcher's nearby-text
  fallback reads.
- **LinkedIn Easy Apply**: see below.

## Workday support

Verified against a live Workday posting (`*.myworkdayjobs.com`), which is
a multi-step wizard (My Information → My Experience → Application
Questions → Voluntary Disclosures → Self Identify → Review). Click "Fill
this page" again on each step as you reach it — the extension only ever
fills the step currently on screen.

- **Works — plain text fields**: name, address, email, phone. Real
  `<label for>` associations, same as everywhere else.
- **Works — Country/State**: these are custom button-triggered listbox
  widgets, not native `<select>` elements (`<button aria-haspopup="listbox">`
  that opens a floating options panel on click), so filling them means
  clicking the button, waiting for the panel to render, then clicking the
  option that matches — `content/combobox-filler.js` handles this. One
  real quirk found while testing: firing the "close anything else open"
  click and the "open this one" click back-to-back let React batch them
  into a no-op, so there's a short delay between them.
- **Works — Work Experience and Education, including "Add Another"**: both
  sections start empty with an Add button that reveals one entry's fields
  each click. `content/repeater-filler.js` clicks Add as many times as
  needed (one per job/degree in your profile), waits for each new set of
  fields to render, and fills them — including splitting your stored
  `startDate`/`endDate` text ("Jun 2023") into Workday's separate Month/Year
  fields. It matches entries by label text rather than internal ids, so it
  has a reasonable shot at working on other sites with the same pattern.
  Within Education, Degree is a listbox button like Country/State; School
  and Field of Study are live server-backed search fields (see below).
- **Best-effort — School and Field of Study**: typing into these triggers
  a live search against the site's own institution/major list, and the
  match is genuinely hit-or-miss per site — the extension types your value
  and clicks a matching suggestion if one appears, exactly like Lever's
  location field below. On the Workday tenant this was tested against,
  common searches like "Stanford University" or "University of
  California" returned zero results — and if you tab away with no
  suggestion selected, **the site itself clears the field back to empty**
  (a Workday UX choice, not an extension bug). If "Fill this page" reports
  it filled your education but the School field looks blank, that's why —
  fill it in by hand.
- **How Did You Hear About Us**: not filled — it's not something a
  personal profile has an answer for, and on top of that this one is a
  two-level cascading menu (pick a category, then a sub-option), which the
  current combobox handling doesn't attempt.

## LinkedIn Easy Apply support (unverified)

**Unlike Greenhouse, Lever, and Workday above, this adapter has not been
checked against a live LinkedIn posting.** Getting an actual Easy Apply
modal open and mid-application wasn't possible in the environment this was
built in, so `content/site-adapters/linkedin.js` is instead based on Easy
Apply's publicly documented DOM conventions — the same id-suffix pattern
(`...-firstName`, `...-phoneNumber-nationalNumber`) that several open-source
LinkedIn auto-apply tools rely on — and traced by hand against a
constructed HTML fixture (`__tests__/linkedin-adapter.test.js`) rather than
a real page. It is a reasonable starting point, not a confirmed-working
integration. If you try it, check the **Field detection log** the first
time — LinkedIn changes its markup periodically, and selectors that matched
when this was written may need adjusting.

What's structurally different about LinkedIn versus the other three:
Greenhouse, Lever, and Workday are all full page loads with the application
form directly in the page. LinkedIn Easy Apply is a **multi-step modal
dialog** injected into the DOM on top of the job listing when you click
"Easy Apply" (Contact info → Resume → Additional questions → Review), so
the adapter only has something to fill once that modal is actually open —
click "Fill this page" again on each step, same as Workday's wizard.

- **Handled by the adapter**: first name, last name, and the "Mobile phone
  number" field, matched by their stable id *suffix* rather than a full id
  (LinkedIn generates a fresh hashed prefix per posting/session, but the
  suffix has stayed consistent).
- **Left to the generic matcher**: email, address, and the EEO/voluntary
  disclosure Yes/No questions all render with a real `<label>` or
  `aria-label` in LinkedIn's own markup (per public documentation of the
  form), so `content/field-matcher.js`'s normal label/aria-label reading
  should already handle them without adapter-specific selectors — the same
  "only grab what's not already handled generically" pattern Greenhouse's
  adapter uses.
- **Not handled**: the phone country-code dropdown (left alone rather than
  risked — filling it wrong is worse than leaving it), and the home-city
  field if LinkedIn renders it as a live-search typeahead (same best-effort
  caveat as Lever's location field and Workday's School field below).
- **Resume upload**: not fillable, same file-input restriction as
  everywhere else.

## Known limitations

- **File uploads (resume/cover letter attachments) can never be filled by
  any browser extension** — browsers block scripts from setting a file
  input's value, for security. The popup will tell you which file fields
  it skipped so you can attach them by hand.
- **Lever's location field** is a typeahead widget backed by an address
  autocomplete service; the extension fills the text but Lever may still
  expect you to click a suggestion from its dropdown for the value to fully
  register.
- **Your Claude API key is stored unencrypted** in this browser's extension
  storage (`chrome.storage.local`). That's normal for a personal-use tool
  like this, but don't share your browser profile with anyone you wouldn't
  trust with that key.
- **Resume tailoring only reframes what's already in your saved resume
  text** — Claude is explicitly instructed not to invent experience, and
  to call out gaps instead of fabricating them. Still, review the output
  before sending it anywhere.
- **The LinkedIn adapter is unverified against a live posting** — see
  [LinkedIn Easy Apply support](#linkedin-easy-apply-support-unverified)
  above.

## Testing without a real job site

`test-page/sample-application.html` is a local fake application form
covering the field patterns above (standard labels, aria-label-only
fields, fieldset/legend radios, Lever-style sibling-div labels, file
uploads). Open it directly in Chrome (`file://.../test-page/sample-application.html`)
to try "Fill this page" risk-free.

## Running the tests

`content/field-matcher.js` has automated unit tests covering its DOM
heuristics — label-for association, aria-label, placeholder-only fields,
the nearby-div-text fallback, radio group matching, select-by-option-text,
file/checkbox skipping, "don't clobber an existing value," and the
per-field run log's confidence tiers — plus a small suite for the LinkedIn
adapter (see [above](#linkedin-easy-apply-support-unverified)) that traces
its selectors against a constructed fixture in place of a live posting.

This is dev-only tooling — the extension itself has no build step and no
runtime dependencies; Jest only exists to run these tests.

```
npm install   # one-time, installs Jest + jsdom as devDependencies
npm test
```

Tests run against [jsdom](https://github.com/jsdom/jsdom) (a JS
implementation of the DOM, not a real browser) via
`jest-environment-jsdom`. `content/field-matcher.js` isn't written as a
module — like every content script here, it just attaches
`window.__jobAutofill` as a side effect — so tests `require()` it for that
side effect and then exercise it through that global, exactly like Chrome
loading it as a content script. `test/jest.setup.js` polyfills two things
jsdom doesn't implement that the matching logic depends on: `CSS.escape()`
and `offsetParent` (jsdom doesn't run layout, so `offsetParent` — which
`isVisible()` uses to detect `display:none` — is always `null` without the
polyfill).

## File structure

```
manifest.json           Extension config (Manifest V3)
background.js            Service worker — handles Claude API calls
lib/
  claude-api.js            Wraps the Anthropic Messages API
  profile-store.js         Multi-profile storage (read/write/switch/migrate)
content/
  field-matcher.js        Generic field-detection + fill logic, + per-field run log
  combobox-filler.js       Fills custom button/listbox dropdowns + search typeaheads
  repeater-filler.js       Fills repeatable "Add another job/degree" sections (Workday etc.)
  content.js               Entry point injected into the active tab
  site-adapters/
    greenhouse.js
    lever.js
    linkedin.js              Unverified — see "LinkedIn Easy Apply support" above
popup/                   "Fill this page" / "Tailor resume" UI, profile switcher, run log
options/                 Profile form (multi-profile) + API key
result/                  Shows the tailored resume with a copy button
test-page/               Local fake application form for testing
__tests__/               Jest unit tests for field-matcher.js and the LinkedIn adapter
test/jest.setup.js       jsdom polyfills (CSS.escape, offsetParent) for the tests above
package.json             Dev-only: Jest, for `npm test` — no runtime dependencies
jest.config.js
```
