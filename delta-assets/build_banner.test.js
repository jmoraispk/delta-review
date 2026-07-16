const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const generator = path.join(__dirname, "build_banner.js");
const banner = path.join(__dirname, "banner.svg");

function generatedSvg() {
  execFileSync(process.execPath, [generator]);
  return fs.readFileSync(banner, "utf8");
}

test("sequences the scan before the three-second comment hold", () => {
  const svg = generatedSvg();

  assert.match(svg, /@keyframes review-scan/);
  assert.match(svg, /@keyframes review-comment/);
  assert.match(svg, /\.scan\s+\{ animation: review-scan 11s/);
  assert.match(svg, /\.bubble \{ animation: review-comment 11s/);
  assert.match(svg, /0%\s+\{ opacity: \.09; transform: translateY\(0\); \}/);
  assert.match(svg, /67%, 94% \{ opacity: 1;/);
  assert.doesNotMatch(svg, /infinite alternate/);
});

test("points the comment at the caret without covering its line", () => {
  const svg = generatedSvg();

  assert.match(svg, /<rect class="caret" x="900" y="190"/);
  assert.match(svg, /<polygon points="892,218 908,218 900,204"/);
  assert.match(svg, /<rect x="842" y="218" width="358" height="50"/);
});

test("reduced motion shows only the static comment state", () => {
  const svg = generatedSvg();

  assert.match(svg, /\.scan, \.caret \{ opacity: 0; \}/);
  assert.match(svg, /\.bubble \{ opacity: 1; transform: none; \}/);
});
