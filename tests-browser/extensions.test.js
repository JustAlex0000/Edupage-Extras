const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { chromium, firefox } = require("playwright");
const { createFirefoxPackageStaging, isShippableEntry } = require("../scripts-dev/package-policy");

const ROOT = path.resolve(__dirname, "..");
const ORIGIN = "https://audit.edupage.org";
const PRIVATE_TEXT = "SyntheticPrivateName";
const FIREFOX_CONTROL_FILE = "__audit_test_control__.js";
const JQUERY = fs.readFileSync(require.resolve("jquery/dist/jquery.js"), "utf8");
const FIXTURE = `<!doctype html><html><head><title>${PRIVATE_TEXT}</title>
<script>
window.auditMessages = [];
window.auditNativeStateEvents = 0;
window.addEventListener("message", event => {
  if (event.source === window && typeof event.data?.type === "string"
      && event.data.type.startsWith("ee-activity-shield")) {
    window.auditMessages.push(JSON.parse(JSON.stringify(event.data)));
  }
});
document.addEventListener("ee-activity-state", () => window.auditNativeStateEvents++, true);
</script>
<script src="${ORIGIN}/jquery.js"></script>
<script>
window.auditOriginalDispatch = jQuery.event.dispatch;
window.auditOriginalAdd = jQuery.event.add;
window.auditCalls = { player: 0, lookalike: 0, ordinary: 0, late: 0, afterOff: 0 };
window.auditDocumentCalls = { player: 0, lookalike: 0, ordinary: 0, late: 0, afterOff: 0 };
jQuery(window).on("enterBackgroundHandler.etestplayeral", () => window.auditCalls.player++);
jQuery(window).on("enterBackgroundHandler.etestplayeralExtra", () => window.auditCalls.lookalike++);
jQuery(window).on("enterBackgroundHandler", () => window.auditCalls.ordinary++);
jQuery(document).on("enterBackgroundHandler.etestaplayer", () => window.auditDocumentCalls.player++);
jQuery(document).on("enterBackgroundHandler.etestaplayerExtra", () => window.auditDocumentCalls.lookalike++);
jQuery(document).on("enterBackgroundHandler", () => window.auditDocumentCalls.ordinary++);
window.auditDispatch = () => {
  for (const key of Object.keys(window.auditCalls)) window.auditCalls[key] = 0;
  jQuery(window).trigger("enterBackgroundHandler");
  return { ...window.auditCalls };
};
window.auditDispatchDocument = () => {
  for (const key of Object.keys(window.auditDocumentCalls)) window.auditDocumentCalls[key] = 0;
  jQuery(document).triggerHandler("enterBackgroundHandler");
  return { ...window.auditDocumentCalls };
};
window.auditExactHandlerCounts = () => [window, document].map(target =>
  Object.values(jQuery._data(target, "events") || {}).flat().filter(handle =>
    handle.namespace.split(".").some(name => name === "etestplayeral" || name === "etestaplayer")
  ).length
);
</script></head><body><main id="maincontent">
<table class="znamkyTable ${PRIVATE_TEXT}" data-private-name="${PRIVATE_TEXT}">
<tbody><tr class="predmetRow" data-predmetid="${PRIVATE_TEXT}">
<td class="fixedCell"><b>${PRIVATE_TEXT}</b></td>
<td class="znPriemerCell">85.5 %</td>
<td><span data-ee-original-grade-title="${PRIVATE_TEXT}: individual plan 1"><span class="znZnamka">1</span></span></td>
</tr></tbody></table></main></body></html>`;

