const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../scripts/lib/ee-common.js"), "utf8") + "\n" +
  fs.readFileSync(require.resolve("../scripts/etest-enhancer.js"), "utf8");

function page({ enabled = true, copy = false, stale = false, pathname = "/user/" } = {}) {
  const buttons = [];
  let storageListener;
  let observer;
  let observerCount = 0;
  let reads = 0;
  const timers = new Map();
  const listeners = [];
  const content = { dataset: stale ? { eeAiRequestPending: "true" } : {}, querySelectorAll: () => [] };
  const actions = {
    querySelector(selector) { return buttons.find(b => b.className.includes(selector.slice(1))) || null; },
    querySelectorAll(selector) { return buttons.filter(b => b.className.includes(selector.slice(1))); },
    closest: () => content,
    insertBefore(button) { buttons.unshift(button); },
    firstChild: null,
  };
  const nodes = [];
  const document = {
    head: { appendChild: node => nodes.push(node) },
    documentElement: {},
    getElementById: id => nodes.find(node => node.id === id),
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === ".etest-question-playactions") return [actions];
      if (selector === ".etest-question-content") return [content];
      return selector.split(",").flatMap(part => buttons.filter(b => b.className?.split(" ").includes(part.trim().slice(1))));
    },
    createElement() {
      return { className: "", setAttribute() {}, appendChild() {}, addEventListener() {},
        remove() { const i = buttons.indexOf(this); if (i >= 0) buttons.splice(i, 1); } };
    },
    addEventListener(name) { listeners.push(name); },
  };
  const window = { location: { pathname, search: "" } }; window.top = window;
  const context = {
    window, document,
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observer = this; }
      observe() { observerCount++; }
      disconnect() { observerCount--; }
    },
    chrome: {
      storage: { local: { get(_keys, cb) { reads++; cb({ eeAiQuestionHelperEnabled: enabled, eeEtestCopyEnabled: copy }); } },
        onChanged: { addListener(fn) { storageListener = fn; } } },
      runtime: { onMessage: { addListener() {} }, sendMessage() { throw Error("Unexpected automatic provider request"); } },
      i18n: { getMessage: () => "" },
    },
  };
  if (stale) {
    for (const name of ["ee-etest-question-copy-btn", "ee-etest-ai-btn"]) {
      const button = document.createElement("button"); button.className = name; button.stale = true; buttons.push(button);
    }
  }
  vm.runInNewContext(source, context);
  return { buttons, content, listeners, get reads() { return reads; }, get observerCount() { return observerCount; },
    navigate(path) {
      window.location.pathname = path;
      observer?.fn();
      const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn());
    },
    enable(value) { storageListener({ eeAiQuestionHelperEnabled: { newValue: value } }, "local"); },
    reinject() { vm.runInNewContext(source, context); },
  };
}

test("AI controls start after native navigation from Home without a document reload", () => {
  const state = page();
  assert.equal(state.buttons.length, 0);
  assert.equal(state.reads, 1);
  state.navigate("/elearning/");
  assert.equal(state.buttons.length, 1);
  state.navigate("/elearning/");
  assert.equal(state.buttons.length, 1);
  state.navigate("/user/");
  assert.equal(state.buttons.length, 0);
});

test("enabling on an existing test attaches controls; disabling stops observation and removes them", () => {
  const state = page({ enabled: false, pathname: "/elearning" });
  assert.equal(state.observerCount, 0);
  state.enable(true);
  assert.equal(state.buttons.length, 1);
  assert.equal(state.observerCount, 1);
  const count = state.listeners.length;
  state.enable(false);
  assert.equal(state.buttons.length, 0);
  assert.equal(state.observerCount, 0);
  state.enable(true);
  assert.equal(state.listeners.length, count);
  assert.equal(state.buttons.length, 1);
});

test("background reinjection cannot register duplicate observers, listeners or controls", () => {
  const state = page({ pathname: "/elearning/" });
  const count = state.listeners.length;
  state.content.dataset.eeAiRequestPending = "true";
  state.reinject();
  assert.equal(state.reads, 1);
  assert.equal(state.buttons.length, 1);
  assert.equal(state.observerCount, 1);
  assert.equal(state.listeners.length, count);
  assert.equal(state.content.dataset.eeAiRequestPending, "true");
});


test("fresh attachment replaces orphaned copy and AI buttons left by extension reload", () => {
  const state = page({ copy: true, stale: true, pathname: "/elearning/" });
  assert.equal(state.buttons.length, 2);
  assert.equal(state.buttons.some(button => button.stale), false);
  assert.equal(state.content.dataset.eeAiRequestPending, undefined);
});

test("copy-only attachment works independently of AI", () => {
  const state = page({ copy: true, enabled: false, pathname: "/elearning/" });
  assert.equal(state.buttons.length, 1);
  assert.match(state.buttons[0].className, /ee-etest-question-copy-btn/);
});
