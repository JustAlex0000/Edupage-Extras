const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const C = require("../scripts/lib/ee-timetable-comparison.js");

// Only the native widget, its replacement, and comparison's mount are modeled.
class Node {
  constructor(kind = "", children = []) {
    this.kind = kind;
    this.children = children;
    children.forEach(child => { child.parentElement = this; });
  }
  get isConnected() { return this.kind === "body" || Boolean(this.parentElement?.isConnected); }
  get previousElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) - 1]; }
  get firstElementChild() { return this.children[0]; }
  setAttribute() {}
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest(selector) { return this.kind === selector ? this : this.parentElement?.closest(selector); }
  remove() {
    if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }
  after(node) {
    node.remove();
    this.parentElement.children.splice(this.parentElement.children.indexOf(this) + 1, 0, node);
    node.parentElement = this.parentElement;
  }
  replaceChildren(...nodes) {
    this.children.forEach(child => { child.parentElement = null; });
    this.children = nodes;
    nodes.forEach(child => { child.parentElement = this; });
  }
  querySelector(selector) {
    if (this.kind === "li") return { textContent: selector === ".casy" ? "08:00 - 08:45" : selector === ".predmet" ? this.subject || "Example" : "12" };
    return null;
  }
  querySelectorAll(selector) { return selector === ".rozvrhItem" ? this.children : []; }
}

async function mount(source = "import") {
  let widget = new Node(".userRozvrh", [new Node("ul", [new Node("li")])]);
  const host = new Node("host", [widget]);
  const body = new Node("body", [new Node("outer", [host])]);
  let target = widget.children[0];
  let listener;
  let observer;
  let renders = 0;
  let requests = 0;
  let pendingRead;
  const timers = new Map();
  let timerId = 0;
  const profile = source === "import"
    ? { version: 1, source, name: "Synthetic", cycleWeeks: 1, anchorMonday: "2026-10-19", templates: [[{ weekday: 0, title: "Other", startTime: "09:00", endTime: "10:00" }]] }
    : { version: 1, source, name: "Synthetic", origin: "https://example.edupage.org", ownerId: "A", ownerLabel: "A" };
  const window = { top: null, addEventListener() {}, __eeTimetableWidgetDate: () => "2026-10-19",
    __eeComparisonReader: { parseTimetableTimeRange: () => ({ startTime: "08:00", endTime: "08:45" }), normalizeTimetablePeriods: value => value } };
  window.top = window;
  const context = { window, URLSearchParams, EEComparison: C, Date,
    location: { pathname: "/user/", search: "", origin: "https://example.edupage.org" },
    document: { body, querySelector: selector => selector === "ul.rozvrh" ? target : null },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    MutationObserver: class { constructor(fn) { this.callback = fn; } observe() { observer = this; } disconnect() {} },
    chrome: { storage: { onChanged: { addListener(fn) { listener = fn; } } } },
    EEComparisonUI: {
      storage: async () => ({ [C.KEY]: profile, [C.ENABLED_KEY]: true }),
      t: key => key, el: () => new Node(),
      renderCompact(node) { renders++; node.replaceChildren(new Node("details")); },
      message() { requests++; return new Promise(resolve => { pendingRead = resolve; }); },
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../scripts/lib/ee-common.js"), "utf8") + "\n" + fs.readFileSync(require.resolve("../scripts/timetable-comparison.js"), "utf8"), context);
  await new Promise(setImmediate);
  return { widget, body, host, get row() { return host.children.find(node => node.id === "ee-comparison-view") || widget.children.find(node => node.id === "ee-comparison-view"); },
    get renders() { return renders; }, get requests() { return requests; },
    async completeRead() { pendingRead({ data: { lessons: [], dates: ["2026-10-19"] } }); await Promise.resolve(); },
    async replaceWidget({ wrapper = false, subject = "Example" } = {}) {
      const item = new Node("li"); item.subject = subject;
      const replacement = new Node("ul", [item]);
      if (wrapper) {
        const nextWidget = new Node(".userRozvrh", [replacement]);
        widget.after(nextWidget); widget.remove(); widget = nextWidget;
      } else { target.remove(); widget.replaceChildren(replacement); }
      target = replacement;
      observer.callback([{ target: host, addedNodes: [replacement] }]);
      const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn());
      await Promise.resolve();
    },
    async disable() { listener({ [C.ENABLED_KEY]: { newValue: false } }, "local"); await Promise.resolve(); },
  };
}

test("native widget refresh preserves the same comparison row and expanded details", async () => {
  const state = await mount();
  const row = state.row;
  const details = row.children[0];
  details.open = true;
  await state.replaceWidget();
  assert.equal(state.row, row);
  assert.equal(state.renders, 1);
  assert.equal(row.children[0], details);
  assert.equal(details.open, true);
  assert.equal(row.isConnected, true);
  await state.disable();
  assert.equal(row.isConnected, false);
});

test("native widget refresh does not restart an in-flight class read", async () => {
  const state = await mount("class");
  const row = state.row;
  assert.equal(state.requests, 1);
  await state.replaceWidget();
  assert.equal(state.row, row);
  assert.equal(state.requests, 1);
  await state.completeRead();
  assert.equal(state.renders, 1);
});


test("whole widget replacement retains the row but changed lessons update it", async () => {
  const state = await mount();
  const row = state.row;
  await state.replaceWidget({ wrapper: true });
  assert.equal(state.row, row);
  assert.equal(state.renders, 1);
  await state.replaceWidget({ subject: "Changed lesson" });
  assert.equal(state.row, row);
  assert.equal(state.renders, 2);
});
