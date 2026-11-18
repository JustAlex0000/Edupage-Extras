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
      if (settings) await t.test("language and anonymizer settings coexist with saved-test review", async () => {
        const catalog = (language) => JSON.parse(fs.readFileSync(path.join(ROOT, `_locales/${language}/messages.json`), "utf8"));
        await settings.locator("#nav-appearance").click();
        await settings.locator("#ee-language-select").selectOption("sk");
        await settings.waitForFunction(() => document.documentElement.lang === "sk");
        await settings.locator("#nav-cleanup").click();
        await settings.locator('label[for="HidePersonalInfoCheckbox"]').click();
        assert.equal(await settings.locator("#HidePersonalInfoCheckbox").isChecked(), true);
        await settings.locator("#ee-anonymizer-alias").fill("Review alias");
        await settings.locator("#ee-anonymizer-alias").blur();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAnonymizerAlias")).eeAnonymizerAlias === "Review alias");
        await saveStorage({ eeTestArchive: { version: 1, blocked: [], tests: [{
          id: "00000000-0000-4000-8000-000000000001", title: "Synthetic saved test", origin: ORIGIN,
          openedAt: 1, updatedAt: 2, sequence: 1,
          questions: [{ id: "q0", number: "1", body: "Synthetic saved question", answers: ["Recorded answer"], images: [] }],
        }] } });
        await settings.locator("#ExperimentalSettingsButton").click();
        if (await settings.locator("#ExperimentalConfirmDialog").evaluate(el => el.open))
          await settings.locator("#ExperimentalConfirmContinue").click();
        await settings.waitForFunction(expected => document.querySelector("#ee-test-archive-questions strong")?.textContent === expected,
          catalog("sk").eeArchiveYourAnswer.message);
        assert.equal(await settings.locator("#ee-test-archive-card").isVisible(), true);
        assert.equal(await settings.locator("#ee-test-archive-card").evaluate(card => {
          const heading = document.getElementById("etest-tools-heading");
          const nextSection = document.getElementById("activity-heading");
          return Boolean(heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)
            && Boolean(card.compareDocumentPosition(nextSection) & Node.DOCUMENT_POSITION_FOLLOWING);
        }), true);
        assert.equal(await settings.locator("#ee-test-archive-enabled").isChecked(), false);
        await settings.locator("#nav-appearance").click();
        await settings.locator("#ee-language-select").selectOption("cs");
        await settings.waitForFunction(expected => document.querySelector("#ee-test-archive-questions strong")?.textContent === expected,
          catalog("cs").eeArchiveYourAnswer.message);
        assert.equal(await settings.locator("#ee-test-archive-questions p").first().textContent(), "Synthetic saved question");
      });
      if (settings) await t.test("saved tests copy the selected capture and keep actions separated", async () => {
        await settings.locator("#ExperimentalSettingsButton").click();
        await settings.evaluate(() => { navigator.clipboard.writeText = async value => { window.syntheticCopiedTest = value; }; });
        await settings.locator("#ee-test-archive-copy").click();
        await settings.waitForFunction(() => window.syntheticCopiedTest?.startsWith("Synthetic saved test"));
        assert.equal(await settings.evaluate(() => syntheticCopiedTest.includes("Recorded answer")), true);
        for (const width of [1280, 390]) {
          await settings.setViewportSize({ width, height: 900 });
          const boxes = await settings.locator("#ee-test-archive-copy, #ee-test-archive-delete").evaluateAll(nodes => nodes.map(n => {
            const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
          }));
          assert.ok(boxes.every(r => r.height >= 44));
          assert.ok(boxes[0].right + 8 <= boxes[1].left || boxes[0].bottom + 8 <= boxes[1].top);
        }
        await settings.setViewportSize({ width: 1280, height: 900 });
        if (process.env.EE_STORE_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.EE_STORE_SCREENSHOT_DIR, { recursive: true });
          await settings.locator("#nav-appearance").click();
          await settings.locator("#ee-language-select").selectOption("en");
          await settings.waitForFunction(() => document.documentElement.lang === "en");
          await settings.locator("#ExperimentalSettingsButton").click();
          await settings.evaluate(async () => {
            const { eeTestArchive: library } = await chrome.storage.local.get("eeTestArchive");
            library.tests[0].openedAt = library.tests[0].updatedAt = new Date("2026-11-12T09:00:00").getTime();
            library.tests[0].questions = [{ id: "q0", number: "1", body: "Find the slope of the line through A[1;2] and B[3;6].\na) 1\nb) 2\nc) 3", answers: ["b) 2"], images: [], visualsOmitted: false }];
            await chrome.storage.local.set({ eeTestArchive: library });
          });
          await settings.waitForFunction(() => document.getElementById("ee-test-archive-questions").textContent.includes("A[1;2]"));
          await settings.setViewportSize({ width: 1280, height: 900 });
          await settings.locator("#ee-test-archive-review").evaluate(el => { el.open = true; });
          await settings.locator("#ee-test-archive-card").scrollIntoViewIfNeeded();
          await settings.locator("#ee-test-archive-card").screenshot({ path: path.join(process.env.EE_STORE_SCREENSHOT_DIR, "saved-tests.png") });
        }
      });
      if (settings) await t.test("AI activity review, clear and disable in installed Settings", async () => {
        await settings.locator("#ExperimentalSettingsButton").click();
        await settings.waitForSelector("#ee-ai-log-card", { state: "visible" });
        await saveStorage({ eeAiActivityLog: [{ at: Date.now(), event: "failed", provider: "openai", model: "gpt-5.6-terra", error: "http", http: 429, ms: 250 }] });
        const disclosure = settings.locator("#ee-ai-log-card summary");
        await disclosure.focus(); await settings.keyboard.press("Enter");
        await settings.waitForFunction(() => document.querySelector("#ee-ai-log-entries")?.textContent.includes("HTTP 429"));
        assert.equal(await settings.locator("#ee-ai-log-enabled").isChecked(), true);
        await settings.setViewportSize({ width: 390, height: 844 });
        assert.equal(await settings.locator("#ee-ai-log-card").evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await settings.locator("#ee-ai-log-clear").click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiActivityLog")).eeAiActivityLog.length === 0);
        await settings.locator('label[for="ee-ai-log-enabled"]').click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiActivityLogEnabled")).eeAiActivityLogEnabled === false);
      });
      if (settings) await t.test("AI timing and reference text save locally, toggle the editor, validate imports and clear cleanly", async () => {
        await settings.locator("#ExperimentalSettingsButton").click();
        if (!await settings.locator("#AiQuestionHelperCheckbox").isChecked()) await settings.locator('label[for="AiQuestionHelperCheckbox"]').click();
        await settings.locator("#ee-ai-fill-delay").fill("2.5");
        await settings.locator("#ee-ai-fill-delay").blur();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiFillDelaySeconds")).eeAiFillDelaySeconds === 2.5);
        await settings.locator('label[for="ee-ai-sequential-fill"]').click();
        await settings.locator("#ee-ai-fill-step").fill("0.2");
        await settings.locator("#ee-ai-fill-step").blur();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiFillStepSeconds")).eeAiFillStepSeconds === 0.2);
        assert.equal(await settings.locator("#ee-ai-context-editor").isVisible(), false);
        await settings.locator('label[for="ee-ai-context-enabled"]').click();
        await settings.waitForFunction(() => !document.getElementById("ee-ai-context-editor").hidden);
        await settings.locator("#ee-ai-context-text").fill("SYNTHETIC_SAVED_NOTES");
        await settings.locator("#ee-ai-context-save").click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiContextText")).eeAiContextText === "SYNTHETIC_SAVED_NOTES");
        assert.equal(await settings.locator("#ee-ai-context-enabled").isChecked(), true);
        await settings.locator("#ee-ai-context-file").setInputFiles({ name: "practice.md", mimeType: "text/markdown", buffer: Buffer.from("SYNTHETIC_FILE_NOTES") });
        await settings.waitForFunction(() => document.getElementById("ee-ai-context-text").value === "SYNTHETIC_FILE_NOTES");
        assert.equal((await readStorage("eeAiContextText")).eeAiContextText, "SYNTHETIC_SAVED_NOTES");
        await settings.locator("#ee-ai-context-save").click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiContextText")).eeAiContextText === "SYNTHETIC_FILE_NOTES");
        await settings.locator('label[for="ee-ai-context-enabled"]').click();
        await settings.waitForFunction(() => document.getElementById("ee-ai-context-editor").hidden);
        assert.equal((await readStorage("eeAiContextText")).eeAiContextText, "SYNTHETIC_FILE_NOTES");
        await settings.locator('label[for="ee-ai-context-enabled"]').click();
        await settings.waitForFunction(() => !document.getElementById("ee-ai-context-editor").hidden);
        assert.equal(await settings.locator("#ee-ai-context-text").inputValue(), "SYNTHETIC_FILE_NOTES");
        for (const [name, buffer] of [["bad.pdf", Buffer.from("pdf")], ["bad.txt", Buffer.from([255, 254, 255])], ["too-long.md", Buffer.alloc(20001, 65)], ["too-big.txt", Buffer.alloc(131073, 65)]]) {
          await settings.locator("#ee-ai-context-file").setInputFiles({ name, mimeType: "text/plain", buffer });
          await settings.waitForFunction(() => document.getElementById("ee-ai-fill-status").dataset.error === "true" && document.getElementById("ee-ai-context-file").value === "");
          assert.equal(await settings.locator("#ee-ai-context-text").inputValue(), "SYNTHETIC_FILE_NOTES");
          assert.equal((await readStorage("eeAiContextText")).eeAiContextText, "SYNTHETIC_FILE_NOTES");
        }
        const report = await generateReport(false);
        assert.equal(JSON.stringify(report).includes("SYNTHETIC_FILE_NOTES"), false);
        assert.equal(JSON.stringify(await readStorage(null)).includes("practice.md"), false);
        await settings.locator("#ExperimentalSettingsButton").click();
        await settings.setViewportSize({ width: 390, height: 844 });
        assert.equal(await settings.locator("#ee-ai-context-editor").evaluate(el => el.scrollWidth <= el.clientWidth), true);
        if (process.env.EE_AI_SETTINGS_REVIEW) await settings.locator("#ee-ai-context-editor").screenshot({ path: process.env.EE_AI_SETTINGS_REVIEW });
        await settings.locator("#ee-ai-context-clear").click();
        await settings.waitForFunction(async () => { const s = await chrome.storage.local.get(["eeAiContextText", "eeAiContextEnabled"]); return s.eeAiContextText === "" && s.eeAiContextEnabled === false; });
        assert.equal(await settings.locator("#ee-ai-context-text").inputValue(), "");
        assert.equal(await settings.locator("#ee-ai-context-editor").isVisible(), false);
        assert.equal(await settings.locator("#ee-ai-fill-status").isVisible(), true);
        await settings.setViewportSize({ width: 1280, height: 900 });
      });
      if (settings) await t.test("automatic test filling has a separate toggle and shared configuration", async () => {
        await settings.locator("#ExperimentalSettingsButton").click();
        if (await settings.locator("#AiQuestionHelperCheckbox").isChecked()) await settings.locator('label[for="AiQuestionHelperCheckbox"]').click();
        assert.equal(await settings.locator("#AiQuestionHelperSettings").isVisible(), false);
        await settings.locator('label[for="ee-ai-auto-enabled"]').click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiAutoFillEnabled")).eeAiAutoFillEnabled === true);
        assert.equal(await settings.locator("#AiQuestionHelperCheckbox").isChecked(), false);
        assert.equal(await settings.locator("#AiQuestionHelperSettings").isVisible(), true);
        assert.equal(await settings.locator("#AiModelSelect").isEnabled(), true);
        assert.equal(await settings.locator("#ee-ai-auto-shortcuts").isVisible(), true);
        if (process.env.EE_AI_SETTINGS_REVIEW) await settings.locator("#ee-ai-auto-card").screenshot({ path: process.env.EE_AI_SETTINGS_REVIEW.replace(/\.png$/, "-auto.png") });
        await settings.locator('label[for="ee-ai-auto-enabled"]').click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeAiAutoFillEnabled")).eeAiAutoFillEnabled === false);
        assert.equal(await settings.locator("#AiQuestionHelperSettings").isVisible(), false);
      });
      if (settings) await t.test("test fullscreen restoration is independently opt-in under Block Escape", async () => {
        await saveStorage({ eeActivityShieldEnabled: false, eeActivityShieldBlockEsc: true, eeActivityShieldRestoreFullscreen: false });
        await settings.locator("#ExperimentalSettingsButton").click();
        await settings.waitForFunction(() => !document.getElementById("ActivityShieldEnabled").checked);
        assert.equal(await settings.locator("#ActivityRestoreFullscreen").isChecked(), false);
        assert.equal(await settings.locator("#ActivityRestoreFullscreen").isDisabled(), true);
        await settings.locator('label[for="ActivityShieldEnabled"]').click();
        await settings.waitForFunction(() => !document.getElementById("ActivityRestoreFullscreen").disabled);
        await settings.locator('label[for="ActivityRestoreFullscreen"]').click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeActivityShieldRestoreFullscreen")).eeActivityShieldRestoreFullscreen === true);
        await settings.locator('label[for="ActivityBlockEsc"]').click();
        await settings.waitForFunction(() => document.getElementById("ActivityRestoreFullscreen").disabled);
        assert.equal(await settings.locator("#ActivityRestoreFullscreen").isChecked(), true);
        await settings.locator('label[for="ActivityBlockEsc"]').click();
        await settings.waitForFunction(() => !document.getElementById("ActivityRestoreFullscreen").disabled);
        await settings.locator('label[for="ActivityRestoreFullscreen"]').click();
        await settings.waitForFunction(async () => (await chrome.storage.local.get("eeActivityShieldRestoreFullscreen")).eeActivityShieldRestoreFullscreen === false);
        await settings.locator('label[for="ActivityShieldEnabled"]').click();
      });
      if (settings) await t.test("installed fullscreen restorer works across isolated and MAIN worlds", async () => {
        await saveStorage({ eeActivityShieldEnabled: true, eeActivityShieldBlockEsc: true, eeActivityShieldRestoreFullscreen: true });
        await page.bringToFront();
        await page.evaluate(() => {
          window.eeFullscreenEvents = [];
          window.addEventListener("fullscreenchange", () => eeFullscreenEvents.push(!!document.fullscreenElement), true);
          const player = document.createElement("div"); player.className = "etest-player"; player.id = "ee-fullscreen-fixture";
          const screen = document.createElement("div"); screen.className = "etest-screen-questions";
          const question = document.createElement("div"); question.className = "etest-question-content";
          const input = document.createElement("input"); input.id = "ee-fullscreen-answer";
          const enter = document.createElement("button"); enter.id = "ee-fullscreen-enter"; enter.textContent = "Fullscreen practice";
          enter.addEventListener("click", () => document.documentElement.requestFullscreen());
          question.append(input, enter); screen.append(question); player.append(screen); document.body.prepend(player);
        });
        await page.locator("#ee-fullscreen-enter").click();
        await page.waitForFunction(() => !!document.fullscreenElement && eeFullscreenEvents.at(-1) === true);
        await page.evaluate(() => document.exitFullscreen());
        await page.waitForFunction(() => !document.fullscreenElement && eeFullscreenEvents.at(-1) === false);
        await page.locator("#ee-fullscreen-answer").click();
        await page.waitForFunction(() => !!document.fullscreenElement && eeFullscreenEvents.at(-1) === true);
        await page.evaluate(() => document.exitFullscreen());
        await page.evaluate(() => document.getElementById("ee-fullscreen-fixture").remove());
        await saveStorage({ eeActivityShieldEnabled: false, eeActivityShieldRestoreFullscreen: false });
        await settings.bringToFront();
      });
      if (settings) await t.test("Firefox shortcut buttons show usable instructions without privileged navigation", async () => {
        await settings.locator("#ExperimentalSettingsButton").click();
        await settings.evaluate(() => {
          window.eeSavedTabsCreate = chrome.tabs.create;
          window.eeShortcutNavigations = [];
          window.eeI18n.isFirefox = true;
          chrome.tabs.create = (options, callback) => {
            if (options.url.startsWith("about:")) throw new Error("Privileged navigation must not be attempted");
            eeShortcutNavigations.push(options.url); callback?.({});
          };
          navigator.clipboard.writeText = async text => { window.eeCopiedShortcutAddress = text; };
        });
        const buttons = ["ExperimentalShortcutSettingsButton", "OpenShortcutSettingsButton", "OpenEtestCopyShortcutSettingsButton", "OpenAiShortcutSettingsButton", "ee-ai-auto-shortcuts"];
        for (const id of buttons) {
          // Some entry points are hidden until their feature is enabled; exercise each bound handler.
          await settings.locator(`#${id}`).evaluate(button => button.click());
          assert.equal(await settings.locator("#ee-shortcut-help").evaluate(dialog => dialog.open), true);
          assert.equal(await settings.locator("#ee-shortcut-address").inputValue(), "about:addons");
          assert.equal(await settings.locator("#ee-shortcut-help-text").textContent().then(text => text.includes("about:addons")), true);
          await settings.locator("#ee-shortcut-close").click();
        }
        await settings.locator("#ExperimentalShortcutSettingsButton").click();
        await settings.locator("#ee-shortcut-copy").click();
        assert.equal(await settings.evaluate(() => eeCopiedShortcutAddress), "about:addons");
        await settings.setViewportSize({ width: 390, height: 844 });
        assert.equal(await settings.locator("#ee-shortcut-help").evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
        await settings.keyboard.press("Escape");
        assert.equal(await settings.locator("#ee-shortcut-help").evaluate(dialog => dialog.open), false);
        assert.equal(await settings.evaluate(() => eeShortcutNavigations.length), 0);
        await settings.evaluate(() => eeI18n.isFirefox = false);
        await settings.locator("#ExperimentalShortcutSettingsButton").click();
        assert.deepEqual(await settings.evaluate(() => eeShortcutNavigations), ["chrome://extensions/shortcuts"]);
        await settings.evaluate(() => { chrome.tabs.create = eeSavedTabsCreate; });
        await settings.setViewportSize({ width: 1280, height: 900 });
      });
      assert.equal(fs.existsSync(path.join(ROOT, FIREFOX_CONTROL_FILE)), false);
      assert.deepEqual(errors, []);
      t.diagnostic(`${browserName}: ${await context.browser().version()}, real extension and isolated/MAIN/background paths exercised; exact eTest registrations are deleted on both targets and stay absent when disabled, while fresh disabled-mode registrations work until reactivation`);
    } finally {
      await cleanup();
    }
  });
}
