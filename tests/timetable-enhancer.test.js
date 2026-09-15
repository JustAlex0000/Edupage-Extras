const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadTimetableEnhancerInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "timetable-enhancer.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const window = { top: null, clearTimeout() {}, setTimeout() {} };
  window.top = window;
  const context = {
    window,
    document: {
      readyState: "loading",
      body: {},
      documentElement: {},
      head: { appendChild() {} },
      addEventListener() {},
      createElement() { return {}; },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    chrome: {
      storage: {
        local: { get(_keys, callback) { callback({}); } },
        onChanged: { addListener() {} },
      },
    },
  };
  context.globalThis = context;
  context.__EE_TEST__ = true;
  vm.runInNewContext(source, context, { filename: scriptPath });
  return context.__eeTestExports;
}

function makeTimetableItem({ period, subject, trieda }) {
  const attributes = new Map();
  const classes = new Set();
  return {
    dataset: {},
    title: "",
    classList: { add: (name) => classes.add(name), contains: (name) => classes.has(name) },
    hasAttribute: (name) => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    querySelector(selector) {
      if (selector === ".hodina") return { textContent: `${period}.` };
      if (selector === ".predmet") return { textContent: subject };
      if (selector === ".trieda") return { textContent: trieda };
      return null;
    },
  };
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

runTest("timetable highlights leave multiple same-period changes uncolored when subjects differ", () => {
  const { applyRozvrhClassification } = loadTimetableEnhancerInternals();
  const item = makeTimetableItem({ period: 3, subject: "BIO", trieda: "II.A" });
  const sections = [{
    heading: "II.A",
    rows: [
      { isAdd: false, periods: ["3"], info: "MAT - Zameniť učebňu: 101 ➔ 202" },
      { isAdd: false, periods: ["3"], info: "DEJ - Suplovanie: KOV" },
    ],
  }];

  applyRozvrhClassification(item, sections);

  assert.equal(item.getAttribute("data-ee-rozvrh-type"), "none");
  assert.equal(item.classList.contains("ee-rozvrh-room-change"), false);
  assert.equal(item.classList.contains("ee-rozvrh-substitution"), false);
});

runTest("timetable highlights use a lone same-period change when labels differ", () => {
  const { applyRozvrhClassification } = loadTimetableEnhancerInternals();
  const item = makeTimetableItem({ period: 3, subject: "Biology", trieda: "II.A" });
  const sections = [{
    heading: "II.A",
    rows: [{ isAdd: false, periods: ["3"], info: "BIO - Suplovanie: KOV" }],
  }];

  applyRozvrhClassification(item, sections);

  assert.equal(item.getAttribute("data-ee-rozvrh-type"), "substitution");
  assert.equal(item.classList.contains("ee-rozvrh-substitution"), true);
});

runTest("timetable highlights keep an exact subject substitution color", () => {
  const { applyRozvrhClassification } = loadTimetableEnhancerInternals();
  const item = makeTimetableItem({ period: 3, subject: "BIO", trieda: "II.A" });
  const sections = [{
    heading: "II.A",
    rows: [{
      isAdd: false,
      periods: ["3"],
      info: "BIO - Suplovanie: KOV",
    }],
  }];

  applyRozvrhClassification(item, sections);

  assert.equal(item.getAttribute("data-ee-rozvrh-type"), "substitution");
  assert.equal(item.classList.contains("ee-rozvrh-substitution"), true);
});
