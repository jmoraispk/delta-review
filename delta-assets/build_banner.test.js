const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const generator = path.join(__dirname, "build_banner.js");
const banner = path.join(__dirname, "banner.svg");
const committedBanner = fs.readFileSync(banner);

function importGeneratorWithoutWrites() {
  const writeFileSync = fs.writeFileSync;
  const attemptedWrites = [];

  fs.writeFileSync = (file) => attemptedWrites.push(file);
  try {
    return { bannerBuilder: require(generator), attemptedWrites };
  } finally {
    fs.writeFileSync = writeFileSync;
  }
}

const { bannerBuilder, attemptedWrites } = importGeneratorWithoutWrites();

function generatedSvg() {
  assert.equal(typeof bannerBuilder.svg, "function", "build_banner.js must export svg()");
  return bannerBuilder.svg({ withDots: true });
}

function keyframes(source, name) {
  const match = source.match(
    new RegExp(`      @keyframes ${name} \\{\\r?\\n([\\s\\S]*?)\\r?\\n      \\}`),
  );
  assert.ok(match, `missing ${name} keyframes`);
  return match[1].split(/\r?\n/).map((line) => line.trim());
}

test("exports SVG generation without writing the committed banner", () => {
  assert.deepEqual(attemptedWrites, []);
  assert.deepEqual(Buffer.from(generatedSvg(), "utf8"), committedBanner);
});

test("uses the exact 11-second scan and comment keyframes", () => {
  const svg = generatedSvg();

  assert.match(svg, /\.scan\s+\{ animation: review-scan 11s/);
  assert.match(svg, /\.bubble \{ animation: review-comment 11s/);
  assert.deepEqual(keyframes(svg, "review-scan"), [
    "0%      { opacity: .09; transform: translateY(0); }",
    "31%     { opacity: .09; transform: translateY(132px); }",
    "62%     { opacity: .09; transform: translateY(0); }",
    "64%,100% { opacity: 0; transform: translateY(0); }",
  ]);
  assert.deepEqual(keyframes(svg, "review-comment"), [
    "0%, 64%   { opacity: 0; transform: translateY(6px) scale(.96); }",
    "67%, 94% { opacity: 1; transform: translateY(0) scale(1); }",
    "100%      { opacity: 0; transform: translateY(4px) scale(.98); }",
  ]);
  assert.doesNotMatch(svg, /infinite alternate/);
});

test("points the comment at the caret without covering its line", () => {
  const svg = generatedSvg();

  assert.match(svg, /<rect class="caret" x="900" y="190"/);
  assert.match(svg, /<polygon points="892,218 908,218 900,204"/);
  assert.match(svg, /<rect x="842" y="218" width="270" height="50"/);
});

test("reduced motion shows only the static comment state", () => {
  const svg = generatedSvg();

  assert.match(svg, /\.scan, \.caret \{ opacity: 0; \}/);
  assert.match(svg, /\.bubble \{ opacity: 1; transform: none; \}/);
});
