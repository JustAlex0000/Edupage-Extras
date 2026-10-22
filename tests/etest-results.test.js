const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function setup({ frame = false, late = false } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const port = { dataset: { enabled: "false" } };
  const draws = [];
  const nativeCalls = [];
  const materialCalls = [];
  const owner = {};
  let currentPanel = { parentElement: owner };
  let observes = 0;
  let disconnects = 0;
  let observerCallback;
  function emit(name, event = {}) {
    for (const callback of listeners.get(name) || []) callback(event);
  }
  const document = {
    body: {},
    getElementById: () => port,
    querySelector: (selector) => selector.includes("data-tab") ? {} : currentPanel,
    addEventListener(name, callback) {
      listeners.set(name, [...(listeners.get(name) || []), callback]);
    },
    dispatchEvent: (event) => emit(event.type),
  };
  function Material() {
    this.isSecuredCards = false;
    this.data = Object.freeze({ fixture: "unchanged" });
  }
  const originalPrint = function (variantid, answers, options) {
    const markCorrectAnswers = !this.isSecuredCards && options?.markCorrectAnswers === true;
    const questions = [{ markCorrectAnswers }, { markCorrectAnswers }];
    const widget = {
      markCorrectAnswers,
      questions,
      findByWidgetClass: (name) => name === "QuestionETestWidget" ? questions : [],
    };
    materialCalls.push({ receiver: this, args: Array.from(arguments), widget });
    return widget;
  };
  Material.prototype.createPrintMainWidget = originalPrint;
  function Super() { this.materialObj = new Material(); }
  const original = function (level, userid, extra) {
    nativeCalls.push({ method: "zobrazovatOtazky", receiver: this, args: Array.from(arguments) });
    return extra || false;
  };
  const originalCorrect = function (level, userid, extra) {
    nativeCalls.push({ method: "zobrazovatSpravne", receiver: this, args: Array.from(arguments) });
    return extra || false;
  };
  Super.prototype.zobrazovatOtazky = original;
  Super.prototype.zobrazovatSpravne = originalCorrect;
  Super.prototype.getBestVysledokRow = () => ({ vysledokid: "fixture-result" });
  Super.prototype.getVysledokStav = () => "done";
  const window = {
    location: { pathname: "/elearning/" },
    EdubarUtils: { isStudentOrParent: () => "fixture-student" },
    ETestSuperPridelenie: late ? undefined : Super,
    ETestMaterial: Material,
    addEventListener: document.addEventListener,
    jQuery: (elem) => ({ data: () => elem === owner ? {
      changePohlad: (value) => draws.push(value),
    } : undefined }),
  };
  window.top = frame ? {} : window;
  const context = {
    window, document, __EE_TEST__: true,
    Event: function (type) { this.type = type; },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() { observes++; }
      disconnect() { disconnects++; }
    },
    setTimeout(callback, delay) { const id = {}; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../scripts/etest-results-main.js"), "utf8"), context);
  return {
    window, Super, Material, original, originalCorrect, originalPrint,
    nativeCalls, materialCalls, context, draws, timers, emit,
    enable(value) { port.dataset.enabled = String(value); emit("ee-etest-results-state"); },
    mutate() { observerCallback(); },
    flush(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay === delay) { timers.delete(id); timer.callback(); }
      }
    },
    counts: () => ({ observes, disconnects }),
    clearPanel: () => { currentPanel = null; },
  };
}

test("question visibility override is opt-in, scoped to own results, and preserves native calls", () => {
  const s = setup();
  const obj = new s.Super();
  const own = "Studentfixture-student";
  const methods = ["zobrazovatOtazky"];
  for (const method of methods) assert.equal(obj[method]("l2or3", own), false);
  s.enable(true);
  for (const method of methods) {
    assert.equal(obj[method]("l2or3", own), true);
    assert.equal(obj[method]("l2or3", "Studentother"), false);
    assert.equal(obj[method]("l1", own), false);
    assert.equal(obj[method]("l3", own), false);
    assert.equal(obj[method]("l1", own, "native-result", "extra-argument"), "native-result");
    const call = s.nativeCalls.at(-1);
    assert.equal(call.method, method);
    assert.equal(call.receiver, obj);
    assert.deepEqual(call.args, ["l1", own, "native-result", "extra-argument"]);
  }
  s.window.location.pathname = "/timetable/";
  for (const method of methods) assert.equal(obj[method]("l2or3", own), false);
  s.emit("click");
  assert.equal(s.Super.prototype.zobrazovatOtazky, s.original);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
});

