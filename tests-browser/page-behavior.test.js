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
    window.aiQuestions = [];
    window.aiModes = [];
    window.aiActivity = [];
    window.archiveSnapshots = [];
    window.extensionMessageListeners = [];
    window.syntheticChrome = {
      i18n: { getMessage: key => key, getUILanguage: () => "en" },
      storage: {
        local: { get: (keys, callback) => setTimeout(() => callback(values), 0) },
        onChanged: { addListener: callback => preferenceListeners.push(callback) },
      },
      runtime: {
        lastError: null,
        onMessage: { addListener: callback => extensionMessageListeners.push(callback) },
        sendMessage: (message, callback) => {
          if (message.type === "ee-ai-question-suggestion") { aiCallbacks.push(callback); aiQuestions.push(message.question); aiModes.push(message.mode || "question"); }
          else { if (message.type === "ee-ai-activity") aiActivity.push(message.event);
            if (message.type === "ee-test-archive-save") archiveSnapshots.push(message.snapshot);
            callback?.({ ok: true }); }
        },
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

    for (const canvas of [false, true]) {
      await t.test(`weekly comparison mounts outside the native canvas: ${canvas}`, async () => {
        const native = '<div class="native-timetable" style="height:40px"></div>';
        const page = await fixture(browser, "dashboard/eb.php?mode=timetable", canvas ? `<div id="fitheight" style="height:80px;overflow:hidden">${native}</div>` : native, {
          eeTimetableComparisonEnabled: true,
          eeTimetableComparison: { version: 1, source: "import", name: "Comparison schedule", cycleWeeks: 1, anchorMonday: "2026-11-16", templates: [[{ title: "Chemistry", weekday: 0, startTime: "08:00", endTime: "08:45" }]] },
        });
        try {
          await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
          await page.addScriptTag({ content: source("scripts/lib/ee-timetable-comparison.js") });
          await page.addScriptTag({ content: source("scripts/timetable-comparison-ui.js") });
          // Reader boundary is stubbed: this checks mounting, not live EduPage parsing.
          await page.evaluate(() => { window.__eeComparisonReader = {
            findTimetableRoot: () => document.querySelector(".native-timetable"),
            parseWeeklyTimetable: () => ({ dayHeaders: [{ date: "2026-11-16" }], lessons: [] }),
          }; });
          await page.addStyleTag({ content: source("scripts/timetable-comparison.css") });
          await page.addScriptTag({ content: source("scripts/timetable-comparison.js") });
          await page.waitForSelector("#ee-comparison-view .ee-comparison-week-view");
          assert.equal(await page.locator("#fitheight #ee-comparison-view").count(), 0);
          assert.equal(await page.locator(".native-timetable").isVisible(), false);
          const toggle = page.locator("#ee-comparison-view > button").first();
          await toggle.focus(); await page.keyboard.press("Enter");
          await page.waitForFunction(() => !document.querySelector(".native-timetable").classList.contains("ee-comparison-hidden-native"));
          assert.equal(await page.locator(".ee-comparison-week-view").isVisible(), false);
          await toggle.click();
          await page.waitForSelector(".ee-comparison-week-view", { state: "visible" });
          await page.evaluate(() => changePreference("eeTimetableComparisonEnabled", false));
          assert.equal(await page.locator("#ee-comparison-view").count(), 0);
          assert.equal(await page.locator(".native-timetable").isVisible(), true);
        } finally { await page.close(); }
      });
    }

    await t.test("weekly comparison aligns actual times, preserves overlaps and marks unknown days", async () => {
      const page = await fixture(browser, "dashboard/eb.php?mode=timetable", '<div class="ee-comparison ee-comparison-native" id="comparison"></div>');
      try {
        await page.addStyleTag({ content: source("scripts/timetable-comparison.css") });
        await page.addStyleTag({ content: "body{font:14px/1.45 Arial,sans-serif;color:#202124;margin:16px} h4{font-size:14px}" });
        await page.evaluate(catalog => { syntheticChrome.i18n.getMessage = key => catalog[key]?.message || key; }, JSON.parse(source("_locales/en/messages.json")));
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/lib/ee-timetable-comparison.js") });
        await page.addScriptTag({ content: source("scripts/timetable-comparison-ui.js") });
        await page.evaluate(() => {
          const source = document.createElement("div"); source.hidden = true;
          source.innerHTML = '<div class="tt-cell" style="left:0px;top:0px;width:100px;height:60px;background:rgb(153,179,128)"></div><div class="tt-cell" style="left:0px;top:0px;width:100px;height:60px;pointer-events:none">Mathematics</div>';
          const later = source.cloneNode(true);
          later.querySelector(".tt-cell").style.backgroundColor = "rgb(192,192,192)";
          source.append(later);
          document.body.append(source);
          const lesson = (title, startTime, endTime) => ({ date: "2026-11-16", title, startTime, endTime, room: "Room 12", group: "" });
          const own = [lesson("Mathematics", "08:00", "08:45"), lesson("English", "09:15", "10:00"), lesson("Physics", "10:15", "11:00")];
          const other = [lesson("Chemistry", "08:15", "09:00"), lesson("Languages A", "10:00", "10:45"), lesson("Languages B", "10:00", "11:00")];
          window.syntheticComparison = { dates: ["2026-11-16", "2026-11-17"], own, other, name: "Comparison schedule", ownDates: ["2026-11-16"], otherDates: ["2026-11-16"], notice: "Regular timetable — repeats weekly." };
          EEComparisonUI.renderCompact(document.getElementById("comparison"), syntheticComparison);
        });
        assert.equal(await page.locator(".ee-comparison-week-view").isVisible(), true);
        assert.equal(await page.locator(".ee-comparison-week-view details").count(), 0);
        assert.equal(await page.locator(".ee-comparison-lesson").count(), 6);
        assert.equal(await page.locator(".ee-comparison-chart-day").last().locator(".ee-comparison-gap-band").count(), 0);
        const overlaps = await page.locator(".ee-comparison-lesson-peer").evaluateAll(nodes => nodes.slice(1).map(node => node.style.top));
        assert.deepEqual(overlaps, ["0px", "60px"]);
        assert.equal(await page.locator(".ee-comparison-lesson-subject").first().evaluate(el => getComputedStyle(el).fontSize), "18px");
        assert.equal(await page.locator(".ee-comparison-lesson").first().evaluate(el => getComputedStyle(el).backgroundColor), "rgb(153, 179, 128)");
        assert.equal(await page.locator(".ee-comparison-lesson-room").first().evaluate(el => getComputedStyle(el).position), "absolute");
        assert.equal(await page.locator(".ee-comparison-gap-band").count(), 2);
        if (process.env.EE_STORE_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.EE_STORE_SCREENSHOT_DIR, { recursive: true });
          await page.setViewportSize({ width: 1280, height: 900 });
          await page.locator("#comparison").screenshot({ path: path.join(process.env.EE_STORE_SCREENSHOT_DIR, "weekly-comparison.png") });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.locator(".ee-comparison-week-scroll").evaluate(el => el.scrollWidth > el.clientWidth), true);
        {
          await page.setViewportSize({ width: 1000, height: 600 });
          await page.evaluate(() => {
            EEComparisonUI.renderCompact(document.getElementById("comparison"), { ...syntheticComparison, dates: ["2026-11-16"], daily: true });
            const native = document.createElement("section");
            const title = document.createElement("h2"); title.textContent = "Your timetable · Monday";
            native.className = "ee-comparison ee-comparison-native ee-comparison-home";
            native.append(title);
            const columns = document.createElement("ul"); columns.className = "ee-comparison-day-columns";
            for (const lesson of syntheticComparison.own) {
              const cell = document.createElement("li");
              for (const [tag, value] of [["small", `${lesson.startTime}–${lesson.endTime}`], ["strong", lesson.title], ["span", lesson.room]]) {
                const text = document.createElement(tag); text.textContent = value; cell.append(text);
              }
              columns.append(cell);
            }
            native.append(columns);
            const comparison = document.getElementById("comparison");
            const context = document.createElement("div"); context.style.cssText = "background:#294c66;color:white;padding:16px";
            comparison.before(context); context.append(native, comparison);
          });
          await page.locator(".ee-comparison-compact-day > summary").click();
          assert.equal(await page.locator("#comparison .ee-comparison-day-columns > li").count(), 3);
          assert.equal(await page.locator(".ee-comparison-compact-detail").evaluate(el => /No shared gaps|15\+/.test(el.textContent)), false);
          assert.equal(await page.locator("#comparison .ee-comparison-day-columns").evaluate(el => getComputedStyle(el).display), "flex");
          // EduPage Home's native strip uses white text over a blue background.
          await page.locator("#comparison").evaluate(el => { el.style.background = "#294c66"; el.style.color = "white"; });
          assert.equal(await page.locator("#comparison .ee-comparison-day-columns li").first().evaluate(el => getComputedStyle(el).backgroundColor), "rgba(255, 255, 255, 0.1)");
          await page.evaluate(() => EEComparisonUI.renderCompact(document.getElementById("comparison"), { ...syntheticComparison, dates: ["2026-11-16"], daily: true }));
          assert.equal(await page.locator(".ee-comparison-compact-day").evaluate(el => el.open), true);
          if (process.env.EE_STORE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.EE_STORE_SCREENSHOT_DIR, "home-comparison.png") });
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
      } finally { await page.close(); }
    });

    await t.test("archive captures the native name without accessibility text and updates a late name", async () => {
      const page = await fixture(browser, "elearning/synthetic", '<div class="etest-player"><div class="etest-player-title-name counters1"><div><span class="sr-only">Question counter instructions</span><span class="interactiveElem">Geometry practice</span></div></div><div class="etest-question-content"><p>Invented practice question</p><input type="text"></div></div>', { eeTestArchiveEnabled: true });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.waitForFunction(() => archiveSnapshots.length > 0);
        assert.equal(await page.evaluate(() => archiveSnapshots.at(-1).title), "Geometry practice");
        await page.locator(".etest-player-title-name .interactiveElem").evaluate(el => el.textContent = "Updated practice title");
        await page.waitForFunction(() => archiveSnapshots.at(-1).title === "Updated practice title");
      } finally { await page.close(); }
    });

    await t.test("AI shortcut follows the hovered question before the last clicked question", async () => {
      const question = title => `<div class="etest-question-content"><p>${title}</p><input type="text"><div class="etest-question-playactions"></div></div>`;
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player">${question("First practice question")}${question("Second practice question")}</div>`, { eeAiQuestionHelperEnabled: true, eeAiAnswerMode: "both" });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.waitForSelector(".ee-etest-ai-btn");
        await page.locator(".etest-question-content").nth(1).locator("input").click();
        await page.locator(".etest-question-content").first().locator("p").hover();
        await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-suggest-current-question" })));
        assert.equal(await page.evaluate(() => aiQuestions[0].plainBody.includes("First practice question")), true);
        await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["FIRST"], dropdownIndexes: [], matches: [], ordering: [] } }));
        assert.equal(await page.locator("input").first().inputValue(), "FIRST");
        assert.equal(await page.locator("input").nth(1).inputValue(), "");
      } finally { await page.close(); }
    });

    for (const scenario of ["normal", "manual", "disable", "context", "route", "replacement", "changed-question", "escape"]) {
      await t.test(`delayed sequential fill is local and cancels safely: ${scenario}`, async () => {
        const page = await fixture(browser, "elearning/synthetic", '<div class="etest-player"><div class="etest-question-content"><p>Fill three practice fields</p><input type="text"><input type="text"><input type="text"><div class="etest-question-playactions"></div></div></div>', {
          eeAiQuestionHelperEnabled: true, eeAiSequentialFillEnabled: true, eeAiFillDelaySeconds: scenario === "normal" || scenario === "escape" ? 0.5 : 0, eeAiFillStepSeconds: scenario === "normal" ? 0.1 : 0.5,
        });
        try {
          await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
          await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
          await page.waitForSelector(".ee-etest-ai-btn");
          await page.evaluate(() => {
            window.fillEvents = [];
            window.fillTimers = [];
            const originalTimeout = window.setTimeout;
            window.setTimeout = (fn, delay, ...args) => { fillTimers.push(delay); return originalTimeout(fn, delay, ...args); };
            document.querySelectorAll("input").forEach((input, index) => input.addEventListener("input", () => fillEvents.push({ index, time: performance.now() })));
          });
          await page.locator(".ee-etest-ai-btn").click();
          await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["A", "B", "C"], dropdownIndexes: [], matches: [], ordering: [] } }));
          if (scenario === "normal" || scenario === "escape") {
            assert.equal(await page.locator("input").first().inputValue(), "");
            assert.equal(await page.locator(".ee-etest-ai-btn").isDisabled(), true);
          }
          if (scenario === "escape") await page.keyboard.press("Escape");
          else await page.waitForFunction(() => document.querySelector("input").value === "A");
          if (scenario === "normal") {
            assert.equal(await page.locator("input").nth(1).inputValue(), "");
            await page.waitForFunction(() => document.querySelectorAll("input")[2].value === "C");
            const times = await page.evaluate(() => fillEvents.map(event => event.time));
            assert.ok(times[1] - times[0] >= 80 && times[2] - times[1] >= 80);
            assert.equal(await page.evaluate(() => fillTimers.filter(delay => delay === 100).length), 2);
          } else {
            if (scenario === "manual") await page.locator("input").nth(1).fill("MY ANSWER");
            if (scenario === "disable") await page.evaluate(() => changePreference("eeAiQuestionHelperEnabled", false));
            if (scenario === "context") await page.evaluate(() => changePreference("eeAiContextEnabled", true));
            if (scenario === "route") await page.evaluate(() => history.replaceState(null, "", "/elearning/other"));
            if (scenario === "replacement") await page.evaluate(() => document.querySelector(".etest-player").replaceWith(document.querySelector(".etest-player").cloneNode(true)));
            if (scenario === "changed-question") await page.locator("p").evaluate(el => el.textContent = "A different question");
            await page.waitForTimeout(750);
            assert.equal(await page.locator("input").nth(2).inputValue(), "");
            if (scenario === "manual") assert.equal(await page.locator("input").nth(1).inputValue(), "MY ANSWER");
          }
          assert.equal(await page.evaluate(() => aiQuestions.length), 1);
          assert.equal(await page.locator('[data-ee-ai-request-pending="true"]').count(), 0);
          if (scenario === "replacement") {
            await page.locator(".ee-etest-ai-btn").click();
            assert.equal(await page.evaluate(() => aiQuestions.length), 2);
            await page.evaluate(() => aiCallbacks[1]({ ok: false, error: "Synthetic cancellation check" }));
          }
        } finally { await page.close(); }
      });
    }

    await t.test("checkbox choices are selected separately without cancelling their own input events", async () => {
      const option = text => `<label class="etest-alist-answer"><input type="checkbox">${text}</label>`;
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player"><div class="etest-question-content"><p>Choose two practice options</p>${option("A")}${option("B")}<div class="etest-question-playactions"></div></div></div>`, { eeAiQuestionHelperEnabled: true, eeAiSequentialFillEnabled: true });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.evaluate(() => document.querySelectorAll("input").forEach(input => input.addEventListener("change", () => input.closest("label").classList.toggle("selected", input.checked))));
        await page.locator(".ee-etest-ai-btn").click();
        await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [0, 1], fillIns: [], dropdownIndexes: [], matches: [], ordering: [] } }));
        await page.waitForFunction(() => document.querySelectorAll("input:checked").length === 1);
        await page.waitForFunction(() => document.querySelectorAll("input:checked").length === 2);
        assert.equal(await page.evaluate(() => aiQuestions.length), 1);
      } finally { await page.close(); }
    });

    await t.test("dropdowns fill separately with the existing answer indexes", async () => {
      const select = '<select><option value="">-- choose --</option><option value="a">A</option><option value="b">B</option></select>';
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player"><div class="etest-question-content"><p>Two practice dropdowns</p>${select}${select}<div class="etest-question-playactions"></div></div></div>`, { eeAiQuestionHelperEnabled: true, eeAiSequentialFillEnabled: true });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.locator(".ee-etest-ai-btn").click();
        await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: [], dropdownIndexes: [1, 0], matches: [], ordering: [] } }));
        await page.waitForFunction(() => document.querySelector("select").value === "b");
        assert.equal(await page.locator("select").nth(1).inputValue(), "");
        await page.waitForFunction(() => document.querySelectorAll("select")[1].value === "a");
        assert.equal(await page.evaluate(() => aiQuestions.length), 1);
      } finally { await page.close(); }
    });

    await t.test("ordering moves are spaced and keep the original row identities", async () => {
      const row = index => `<div class="etest-alist-answer" data-ind="${index}" style="width:200px;height:30px">Option ${index}</div>`;
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player"><div class="etest-question-content"><p>Order practice items</p><div class="etest-alist-ordering">${row(0)}${row(1)}${row(2)}</div><div class="etest-question-playactions"></div></div></div>`, { eeAiQuestionHelperEnabled: true, eeAiSequentialFillEnabled: true });
      try {
        await page.evaluate(() => {
          // Minimal sortable adapter for the existing synthetic drag events.
          let moving;
          window.orderSteps = [];
          document.addEventListener("mousedown", event => moving = event.target.closest(".etest-alist-answer"));
          document.addEventListener("mouseup", event => {
            const target = event.target.closest(".etest-alist-answer");
            if (moving && target && target !== moving) { target.before(moving); orderSteps.push(performance.now()); }
            moving = null;
          });
        });
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.locator(".ee-etest-ai-btn").click();
        await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: [], dropdownIndexes: [], matches: [], ordering: [2, 1, 0] } }));
        await page.waitForFunction(() => orderSteps.length === 1);
        assert.deepEqual(await page.locator(".etest-alist-answer").evaluateAll(rows => rows.map(row => row.dataset.ind)), ["2", "0", "1"]);
        await page.waitForFunction(() => orderSteps.length === 2);
        assert.deepEqual(await page.locator(".etest-alist-answer").evaluateAll(rows => rows.map(row => row.dataset.ind)), ["2", "1", "0"]);
        assert.ok(await page.evaluate(() => orderSteps[1] - orderSteps[0] >= 400));
        assert.equal(await page.evaluate(() => aiQuestions.length), 1);
      } finally { await page.close(); }
    });

    await t.test("matching pairs fill one by one through the existing page bridge", async () => {
      const row = index => `<div class="etest-pair-item" data-id="left-${index}"><span class="pair-l">Left ${index}</span><span class="etest-answer-inner pair-r" data-id="right-${index}">Right ${index}</span></div>`;
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player"><div class="etest-question-content"><p>Match practice pairs</p>${row(0)}${row(1)}<div class="etest-question-playactions"></div></div></div>`, { eeAiQuestionHelperEnabled: true, eeAiSequentialFillEnabled: true });
      try {
        await page.evaluate(() => {
          window.pairSteps = [];
          function drop(_event, ui) {
            const moving = ui.helper[0], old = this.querySelector(".pair-r"), from = moving.parentElement;
            if (from !== this) { from.replaceChild(old, moving); this.append(moving); }
            this.classList.add("isConnected");
            pairSteps.push(performance.now());
          }
          window.jQuery = element => ({ 0: element, data: () => ({ options: { drop } }) });
          jQuery.Event = (_type, init) => init;
        });
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-answer-bridge.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.locator(".ee-etest-ai-btn").click();
        await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: [], dropdownIndexes: [], matches: [{ left: 0, right: 1 }, { left: 1, right: 0 }], ordering: [] } }));
        await page.waitForFunction(() => pairSteps.length === 1);
        assert.equal(await page.locator(".isConnected").count(), 1);
        await page.waitForFunction(() => pairSteps.length === 2);
        assert.equal(await page.locator(".isConnected").count(), 2);
        assert.ok(await page.evaluate(() => pairSteps[1] - pairSteps[0] >= 400));
        assert.equal(await page.evaluate(() => aiQuestions.length), 1);
      } finally { await page.close(); }
    });

    await t.test("automatic filling is separate, serial, all-layout only and has no page indicators", async () => {
      const question = (id, value = "", hidden = false) => `<div class="etest-question-content" id="${id}" ${hidden ? 'style="display:none"' : ''}><p>Practice ${id}</p><input type="text" value="${value}"><div class="etest-question-playactions"></div></div>`;
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player cardsPerScreen-all">${question("first")}${question("answered", "KEEP")}${question("last")}${question("hidden", "", true)}</div>`, { eeAiAutoFillEnabled: true });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.waitForFunction(() => preferenceListeners.length > 0);
        await page.mouse.move(1000, 700);
        assert.equal(await page.evaluate(() => aiQuestions.length), 0);
        await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-toggle-loaded-test" })));
        await page.waitForFunction(() => aiQuestions.length === 1);
        await page.evaluate(() => {
          const late = document.createElement("div"); late.className = "etest-question-content"; late.id = "late";
          late.innerHTML = '<p>Later practice question</p><input type="text">'; document.querySelector(".etest-player").append(late);
          aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["FIRST"], dropdownIndexes: [], matches: [], ordering: [] } });
        });
        await page.waitForFunction(() => aiQuestions.length === 2);
        assert.equal(await page.locator("#first input").inputValue(), "FIRST");
        assert.equal(await page.locator("#answered input").inputValue(), "KEEP");
        await page.evaluate(() => aiCallbacks[1]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["LAST"], dropdownIndexes: [], matches: [], ordering: [] } }));
        await page.waitForFunction(() => aiActivity.includes("queue_finished"));
        assert.equal(await page.locator("#last input").inputValue(), "LAST");
        assert.equal(await page.locator("#hidden input").inputValue(), "");
        assert.equal(await page.locator("#late input").inputValue(), "");
        assert.deepEqual(await page.evaluate(() => aiModes), ["loaded-test", "loaded-test"]);
        assert.equal(await page.locator('.ee-etest-ai-btn, .ee-etest-ai-note, .fa-spin, [role="status"], [role="alert"]').count(), 0);
        assert.equal(await page.locator('[data-ee-ai-request-pending="true"]').count(), 0);
      } finally { await page.close(); }
    });

    for (const scenario of ["default-off", "unsupported", "error", "shortcut-stop", "escape", "disable", "route", "replacement", "edit", "layout-change"]) {
      await t.test(`automatic filling respects its scope and stops without page messages: ${scenario}`, async () => {
        const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player ${scenario === "unsupported" ? "cardsPerScreen-1" : "cardsPerScreen-all"}"><div class="etest-question-content"><p>Practice first</p><input type="text"><div class="etest-question-playactions"></div></div><div class="etest-question-content"><p>Practice second</p><input type="text"><div class="etest-question-playactions"></div></div></div>`, { eeAiAutoFillEnabled: scenario !== "default-off" });
        try {
          await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
          await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
          await page.waitForFunction(() => preferenceListeners.length > 0);
          await page.mouse.move(1000, 700);
          await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-toggle-loaded-test" })));
          if (["default-off", "unsupported"].includes(scenario)) {
            assert.equal(await page.evaluate(() => aiQuestions.length), 0);
            if (scenario === "unsupported") assert.equal(await page.evaluate(() => aiActivity.includes("queue_unsupported")), true);
          } else {
            await page.waitForFunction(() => aiQuestions.length === 1);
            if (scenario === "shortcut-stop") await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-toggle-loaded-test" })));
            if (scenario === "escape") await page.keyboard.press("Escape");
            if (scenario === "disable") await page.evaluate(() => changePreference("eeAiAutoFillEnabled", false));
            if (scenario === "route") await page.evaluate(() => history.replaceState(null, "", "/elearning/other"));
            if (scenario === "replacement") await page.evaluate(() => document.querySelector(".etest-player").replaceWith(document.querySelector(".etest-player").cloneNode(true)));
            if (scenario === "edit") await page.locator("input").first().fill("MY ANSWER");
            if (scenario === "layout-change") await page.locator(".etest-player").evaluate(el => el.classList.remove("cardsPerScreen-all"));
            await page.evaluate(failed => aiCallbacks[0](failed
              ? { ok: false, error: "Synthetic provider failure" }
              : { ok: true, suggestion: { choiceIndexes: [], fillIns: ["SHOULD NOT FILL"], dropdownIndexes: [], matches: [], ordering: [] } }), scenario === "error");
            await page.waitForTimeout(250);
            assert.equal(await page.evaluate(() => aiQuestions.length), 1);
            assert.equal(await page.locator("input").nth(1).inputValue(), "");
            assert.equal(await page.locator("input").first().inputValue(), scenario === "edit" ? "MY ANSWER" : "");
            assert.equal(await page.locator('[data-ee-ai-request-pending="true"]').count(), 0);
          }
          assert.equal(await page.locator('.ee-etest-ai-btn, .ee-etest-ai-note, .fa-spin, [role="status"], [role="alert"]').count(), 0);
        } finally { await page.close(); }
      });
    }

    await t.test("automatic filling skips a later question that the user edits and clears", async () => {
      const question = index => `<div class="etest-question-content"><p>Practice ${index}</p><input type="text"><div class="etest-question-playactions"></div></div>`;
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player cardsPerScreen-all">${question(0)}${question(1)}${question(2)}</div>`, { eeAiAutoFillEnabled: true });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.waitForFunction(() => preferenceListeners.length > 0);
        await page.mouse.move(1000, 700);
        await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-toggle-loaded-test" })));
        await page.waitForFunction(() => aiQuestions.length === 1);
        await page.locator("input").nth(1).fill("MY ANSWER");
        await page.locator("input").nth(1).fill("");
        await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["FIRST"], dropdownIndexes: [], matches: [], ordering: [] } }));
        await page.waitForFunction(() => aiQuestions.length === 2);
        assert.equal(await page.evaluate(() => aiQuestions[1].plainBody.includes("Practice 2")), true);
        await page.evaluate(() => aiCallbacks[1]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["LAST"], dropdownIndexes: [], matches: [], ordering: [] } }));
        await page.waitForFunction(() => aiActivity.includes("queue_finished"));
        assert.equal(await page.locator("input").nth(1).inputValue(), "");
      } finally { await page.close(); }
    });

    await t.test("automatic filling holds a hovered answer without another provider request", async () => {
      const page = await fixture(browser, "elearning/synthetic", '<div class="etest-player cardsPerScreen-all"><div class="etest-question-content"><p>Practice first</p><input type="text"><div class="etest-question-playactions"></div></div><div class="etest-question-content"><p>Practice second</p><input type="text"><div class="etest-question-playactions"></div></div></div>', { eeAiAutoFillEnabled: true });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.waitForFunction(() => preferenceListeners.length > 0);
        await page.mouse.move(1000, 700);
        await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-toggle-loaded-test" })));
        await page.waitForFunction(() => aiQuestions.length === 1);
        await page.locator(".etest-question-content p").first().hover();
        await page.evaluate(() => aiCallbacks[0]({ ok: true, suggestion: { choiceIndexes: [], fillIns: ["HELD"], dropdownIndexes: [], matches: [], ordering: [] } }));
        await page.waitForTimeout(100);
        assert.equal(await page.locator("input").first().inputValue(), "");
        assert.equal(await page.evaluate(() => aiQuestions.length), 1);
        await page.mouse.move(1000, 700);
        await page.waitForFunction(() => document.querySelector("input").value === "HELD");
        await page.waitForFunction(() => aiQuestions.length === 2);
        await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-toggle-loaded-test" })));
        assert.equal(await page.locator('.ee-etest-ai-note, [role="status"]').count(), 0);
      } finally { await page.close(); }
    });

    await t.test("shortcut log explains buttons-only mode and missing question focus", async () => {
      const question = '<div class="etest-question-content"><p>Synthetic question</p><div class="etest-question-playactions"></div></div>';
      const page = await fixture(browser, "elearning/synthetic", `<div class="etest-player">${question}${question}</div>`, { eeAiQuestionHelperEnabled: true });
      try {
        await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
        await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
        await page.waitForSelector(".ee-etest-ai-btn");
        await page.evaluate(() => {
          extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-suggest-current-question" }));
          changePreference("eeAiAnswerMode", "both");
          extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-suggest-current-question" }));
        });
        assert.deepEqual(await page.evaluate(() => aiActivity), ["shortcut_buttons", "shortcut_no_question"]);
        assert.equal(await page.evaluate(() => aiCallbacks.length), 0);
      } finally { await page.close(); }
    });

    for (const trigger of ["button", "shortcut"]) {
      await t.test(`AI provider errors stay visible with helper messages off: ${trigger}`, async () => {
        const page = await fixture(browser, "elearning/synthetic", '<div class="etest-player"><div class="etest-question-content"><p>Choose a synthetic option</p><input type="text"><div class="etest-question-playactions"></div></div></div>', {
          eeAiQuestionHelperEnabled: true, eeAiHelperMessagesEnabled: false, eeAiAnswerMode: "both",
        });
        try {
          await page.addScriptTag({ content: source("scripts/lib/ee-common.js") });
          await page.addScriptTag({ content: source("scripts/etest-enhancer.js") });
          await page.waitForSelector(".ee-etest-ai-btn");
          if (trigger === "button") await page.locator(".ee-etest-ai-btn").click();
          else await page.evaluate(() => extensionMessageListeners.forEach(fn => fn({ type: "ee-ai-suggest-current-question" })));
          assert.equal(await page.evaluate(() => aiCallbacks.length), 1);
          await page.evaluate(() => aiCallbacks[0]({ ok: false, error: "Synthetic provider unavailable" }));
          assert.equal(await page.locator('[role="alert"]').textContent({ timeout: 1500 }), "Synthetic provider unavailable");
          assert.equal(await page.locator("input").inputValue(), "");
          assert.equal(await page.locator(".ee-etest-ai-btn").isDisabled(), false);
        } finally { await page.close(); }
      });
    }

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
