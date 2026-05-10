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

const settingsPath = path.join(__dirname, "..", "menu", "settings.html");
const html = fs.readFileSync(settingsPath, "utf8");
const switchLabels = Array.from(
  html.matchAll(/<label class="([^"]*\bswitch\b[^"]*)"[^>]*>([\s\S]*?)<\/label>/g),
);

runTest("every settings switch includes the visual switch track", () => {
  assert.ok(switchLabels.length > 0, "expected at least one switch label");
  switchLabels.forEach(([, className, body]) => {
    assert.match(className, /\bswitch\b/);
    assert.match(body, /class="switch-track"/, `missing switch track for ${className}`);
  });
});

runTest("compact settings switches use screen-reader labels", () => {
  const compactSwitches = switchLabels.filter(([, className]) => /\bswitch-compact\b/.test(className));

  assert.ok(compactSwitches.length > 0, "expected compact switches for top-level settings");
  compactSwitches.forEach(([, , body]) => {
    assert.match(body, /class="sr-only"/, "compact switch is missing screen-reader text");
  });
});

runTest("inline option switches keep visible text labels", () => {
  const inlineSwitches = switchLabels.filter(([, className]) => !/\bswitch-compact\b/.test(className));

  assert.ok(inlineSwitches.length > 0, "expected inline switches for option rows");
  inlineSwitches.forEach(([, , body]) => {
    assert.match(body, /class="switch-text"/, "inline switch is missing visible text");
  });
});
