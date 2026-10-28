const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../scripts/lib/ee-common.js"), "utf8") + "\n" +
  fs.readFileSync(require.resolve("../scripts/etest-enhancer.js"), "utf8");

function page({ enabled = true, copy = false, archive = false, stale = false, pathname = "/user/" } = {}) {
  const buttons = [];
  let storageListener;
  let observer;
  let observerCount = 0;
  let reads = 0;
  const timers = new Map();
  const listeners = [];
  const handlers = {};
  const recorded = [];
  let testTitle = "";
  const field = { nodeType: 1, tagName: "TEXTAREA", value: "", childNodes: [], classList: { contains: () => false }, closest: () => content };
  const content = { nodeType: 1, tagName: "DIV", classList: { contains: () => false },
    dataset: stale ? { eeAiRequestPending: "true" } : {},
    childNodes: [{ nodeType: 3, nodeValue: "Explain your choice." }, field],
    getAttribute: () => "synthetic-question",
    querySelector: () => null,
    querySelectorAll: selector => selector === "input, textarea, select" ? [field] : [] };
  const root = { querySelector: selector => selector === ".etest-player-title-name" ? { textContent: testTitle } : null,
    querySelectorAll: () => [content] };
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
    querySelector: selector => archive && selector === ".etest-player" ? root : null,
    querySelectorAll(selector) {
      if (selector === ".etest-question-playactions") return [actions];
      if (selector === ".etest-question-content") return [content];
      return selector.split(",").flatMap(part => buttons.filter(b => b.className?.split(" ").includes(part.trim().slice(1))));
    },
    createElement() {
      return { className: "", setAttribute() {}, appendChild() {}, addEventListener() {},
        remove() { const i = buttons.indexOf(this); if (i >= 0) buttons.splice(i, 1); } };
    },
    addEventListener(name, fn) { listeners.push(name); (handlers[name] ||= []).push(fn); },
  };
  const window = { location: { pathname, search: "" }, addEventListener() {} }; window.top = window;
  const context = {
    window, document,
    crypto: require("node:crypto").webcrypto,
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observer = this; }
      observe() { observerCount++; }
      disconnect() { observerCount--; }
    },
    chrome: {
      storage: { local: { get(_keys, cb) { reads++; cb({ eeAiQuestionHelperEnabled: enabled, eeEtestCopyEnabled: copy, eeTestArchiveEnabled: archive }); }, set() {} },
        onChanged: { addListener(fn) { storageListener = fn; } } },
      runtime: { onMessage: { addListener() {} }, sendMessage(message, cb) {
        if (message.type !== "ee-test-archive-save") throw Error("Unexpected automatic provider request");
        recorded.push(JSON.parse(JSON.stringify(message.snapshot))); cb({ ok: true, saved: true });
      } },
      i18n: { getMessage: () => "" },
    },
  };
  if (stale) {
    for (const name of ["ee-etest-question-copy-btn", "ee-etest-ai-btn"]) {
      const button = document.createElement("button"); button.className = name; button.stale = true; buttons.push(button);
    }
  }
  vm.runInNewContext(source, context);
  function flush() {
    for (let i = 0; timers.size && i < 8; i++) { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); }
  }
  return { buttons, content, listeners, recorded, get reads() { return reads; }, get observerCount() { return observerCount; },
    navigate(path) {
      window.location.pathname = path;
      observer?.fn();
      flush();
    },
    enable(value) { storageListener({ eeAiQuestionHelperEnabled: { newValue: value } }, "local"); },
    reinject() { vm.runInNewContext(source, context); },
    answer(value) { field.value = value; (handlers.input || []).forEach(fn => fn({ target: field })); flush(); },
    archiveToggle(value) { storageListener({ eeTestArchiveEnabled: { newValue: value } }, "local"); flush(); },
    title(value) { testTitle = value; observer?.fn(); flush(); },
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

test("archive alone records after smart navigation, updates cleared answers, and stops independently", () => {
  const state = page({ enabled: false, archive: true });
  assert.equal(state.recorded.length, 0);
  state.navigate("/elearning/");
  assert.equal(state.recorded.length, 1);
  assert.equal(state.buttons.length, 0);
  const id = state.recorded[0].id;
  state.answer("Written answer");
  assert.deepEqual(state.recorded.at(-1).questions[0].answers, ["Written answer"]);
  assert.equal(state.recorded.at(-1).id, id);
  state.answer("");
  assert.deepEqual(state.recorded.at(-1).questions[0].answers, []);
  const count = state.recorded.length;
  state.archiveToggle(false);
  assert.equal(state.observerCount, 0);
  state.answer("Do not save");
  assert.equal(state.recorded.length, count);
  state.archiveToggle(true);
  assert.notEqual(state.recorded.at(-1).id, id);
  state.navigate("/user/");
  const left = state.recorded.length;
  state.answer("Outside test");
  assert.equal(state.recorded.length, left);
});

test("a late native test title updates the same saved capture without changing answers", () => {
  const state = page({ enabled: false, archive: true });
  state.navigate("/elearning/");
  const first = state.recorded[0];
  assert.equal(first.title, "");
  state.title("Practice fractions");
  const named = state.recorded.at(-1);
  assert.equal(state.recorded.length, 2);
  assert.equal(named.title, "Practice fractions");
  assert.equal(named.id, first.id);
  assert.deepEqual(named.questions, first.questions);
  state.title("");
  assert.equal(state.recorded.length, 2);
});