test("automatically evaluated results show the student's answers", () => {
  const s = setup();
  const obj = new s.Super();
  obj.getVysledokStav = () => "evaluated";
  s.enable(true);
  assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student"), true);
  assert.equal(obj.zobrazovatSpravne("l2or3", "Studentfixture-student"), false);
  s.enable(false);
  assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student"), false);
});

test("loaded own results are visible independently of status, including future statuses", () => {
  const s = setup();
  const obj = new s.Super();
  s.enable(true);
  for (const state of ["evaluated", "ev_man", "done", "part", "nexttime", "new", "saved", "submitted", "rework", "dline", "seen_only", "", "future-status"]) {
    obj.getVysledokStav = () => state;
    assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student"), true, state);
    assert.equal(obj.zobrazovatOtazky("l2or3", "Studentother"), false, state);
    assert.equal(obj.zobrazovatOtazky("l1", "Studentfixture-student"), false, state);
    assert.equal(obj.zobrazovatOtazky("l3", "Studentfixture-student"), false, state);
  }
  // Status APIs need not exist when the native results row is available.
  obj.getVysledokStav = undefined;
  assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student"), true);
});

test("missing own results keep native visibility and arguments", () => {
  const s = setup();
  const obj = new s.Super();
  s.enable(true);
  for (const getRow of [() => null, undefined, () => { throw new Error("unsupported renderer"); }]) {
    obj.getBestVysledokRow = getRow;
    assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student"), false);
    assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student", "native-result"), "native-result");
    assert.deepEqual(s.nativeCalls.at(-1).args, ["l2or3", "Studentfixture-student", "native-result"]);
  }
});

test("disable restores question visibility and leaves native correctness untouched", () => {
  const s = setup();
  s.enable(true);
  const wrapped = s.Super.prototype.zobrazovatOtazky;
  const wrappedCorrect = s.Super.prototype.zobrazovatSpravne;
  s.emit("click");
  assert.equal(s.Super.prototype.zobrazovatOtazky, wrapped);
  assert.equal(s.Super.prototype.zobrazovatSpravne, wrappedCorrect);
  s.enable(false);
  assert.equal(s.Super.prototype.zobrazovatOtazky, s.original);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
  assert.ok(s.draws.length >= 2);
  assert.ok(s.draws.every((view) => view === "results"));
  assert.equal(s.timers.size, 0);
  assert.equal(s.counts().disconnects, 1);
});

test("late scripts and replaced methods are handled with bounded, debounced observation", () => {
  const s = setup({ late: true });
  s.enable(true);
  s.window.ETestSuperPridelenie = s.Super;
  s.mutate(); s.mutate();
  assert.equal([...s.timers.values()].filter((timer) => timer.delay === 80).length, 1);
  s.flush(80);
  assert.notEqual(s.Super.prototype.zobrazovatOtazky, s.original);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
  s.flush(15000);
  assert.equal(s.counts().disconnects, 1);
  const replacement = () => false;
  s.Super.prototype.zobrazovatOtazky = replacement;
  s.emit("click");
  assert.equal(new s.Super().zobrazovatOtazky("l2or3", "Studentfixture-student"), true);
  s.enable(false);
  assert.equal(s.Super.prototype.zobrazovatOtazky, replacement);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
});

