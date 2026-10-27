const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(ROOT, "scripts/activity-shield-main.js"), "utf8");
const bridgeSource = fs.readFileSync(path.join(ROOT, "scripts/activity-shield-bridge.js"), "utf8");

function createPage({ prefs = {}, bridgeFirst = false, navigation = true, deferStorage = false, body = true, child = false } = {}) {
  let now = 0;
  let timerId = 0;
  let frameId = 0;
  let hidden = false;
  const timers = new Map();
  const nativeFrames = new Map();
  const canceledFrames = [];
  const storageReads = [];
  const storageListeners = [];
  const stored = { ...prefs };
  const errors = [];
  const channels = [];
  const nodes = new Map();

  function setTimeout(fn, delay = 0) {
    const id = ++timerId;
    timers.set(id, { fn, due: now + delay });
    return id;
  }

  function advance(duration = 0) {
    const end = now + duration;
    let count = 0;
    while (true) {
      const next = [...timers].filter(([, item]) => item.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(++count < 2000, "timer work must be bounded");
      now = next[1].due;
      timers.delete(next[0]);
      if (next[1].interval) timers.set(next[0], { ...next[1], due: now + next[1].interval });
      next[1].fn();
    }
    now = end;
  }

  class Event {
    constructor(type, options = {}) {
      this.type = type;
      this.cancelable = options.cancelable === true;
      this.bubbles = options.bubbles === true;
      this.defaultPrevented = false;
      Object.assign(this, options);
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this.stopped = true; }
    stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; }
    composedPath() { return this.path || []; }
  }
  class KeyboardEvent extends Event {}
  class Target {
    constructor(parent = null) { this.parent = parent; this.listeners = new Map(); }
    addEventListener(type, handler, options) {
      const capture = options === true || options?.capture === true;
      const list = this.listeners.get(type) || [];
      if (!list.some((item) => item.handler === handler && item.capture === capture)) list.push({ handler, capture, once: options?.once });
      this.listeners.set(type, list);
    }
    removeEventListener(type, handler, options) {
      const capture = options === true || options?.capture === true;
      this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item.handler !== handler || item.capture !== capture));
    }
    dispatchEvent(event) {
      event.target = this;
      const ancestors = [];
      for (let ancestor = this.parent; ancestor; ancestor = ancestor.parent) ancestors.push(ancestor);
      event.path = [this, ...ancestors];
      const invoke = (target, capture) => {
        event.currentTarget = target;
        for (const item of [...(target.listeners.get(event.type) || [])]) {
          if (item.capture !== capture) continue;
          if (item.once) target.removeEventListener(event.type, item.handler, item.capture);
          item.handler.call(target, event);
          if (event.immediateStopped) break;
        }
      };
      for (const ancestor of ancestors.reverse()) {
        invoke(ancestor, true);
        if (event.stopped) return !event.defaultPrevented;
      }
      invoke(this, true);
      if (!event.immediateStopped) invoke(this, false);
      if (event.bubbles && !event.stopped) {
        for (const ancestor of ancestors.reverse()) {
          invoke(ancestor, false);
          if (event.stopped) break;
        }
      }
      return !event.defaultPrevented;
    }
    listenerCount(type) { return (this.listeners.get(type) || []).length; }
  }
  class Element extends Target {
    constructor(tagName) { super(); this.tagName = tagName.toUpperCase(); this.dataset = {}; this.style = {}; this.children = []; }
    append(node) { node.parent = this; this.children.push(node); if (node.id) nodes.set(node.id, node); }
    remove() { nodes.delete(this.id); if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
    setAttribute(name, value) { this[name] = String(value); }
    matches() { return false; }
    closest() { return null; }
  }
  class Document extends Target {
    get hidden() { return hidden; }
    get visibilityState() { return hidden ? "hidden" : "visible"; }
    hasFocus() { return !hidden; }
    getElementById(id) { return nodes.get(id) || null; }
    createElement(tag) { return new Element(tag); }
  }
  class Port {
    postMessage(data) {
      setTimeout(() => { if (!this.closed && !this.other.closed) this.other.onmessage?.({ data }); });
    }
    close() { this.closed = true; }
  }
  class MessageChannel {
    constructor() {
      this.port1 = new Port(); this.port2 = new Port();
      this.port1.other = this.port2; this.port2.other = this.port1;
      channels.push(this);
    }
  }

  const window = new Target();
  window.window = window;
  window.top = child ? {} : window;
  window.navigation = navigation ? new Target() : undefined;
  window.requestAnimationFrame = (callback) => {
    if (typeof callback !== "function") throw new TypeError("callback required");
    const id = ++frameId;
    nativeFrames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => { nativeFrames.delete(Number(id)); canceledFrames.push(Number(id)); };
  window.reportError = (error) => errors.push(error);
  window.postMessage = (data, _origin, ports = []) => setTimeout(() => window.dispatchEvent(new Event("message", { source: window, data, ports })));
  window.open = () => {};
  const document = new Document(window);
  document.documentElement = new Element("html");
  document.documentElement.parent = document;
  document.body = body ? new Element("body") : null;
  if (document.body) document.documentElement.append(document.body);
  const chrome = {
    runtime: { getURL: (value) => `chrome-extension://test/${value}` },
    i18n: { getMessage: (key) => key },
    storage: {
      local: {
        get(defaults, callback) {
          const result = { ...defaults, ...stored };
          if (deferStorage) storageReads.push(() => callback(result));
          else setTimeout(() => callback(result));
        },
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
  };
  const context = vm.createContext({ window, document, Document, Element, Event, KeyboardEvent, MessageChannel, chrome,
    console, setTimeout, clearTimeout: (id) => timers.delete(id),
    setInterval(fn, interval) { const id = setTimeout(fn, interval); timers.get(id).interval = interval; return id; },
    clearInterval: (id) => timers.delete(id), performance: { now: () => now } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../scripts/lib/ee-common.js"), "utf8"), context);
  const scripts = bridgeFirst ? [bridgeSource, mainSource] : [mainSource, bridgeSource];
  for (const source of scripts) vm.runInContext(source, context);
  advance();

  return {
    window, document, Event, Element, nativeFrames, canceledFrames, timers, storageReads, errors, channels, advance,
    setPrefs(changes) {
      Object.assign(stored, changes);
      for (const listener of storageListeners) listener(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, { newValue: value }])), "local");
      advance();
    },
    setHidden(value) { hidden = value; document.dispatchEvent(new Event("visibilitychange")); },
    runNativeFrame(timestamp = now) {
      const pending = [...nativeFrames];
      for (const [id, fn] of pending) if (nativeFrames.delete(id)) fn(timestamp);
    },
    navigation(type) {
      window.navigation?.dispatchEvent(new Event("navigate", { navigationType: type, destination: { url: "https://example.edupage.org/" } }));
    },
  };
}

function addJquery(page) {
  const events = new WeakMap();
  const jq = (element) => ({
    on(types, handler) {
      for (const type of types.split(/\s+/)) {
        const [base, ...namespaces] = type.split(".");
        const stored = events.get(element) || {};
        const list = stored[base] || [];
        handler.guid ||= jq.guid++;
        list.push({ handler, namespace: namespaces.sort().join(".") });
        stored[base] = list;
        events.set(element, stored);
      }
      return this;
    },
    off(type, handler) {
      const [base, ...namespaces] = type.split(".");
      const stored = events.get(element) || {};
      for (const name of Object.keys(stored)) {
        if (base && name !== base) continue;
        stored[name] = stored[name].filter((item) => {
          const matchesNamespace = namespaces.every((namespace) => item.namespace.split(".").includes(namespace));
          const matchesHandler = !handler || item.handler.guid === handler.guid;
          return !matchesNamespace || !matchesHandler;
        });
      }
      return this;
    },
    trigger(type, ...args) { return jq.event.dispatch.call(element, { type }, ...args); },
  });
  jq.fn = { off() {} };
  jq.guid = 1;
  jq._data = (element, key) => key === "events" ? events.get(element) : undefined;
  jq.event = {
    dispatch(event, ...args) {
      let result;
      for (const item of [...(events.get(this)?.[event.type] || [])]) result = item.handler.call(this, event, ...args);
      return result;
    },
  };
  page.window.jQuery = jq;
  return jq;
}

for (const bridgeFirst of [false, true]) {
  test(`preference channel connects in either script order (bridge first: ${bridgeFirst})`, () => {
    const page = createPage({ bridgeFirst, prefs: { eeActivityShieldEnabled: true } });
    page.setHidden(true);
    assert.equal(page.document.hidden, false);
    assert.equal(page.document.visibilityState, "visible");
    assert.equal(page.document.getElementById("ee-activity-shield-port"), null);
    assert.equal(page.window.listenerCount("message"), 0, "bootstrap listeners are removed after connection");
    page.setPrefs({ eeActivityShieldEnabled: false });
    assert.equal(page.document.hidden, true);
    assert.equal(page.document.visibilityState, "hidden");
    assert.equal(page.timers.size, 0, "disabling clears discovery timers");
  });
}

test("default off performs no polling, preserves jQuery, and ignores DOM and broadcast preference tampering", () => {
  const page = createPage();
  assert.equal(page.timers.size, 0);
  const jq = addJquery(page);
  const originalDispatch = jq.event.dispatch;
  let calls = 0;
  jq(page.window).on("enterBackgroundHandler.etestplayeral", () => ++calls);
  assert.equal(jq(page.window).trigger("enterBackgroundHandler"), 1);
  assert.equal(jq.event.dispatch, originalDispatch);
  page.setHidden(true);
  const fakePort = page.document.createElement("span");
  fakePort.id = "ee-activity-shield-port";
  Object.assign(fakePort.dataset, { enabled: "true", hidden: "true" });
  page.document.body.append(fakePort);
  page.window.postMessage({ type: "preferences", revision: 1000, preferences: { enabled: true, hidden: true } }, "*");
  page.window.postMessage({ type: "ee-activity-shield-connect" }, "*");
  page.advance();
  assert.equal(page.document.hidden, true);
  assert.equal(page.timers.size, 0);
  page.setPrefs({ eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: false });
  fakePort.dataset.enabled = "false";
  page.window.postMessage({ type: "preferences", revision: 1001, preferences: { enabled: false } }, "*");
  page.advance();
  assert.equal(page.document.hidden, false, "DOM edits and public messages cannot disable a connected shield");
});

test("stale storage callbacks and stale preference revisions cannot restore old settings", () => {
  const page = createPage({ deferStorage: true, prefs: { eeActivityShieldEnabled: false } });
  page.setPrefs({ eeActivityShieldEnabled: true });
  page.storageReads[1](); page.advance();
  page.setHidden(true);
  assert.equal(page.document.hidden, false);
  page.storageReads[0](); page.advance();
  assert.equal(page.document.hidden, false);
  page.setPrefs({ eeActivityShieldEnabled: false });
  page.storageReads[2](); page.advance();
  page.channels[0].port1.postMessage({ type: "preferences", revision: 1, preferences: { enabled: true, hidden: true } });
  page.advance();
  assert.equal(page.document.hidden, true);
});

test("jQuery sweep removes exact player namespaces without wrapping APIs or restoring deleted handlers", () => {
  const page = createPage();
  const jq = addJquery(page);
  const originalDispatch = jq.event.dispatch;
  const calls = [];
  const oldHandler = function (_event, value) { assert.equal(this, page.window); calls.push(`old:${value}`); return 42; };
  const newHandler = () => calls.push("new");
  jq(page.window).on("activity.etestplayeral", oldHandler);
  jq(page.window).on("activity.etestplayeralias activity.other", () => calls.push("ordinary"));
  jq(page.document).on("activity.extra.etestaplayer", () => calls.push("document"));
  page.setPrefs({ eeActivityShieldEnabled: true });
  assert.equal(jq.event.dispatch, originalDispatch);
  assert.equal(jq._data(page.window, "events").activity.length, 2);
  assert.equal(jq._data(page.document, "events").activity.length, 0);
  jq(page.window).on("activity.etestaplayer", newHandler);
  assert.equal(jq._data(page.window, "events").activity.length, 3, "late registrations are removed on the next sweep");
  page.advance(500);
  jq(page.window).trigger("activity", "on");
  assert.deepEqual(calls, ["ordinary", "ordinary"]);
  assert.equal(jq._data(page.window, "events").activity.length, 2);
  page.setPrefs({ eeActivityShieldEnabled: false });
  jq(page.window).trigger("activity", "off");
  assert.deepEqual(calls.slice(2), ["ordinary", "ordinary"], "deleted handlers intentionally stay deleted");
  assert.equal(page.timers.size, 0);
  jq(page.window).on("activity.etestplayeral", oldHandler);
  page.advance(1000);
  jq(page.window).trigger("activity", "fresh-off");
  assert.deepEqual(calls.slice(-3), ["ordinary", "ordinary", "old:fresh-off"]);
  page.setPrefs({ eeActivityShieldEnabled: true });
  jq(page.window).trigger("activity", "again");
  assert.deepEqual(calls.slice(-2), ["ordinary", "ordinary"]);
  page.setPrefs({ eeActivityShieldJquerySweep: false });
  jq(page.window).on("activity.etestaplayer", newHandler);
  page.advance(1000);
  jq(page.window).trigger("activity", "individual-off");
  assert.deepEqual(calls.slice(-3), ["ordinary", "ordinary", "new"]);
  assert.equal(jq._data(page.window, "events").activity.length, 3);
  assert.equal(page.timers.size, 0);
  page.setPrefs({ eeActivityShieldJquerySweep: true });
  assert.equal(jq._data(page.window, "events").activity.length, 2);
});

test("jQuery sweep runs only while active and finds late libraries on script load or its next tick", () => {
  const page = createPage({ prefs: { eeActivityShieldEnabled: true } });
  assert.equal(page.timers.size, 1);
  page.advance(12000);
  assert.equal(page.timers.size, 1, "the requested sweep remains active while enabled");
  const jq = addJquery(page);
  let calls = 0;
  jq(page.document).on("activity.etestplayeral", () => ++calls);
  const script = page.document.createElement("script");
  page.document.body.append(script);
  script.dispatchEvent(new page.Event("load"));
  jq(page.document).trigger("activity");
  assert.equal(calls, 0);
  jq(page.document).on("activity.etestplayeral", () => ++calls);
  page.advance(500);
  jq(page.document).trigger("activity");
  assert.equal(calls, 0);
  page.setPrefs({ eeActivityShieldEnabled: false });
  jq(page.document).trigger("activity");
  assert.equal(calls, 0, "disabling does not recreate removed listeners");
  jq(page.document).on("activity.etestplayeral", () => ++calls);
  page.advance(1000);
  jq(page.document).trigger("activity");
  assert.equal(calls, 1, "new registrations are untouched while disabled");
  assert.equal(page.timers.size, 0);
});

for (const navigation of [false, true]) {
  test(`hidden reload protection arms before suppression and cleans up when disabled (navigation: ${navigation})`, () => {
    const page = createPage({ navigation, prefs: { eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: false } });
    let leaked = 0;
    page.document.addEventListener("visibilitychange", () => ++leaked);
    page.setHidden(true);
    assert.equal(leaked, 0);
    assert.equal(page.window.listenerCount("beforeunload"), 1);
    page.navigation("reload");
    let event = new page.Event("beforeunload", { cancelable: true });
    page.window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    if (navigation) {
      page.navigation("push");
      event = new page.Event("beforeunload", { cancelable: true });
      page.window.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false, "a canceled reload must not affect the next non-reload navigation");
    }
    page.setPrefs({ eeActivityShieldRedirect: false });
    assert.equal(page.window.listenerCount("beforeunload"), 0);
    page.setPrefs({ eeActivityShieldRedirect: true });
    assert.equal(page.window.listenerCount("beforeunload"), 1, "enabling while already hidden arms immediately");
    page.setPrefs({ eeActivityShieldEnabled: false });
    assert.equal(page.window.listenerCount("beforeunload"), 0);
    event = new page.Event("beforeunload", { cancelable: true });
    page.window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  });
}

test("visible pending animation loops migrate into and out of the hidden scheduler", () => {
  const page = createPage({ prefs: { eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: false } });
  const calls = [];
  const tick = function (timestamp) { assert.equal(this, page.window); calls.push(timestamp); page.window.requestAnimationFrame(tick); };
  const originalId = page.window.requestAnimationFrame(tick);
  assert.equal(page.nativeFrames.size, 1);
  page.setHidden(true);
  assert.deepEqual(page.canceledFrames, [originalId]);
  assert.equal(page.nativeFrames.size, 0);
  page.advance(16);
  assert.deepEqual(calls, [16]);
  page.setHidden(false);
  assert.equal(page.timers.size, 0);
  assert.equal(page.nativeFrames.size, 1);
  page.runNativeFrame(30);
  assert.deepEqual(calls, [16, 30]);
  assert.equal(page.nativeFrames.size, 1, "the loop continues through the visibility transition");
});

test("frame handles remain cancelable after migration, disable, and visibility changes", () => {
  const page = createPage({ prefs: { eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: false } });
  let calls = 0;
  const visible = page.window.requestAnimationFrame(() => ++calls);
  page.setHidden(true);
  page.window.cancelAnimationFrame(visible);
  page.advance(32);
  assert.equal(calls, 0);
  const hidden = page.window.requestAnimationFrame(() => ++calls);
  page.setPrefs({ eeActivityShieldAnimationFrame: false });
  assert.equal(page.timers.size, 0);
  assert.equal(page.nativeFrames.size, 1);
  page.window.cancelAnimationFrame(hidden);
  page.runNativeFrame();
  assert.equal(calls, 0);
  page.setPrefs({ eeActivityShieldAnimationFrame: true });
  const migrated = page.window.requestAnimationFrame(() => ++calls);
  page.setHidden(false);
  page.window.cancelAnimationFrame(String(migrated));
  page.runNativeFrame();
  assert.equal(calls, 0);
});

test("hidden callbacks share a frame timestamp, honor cancellation within a batch, and isolate errors", () => {
  const page = createPage({ prefs: { eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: false } });
  page.setHidden(true);
  const calls = [];
  let canceled;
  page.window.requestAnimationFrame((time) => { calls.push(time); page.window.cancelAnimationFrame(canceled); });
  canceled = page.window.requestAnimationFrame(() => calls.push("canceled"));
  page.window.requestAnimationFrame(() => { throw new Error("frame failed"); });
  page.window.requestAnimationFrame((time) => calls.push(time));
  assert.equal(page.timers.size, 1);
  page.advance(16);
  assert.deepEqual(calls, [16, 16]);
  assert.equal(page.errors.length, 1);
  assert.equal(page.timers.size, 0);
});

test("pending frames created while off migrate when the feature is enabled in a hidden page", () => {
  const page = createPage();
  let calls = 0;
  page.window.requestAnimationFrame(() => ++calls);
  page.setHidden(true);
  page.setPrefs({ eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: false });
  page.advance(16);
  assert.equal(calls, 1);
  assert.equal(page.nativeFrames.size, 0);
  assert.equal(page.timers.size, 0);
});

test("status indicator is opt-in, waits for a body, and appears only in the top frame", () => {
  const page = createPage({ body: false, prefs: { eeActivityShieldVisualIndicator: true } });
  assert.equal(page.document.getElementById("ee-activity-shield-indicator"), null);
  page.document.body = page.document.createElement("body");
  page.document.documentElement.append(page.document.body);
  page.document.dispatchEvent(new page.Event("DOMContentLoaded"));
  assert.ok(page.document.getElementById("ee-activity-shield-indicator"));
  page.setPrefs({ eeActivityShieldVisualIndicator: false });
  assert.equal(page.document.getElementById("ee-activity-shield-indicator"), null);
  const child = createPage({ child: true, prefs: { eeActivityShieldVisualIndicator: true } });
  assert.equal(child.document.getElementById("ee-activity-shield-indicator"), null);
});