async function launchExtension(browserName) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `ee-${browserName}-extension-test-`));
  let staging;
  let context;
  let remote;
  let controlNonce;
  const cleanup = async () => {
    remote?.disconnect();
    await context?.close();
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  };
  try {
    let extensionOrigin;
    if (browserName === "chromium") {
      context = await chromium.launchPersistentContext(profile, {
        headless: true,
        channel: "chromium",
        ignoreDefaultArgs: ["--disable-extensions"],
        proxy: { server: "http://127.0.0.1:9" },
        args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
        timeout: 20_000,
      });
      const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
      extensionOrigin = `${new URL(worker.url()).protocol}//${new URL(worker.url()).host}`;
    } else {
      const { connectWithMaxRetries, findFreeTcpPort } = await import("../node_modules/web-ext/lib/firefox/remote.js");
      const port = await findFreeTcpPort();
      staging = createFirefoxPackageStaging("ee-firefox-extension-test-");
      assert.equal(fs.existsSync(path.join(ROOT, FIREFOX_CONTROL_FILE)), false);
      assert.equal(isShippableEntry(FIREFOX_CONTROL_FILE), false);
      assert.equal(staging.startsWith(`${ROOT}${path.sep}`), false);
      controlNonce = randomUUID();
      const manifestPath = path.join(staging, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      fs.writeFileSync(path.join(staging, FIREFOX_CONTROL_FILE), `
        (() => {
          const nonce = ${JSON.stringify(controlNonce)};
          window.addEventListener("message", (event) => {
            if (location.origin !== ${JSON.stringify(ORIGIN)} || event.source !== window
                || event.origin !== location.origin || event.data?.type !== "ee-audit-test-control"
                || event.data.nonce !== nonce) return;
            const { requestId, request } = event.data;
            const reply = (result) => {
              const error = chrome.runtime.lastError;
              window.postMessage({ type: "ee-audit-test-result", nonce, requestId,
                ok: !error, error: error?.message, result }, location.origin);
            };
            if (request?.action === "get-storage") chrome.storage.local.get(request.keys, reply);
            else if (request?.action === "set-storage") chrome.storage.local.set(request.values, () => reply(true));
            else if (request?.action === "diagnostics") {
              chrome.runtime.sendMessage({ type: "ee-collect-report", redact: request.redact }, reply);
            }
          });
        })();
      `);
      manifest.content_scripts.push({ matches: [`${ORIGIN}/*`], js: [FIREFOX_CONTROL_FILE], run_at: "document_start" });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      context = await firefox.launchPersistentContext(profile, {
        headless: true,
        proxy: { server: "http://127.0.0.1:9" },
        args: ["--start-debugger-server", String(port)],
        firefoxUserPrefs: {
          "devtools.debugger.remote-enabled": true,
          "devtools.chrome.enabled": true,
          "devtools.debugger.prompt-connection": false,
          "devtools.debugger.force-local": true,
        },
        timeout: 20_000,
      });
      remote = await connectWithMaxRetries({ port, maxRetries: 20, retryInterval: 100 });
      await remote.installTemporaryAddon(staging, false);
      const addon = await remote.getInstalledAddon(manifest.browser_specific_settings.gecko.id);
      assert.equal(addon.backgroundScriptStatus, "RUNNING");
      const manifestUrl = new URL(addon.manifestURL);
      extensionOrigin = `${manifestUrl.protocol}//${manifestUrl.host}`;
    }
    context.setDefaultTimeout(8_000);
    await context.route(`${ORIGIN}/**`, async (route) => {
      const jquery = new URL(route.request().url()).pathname === "/jquery.js";
      await route.fulfill({ contentType: jquery ? "text/javascript" : "text/html", body: jquery ? JQUERY : FIXTURE });
    });
    return { context, extensionOrigin, controlNonce, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function writeStorage(settings, values) {
  await settings.evaluate((next) => chrome.storage.local.set(next), values);
}

async function firefoxControl(page, nonce, request) {
  return page.evaluate(({ nonce, request }) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onResult);
      reject(new Error("The temporary Firefox test control did not respond within five seconds."));
    }, 5000);
    function onResult(event) {
      const response = event.data;
      if (event.source !== window || event.origin !== location.origin || response?.type !== "ee-audit-test-result"
          || response.nonce !== nonce || response.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onResult);
      if (response.ok) resolve(response.result);
      else reject(new Error(response.error || "The temporary Firefox test control failed."));
    }
    window.addEventListener("message", onResult);
    window.postMessage({ type: "ee-audit-test-control", nonce, requestId, request }, location.origin);
  }), { nonce, request });
}

async function waitForSweepRemoval(page) {
  await page.waitForFunction(() => window.auditExactHandlerCounts().every(count => count === 0));
}

