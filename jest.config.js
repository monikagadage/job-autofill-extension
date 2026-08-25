// content/field-matcher.js (and the site adapters) run inside a real page's
// DOM and were never written as CommonJS/ESM modules — they just attach to
// `window`/`document`. jest-environment-jsdom gives tests a real DOM so
// those files can be `require()`d for their side effects (attaching
// window.__jobAutofill etc.) exactly like a browser would load them as a
// content script.
module.exports = {
  testEnvironment: "jsdom",
  setupFiles: ["./test/jest.setup.js"],
};
