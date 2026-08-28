// babel.config.js
//
// Dev-only, used solely by Jest (via babel-jest) so test files can
// require() lib/*.js modules that use real ES `import`/`export` syntax —
// the same syntax the extension itself relies on via <script type="module">
// (popup.js, options.js, background.js). This does NOT touch how the
// extension runs in Chrome: manifest.json/HTML load these files directly,
// untranspiled, with no build step. See jest.config.js and
// test/jest.setup.js for the rest of the test-only setup.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
};
