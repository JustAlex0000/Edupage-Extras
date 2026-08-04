const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "ua-ios-fix.js"),
  "utf8",
);
const BOOTSTRAP_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "ua-ios-bootstrap.js"),
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
  window.self = window;
  window.top = window;
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

test("ordinary iOS browsers keep EduPage's native request transport disabled", () => {
  const harness = createHarness();

  assert.equal(harness.window.webkit, undefined);
  assert.match(harness.context.navigator.userAgent, /Android 14/);
  assert.equal(harness.context.navigator.platform, "iPhone");
  assert.equal(harness.context.navigator.vendor, "Apple Computer, Inc.");

  harness.edupage.dispatch("load");
  harness.window.dispatch("DOMContentLoaded");
  assert.equal(harness.window.webkit, undefined);
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
  assert.match(harness.context.navigator.userAgent, /iPhone/);
});

test("the compatibility bootstrap stays scoped to /app routes", () => {
  const harness = createHarness({ pathname: "/elearning/" });

  assert.ok(harness.window.webkit);
  assert.match(harness.context.navigator.userAgent, /iPhone/);
});

test("the compatibility script is idempotent when direct and injected copies run", () => {
  const harness = createHarness();

  vm.runInContext(SOURCE, harness.context, { filename: "ua-ios-fix.js" });
  assert.equal(harness.window.webkit, undefined);
  assert.match(harness.context.navigator.userAgent, /Android 14/);
});

function createBootstrapHarness({
  pathname = "/app/main",
  userAgent = IPHONE_UA,
  topFrame = true,
} = {}) {
  const inserted = [];
  const root = {
    prepend(node) {
      inserted.push(node);
    },
  };
  const document = {
    documentElement: root,
    createElement() {
      return {
        async: true,
        dataset: {},
        addEventListener() {},
        remove() {},
      };
    },
  };
  const window = {};
  window.self = window;
  window.top = topFrame ? window : {};

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  const context = vm.createContext({
    chrome: {
      runtime: {
        getURL(resource) {
          return `safari-web-extension://extension/${resource}`;
        },
      },
    },
    document,
    location: { pathname },
    MutationObserver: FakeMutationObserver,
    navigator: { userAgent },
    window,
  });
  window.document = document;
  window.location = context.location;
  window.navigator = context.navigator;

  vm.runInContext(BOOTSTRAP_SOURCE, context, { filename: "ua-ios-bootstrap.js" });
  return inserted;
}

test("isolated iOS bootstrap injects the compatibility script into the page", () => {
  const inserted = createBootstrapHarness();

  assert.equal(inserted.length, 1);
  assert.equal(
    inserted[0].src,
    "safari-web-extension://extension/scripts/ua-ios-fix.js",
  );
  assert.equal(inserted[0].async, false);
  assert.equal(inserted[0].dataset.eeIosMainBootstrap, "true");
});

test("isolated bootstrap avoids unrelated pages and subframes", () => {
  assert.equal(createBootstrapHarness({ pathname: "/elearning/" }).length, 0);
  assert.equal(createBootstrapHarness({ userAgent: "Mozilla/5.0 Android Mobile" }).length, 0);
  assert.equal(createBootstrapHarness({ topFrame: false }).length, 0);
});
