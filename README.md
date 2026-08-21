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
  your saved profile.
- Click **Tailor resume for this job** to grab the job description off the
  current page and get back a reframed version of your base resume (opens
  in a new tab with a copy button).

## How autofill matches fields

`content/field-matcher.js` reads each field's `<label>`, `aria-label`,
placeholder, `name`/`id`, and — for forms that put the question text in a
plain nearby `<div>` instead of a real label (common on custom-built
question cards) — nearby sibling text, and matches it against a keyword
list per profile field. Radio button groups are matched at the group level
(via `<fieldset><legend>` or the same nearby-text fallback), then the
specific "Yes"/"No" option is matched by its own label text.

`content/site-adapters/` layers more precise selectors on top for
Greenhouse (`job-boards.greenhouse.io`) and Lever (`jobs.lever.co`),
verified against live postings on both:
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

## Testing without a real job site

`test-page/sample-application.html` is a local fake application form
covering the field patterns above (standard labels, aria-label-only
fields, fieldset/legend radios, Lever-style sibling-div labels, file
uploads). Open it directly in Chrome (`file://.../test-page/sample-application.html`)
to try "Fill this page" risk-free.

## File structure

```
manifest.json           Extension config (Manifest V3)
background.js            Service worker — handles Claude API calls
lib/claude-api.js        Wraps the Anthropic Messages API
content/
  field-matcher.js        Generic field-detection + fill logic
  combobox-filler.js       Fills custom button/listbox dropdowns + search typeaheads
  repeater-filler.js       Fills repeatable "Add another job/degree" sections (Workday etc.)
  content.js               Entry point injected into the active tab
  site-adapters/
    greenhouse.js
    lever.js
popup/                   "Fill this page" / "Tailor resume" UI
options/                 Profile form + API key
result/                  Shows the tailored resume with a copy button
test-page/               Local fake application form for testing
```