test("replacing question visibility preserves native correctness and restores the latest method", () => {
  for (const method of ["zobrazovatOtazky"]) {
    const s = setup();
    s.enable(true);
    const other = method === "zobrazovatOtazky" ? "zobrazovatSpravne" : "zobrazovatOtazky";
    const unaffected = s.Super.prototype[other];
    const replacement = () => false;
    s.Super.prototype[method] = replacement;
    s.emit("click");
    assert.equal(new s.Super()[method]("l2or3", "Studentfixture-student"), true);
    assert.equal(s.Super.prototype[other], unaffected);
    s.enable(false);
    assert.equal(s.Super.prototype[method], replacement);
    assert.equal(s.Super.prototype[other], other === "zobrazovatOtazky" ? s.original : s.originalCorrect);
  }
});

test("redacted keys never enable highlighting or change native print guards", () => {
  const s = setup();
  const obj = new s.Super();
  obj.materialObj.isSecuredCards = true;
  // Synthetic regression: native widget loading can replace a redacted [] with [0].
  obj.materialObj.data = { correctAnswers: [0] };
  s.enable(true);
  assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student"), true);
  assert.equal(obj.zobrazovatSpravne("l2or3", "Studentfixture-student"), false);
  assert.equal(s.Material.prototype.createPrintMainWidget, s.originalPrint);
  const widget = obj.materialObj.createPrintMainWidget("fixture-variant", {}, { markCorrectAnswers: true });
  assert.equal(widget.markCorrectAnswers, false);
  assert.ok(widget.questions.every(q => q.markCorrectAnswers === false));
  assert.equal(obj.materialObj.isSecuredCards, true);
  s.enable(false);
  assert.equal(s.Super.prototype.zobrazovatOtazky, s.original);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
});

test("correct-answer and print functions are never overwritten, even with a complete key", () => {
  const s = setup();
  const obj = new s.Super();
  obj.materialObj.data = { correctAnswers: ["fixture-answer"] };
  s.enable(true);
  assert.equal(obj.zobrazovatOtazky("l2or3", "Studentfixture-student"), true);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
  assert.equal(obj.zobrazovatSpravne("l2or3", "Studentfixture-student"), false);
  assert.equal(s.Material.prototype.createPrintMainWidget, s.originalPrint);
  s.emit("click");
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
  s.enable(false);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
});

test("missing APIs, child frames, and competing patches fail quietly", () => {
  const frame = setup({ frame: true });
  frame.enable(true);
  assert.equal(frame.Super.prototype.zobrazovatOtazky, frame.original);
  assert.equal(frame.Super.prototype.zobrazovatSpravne, frame.originalCorrect);
  const s = setup();
  s.enable(true);
  s.window.EdubarUtils = null;
  assert.equal(new s.Super().zobrazovatOtazky("l2or3", "Studentfixture-student"), false);
  assert.equal(new s.Super().zobrazovatSpravne("l2or3", "Studentfixture-student"), false);
  const other = () => "other";
  s.Super.prototype.zobrazovatOtazky = other;
  s.clearPanel();
  s.enable(false);
  assert.equal(s.Super.prototype.zobrazovatOtazky, other);
  assert.equal(s.Super.prototype.zobrazovatSpravne, s.originalCorrect);
});

test("results setting is in Enhancements and registered in isolated and MAIN worlds", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const html = read("menu/settings.html");
  const pos = html.indexOf('id="EtestResultsCheckbox"');
  assert.ok(pos > html.indexOf('id="panel-features"') && pos < html.indexOf('id="panel-grades"'));
  assert.match(read("menu/settings.js"), /etestResultsToggle.checked = result\[ETEST_RESULTS_KEY\] === true/);
  const manifest = JSON.parse(read("manifest.json"));
  assert.ok(manifest.content_scripts.some((entry) => entry.js?.includes("scripts/etest-results-main.js") && entry.world === "MAIN"));
  assert.ok(manifest.content_scripts.some((entry) => entry.js?.includes("scripts/etest-results-bridge.js") && !entry.world));
});

