# Design

Architecture, algorithms, and known limitations for the Job Application
Autofill + Resume Tailoring extension. See [README.md](README.md) for
install/usage.

## Architecture overview

The extension is Manifest V3: a background service worker, a popup, an
options page, and content scripts injected on demand (no persistent content
scripts declared in `manifest.json` — the popup injects them via
`chrome.scripting.executeScript` only when you click a button). Components
never call each other's functions directly; they only share
`chrome.storage.local` and Chrome's message-passing APIs.

```mermaid
flowchart TB
    subgraph Popup["popup/ (popup.js)"]
        FillBtn["Fill this page"]
        TailorBtn["Tailor resume"]
        Log["Field detection log"]
    end

    subgraph Options["options/ (options.js)"]
        ProfileForm["Profile form + API key"]
    end

    subgraph Page["Job application tab (injected content scripts)"]
        FM["field-matcher.js\n(generic matcher)"]
        Adapters["site-adapters/\ngreenhouse · lever · linkedin"]
        Combo["combobox-filler.js"]
        Repeater["repeater-filler.js"]
        Content["content.js\n(entry point)"]
    end

    subgraph BG["background.js (service worker)"]
        Claude["lib/claude-api.js"]
    end

    subgraph Storage["chrome.storage.local"]
        Profiles["profiles, activeProfileId\n(lib/profile-store.js)"]
        ApiKey["anthropicApiKey"]
        RunLog["lastRunLog"]
        Tailored["lastTailoredResume"]
    end

    Result["result/ (result.js)"]

    Options -- "saveProfile / setActiveProfile" --> Profiles
    Options -- save --> ApiKey
    Popup -- "loadProfiles/getActiveProfile" --> Profiles
    FillBtn -- "chrome.scripting.executeScript" --> Content
    Content --> FM
    Content --> Adapters
    Content --> Combo
    Content --> Repeater
    Content -- "fill result + fieldLog" --> Popup
    Popup -- "write" --> RunLog
    RunLog -- "restore on reopen" --> Log
    TailorBtn -- "extractJobDescription()" --> Content
    TailorBtn -- "chrome.runtime.sendMessage(TAILOR_RESUME)" --> BG
    BG -- "getActiveProfile()" --> Profiles
    BG -- "read key" --> ApiKey
    BG --> Claude
    Claude -- "POST https://api.anthropic.com/v1/messages" --> AnthropicAPI["Anthropic Messages API"]
    BG -- "sendResponse({tailored})" --> Popup
    Popup -- "write" --> Tailored
    Popup -- "chrome.tabs.create" --> Result
    Result -- "read" --> Tailored
```

Why the API key never reaches the job site's page: `lib/claude-api.js` only
runs inside `background.js`, the service worker, which has no DOM and is
never injected into a web page. The popup only ever ships the job
description *text* to the background script via `chrome.runtime.sendMessage`
— the page's own JavaScript never sees the key.

### Components

- **`background.js`** — service worker; the only place that calls the
  Claude API. Listens for a `TAILOR_RESUME` message, reads the active
  profile and API key from storage, calls `lib/claude-api.js`, and replies.
- **`popup/`** — the toolbar UI. Injects content scripts into the active
  tab, calls their exposed functions via `chrome.scripting.executeScript`,
  renders the field detection log, and hosts the profile switcher.
- **`options/`** — the profile-editing form (personal info, education,
  experience, resume text, skills) plus the shared API key field. Talks to
  storage only through `lib/profile-store.js`.
- **`content/`** — injected into the job-application page on click (not
  auto-injected on page load). `content.js` is the entry point; it wires
  the generic matcher, whichever site adapter matches the hostname, the
  combobox filler, and the repeater filler together and exposes
  `fillCurrentPage()` / `extractJobDescription()` on `window`.
- **`lib/profile-store.js`** — the only code that reads/writes profile data
  in `chrome.storage.local`; every other component goes through it so a
  read from the popup, options page, and background worker always agree.
- **`lib/claude-api.js`** — thin wrapper around the Messages API.
- **`result/`** — a plain tab that reads `lastTailoredResume` from storage
  and shows it with a copy button.

### Content script loading model

Content scripts are **not** declared in `manifest.json` as
`content_scripts` (which would auto-run on every page load). Instead,
`popup.js` injects a fixed list of files (`CONTENT_FILES`) via
`chrome.scripting.executeScript` only when you click "Fill this page" or
"Tailor resume." Each file is a plain script (not an ES module) that
attaches its exports to `window` as a side effect (`window.__jobAutofill`,
`window.__jobAutofillSiteAdapters`, `window.__jobAutofillCombobox`,
`window.__jobAutofillRepeater`, `window.__jobAutofillContent`) so the
files can call into each other despite each being injected separately —
they share the page's JS "world." This is also why the Jest tests
`require()` these files for their side effect and then exercise them
through those globals, rather than importing named exports.

## Field-matching algorithm (`content/field-matcher.js`)

For every visible, enabled `input`/`textarea`/`select` (excluding hidden,
submit, button, and file inputs, which are handled separately), the matcher
gathers every plausible source of "what is this field asking for" text, in
priority order:

