const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootPath = path.join(__dirname, "../..");
const empty = { querySelector: () => null, querySelectorAll: () => [], style: {} };

function gridFixture({ start = "2026-10-19", owner = "Student Example", days = [0, 1, 2, 3, 4], periods = 3 } = {}) {
  const headers = Array.from({ length: periods }, (_, index) => ({
    ...empty,
    style: { position: "absolute", left: `${100 + index * 100}px`, width: "100px" },
    textContent: `${index + 1} ${8 + index}:00 - ${8 + index}:45`,
    querySelectorAll: selector => selector === "span" ? [{ textContent: String(index + 1) }, { textContent: `${8 + index}:00 - ${8 + index}:45` }] : [],
  }));
  const periodHeader = { ...empty, style: { position: "sticky" },
    querySelectorAll: selector => selector === "span" ? [{ textContent: "08:00 - 08:45" }] : selector.includes("position: absolute") ? headers : [] };
  const dateHeaders = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateText = `${date.getUTCDate()}. ${date.getUTCMonth() + 1}.`;
    return { ...empty, style: { position: "absolute", top: `${index * 100}px` }, textContent: `D${index} ${dateText}`,
      childNodes: [{ textContent: `D${index}` }, { textContent: dateText }] };
  });
  const dayHeader = { ...empty, style: { position: "sticky" },
    querySelectorAll: selector => selector === "div" || selector.includes("position: absolute") ? dateHeaders : [] };
  const rows = days.map(day => {
    const blocks = headers.map((_, index) => ({ ...empty,
      style: { left: `${100 + index * 100}px`, top: "0px", width: "100px", height: "60px", cursor: "pointer" } }));
    const titles = blocks.map((block, index) => ({ ...empty, style: { ...block.style, pointerEvents: "none" },
      classList: { contains: value => value === "tt-cell" }, textContent: `Day ${day} lesson ${index + 1}` }));
    return { ...empty, style: { position: "absolute", overflow: "visible", top: `${day * 100}px` },
      querySelector: selector => selector === ":scope > div.tt-cell" ? blocks[0] : null,
      querySelectorAll: selector => selector === ":scope > div.tt-cell" ? blocks : selector === ":scope > div" ? [...blocks, ...titles] : [] };
  });
  const grid = { ...empty, querySelectorAll: selector => selector.includes("overflow: visible") ? rows : [] };
  const weekLabel = { ...empty, style: { position: "absolute", height: "45px" },
    parentElement: { style: { position: "sticky" } }, textContent: start };
  return { ...empty,
    querySelector: selector => selector === ".tt-cell" ? rows[0] || null : selector.includes("font-size: 32px") ? { textContent: owner } : null,
    querySelectorAll: selector => selector === "div" ? [weekLabel, periodHeader, dayHeader, grid] : [] };
}

function syncFixture(options = {}) {
  const state = { now: Date.parse("2026-10-22T12:00:00Z"), grid: gridFixture(options), clicks: 0, ownName: "Student Example", next: [], onDelay() {} };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const own = { tagName: "SPAN", title: "My timetable", style: {}, textContent: "", click() { state.clicks++; state.onOwnClick?.(); } };
  const ownName = { tagName: "SPAN", style: { fontWeight: "bold" }, get textContent() { return state.ownName; }, click: () => own.click() };
  const forward = { textContent: ">", click() { state.grid = state.next.shift() || state.grid; } };
  const navigation = { children: [ownName], querySelectorAll: selector => selector === "span[title]" ? [own] : selector === "span" ? [forward] : [] };
  const window = { top: null, setTimeout(fn, ms) { state.now += ms; state.onDelay(); fn(); },
    location: { origin: "https://example.edupage.org", href: "https://example.edupage.org/dashboard/eb.php?mode=timetable", search: "?mode=timetable" } };
  window.top = window;
  const context = { window, Date: ClockDate, Math, Promise, URLSearchParams,
    document: { body: {}, querySelectorAll: selector => selector === ".print-nobreak" ? [state.grid] : [],
      querySelector: selector => selector === "#fitheight" ? { firstElementChild: navigation } : null },
    chrome: { runtime: { sendMessage() {}, onMessage: { addListener(fn) { state.listener = fn; } } } }, __EE_TEST__: true };
  context.globalThis = context;
  for (const file of ["scripts/lib/ee-common.js", "scripts/lib/ee-timetable-comparison.js", "scripts/timetable-sync.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(rootPath, file), "utf8"), context, { filename: file });
  }
  return { state, api: context.__eeTestExports };
}

module.exports = { gridFixture, syncFixture };
