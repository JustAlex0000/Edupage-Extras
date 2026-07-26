const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "etest-plugin-bridge.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const context = { console, EE: {} };
  context.globalThis = context;
  context.__EE_TEST__ = true;

  vm.runInNewContext(source, context, { filename: scriptPath });
  return context.__eeTestExports;
}

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

runTest("decodePluginOpts parses a captured plugin options object", () => {
  const { decodePluginOpts } = loadInternals();
  const opts = decodePluginOpts('{"answered":3,"total":10}');
  assert.equal(opts.answered, 3);
  assert.equal(opts.total, 10);
});

runTest("decodePluginOpts rejects missing, malformed, or non-object payloads", () => {
  const { decodePluginOpts } = loadInternals();
  assert.equal(decodePluginOpts(undefined), null);
  assert.equal(decodePluginOpts(""), null);
  assert.equal(decodePluginOpts("not json"), null);
  assert.equal(decodePluginOpts("42"), null);
  assert.equal(decodePluginOpts("null"), null);
});
