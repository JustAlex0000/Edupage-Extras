const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const source = fs.readFileSync(path.join(__dirname, "../scripts/test-fullscreen.js"), "utf8");
const body = '<div class="etest-player"><div class="etest-screen-questions"><div class="etest-question-content"><input id="answer"><button id="enter">Fullscreen</button></div></div></div><button id="outside">Outside test</button>';
const defaults = { eeActivityShieldEnabled: true, eeActivityShieldBlockEsc: true, eeActivityShieldRestoreFullscreen: true };
async function fixture(browser, { preferences = defaults, modeled = true, route = "elearning/practice" } = {}) {
  const page = await browser.newPage();
  await page.route("https://fullscreen.edupage.org/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body>${body}</body></html>` }));
  await page.goto(`https://fullscreen.edupage.org/${route}`);
  await page.evaluate(({ preferences, modeled }) => {
    window.preferenceListeners = [];
    Object.defineProperty(window, "chrome", { configurable: true, value: {
      runtime: { lastError: null },
      storage: { local: { get: (keys, callback) => callback(Array.isArray(keys) ? preferences : { ...keys, ...preferences }) }, onChanged: { addListener: fn => preferenceListeners.push(fn) } },
    } });
    window.changePreference = (key, value) => preferenceListeners.forEach(fn => fn({ [key]: { newValue: value } }, "local"));
    if (!modeled) return;
    window.fullscreenAudit = { current: null, focus: true, hidden: false, requests: 0, denied: false };
    Object.defineProperty(Document.prototype, "fullscreenElement", { configurable: true, get: () => fullscreenAudit.current });
    Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => fullscreenAudit.hidden });
    Document.prototype.hasFocus = () => fullscreenAudit.focus;
    Element.prototype.requestFullscreen = function () {
      fullscreenAudit.requests++;
      if (fullscreenAudit.denied) return Promise.reject(new Error("Synthetic permission denial"));
      fullscreenAudit.current = this;
      document.dispatchEvent(new Event("fullscreenchange", { bubbles: true }));
      return Promise.resolve();
    };
    window.setFullscreen = entered => {
      fullscreenAudit.current = entered ? document.documentElement : null;
      document.dispatchEvent(new Event("fullscreenchange", { bubbles: true }));
    };
  }, { preferences, modeled });
  await page.addScriptTag({ content: source });
  return page;
}

test("chromium: optional test fullscreen restoration", { timeout: 60000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const scenario of ["default-off", "master-off", "parent-off", "not-fullscreen", "outside-test", "restore", "modifiers", "background", "denied", "closed", "replaced", "disabled"]) {
    await t.test(scenario, async () => {
      const prefs = { ...defaults, ...(scenario === "default-off" ? { eeActivityShieldRestoreFullscreen: false } : {}), ...(scenario === "master-off" ? { eeActivityShieldEnabled: false } : {}), ...(scenario === "parent-off" ? { eeActivityShieldBlockEsc: false } : {}) };
      const page = await fixture(browser, { preferences: prefs, route: scenario === "outside-test" ? "user/" : "elearning/practice" });
      try {
        if (scenario !== "not-fullscreen") await page.evaluate(() => { setFullscreen(true); setFullscreen(false); });
        assert.equal(await page.evaluate(() => fullscreenAudit.requests), 0);
        if (scenario === "closed") await page.locator(".etest-screen-questions").evaluate(el => el.classList.remove("etest-screen-questions"));
        if (scenario === "replaced") await page.locator(".etest-player").evaluate(el => el.replaceWith(el.cloneNode(true)));
        if (scenario === "disabled") await page.evaluate(() => changePreference("eeActivityShieldRestoreFullscreen", false));
        if (scenario === "denied") await page.evaluate(() => fullscreenAudit.denied = true);
        if (scenario === "background") await page.evaluate(() => { fullscreenAudit.focus = false; fullscreenAudit.hidden = true; });
        if (scenario === "modifiers") {
          await page.locator("#answer").evaluate(el => el.focus());
          await page.keyboard.press("Escape");
          await page.keyboard.press("Alt+Tab");
          assert.equal(await page.evaluate(() => fullscreenAudit.requests), 0);
          await page.keyboard.press("a");
        } else await page.locator("#answer").click();
        const shouldRestore = ["restore", "modifiers", "denied"].includes(scenario);
        assert.equal(await page.evaluate(() => fullscreenAudit.requests), shouldRestore ? 1 : 0);
        if (scenario === "denied") {
          await page.locator(".etest-player").evaluate(el => el.classList.add("native-update"));
          await page.locator("#answer").click();
          assert.equal(await page.evaluate(() => fullscreenAudit.requests), 1);
        }
        if (scenario === "background") {
          await page.evaluate(() => { fullscreenAudit.focus = true; fullscreenAudit.hidden = false; });
          await page.locator("#answer").click();
          assert.equal(await page.evaluate(() => fullscreenAudit.requests), 1);
        }
      } finally { await page.close(); }
    });
  }
  await t.test("restore the original question-view element and disarm when it is hidden", async () => {
    const page = await fixture(browser);
    try {
      await page.evaluate(() => {
        fullscreenAudit.current = document.querySelector(".etest-screen-questions");
        document.dispatchEvent(new Event("fullscreenchange", { bubbles: true }));
        setFullscreen(false);
      });
      await page.locator("#answer").click();
      assert.equal(await page.evaluate(() => fullscreenAudit.current === document.querySelector(".etest-screen-questions")), true);
      await page.locator(".etest-screen-questions").evaluate(el => el.style.display = "none");
      await page.evaluate(() => setFullscreen(false));
      await page.locator("#outside").click();
      await page.locator(".etest-screen-questions").evaluate(el => el.style.display = "");
      await page.locator("#answer").click();
      assert.equal(await page.evaluate(() => fullscreenAudit.requests), 1);
    } finally { await page.close(); }
  });
  await t.test("native state is observed before existing fullscreen handlers", async () => {
    const page = await fixture(browser, { preferences: { ...defaults, eeActivityShieldFullscreenSpoof: true } });
    try {
      await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../scripts/lib/ee-common.js"), "utf8") });
      await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../scripts/activity-shield-main.js"), "utf8") });
      await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../scripts/activity-shield-bridge.js"), "utf8") });
      await page.evaluate(() => fullscreenAudit.hidden = true);
      await page.waitForFunction(() => document.hidden === false);
      await page.evaluate(() => { fullscreenAudit.hidden = false; setFullscreen(true); setFullscreen(false); });
      await page.locator("#answer").click();
      assert.equal(await page.evaluate(() => fullscreenAudit.requests), 1);
    } finally { await page.close(); }
  });
  await t.test("native fullscreen enter, exit and next-interaction restore", async () => {
    const page = await fixture(browser, { modeled: false });
    try {
      await page.evaluate(() => document.getElementById("enter").addEventListener("click", () => document.documentElement.requestFullscreen()));
      await page.locator("#enter").click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForFunction(() => !document.fullscreenElement);
      await page.locator("#answer").click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await page.evaluate(() => document.exitFullscreen());
      assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    } finally { await page.close(); }
  });
});
