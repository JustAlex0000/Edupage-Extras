const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const { chromium, firefox } = require("playwright");
const MAIN = fs.readFileSync(path.join(ROOT, "scripts/activity-shield-main.js"), "utf8");
const BRIDGE = fs.readFileSync(path.join(ROOT, "scripts/activity-shield-bridge.js"), "utf8");
const JQUERY = fs.readFileSync(require.resolve("jquery/dist/jquery.js"), "utf8");
const ORIGIN = "https://activity-audit.edupage.org";

const waitFor = (page, predicate, argument) => page.waitForFunction(predicate, argument, { polling: 10, timeout: 5000 });

async function fixture(context, { navigation = true, bridgeFirst = false, modeled = true, existingPage = null } = {}) {
  const page = existingPage || await context.newPage();
  await page.goto(`${ORIGIN}/synthetic`);
  await page.addScriptTag({ content: JQUERY });
  await page.evaluate(({ navigation, modeled }) => {
    const state = window.activityAudit = {
      now: 0, hidden: false, timerId: 0, frameId: 0, timers: new Map(), nativeFrames: new Map(),
      canceled: [], beforeUnload: new Set(), storageListeners: [], readyCalls: 0, nativeVisibilityEvents: 0,
      preferences: { eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: true },
    };
    const nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden").get;
    const nativeVisibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState").get;
    state.nativeHidden = () => nativeHidden.call(document);
    state.nativeVisibility = () => nativeVisibility.call(document);
    document.addEventListener("visibilitychange", () => state.nativeVisibilityEvents++, true);
    const add = window.addEventListener;
    const remove = window.removeEventListener;
    window.addEventListener = function (type, handler, options) {
      if (type === "beforeunload") state.beforeUnload.add(handler);
      return add.call(this, type, handler, options);
    };
    window.removeEventListener = function (type, handler, options) {
      if (type === "beforeunload") state.beforeUnload.delete(handler);
      return remove.call(this, type, handler, options);
    };
    if (modeled) {
      Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => state.hidden });
      Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => state.hidden ? "hidden" : "visible" });
      window.requestAnimationFrame = callback => {
        if (typeof callback !== "function") throw new TypeError("Callback required");
        const id = ++state.frameId;
        state.nativeFrames.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = id => { state.canceled.push(Number(id)); state.nativeFrames.delete(Number(id)); };
      window.setTimeout = (callback, delay = 0) => {
        const id = ++state.timerId;
        state.timers.set(id, { callback, due: state.now + Number(delay) });
        return id;
      };
      window.clearTimeout = id => state.timers.delete(Number(id));
      state.advance = duration => {
        const end = state.now + duration;
        let count = 0;
        while (true) {
          const next = [...state.timers].filter(([, timer]) => timer.due <= end)
            .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
          if (!next) break;
          if (++count > 1000) throw new Error("Unbounded synthetic timer work");
          state.now = next[1].due;
          state.timers.delete(next[0]);
          next[1].callback();
        }
        state.now = end;
      };
      state.flushNative = () => {
        const timestamp = performance.now();
        for (const [id, callback] of [...state.nativeFrames]) if (state.nativeFrames.delete(id)) callback(timestamp);
      };
      state.setHidden = hidden => {
        state.hidden = hidden;
        document.dispatchEvent(new Event("visibilitychange"));
      };
      const navigationTarget = navigation ? new EventTarget() : undefined;
      Object.defineProperty(window, "navigation", { configurable: true, value: navigationTarget });
      state.navigate = type => {
        if (!navigationTarget) return;
        const event = new Event("navigate");
        Object.defineProperties(event, { navigationType: { value: type }, destination: { value: { url: location.href } } });
        navigationTarget.dispatchEvent(event);
      };
    }
    const chrome = {
      runtime: { lastError: null, getURL: suffix => `${location.origin}/${suffix}` },
      i18n: { getMessage: key => key },
      storage: {
        local: { get(defaults, callback) { const preferences = { ...defaults, ...state.preferences }; queueMicrotask(() => callback(preferences)); } },
        onChanged: { addListener(callback) { state.storageListeners.push(callback); } },
      },
    };
    Object.defineProperty(window, "chrome", { configurable: true, value: chrome });
    state.setPrefs = changes => {
      Object.assign(state.preferences, changes);
      const event = Object.fromEntries(Object.entries(changes).map(([key, newValue]) => [key, { newValue }]));
      state.storageListeners.forEach(callback => callback(event, "local"));
    };
    state.gateBlocked = () => {
      const before = state.readyCalls;
      const probe = () => state.readyCalls++;
      jQuery(window).on("activityAuditReady.etestplayeral", probe);
      window.dispatchEvent(new Event("pageshow"));
      jQuery(window).trigger("activityAuditReady");
      jQuery(window).off("activityAuditReady.etestplayeral", probe);
      return state.readyCalls === before;
    };
    state.originalJqueryAdd = jQuery.event.add;
    state.originalJqueryDispatch = jQuery.event.dispatch;
  }, { navigation, modeled });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "scripts/lib/ee-common.js"), "utf8") });
  for (const content of bridgeFirst ? [BRIDGE, MAIN] : [MAIN, BRIDGE]) await page.addScriptTag({ content });
  await waitFor(page, () => activityAudit.gateBlocked());
  return page;
}

