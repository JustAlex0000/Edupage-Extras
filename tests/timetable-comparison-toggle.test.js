const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const C = require("../scripts/lib/ee-timetable-comparison.js");

const saved = { version: 1, source: "import", name: "Synthetic timetable", cycleWeeks: 1, anchorMonday: "2026-10-19",
  templates: [[{ title: "Example", weekday: 0, startTime: "08:00", endTime: "08:45" }]] };

async function content(settings, route = {}) {
  const state = { queries: 0, activeObservers: 0, storageListener: null, nodes: 0 };
  let ready;
  const initialized = new Promise((resolve) => { ready = resolve; });
  const window = { addEventListener() {} };
  window.top = window;
  const context = {
    window, location: { pathname: "/user/", search: "", origin: "https://example.edupage.org", ...route },
    URLSearchParams, EEComparison: C, Promise, setTimeout: () => 1, clearTimeout() {},
    document: { body: {}, querySelector() { state.queries++; return null; } },
    MutationObserver: class {
      active = false;
      observe() { if (!this.active) { this.active = true; state.activeObservers++; } }
      disconnect() { if (this.active) { this.active = false; state.activeObservers--; } }
    },
    EEComparisonUI: { storage: async () => settings, el() { state.nodes++; throw new Error("Unexpected UI"); } },
    chrome: { storage: { onChanged: { addListener(fn) { state.storageListener = fn; ready(); } } } },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../scripts/lib/ee-common.js"), "utf8") + "\n" + fs.readFileSync(path.join(__dirname, "../scripts/timetable-comparison.js"), "utf8"), context);
  await initialized;
  return state;
}

test("comparison is completely absent by default, including when an older saved profile exists", async () => {
  for (const settings of [{}, { [C.KEY]: saved }, { [C.KEY]: saved, [C.ENABLED_KEY]: false }]) {
    const state = await content(settings);
    assert.equal(state.queries, 0);
    assert.equal(state.activeObservers, 0);
    assert.equal(state.nodes, 0);
  }
});

test("enabling without a saved schedule does not add a setup prompt to EduPage", async () => {
  const state = await content({ [C.ENABLED_KEY]: true });
  assert.equal(state.queries, 0);
  assert.equal(state.nodes, 0);
});

test("turning comparison off stops discovery and keeps the saved schedule", async () => {
  const settings = { [C.KEY]: saved, [C.ENABLED_KEY]: true };
  const state = await content(settings);
  assert.equal(state.activeObservers, 1);
  await state.storageListener({ [C.ENABLED_KEY]: { newValue: false } }, "local");
  assert.equal(state.activeObservers, 0);
  assert.equal(settings[C.KEY], saved);
  assert.equal(state.nodes, 0);
});


test("encoded weekly links start comparison discovery", async () => {
  const state = await content({ [C.KEY]: saved, [C.ENABLED_KEY]: true }, {
    pathname: "/dashboard/eb.php", search: "?eqa=bW9kZT10aW1ldGFibGU%3D",
  });
  assert.equal(state.activeObservers, 1);
  assert.equal(state.nodes, 0);
  await state.storageListener({ [C.ENABLED_KEY]: { newValue: false } }, "local");
  assert.equal(state.activeObservers, 0);
});