test("storage bridge waits for body and transmits only the boolean preference", () => {
  const listeners = {};
  const elements = new Map();
  const events = [];
  let storageChange;
  const document = {
    body: null,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    dispatchEvent: (event) => events.push(event.type),
    getElementById: (id) => elements.get(id),
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
  };
  const window = { location: { pathname: "/elearning/" } };
  window.top = window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../scripts/lib/ee-common.js"), "utf8") + "\n" + fs.readFileSync(path.join(__dirname, "../scripts/etest-results-bridge.js"), "utf8"), {
    window, document,
    Event: function (type) { this.type = type; },
    chrome: {
      runtime: {},
      storage: {
        local: { get: (defaults, done) => done(defaults) },
        onChanged: { addListener: (listener) => { storageChange = listener; } },
      },
    },
  });
  assert.equal(elements.size, 0);
  document.body = { append: (elem) => elements.set(elem.id, elem) };
  listeners.DOMContentLoaded();
  const port = elements.get("ee-etest-results-port");
  assert.equal(port.hidden, true);
  assert.equal(port.dataset.enabled, "false");
  storageChange({ eeEtestResultsEnabled: { newValue: true } }, "sync");
  assert.equal(port.dataset.enabled, "false");
  storageChange({ eeEtestResultsEnabled: { newValue: true } }, "local");
  assert.equal(port.dataset.enabled, "true");
  storageChange({ eeEtestResultsEnabled: {} }, "local");
  assert.equal(port.dataset.enabled, "false");
  assert.deepEqual(Object.keys(port.dataset), ["enabled"]);
  assert.ok(events.every((event) => event === "ee-etest-results-state"));
});

test("localized results banner is unique, follows redraws, and cleans up", () => {
  const listeners = {};
  const elements = new Map();
  let storageChange;
  let panel = null;
  const makePanel = () => {
    const page = {};
    const question = { parentElement: page, before(elem) {
      elem.parentElement = page;
      elem.nextElementSibling = this;
      elements.set(elem.id, elem);
    } };
    return { page, question, querySelector: () => question };
  };
  const document = {
    body: { append: (elem) => elements.set(elem.id, elem) },
    getElementById: (id) => elements.get(id),
    querySelector: () => panel,
    createElement: () => ({
      dataset: {}, style: {}, setAttribute(name, value) { this[name] = value; },
      remove() { elements.delete(this.id); this.parentElement = null; },
    }),
    addEventListener: (name, callback) => { listeners[name] = callback; },
    dispatchEvent: (event) => listeners[event.type]?.(),
  };
  const window = { location: { pathname: "/elearning/" } };
  window.top = window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../scripts/lib/ee-common.js"), "utf8") + "\n" + fs.readFileSync(path.join(__dirname, "../scripts/etest-results-bridge.js"), "utf8"), {
    window, document,
    Event: function (type) { this.type = type; },
    chrome: {
      runtime: {}, i18n: { getMessage: (key) => key === "etestResultsInfo" ? "Lokalizovaný informačný text" : "" },
      storage: {
        local: { get: (defaults, done) => done(defaults) },
        onChanged: { addListener: (listener) => { storageChange = listener; } },
      },
    },
  });
  panel = makePanel();
  storageChange({ eeEtestResultsEnabled: { newValue: true } }, "local");
  const banner = elements.get("ee-etest-results-info");
  assert.equal(banner.textContent, "Lokalizovaný informačný text");
  assert.equal(banner.role, "note");
  assert.equal(banner.parentElement, panel.page);
  assert.equal(banner.nextElementSibling, panel.question);
  listeners["ee-etest-results-render"]();
  assert.equal(elements.get("ee-etest-results-info"), banner);
  panel = makePanel();
  listeners["ee-etest-results-render"]();
  assert.equal(banner.parentElement, panel.page);
  assert.equal(banner.nextElementSibling, panel.question);
  window.location.pathname = "/timeline/";
  listeners["ee-etest-results-render"]();
  assert.equal(elements.has("ee-etest-results-info"), false);
  window.location.pathname = "/elearning/";
  listeners["ee-etest-results-render"]();
  assert.ok(elements.has("ee-etest-results-info"));
  storageChange({ eeEtestResultsEnabled: { newValue: false } }, "local");
  assert.equal(elements.has("ee-etest-results-info"), false);
});