1. **`<label for>`** referencing the field's id, or a wrapping `<label>`.
2. **`aria-label`** on the element.
3. **`aria-labelledby`**, resolved to the referenced element(s)' text.
4. **`placeholder`** attribute.
5. **Humanized `name`/`id`** — camelCase and `snake-case`/`kebab-case`
   converted to lowercase words (`firstName` → "first name").
6. **Nearby-text fallback** — for forms that put the question in a plain
   sibling `<div>` instead of a real label (common on custom-built question
   cards, e.g. Lever's `.application-label`): walks up to 4 ancestor levels,
   at each level checking elements immediately *before* the field's branch
   for a class name matching `label` or `question`. Deliberately narrow —
   searching a whole ancestor's subtree would pick up unrelated label text
   from other questions on the same page.

All gathered text is matched against `FIELD_DEFINITIONS`, a list of
`{ key, keywords }` pairs (e.g. `firstName` → `["first name", "given
name", "fname"]`), picking the definition whose matched keyword is longest
(so "first name" wins over a bare "name" match). The winning key is looked
up in a flattened view of the active profile (`flattenProfile()` — pulls
the most recent education/experience entry into flat keys like `school`,
`currentCompany`) to get the value to fill.

**Radio groups** are matched at the group level, once per `name` attribute:
the *question* text comes from the closest `<fieldset><legend>`, an
`aria-label`/heading on a `role="radiogroup"`/`role="group"` ancestor, or
the same nearby-text fallback; then the specific option ("Yes"/"No") is
matched by its own label text via `fillRadioGroup()`.

**Setting values** goes through `setNativeValue()` rather than
`el.value = x`, because React (and similar frameworks) override the native
value setter to track changes — direct assignment is silently ignored.
`setNativeValue()` calls the native `HTMLInputElement`/`HTMLTextAreaElement`
/`HTMLSelectElement` prototype's setter explicitly, then dispatches `input`
and `change` events so the framework's own listeners fire.

### Confidence tiers

Recorded per-field in the run log (`matchConfidence()`), based on which
*kind* of source produced the winning keyword match:

| Tier | Source | Rationale |
| --- | --- | --- |
| High | `<label>`, `aria-label`, `aria-labelledby` | The page explicitly names the field, for sighted users and screen readers alike. |
| Medium | `placeholder`, humanized `name`/`id` | A same-element attribute, but not necessarily written to be read as a sentence. |
| Low | nearby-text fallback | A heuristic guess about which nearby text is the question — last resort. |

The full log (one entry per candidate field: description, matched key,
confidence, filled/not, and a reason when not filled) is returned from
`fillPage()`, merged in `content.js` with adapter-filled fields (recorded
as synthetic high-confidence entries), and rendered by the popup.

## Site-adapter pattern

`content/site-adapters/*.js` each register themselves on
`window.__jobAutofillSiteAdapters` keyed by name, with a
`{ hostnameMatch, fill(profile, setNativeValue) }` shape. `content.js`
picks the first adapter whose `hostnameMatch` substring appears in
`window.location.hostname`, runs its `fill()` first, then always runs the
generic matcher afterward over whatever the adapter didn't already fill in
(the generic pass's `if (el.value) skip` check prevents re-filling
adapter-handled fields).

**Why this split** — the generic matcher is deliberately the default, and
adapters only add the handful of selectors the generic matcher's
heuristics can't reach:

- **Greenhouse**: core identity fields (`#first_name`, `#last_name`,
  `#email`, `#phone`, `#country`) have stable ids, so the adapter grabs
  those directly. Every custom question gets a dynamically generated id
  per posting but carries a real `aria-label`, so those fall through to
  the generic matcher untouched.
- **Lever**: core fields use plain `name` attributes with no id or
  aria-label (`name="name"` — one full-name field, not split — plus
  `email`, `phone`, `org`, `location`). Custom questions
  (`cards[uuid][field0]`-style names) have no id/aria-label at all; their
  text lives in a sibling `.application-label` div, which the generic
  matcher's nearby-text fallback already reads.
- **LinkedIn**: see [Known limitations](#known-limitations--unverified).

A generic-matcher-first, adapter-as-precision-layer design means a brand
new ATS with no adapter at all still gets partial autofill for free (any
field with a real label/aria-label/placeholder), and each adapter only
needs to cover what's left — not reimplement the whole form.

### Multi-step forms (Workday, LinkedIn)

Both Workday and LinkedIn Easy Apply are multi-step (a wizard across page
loads, and a modal dialog across steps, respectively). Neither adapter
tries to advance the wizard/modal itself — you click "Fill this page"
again on each step as you reach it, and the extension only ever fills what
is currently on screen. Workday additionally needs two other content
scripts beyond the field-matcher and its adapter:

- **`combobox-filler.js`** — handles Workday's custom
  `<button aria-haspopup="listbox">` dropdowns (Country, State, Degree) by
  clicking the button, waiting for the option panel to render, then
  clicking the matching `role="option"`; and live-search typeahead inputs
  (School, Field of Study) by typing the value and clicking a matching
  suggestion if one appears (best-effort — the site's own lookup table may
  not contain the value).
- **`repeater-filler.js`** — handles "Add Another" sections (Work
  Experience, Education) that start empty: clicks Add once per profile
  entry, waits for each new set of fields to render, and fills them by
  label text (not id) so the same code has a reasonable shot at other
  sites built the same pattern. Also splits stored `startDate`/`endDate`
  text ("Jun 2023") into separate Month/Year fields.

## Multi-profile data model (`lib/profile-store.js`)

```
chrome.storage.local:
  profiles: { [profileId]: ProfileRecord }
  activeProfileId: string
  anthropicApiKey: string   // shared across all profiles, not part of ProfileRecord
```

`ProfileRecord` = `{ name, firstName, lastName, email, phone, address,
city, state, zip, country, linkedin, github, website, authorizedToWork,
needsSponsorship, gender, raceEthnicity, veteranStatus, disabilityStatus,
skills[], resumeText, education[], experience[] }`.

Every reader/writer (popup, options page, background worker) goes through
`loadProfiles()` / `getActiveProfile()` / `saveProfile()` /
`createProfile()` / `deleteProfile()` / `setActiveProfile()` in this one
module, so profile data can't drift out of sync between components.
`loadProfiles()` also migrates a legacy single `profile` key (from
before multi-profile support) into `profiles: { [newId]: { name:
"Default", ...oldProfile } }` the first time it's called after an update —
a one-time, silent, lossless migration. Deleting the only remaining
profile is rejected (`deleteProfile` throws) since the extension always
needs at least one active profile.

## Resume-tailoring flow

1. Popup's **Tailor resume for this job** button injects content scripts
   (if not already present) and calls `extractJobDescription()`, which
   tries a few common ATS container selectors (`[class*="job-description"
   i]`, `#content`, `main`, `article`, ...) before falling back to the
   whole page's visible text, capped at 12,000 characters.
2. Popup sends `{ type: "TAILOR_RESUME", jobDescription }` via
   `chrome.runtime.sendMessage` to `background.js`.
3. `background.js` reads the API key and active profile's `resumeText`
   from storage, and calls `tailorResume()` in `lib/claude-api.js`.
4. `lib/claude-api.js` POSTs to `https://api.anthropic.com/v1/messages`
   with a system prompt instructing Claude to reorder/rephrase/re-emphasize
   but never invent experience, skills, titles, dates, or accomplishments
   not already in the base resume — and to list unmet requirements under a
   "Gaps to consider" section instead of fabricating them. Output is plain
   text (no markdown formatting) so it's paste-ready.
5. The tailored text is saved to `chrome.storage.local` as
   `lastTailoredResume`, and a new tab opens `result/result.html`, which
   reads that key and displays it with a copy-to-clipboard button.

## Known limitations / unverified

- **LinkedIn Easy Apply adapter is unverified against a live posting.**
  `content/site-adapters/linkedin.js` is based on Easy Apply's publicly
  documented DOM conventions (the same id-suffix pattern —
  `...-firstName`, `...-phoneNumber-nationalNumber` — that several
  open-source LinkedIn auto-apply tools rely on) and traced by hand against
  a constructed HTML fixture (`__tests__/linkedin-adapter.test.js`), not a
  real page. It only handles first name, last name, and mobile phone by id
  suffix; email, address, and EEO/voluntary-disclosure radios are left to
  the generic matcher (they're documented to carry real labels/aria-labels
  in LinkedIn's own markup). Not handled at all: the phone country-code
  dropdown, and the home-city field if rendered as a live-search
  typeahead. Check the popup's field detection log the first time you use
  it on a real posting — LinkedIn's markup changes periodically.
- **Workday step-by-step caveats**: Workday's application is a multi-step
  wizard (My Information → My Experience → Application Questions →
  Voluntary Disclosures → Self Identify → Review); "Fill this page" only
  fills the step currently on screen, so it must be re-clicked at each
  step. Within that:
  - Country/State/Degree are custom listbox-button widgets handled by
    `combobox-filler.js`; a short delay is required between "close
    anything else open" and "open this one" clicks because firing them in
    the same tick lets React batch them into a no-op.
  - School and Field of Study are live server-backed search fields — a
    typed value can come back with zero suggestions depending on the
    site's own lookup table, and Workday itself (not a bug in this
    extension) clears the field back to empty if you tab away with no
    suggestion selected.
  - "How Did You Hear About Us" is not filled — it's not something a
    personal profile has an answer for, and it's typically a two-level
    cascading menu the current combobox handling doesn't attempt.
- **File uploads** can never be filled by any browser extension — browsers
  block scripts from setting a file input's value for security reasons.
- **Lever's location field** is a typeahead backed by an address
  autocomplete service; the extension fills the text, but Lever may still
  expect a dropdown suggestion click for the value to fully register.
- **Claude API key is stored unencrypted** in `chrome.storage.local` — fine
  for a personal-use tool, but don't share your browser profile.
- **Resume tailoring is bounded by what's already in the saved resume
  text** — Claude is instructed not to invent experience; review output
  before sending it anywhere.