async function enabled(page, value) {
  await page.evaluate(next => activityAudit.setPrefs({ eeActivityShieldEnabled: next }), value);
  await waitFor(page, next => activityAudit.gateBlocked() === next, value);
}

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  test(`${name}: Activity Shield browser scheduling and real jQuery regressions`, { timeout: 60000 }, async t => {
    const browser = await engine.launch({
      headless: process.env.EE_HEADED_BROWSER_TESTS !== "1",
      ...(name === "firefox" ? { firefoxUserPrefs: { "focusmanager.testmode": false } } : {}),
    });
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route(`${ORIGIN}/**`, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head></head><body><main>Synthetic activity fixture</main></body></html>" }));
    t.after(() => browser.close());

    await t.test("visible pending RAF migrates while hidden and its original handle still cancels", async () => {
      const page = await fixture(context);
      try {
        const result = await page.evaluate(() => {
          const state = activityAudit;
          state.calls = 0;
          const original = requestAnimationFrame(() => state.calls++);
          state.setHidden(true);
          const migrated = state.nativeFrames.size === 0 && state.canceled.includes(original);
          cancelAnimationFrame(original);
          state.advance(48);
          return { migrated, calls: state.calls, native: state.nativeFrames.size, timers: state.timers.size, hidden: document.hidden };
        });
        assert.deepEqual(result, { migrated: true, calls: 0, native: 0, timers: 0, hidden: false });
      } finally { await page.close(); }
    });

    await t.test("hidden RAF handles survive visible migration and disabling the scheduler", async () => {
      const page = await fixture(context, { bridgeFirst: true });
      try {
        const visibleMigration = await page.evaluate(() => {
          const state = activityAudit;
          state.calls = 0;
          state.setHidden(true);
          const handle = requestAnimationFrame(() => state.calls++);
          state.setHidden(false);
          const queued = state.nativeFrames.size;
          cancelAnimationFrame(String(handle));
          state.flushNative();
          return { queued, calls: state.calls, timers: state.timers.size, native: state.nativeFrames.size };
        });
        assert.deepEqual(visibleMigration, { queued: 1, calls: 0, timers: 0, native: 0 });
        await page.evaluate(() => {
          activityAudit.setHidden(true);
          activityAudit.handle = requestAnimationFrame(() => activityAudit.calls++);
          activityAudit.setPrefs({ eeActivityShieldAnimationFrame: false });
        });
        await waitFor(page, () => activityAudit.nativeFrames.size === 1 && activityAudit.timers.size === 0);
        assert.deepEqual(await page.evaluate(() => {
          cancelAnimationFrame(activityAudit.handle);
          activityAudit.flushNative();
          return { calls: activityAudit.calls, native: activityAudit.nativeFrames.size };
        }), { calls: 0, native: 0 });
        await page.evaluate(() => activityAudit.setPrefs({ eeActivityShieldAnimationFrame: true }));
        await waitFor(page, () => {
          const handle = requestAnimationFrame(() => {});
          const synthetic = handle < 0;
          cancelAnimationFrame(handle);
          return synthetic;
        });
        await page.evaluate(() => { activityAudit.handle = requestAnimationFrame(() => activityAudit.calls++); });
        await enabled(page, false);
        assert.deepEqual(await page.evaluate(() => {
          const queued = activityAudit.nativeFrames.size;
          cancelAnimationFrame(activityAudit.handle);
          activityAudit.flushNative();
          return { queued, calls: activityAudit.calls, native: activityAudit.nativeFrames.size, timers: activityAudit.timers.size, hidden: document.hidden };
        }), { queued: 1, calls: 0, native: 0, timers: 0, hidden: true });
      } finally { await page.close(); }
    });

    await t.test("recursive hidden frames share batch timestamps and defer newly requested callbacks", async () => {
      const page = await fixture(context);
      try {
        const result = await page.evaluate(() => {
          const state = activityAudit;
          state.setHidden(true);
          const calls = [];
          const loop = name => function tick(timestamp) {
            calls.push({ name, timestamp });
            if (calls.filter(call => call.name === name).length < 3) requestAnimationFrame(tick);
          };
          requestAnimationFrame(loop("a"));
          requestAnimationFrame(loop("b"));
          state.advance(48);
          const batching = calls.every((call, index) => index % 2 || call.timestamp === calls[index + 1].timestamp);
          const canceled = [];
          let second;
          requestAnimationFrame(() => { canceled.push("first"); cancelAnimationFrame(second); requestAnimationFrame(() => canceled.push("new")); });
          second = requestAnimationFrame(() => canceled.push("canceled"));
          state.advance(16);
          const firstBatch = [...canceled];
          state.advance(16);
          return { names: calls.map(call => call.name), batching, firstBatch, finalBatch: canceled, native: state.nativeFrames.size, timers: state.timers.size };
        });
        assert.deepEqual(result, { names: ["a", "b", "a", "b", "a", "b"], batching: true, firstBatch: ["first"], finalBatch: ["first", "new"], native: 0, timers: 0 });
      } finally { await page.close(); }
    });

    for (const navigation of [false, true]) {
      await t.test(`redirect capture ordering and listener cleanup (Navigation API: ${navigation})`, async () => {
        const page = await fixture(context, { navigation });
        try {
          const result = await page.evaluate(() => {
            const state = activityAudit;
            state.leakedVisibility = 0;
            document.addEventListener("visibilitychange", () => state.leakedVisibility++);
            state.setHidden(true);
            state.navigate("reload");
            const reload = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(reload);
            state.navigate("push");
            const other = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(other);
            return { leaked: state.leakedVisibility, listeners: state.beforeUnload.size, reload: reload.defaultPrevented, other: other.defaultPrevented };
          });
          assert.deepEqual(result, { leaked: 0, listeners: 1, reload: true, other: !navigation });
          await page.evaluate(() => activityAudit.setPrefs({ eeActivityShieldRedirect: false }));
          await waitFor(page, () => activityAudit.beforeUnload.size === 0);
          await page.evaluate(() => activityAudit.setPrefs({ eeActivityShieldRedirect: true }));
          await waitFor(page, () => activityAudit.beforeUnload.size === 1);
          await enabled(page, false);
          assert.equal(await page.evaluate(() => activityAudit.beforeUnload.size), 0);
          assert.equal(await page.evaluate(() => {
            const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
          }), false);
        } finally { await page.close(); }
      });
    }

    await t.test("jQuery 3.7.1 removes exact scoped namespaces and never restores deleted handlers", async () => {
      const page = await fixture(context);
      try {
        assert.equal(await page.evaluate(() => jQuery.fn.jquery), "3.7.1");
        await enabled(page, false);
        await page.evaluate(() => {
          const state = activityAudit;
          state.calls = { window: 0, document: 0, one: 0, ordinary: 0, lookalike: 0, element: 0, late: 0, freshOne: 0, freshDocument: 0, removed: 0 };
          state.depth = 0;
          state.element = document.createElement("div");
          document.body.append(state.element);
          jQuery(window).on("auditSweep.etestplayeral", () => state.calls.window++);
          jQuery(document).on("auditSweep.etestaplayer", () => state.calls.document++);
          jQuery(window).one("auditOne.etestplayeral", () => state.calls.one++);
          jQuery(window).on("auditSweep.ordinary", () => {
            state.calls.ordinary++;
            if (!state.depth) { state.depth++; jQuery(window).triggerHandler("auditSweep"); state.depth--; }
          });
          jQuery(window).on("auditSweep.etestplayeralExtra", () => state.calls.lookalike++);
          jQuery(state.element).on("auditSweep.etestplayeral", () => state.calls.element++);
        });
        await enabled(page, true);
        const active = await page.evaluate(() => {
          const state = activityAudit;
          const scoped = [window, document].flatMap(target => Object.values(jQuery._data(target, "events") || {}).flat());
          const exactRemaining = scoped.filter(handle => handle.namespace.split(".").some(name => name === "etestplayeral" || name === "etestaplayer")).length;
          jQuery(window).trigger("auditOne");
          jQuery(window).triggerHandler("auditSweep");
          jQuery(document).triggerHandler("auditSweep");
          jQuery(state.element).triggerHandler("auditSweep");
          state.lateHandler = () => state.calls.late++;
          jQuery(window).on("auditLater.etestaplayer auditLater.ordinary auditLater.etestplayeralExtra", state.lateHandler);
          jQuery(document).one("auditDocOne.etestplayeral", () => state.calls.one++);
          return { ...state.calls, exactRemaining,
            addUnchanged: jQuery.event.add === state.originalJqueryAdd,
            dispatchUnchanged: jQuery.event.dispatch === state.originalJqueryDispatch,
            laterRegistered: jQuery._data(window, "events").auditLater.some(handle => handle.namespace === "etestaplayer"),
            lateOneRegistered: Boolean(jQuery._data(document, "events")?.auditDocOne),
            oneDeleted: !jQuery._data(window, "events").auditOne,
          };
        });
        assert.deepEqual(active, { window: 0, document: 0, one: 0, ordinary: 2, lookalike: 2, element: 1, late: 0,
          freshOne: 0, freshDocument: 0, removed: 0, exactRemaining: 0,
          addUnchanged: true, dispatchUnchanged: true, laterRegistered: true, lateOneRegistered: true, oneDeleted: true });
        await waitFor(page, () => !(jQuery._data(window, "events")?.auditLater || []).some(handle => handle.namespace === "etestaplayer")
          && !jQuery._data(document, "events")?.auditDocOne);
        assert.deepEqual(await page.evaluate(() => {
          const state = activityAudit;
          const laterNamespaces = (jQuery._data(window, "events").auditLater || []).map(handle => handle.namespace).sort();
          jQuery(window).triggerHandler("auditLater");
          jQuery(window).off("auditLater", state.lateHandler);
          jQuery(window).triggerHandler("auditLater");
          jQuery(document).triggerHandler("auditDocOne");
          return { late: state.calls.late, one: state.calls.one, laterNamespaces };
        }), { late: 2, one: 0, laterNamespaces: ["etestplayeralExtra", "ordinary"] });
        await enabled(page, false);
        assert.deepEqual(await page.evaluate(() => {
          const state = activityAudit;
          jQuery(window).trigger("auditOne");
          jQuery(window).triggerHandler("auditSweep"); jQuery(document).triggerHandler("auditSweep");
          jQuery(window).one("auditFresh.etestplayeral", () => state.calls.freshOne++);
          jQuery(document).on("auditFresh.etestaplayer", () => state.calls.freshDocument++);
          const removed = () => state.calls.removed++;
          jQuery(window).on("auditFreshRemove.etestplayeral", removed);
          jQuery(window).off("auditFreshRemove", removed);
          jQuery(window).triggerHandler("auditFreshRemove");
          jQuery(window).triggerHandler("auditFresh"); jQuery(window).triggerHandler("auditFresh");
          jQuery(document).triggerHandler("auditFresh");
          return { ...state.calls };
        }), { window: 0, document: 0, one: 0, ordinary: 4, lookalike: 4, element: 1, late: 2, freshOne: 1, freshDocument: 1, removed: 0 });
        await enabled(page, true);
        assert.equal(await page.evaluate(() => Boolean(jQuery._data(document, "events")?.auditFresh)), false);
        await enabled(page, false);
        assert.equal(await page.evaluate(() => { jQuery(document).triggerHandler("auditFresh"); return activityAudit.calls.freshDocument; }), 1);
      } finally { await page.close(); }
    });

    await t.test("real native visibility and pending frames between browser tabs when supported", async visibilityTest => {
      const first = await fixture(context, { modeled: false });
      const popup = first.waitForEvent("popup");
      await first.evaluate(url => window.open(url, "_blank"), `${ORIGIN}/synthetic`);
      const second = await fixture(context, { modeled: false, existingPage: await popup });
      try {
        if (name === "chromium") {
          for (const page of [first, second]) {
            const client = await context.newCDPSession(page);
            await client.send("Emulation.setFocusEmulationEnabled", { enabled: false });
          }
        }
        await first.bringToFront();
        await first.evaluate(() => {
          activityAudit.liveFrameCount = 0;
          const tick = () => {
            activityAudit.liveFrameCount++;
            activityAudit.liveFrameHandle = requestAnimationFrame(tick);
          };
          activityAudit.liveFrameHandle = requestAnimationFrame(tick);
        });
        await waitFor(first, () => activityAudit.liveFrameCount >= 2);
        await second.bringToFront();
        const states = await Promise.all([first, second].map(page => page.evaluate(() => ({ hidden: activityAudit.nativeHidden(), state: activityAudit.nativeVisibility() }))));
        if (!states[0].hidden || states[1].hidden) {
          visibilityTest.diagnostic(`${name}: native tab states ${JSON.stringify(states)}`);
          visibilityTest.skip("This browser run does not expose an active/background native visibility transition.");
          return;
        }
        assert.equal(await first.evaluate(() => document.hidden), false);
        assert.equal(await first.evaluate(() => document.visibilityState), "visible");
        const hiddenFrames = await first.evaluate(() => activityAudit.liveFrameCount);
        await waitFor(first, previous => activityAudit.liveFrameCount > previous, hiddenFrames);
        await enabled(first, false);
        await first.evaluate(() => cancelAnimationFrame(activityAudit.liveFrameHandle));
        const canceledFrames = await first.evaluate(() => activityAudit.liveFrameCount);
        assert.equal(await first.evaluate(() => document.hidden), true);
        assert.equal(await first.evaluate(() => document.visibilityState), "hidden");
        await first.bringToFront();
        await waitFor(first, () => activityAudit.nativeHidden() === false);
        assert.equal(await first.evaluate(() => document.hidden), false);
        assert.ok(await first.evaluate(() => activityAudit.nativeVisibilityEvents > 0));
        await first.waitForTimeout(100);
        assert.equal(await first.evaluate(() => activityAudit.liveFrameCount), canceledFrames);
      } finally { await first.close(); await second.close(); }
    });
    t.diagnostic(`${name}: ${browser.version()}, actual MessageChannel and jQuery 3.7.1 with source-injected shield`);
  });
}
