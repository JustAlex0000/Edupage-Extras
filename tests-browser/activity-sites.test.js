const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { chromium, firefox } = require("playwright");
const { createPackageStaging, createFirefoxPackageStaging } = require("../scripts-dev/package-policy");

const ORIGIN = "https://activity-site.example";
const MATCH = `${ORIGIN}/*`;

test("chromium: added activity site registers both worlds and removal stops future injection", { timeout: 60000 }, async (t) => {
  const staging = createPackageStaging("ee-custom-site-test-");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ee-custom-site-profile-"));
  let context;
  try {
    // A test-only required grant bypasses Chromium's native permission prompt,
    // which Playwright cannot accept. Production keeps this host optional.
    const manifestPath = path.join(staging, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    delete manifest.browser_specific_settings;
    manifest.host_permissions.push(MATCH);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: "chromium", ignoreDefaultArgs: ["--disable-extensions"],
      proxy: { server: "http://127.0.0.1:9" },
      args: [`--disable-extensions-except=${staging}`, `--load-extension=${staging}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const url = new URL(worker.url());
    const settings = await context.newPage();
    await settings.goto(`${url.protocol}//${url.host}/menu/settings.html`);
    await settings.locator("#ExperimentalSettingsButton").click();
    if (await settings.locator("#ExperimentalConfirmDialog").evaluate((dialog) => dialog.open)) {
      await settings.locator("#ExperimentalConfirmContinue").click();
    }
    await settings.waitForFunction(() => !document.querySelector("#ee-activity-sites-form button").disabled);
    await settings.evaluate(() => chrome.storage.local.set({ eeActivityShieldEnabled: true }));

    await context.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><body>Custom site fixture</body>" }));
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/`);
    assert.equal(await page.evaluate(() => Object.hasOwn(document, "hidden")), false);

    await settings.locator("#ee-activity-sites-input").fill(ORIGIN);
    await settings.locator("#ee-activity-sites-form button").click();
    await settings.waitForFunction((match) => chrome.storage.local.get("eeActivityShieldSites").then((data) => data.eeActivityShieldSites?.includes(match)), MATCH);
    await settings.waitForFunction(() => document.querySelectorAll("#ee-activity-sites-list button").length === 1);
    await settings.waitForFunction(async () => (await chrome.scripting.getRegisteredContentScripts({ ids: ["ee-activity-site-main", "ee-activity-site-bridge"] })).length === 2);
    await page.reload();
    await page.waitForFunction(() => Object.hasOwn(document, "hidden"));
    // An indicator requires the isolated bridge to read the master preferences.
    await settings.evaluate(() => chrome.storage.local.set({ eeActivityShieldVisualIndicator: true }));
    await page.waitForSelector("#ee-activity-shield-indicator");

    await settings.locator("#ee-activity-sites-list button").click();
    await settings.waitForFunction(async () => (await chrome.scripting.getRegisteredContentScripts({ ids: ["ee-activity-site-main", "ee-activity-site-bridge"] })).length === 0);
    await page.reload();
    assert.equal(await page.evaluate(() => Object.hasOwn(document, "hidden")), false);
    assert.equal(await page.locator("#ee-activity-shield-indicator").count(), 0);
    t.diagnostic("The consent dialog is not exercised: this temporary test package pre-grants the synthetic host. Production host permissions remain optional.");
  } finally {
    await context?.close();
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test("firefox: permitted activity site registers both worlds and removal stops future injection", { timeout: 60000 }, async (t) => {
  const staging = createFirefoxPackageStaging("ee-firefox-custom-site-test-");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ee-firefox-custom-site-profile-"));
  const controlOrigin = "https://activity-control.edupage.org";
  const nonce = randomUUID();
  let context;
  let remote;
  try {
    const manifestPath = path.join(staging, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.host_permissions.push(MATCH);
    // Firefox's extension settings page is not reachable from Playwright's page
    // context in this harness. This isolated, staging-only controller changes
    // real extension storage; injection is checked on the synthetic site.
    fs.writeFileSync(path.join(staging, "__custom_site_test_control__.js"), `
      window.addEventListener("message", event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.nonce !== ${JSON.stringify(nonce)}) return;
        const { id, action, values } = event.data;
        const reply = result => window.postMessage({ nonce: ${JSON.stringify(nonce)}, id, result, reply: true }, location.origin);
        if (action === "set") chrome.storage.local.set(values, () => reply(true));
      });
    `);
    manifest.content_scripts.push({ matches: [`${controlOrigin}/*`], js: ["__custom_site_test_control__.js"], run_at: "document_start" });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const { connectWithMaxRetries, findFreeTcpPort } = await import("../node_modules/web-ext/lib/firefox/remote.js");
    const port = await findFreeTcpPort();
    context = await firefox.launchPersistentContext(profile, {
      headless: true, proxy: { server: "http://127.0.0.1:9" },
      args: ["--start-debugger-server", String(port)],
      firefoxUserPrefs: { "devtools.debugger.remote-enabled": true, "devtools.chrome.enabled": true, "devtools.debugger.prompt-connection": false, "devtools.debugger.force-local": true },
    });
    remote = await connectWithMaxRetries({ port, maxRetries: 20, retryInterval: 100 });
    await remote.installTemporaryAddon(staging, false);
    await context.route(`${controlOrigin}/**`, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body>Controller</body>" }));
    await context.route(`${ORIGIN}/**`, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body>Custom site fixture</body>" }));
    const controller = await context.newPage();
    await controller.goto(`${controlOrigin}/`);
    const control = (action, values) => controller.evaluate(({ nonce, action, values }) => new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => reject(new Error("Test controller timed out")), 5000);
      const listener = event => {
        if (event.source !== window || event.data?.nonce !== nonce || event.data.id !== id || !event.data.reply) return;
        clearTimeout(timeout); window.removeEventListener("message", listener); resolve(event.data.result);
      };
      window.addEventListener("message", listener);
      window.postMessage({ nonce, id, action, values }, location.origin);
    }), { nonce, action, values });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/`);
    assert.equal(await page.evaluate(() => Object.hasOwn(document, "hidden")), false);
    await control("set", { eeActivityShieldSites: [MATCH], eeActivityShieldEnabled: true, eeActivityShieldVisualIndicator: true });
    let injected = false;
    for (let attempt = 0; attempt < 30 && !injected; attempt++) {
      await page.reload();
      injected = await page.evaluate(() => Object.hasOwn(document, "hidden"));
      if (!injected) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(injected, true, "registration should inject into the custom host");
    await page.waitForSelector("#ee-activity-shield-indicator");
    await control("set", { eeActivityShieldSites: [] });
    let removed = false;
    for (let attempt = 0; attempt < 30 && !removed; attempt++) {
      await page.reload();
      removed = !await page.evaluate(() => Object.hasOwn(document, "hidden"));
      if (!removed) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(removed, true, "unregistration should stop future injection");
    assert.equal(await page.locator("#ee-activity-shield-indicator").count(), 0);
    t.diagnostic("A temporary manifest pre-grants the synthetic host and a staging-only controller changes extension storage; consent and settings UI are not exercised.");
  } finally {
    remote?.disconnect();
    await context?.close();
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
