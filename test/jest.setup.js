// field-matcher.js uses CSS.escape() (to safely build attribute selectors
// like `label[for="..."]` from arbitrary ids). Real browsers have had this
// natively for years; jsdom's support varies by version, so this polyfills
// it defensively rather than pinning a jsdom version just for that.
if (typeof global.CSS === "undefined") {
  global.CSS = {};
}
if (typeof global.CSS.escape !== "function") {
  // Minimal CSS.escape polyfill (per the CSSOM spec) — good enough for the
  // plain alphanumeric/hyphen ids used throughout this codebase and its tests.
  global.CSS.escape = (value) =>
    String(value).replace(/([^\w-])/g, (match) => `\\${match}`);
}

// jsdom doesn't run layout, so `offsetParent` is always null — field-matcher.js's
// isVisible() uses `offsetParent !== null` as its "is this actually rendered"
// check (the standard trick for detecting display:none, since offsetParent is
// null for any element that or an ancestor has display:none). Polyfill it to
// behave the way it would in a real browser for a plain attached element with
// no display:none anywhere in its ancestor chain — which is what every test
// fixture in this suite is, since none of them set display:none.
Object.defineProperty(HTMLElement.prototype, "offsetParent", {
  configurable: true,
  get() {
    if (this.style && this.style.display === "none") return null;
    let node = this.parentElement;
    while (node) {
      if (node.style && node.style.display === "none") return null;
      node = node.parentElement;
    }
    return this.ownerDocument ? this.ownerDocument.body : null;
  },
});

// Minimal in-memory chrome.storage.local mock. lib/profile-store.js and
// lib/history-store.js both call the real chrome.storage.local API when
// running as an actual extension; under Jest there is no browser, so this
// stands in for it. It's intentionally tiny — get/set over one shared
// object, keyed the same way the real API is — just enough for those
// modules' read-modify-write pattern. Tests reset it themselves via
// chrome.storage.local.__reset() in a beforeEach, the same way DOM-based
// tests reset with `document.body.innerHTML = ""`.
if (typeof global.chrome === "undefined") {
  global.chrome = {};
}
if (!global.chrome.storage) {
  let store = {};
  global.chrome.storage = {
    local: {
      get(keys) {
        return Promise.resolve().then(() => {
          if (!keys) return { ...store };
          const keyList = Array.isArray(keys) ? keys : [keys];
          const result = {};
          keyList.forEach((key) => {
            if (store[key] !== undefined) result[key] = store[key];
          });
          return result;
        });
      },
      set(items) {
        return Promise.resolve().then(() => {
          Object.assign(store, items);
        });
      },
      __reset() {
        store = {};
      },
    },
  };
}
