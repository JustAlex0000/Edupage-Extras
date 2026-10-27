const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const source = file => fs.readFileSync(path.join(ROOT, file), "utf8");

async function fixture(browser, route, body, prefs = {}) {
  const page = await browser.newPage();
  await page.route("https://audit.edupage.org/**", request => request.fulfill({
    contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head></head><body>${body}</body></html>`,
  }));
  await page.goto(`https://audit.edupage.org/${route}`);
  await page.evaluate(values => {
    window.preferenceListeners = [];
    window.aiCallbacks = [];
    window.syntheticChrome = {
      i18n: { getMessage: key => key, getUILanguage: () => "en" },
      storage: {
        local: { get: (keys, callback) => setTimeout(() => callback(values), 0) },
        onChanged: { addListener: callback => preferenceListeners.push(callback) },
      },
      runtime: {
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage: (message, callback) => aiCallbacks.push(callback),
      },
    };
    Object.defineProperty(window, "chrome", { configurable: true, value: syntheticChrome });
    window.changePreference = (key, value) => preferenceListeners.forEach(callback => callback({ [key]: { newValue: value } }, "local"));
  }, prefs);
  return page;
}

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  test(`${name}: page lifecycle regressions`, { timeout: 60000 }, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());

    await t.test("attendance settles, updates native data, and turns off/on cleanly", async () => {
      const page = await fixture(browser, "dashboard/eb.php?mode=attendance", `
        <table class="dash_dochadzka"><tbody><tr><td>Súhrn</td></tr><tr><td><div class="grid"></div></td></tr></tbody></table>
        <script type="application/json" id="synthetic-payload">{"halfStats":{"synthetic":{"1":{"present":80,"absent":20},"2":{"present":50,"absent":10}}},"halves":{"1":"First","2":"Second"},"year_turnover":"2026-09-01"}</script>`);
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/attendance-enhancer.js") });
        await page.waitForFunction(() => document.querySelectorAll(".ee-attendance-stat").length === 4);
        await page.waitForTimeout(350);
        await page.evaluate(() => {
          window.syntheticMutations = 0;
          new MutationObserver(records => syntheticMutations += records.length)
            .observe(document.querySelector(".grid"), { childList: true, subtree: true });
        });
        await page.waitForTimeout(650);
        assert.equal(await page.evaluate(() => syntheticMutations), 0);
        await page.evaluate(() => {
          const payload = document.getElementById("synthetic-payload");
          payload.textContent = payload.textContent.replace('"present":80', '"present":60');
        });
        await page.waitForFunction(() => document.querySelector(".ee-attendance-stat-value strong").textContent.includes("25"));
        await page.evaluate(() => changePreference("attendancePercentagesEnabled", false));
        assert.equal(await page.locator(".ee-attendance-stat").count(), 0);
        await page.evaluate(() => changePreference("attendancePercentagesEnabled", true));
        assert.equal(await page.locator(".ee-attendance-stat").count(), 4);
        await page.waitForTimeout(350);
        const settled = await page.evaluate(() => syntheticMutations);
        await page.waitForTimeout(350);
        assert.equal(await page.evaluate(() => syntheticMutations), settled);
      } finally { await page.close(); }
    });

    for (const scenario of ["disable", "disable-reenable", "changed-question", "new-player", "route", "normal", "user-answer"]) {
      await t.test(`AI response lifecycle: ${scenario}`, async () => {
        const body = '<div class="etest-player"><div class="etest-question-content"><p id="question">Complete this synthetic question:</p><input type="text"><div class="etest-question-playactions"></div></div></div>';
        const page = await fixture(browser, "elearning/synthetic", body, { eeAiQuestionHelperEnabled: true });
        try {
          await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
          await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
          await page.locator(".ee-etest-ai-btn").click();
          await page.evaluate(mode => {
            if (mode.startsWith("disable")) changePreference("eeAiQuestionHelperEnabled", false);
            if (mode === "disable-reenable") changePreference("eeAiQuestionHelperEnabled", true);
            if (mode === "changed-question") document.getElementById("question").textContent = "A different synthetic question";
            if (mode === "new-player") document.querySelector(".etest-player").replaceWith(document.querySelector(".etest-player").cloneNode(true));
            if (mode === "route") history.replaceState(null, "", "/elearning/different");
            if (mode === "user-answer") document.querySelector("input").value = "MY ANSWER";
            aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["PROPOSED"], dropdownIndexes: [], matches: [], ordering: [] } });
          }, scenario);
          const expected = scenario === "normal" ? "PROPOSED" : scenario === "user-answer" ? "MY ANSWER" : "";
          assert.equal(await page.locator("input").inputValue(), expected);
        } finally { await page.close(); }
      });
    }
  });
}
