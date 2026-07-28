const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "ua-ios-fix.js"),
  "utf8",
);

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function createHarness({ pathname = "/app/main", nativeBridge = false } = {}) {
  class FakeEventTarget {
    constructor() {
      this.listeners = new Map();
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    dispatch(type) {
      for (const listener of this.listeners.get(type) || []) listener.call(this);
    }
  }

  class FakeScript extends FakeEventTarget {
    constructor(src) {
      super();
      this.src = src;
    }

    querySelectorAll() {
      return [];
    }
  }

  class FakeNavigator {}
  Object.defineProperties(FakeNavigator.prototype, {
    userAgent: { configurable: true, get: () => IPHONE_UA },
    platform: { configurable: true, get: () => "iPhone" },
    vendor: { configurable: true, get: () => "Apple Computer, Inc." },
  });

  const edubar = new FakeScript("https://school.test/global/pics/js/edubarUtils.js");
  const inobounce = new FakeScript("https://school.test/app/pics/js/inobounce.js");
  const edupage = new FakeScript("https://school.test/app/pics/jsw/Edupage.js");
  const scripts = [edubar, inobounce, edupage];
  const document = new FakeEventTarget();
  document.querySelectorAll = () => scripts;
  const window = new FakeEventTarget();
  window.window = window;
  window.webkit = {
    messageHandlers: nativeBridge
      ? { NativePersistenceProvider: { postMessage() {} } }
      : {},
  };

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  const context = vm.createContext({
    console,
    document,
    HTMLScriptElement: FakeScript,
    location: { pathname },
    MutationObserver: FakeMutationObserver,
    navigator: new FakeNavigator(),
    Navigator: FakeNavigator,
    window,
  });
  window.document = document;
  window.location = context.location;
  window.navigator = context.navigator;

  vm.runInContext(SOURCE, context, { filename: "ua-ios-fix.js" });
  return { context, edubar, inobounce, edupage, window };
}

test("ordinary iOS browsers skip EduPage's native request transport", () => {
  const harness = createHarness();

  assert.equal(harness.window.webkit, undefined);
  assert.match(harness.context.navigator.userAgent, /Android 14/);
  assert.equal(harness.context.navigator.platform, "iPhone");
  assert.equal(harness.context.navigator.vendor, "Apple Computer, Inc.");

  harness.edupage.dispatch("load");
  assert.ok(harness.window.webkit);
  assert.deepEqual(harness.window.webkit.messageHandlers, {});
});

test("browser app mode disables native scheme fallback and iNoBounce", () => {
  const harness = createHarness();
  let nativeCalls = 0;
  let iNoBounceDisables = 0;
  harness.window.MobileAppBridge = {
    runFlexMethod() {
      nativeCalls += 1;
      return true;
    },
  };
  harness.window.iNoBounce = {
    disable() {
      iNoBounceDisables += 1;
    },
  };

  harness.edubar.dispatch("load");
  harness.inobounce.dispatch("load");

  assert.equal(harness.window.MobileAppBridge.runFlexMethod("playerRegistered", {}), false);
  assert.equal(nativeCalls, 0);
  assert.equal(iNoBounceDisables, 1);
});

test("the real EduPage native container keeps its WebKit bridge", () => {
  const harness = createHarness({ nativeBridge: true });

  assert.ok(harness.window.webkit);
  assert.ok(harness.window.webkit.messageHandlers.NativePersistenceProvider);
});

test("the compatibility bootstrap stays scoped to /app routes", () => {
  const harness = createHarness({ pathname: "/elearning/" });

  assert.ok(harness.window.webkit);
  assert.match(harness.context.navigator.userAgent, /iPhone/);
});
