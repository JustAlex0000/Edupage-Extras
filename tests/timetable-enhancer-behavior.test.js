const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function item() {
  const attributes = new Map([["title", "Native lesson title"]]);
  const classes = new Set(["hasChange"]);
  const room = { textContent: "II.A" };
  return { dataset: {}, room,
    get title() { return attributes.get("title") || ""; }, set title(value) { attributes.set("title", value); },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    setAttribute: (key, value) => attributes.set(key, value), hasAttribute: key => attributes.has(key),
    getAttribute: key => attributes.get(key) ?? null, removeAttribute: key => attributes.delete(key),
    querySelector: selector => selector === ".hodina" ? { textContent: "3." } : selector === ".predmet" ? { textContent: "BIO" } : selector === ".trieda" ? room : null };
}

function enhancerFixture({ enabled = true } = {}) {
  const state = { now: Date.parse("2026-10-19T12:00:00Z"), date: "2026-10-19", items: [], subCalls: [], roomCalls: 0,
    subFailure: false, roomFailure: false, info: "BIO - Suplovanie: Teacher", roomName: "101", timers: new Map() };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  let timerId = 0;
  const window = { top: null, setTimeout(fn) { state.timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { state.timers.delete(id); } };
  window.top = window;
  const body = {};
  const list = {};
  const heading = { get textContent() { return `${state.date.slice(8)}. ${state.date.slice(5, 7)}.`; }, contains: () => false, classList: { contains: () => false } };
  list.parentElement = { children: [heading, list], parentElement: body };
  const context = { window, Date: ClockDate, Promise, Map, WeakMap, Set, Element: class {},
    document: { body, documentElement: {}, head: { appendChild() {} }, readyState: "loading", getElementById: () => null, createElement: () => ({}),
      addEventListener(_type, fn) { state.domReady = fn; }, querySelector: selector => selector === "ul.rozvrh" ? list : null,
      querySelectorAll: selector => selector === "script:not([src])" ? [{ textContent: 'ASC.gsechash="abcdef123456"' }] : selector.startsWith("ul.rozvrh") ? state.items : [] },
    chrome: { storage: { local: { get(_keys, callback) { callback({ timetableHighlightsEnabled: enabled }); } },
      onChanged: { addListener(fn) { state.settingChanged = fn; } } } },
    MutationObserver: class { constructor(fn) { state.observe = fn; } observe() {} },
    DOMParser: class { parseFromString(html) {
      const info = JSON.parse(html).info;
      return { querySelectorAll: () => [{ querySelector: () => ({ textContent: "II.A" }), querySelectorAll: () => info ? [{
        classList: { contains: () => false }, querySelector: selector => ({ textContent: selector === "div.period" ? "3." : info }),
      }] : [] }] };
    } },
    async fetch(url, options) {
      if (url.includes("viewer.js")) {
        const date = JSON.parse(options.body).__args[1].date;
        state.subCalls.push(date);
        if (state.deferredSub) return state.deferredSub;
        return { ok: !state.subFailure, json: async () => ({ r: JSON.stringify({ info: state.info }) }) };
      }
      state.roomCalls++;
      const data = { dates: { [state.date]: { plan: [{ type: "lesson", uniperiod: "3", flags: { dp0: { classroomids: ["room"] } } }] } },
        dbi: { classrooms: { room: { short: state.roomName } } } };
      return { ok: !state.roomFailure, text: async () => `classbook.fill(0,${JSON.stringify(data)})` };
    },
    __EE_TEST__: true };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../scripts/timetable-enhancer.js"), "utf8"), context);
  state.domReady();
  state.replace = (items) => {
    state.items = items;
    const node = new context.Element();
    node.matches = () => true;
    state.observe([{ addedNodes: [node] }]);
  };
  state.flush = async () => {
    const jobs = [...state.timers.values()]; state.timers.clear(); jobs.forEach(fn => fn());
    await new Promise(setImmediate);
    await new Promise(setImmediate);
  };
  state.disable = () => state.settingChanged({ timetableHighlightsEnabled: { newValue: false } }, "local");
  return { state, api: context.__eeTestExports };
}

test("widget replacements refresh expired substitutions and rooms through the observer", async () => {
  const { state } = enhancerFixture();
  state.replace([item()]);
  await state.flush();
  assert.equal(state.subCalls.length, 1);
  assert.equal(state.roomCalls, 1);
  assert.equal(state.items[0].room.textContent, "101");
  state.now += 31 * 60 * 1000;
  state.info = "BIO - Zameniť učebňu: 101 ➔ 202";
  state.roomName = "105";
  state.replace([item()]);
  await state.flush();
  assert.equal(state.subCalls.length, 2);
  assert.equal(state.roomCalls, 2);
  assert.equal(state.items[0].room.textContent, "202");
  assert.equal(state.items[0].getAttribute("data-ee-rozvrh-type"), "room-change");
});

test("fresh widget replacements apply cached data synchronously without another request", async () => {
  const { state } = enhancerFixture();
  state.replace([item()]);
  await state.flush();
  const replacement = item();
  state.replace([replacement]);
  assert.equal(replacement.room.textContent, "101");
  assert.equal(replacement.getAttribute("data-ee-rozvrh-type"), "substitution");
  await state.flush();
  assert.equal(state.subCalls.length, 1);
  assert.equal(state.roomCalls, 1);
});

test("a widget date change refreshes both caches and drops the previous date's room override", async () => {
  const { state } = enhancerFixture();
  state.info = "BIO - Zameniť učebňu: 101 ➔ 202";
  const lesson = item();
  state.replace([lesson]);
  await state.flush();
  assert.equal(lesson.room.textContent, "202");
  state.date = "2026-10-20";
  state.info = "BIO - Suplovanie: Next teacher";
  state.roomName = "303";
  state.replace([lesson]);
  await state.flush();
  assert.deepEqual(state.subCalls, ["2026-10-19", "2026-10-20"]);
  assert.equal(state.roomCalls, 2);
  assert.equal(lesson.room.textContent, "303");
  assert.equal(lesson.dataset.eeNewRoom, undefined);
  assert.equal(lesson.getAttribute("data-ee-rozvrh-type"), "substitution");
});

test("transient data failures preserve native rooms and retry after a bounded cooldown", async () => {
  const { state, api } = enhancerFixture();
  state.subFailure = state.roomFailure = true;
  state.items = [item()];
  await Promise.all([api.enhanceRozvrhWidget(), api.enhanceRozvrhRooms()]);
  assert.equal(state.items[0].room.textContent, "II.A");
  assert.equal(state.items[0].hasAttribute("data-ee-rozvrh-type"), false);
  await Promise.all([api.enhanceRozvrhWidget(), api.enhanceRozvrhRooms()]);
  assert.equal(state.subCalls.length, 1);
  assert.equal(state.roomCalls, 1);
  state.now += 31000;
  state.subFailure = state.roomFailure = false;
  await Promise.all([api.enhanceRozvrhWidget(), api.enhanceRozvrhRooms()]);
  assert.equal(state.subCalls.length, 2);
  assert.equal(state.roomCalls, 2);
  assert.equal(state.items[0].room.textContent, "101");
  assert.equal(state.items[0].getAttribute("data-ee-rozvrh-type"), "substitution");
});

test("a pending substitution request cannot reapply highlights after the switch is disabled", async () => {
  const { state, api } = enhancerFixture();
  let resolve;
  state.deferredSub = new Promise(done => { resolve = done; });
  const lesson = item();
  state.items = [lesson];
  const pending = api.enhanceRozvrhWidget();
  state.disable();
  resolve({ ok: true, json: async () => ({ r: JSON.stringify({ info: "BIO - Suplovanie: Teacher" }) }) });
  await pending;
  assert.equal(lesson.classList.contains("ee-rozvrh-substitution"), false);
  assert.equal(lesson.hasAttribute("data-ee-rozvrh-type"), false);
  assert.equal(lesson.title, "Native lesson title");
});

test("an older date's pending response cannot overwrite a newer widget's cache", async () => {
  const { state, api } = enhancerFixture();
  let resolve;
  state.deferredSub = new Promise(done => { resolve = done; });
  state.items = [item()];
  const oldRead = api.enhanceRozvrhWidget();
  state.date = "2026-10-20";
  state.items = [item()];
  state.info = "BIO - Suplovanie: New date teacher";
  state.deferredSub = null;
  await api.enhanceRozvrhWidget();
  resolve({ ok: true, json: async () => ({ r: JSON.stringify({ info: "BIO - Zameniť učebňu: 101 ➔ OLD" }) }) });
  await oldRead;
  api.applyCachedRozvrhData();
  assert.equal(state.items[0].getAttribute("data-ee-rozvrh-type"), "substitution");
  assert.equal(state.items[0].dataset.eeNewRoom, undefined);
  assert.match(state.items[0].title, /New date teacher/);
});

test("turning highlights off restores native titles and retains the independent room display", async () => {
  const { state } = enhancerFixture();
  state.info = "BIO - Zameniť učebňu: 101 ➔ 202";
  const lesson = item();
  state.replace([lesson]);
  await state.flush();
  assert.equal(lesson.room.textContent, "202");
  state.disable();
  assert.equal(lesson.room.textContent, "202");
  assert.equal(lesson.title, "Native lesson title");
  assert.equal(lesson.dataset.eeNewRoom, "202");
});

test("an initially disabled highlight setting starts no substitution reads", async () => {
  const { state, api } = enhancerFixture({ enabled: false });
  state.items = [item()];
  await api.enhanceRozvrhWidget();
  assert.equal(state.subCalls.length, 0);
});