for (const browserName of ["chromium", "firefox"]) {
  const coverage = browserName === "chromium"
    ? "actual extension storage, hard jQuery sweep toggles, and Settings diagnostics"
    : "actual temporary add-on storage, hard jQuery sweep toggles, and background diagnostics";
  test(`${browserName}: ${coverage}`, { timeout: 90_000 }, async (t) => {
    const { context, extensionOrigin, controlNonce, cleanup } = await launchExtension(browserName);
    try {
      const errors = [];
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${ORIGIN}/elearning/${PRIVATE_TEXT}`);
      await page.waitForFunction(() => typeof window.auditDispatch === "function");
      await page.waitForFunction(() => Object.hasOwn(document, "hidden"));
      const untouched = { player: 1, lookalike: 1, ordinary: 1, late: 0, afterOff: 0 };
      const removed = { player: 0, lookalike: 1, ordinary: 1, late: 0, afterOff: 0 };
      assert.deepEqual(await page.evaluate(() => window.auditDispatch()), untouched);
      assert.deepEqual(await page.evaluate(() => window.auditDispatchDocument()), untouched);
      assert.equal(await page.evaluate(() => jQuery.event.dispatch === window.auditOriginalDispatch), true);

      let settings;
      let readStorage;
      let saveStorage;
      let generateReport;
      if (browserName === "chromium") {
        settings = await context.newPage();
        settings.on("pageerror", (error) => errors.push(error.message));
        await settings.goto(`${extensionOrigin}/menu/settings.html`, { waitUntil: "domcontentloaded" });
        await settings.waitForFunction(() => typeof chrome?.storage?.local?.set === "function" && Boolean(window.eeI18n));
        readStorage = (keys) => settings.evaluate((next) => chrome.storage.local.get(next), keys);
        saveStorage = (values) => writeStorage(settings, values);
        generateReport = async (redact) => {
          await settings.locator("#nav-debug").click();
          await settings.locator("#ReportRedactCheckbox").setChecked(redact);
          await settings.locator("#GenerateReportButton").click();
          await settings.waitForFunction((expected) => {
            try { return JSON.parse(document.getElementById("ReportOutput").value).redacted === expected; } catch (_) { return false; }
          }, redact);
          return JSON.parse(await settings.locator("#ReportOutput").inputValue());
        };
      } else {
        readStorage = (keys) => firefoxControl(page, controlNonce, { action: "get-storage", keys });
        saveStorage = (values) => firefoxControl(page, controlNonce, { action: "set-storage", values });
        generateReport = async (redact) => {
          const response = await firefoxControl(page, controlNonce, { action: "diagnostics", redact });
          assert.equal(response?.ok, true, response?.error);
          return response.report;
        };
        t.diagnostic("Firefox uses a nonce-tagged test-only isolated controller added exclusively to temporary staging; the real extension storage, bridge, MAIN scripts and background run unchanged. Settings UI navigation is not covered: Playwright remained about:blank and timed out after 8 seconds on its valid moz-extension URL.");
      }

      const initial = await readStorage("eeActivityShieldEnabled");
      assert.notEqual(initial.eeActivityShieldEnabled, true);
      await saveStorage({ eeActivityShieldEnabled: true, eeActivityShieldJquerySweep: true });
      await waitForSweepRemoval(page);
      assert.deepEqual(await page.evaluate(() => window.auditDispatch()), removed);
      assert.deepEqual(await page.evaluate(() => window.auditDispatchDocument()), removed);
      assert.deepEqual(await page.evaluate(() => window.auditExactHandlerCounts()), [0, 0]);
      assert.equal(await page.evaluate(() => jQuery.event.add === window.auditOriginalAdd), true);
      assert.equal(await page.evaluate(() => jQuery.event.dispatch === window.auditOriginalDispatch), true);
      await page.evaluate(() => {
        jQuery(window).on("enterBackgroundHandler.etestaplayer", () => window.auditCalls.late++);
        jQuery(document).on("enterBackgroundHandler.etestplayeral", () => window.auditDocumentCalls.late++);
      });
      await waitForSweepRemoval(page);
      assert.deepEqual(await page.evaluate(() => window.auditExactHandlerCounts()), [0, 0]);
      assert.deepEqual(await page.evaluate(() => window.auditDispatch()), removed);
      assert.deepEqual(await page.evaluate(() => window.auditDispatchDocument()), removed);

      await page.evaluate(() => window.postMessage({ type: "ee-activity-shield-preferences", preferences: { enabled: false, jquerySweep: false } }, "*"));
      await page.evaluate(() => {
        jQuery(window).on("enterBackgroundHandler.etestaplayer", () => window.auditCalls.late++);
        jQuery(document).on("enterBackgroundHandler.etestplayeral", () => window.auditDocumentCalls.late++);
      });
      await waitForSweepRemoval(page);
      assert.deepEqual(await page.evaluate(() => window.auditExactHandlerCounts()), [0, 0]);
      await saveStorage({ eeActivityShieldEnabled: false });
      assert.deepEqual(await page.evaluate(() => window.auditDispatch()), removed);
      assert.deepEqual(await page.evaluate(() => window.auditDispatchDocument()), removed);
      await page.evaluate(() => {
        jQuery(window).on("enterBackgroundHandler.extra.etestplayeral", () => window.auditCalls.afterOff++);
        jQuery(document).on("enterBackgroundHandler.etestaplayer.extra", () => window.auditDocumentCalls.afterOff++);
      });
      await page.waitForTimeout(1100);
      assert.deepEqual(await page.evaluate(() => window.auditDispatch()), { ...removed, afterOff: 1 });
      assert.deepEqual(await page.evaluate(() => window.auditDispatchDocument()), { ...removed, afterOff: 1 });
      await saveStorage({ eeActivityShieldEnabled: true });
      await waitForSweepRemoval(page);
      assert.deepEqual(await page.evaluate(() => window.auditExactHandlerCounts()), [0, 0]);
      assert.deepEqual(await page.evaluate(() => window.auditDispatch()), removed);
      assert.deepEqual(await page.evaluate(() => window.auditDispatchDocument()), removed);
      await saveStorage({ eeActivityShieldEnabled: false });
      assert.deepEqual(await page.evaluate(() => window.auditDispatch()), removed);
      assert.deepEqual(await page.evaluate(() => window.auditDispatchDocument()), removed);
      const exposure = await page.evaluate(() => ({
        domPort: Boolean(document.getElementById("ee-activity-shield-port")),
        nativeStateAttributes: document.querySelectorAll("[data-native-hidden], [data-native-visibility-state]").length,
        nativeStateEvents: window.auditNativeStateEvents,
        publicPayloads: window.auditMessages.filter((message) => Object.keys(message).some((key) => key !== "type")),
      }));
      assert.equal(exposure.domPort, false);
      assert.equal(exposure.nativeStateAttributes, 0);
      assert.equal(exposure.nativeStateEvents, 0);
      // The only payload with preferences was the deliberate forged message above.
      assert.deepEqual(exposure.publicPayloads, [{ type: "ee-activity-shield-preferences", preferences: { enabled: false, jquerySweep: false } }]);

      await saveStorage({ eeAutoLoginPreferredAccount: PRIVATE_TEXT, eeAiApiKeyOpenai: "SYNTHETIC_SECRET" });
      const report = await generateReport(true);
      assert.equal(report.redacted, true);
      assert.equal(report.page.tabFound, true);
      assert.ok(report.page.summary.frameCount > 0);
      assert.ok(report.page.summary.pageTypes.includes("grades"));
      assert.equal(JSON.stringify(report).includes(PRIVATE_TEXT), false);
      assert.equal(JSON.stringify(report).includes("SYNTHETIC_SECRET"), false);
      assert.equal(report.page.pages[0].tabUrl, ORIGIN);

      const detailed = await generateReport(false);
      assert.equal(detailed.settings.eeAutoLoginPreferredAccount, PRIVATE_TEXT);
      assert.ok(JSON.stringify(detailed.page).includes(PRIVATE_TEXT));
      assert.equal(JSON.stringify(detailed).includes("SYNTHETIC_SECRET"), false);
      assert.equal(fs.existsSync(path.join(ROOT, FIREFOX_CONTROL_FILE)), false);
      assert.deepEqual(errors, []);
      t.diagnostic(`${browserName}: ${await context.browser().version()}, real extension and isolated/MAIN/background paths exercised; exact eTest registrations are deleted on both targets and stay absent when disabled, while fresh disabled-mode registrations work until reactivation`);
    } finally {
      await cleanup();
    }
  });
}
