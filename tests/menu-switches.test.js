const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}

function readHtml(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function collectSwitchLabels(html) {
  return Array.from(
    html.matchAll(/<label class="([^"]*\bswitch\b[^"]*)"[^>]*>([\s\S]*?)<\/label>/g),
  );
}

runTest("settings page switches (including the merged Experimental tab) all include tracks and screen-reader labels", () => {
  const html = readHtml(path.join("menu", "settings.html"));
  const labels = collectSwitchLabels(html);

  assert.ok(labels.length > 0, "expected settings switches");
  labels.forEach(([, className, body]) => {
    assert.match(className, /\bswitch-compact\b/);
    assert.match(body, /class="switch-track"/);
    assert.match(body, /class="sr-only"/);
  });
});

runTest("popup menu theme toggle uses the shared switch structure", () => {
  const html = readHtml(path.join("menu", "menu.html"));

  assert.match(html, /class="switch switch-compact"/);
  assert.match(html, /class="switch-track"/);
  assert.match(html, /class="sr-only"/);
});
