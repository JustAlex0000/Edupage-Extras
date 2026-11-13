const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const scripts = manifest.content_scripts.flatMap(entry => entry.js || []).filter(file => /^scripts\/grades-/.test(file));

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  test(`${name}: grade weights toggle, late data, rerender and cleanup`, { timeout: 30000 }, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://weights.edupage.org/**", route => route.fulfill({
      contentType: "text/html", body: '<div id="viewer-random"><table class="znamkyTable"><tbody><tr class="header"><th>Subject</th><th>Grades</th></tr><tr class="predmetRow" data-predmetid="1"><td class="fixedCell"><b>Synthetic subject</b></td><td><span>No grades</span></td><td class="znPriemerCell"></td></tr></tbody></table></div><div id="znamkyTableHeaderBg">Native header</div>',
    }));
    await page.goto("https://weights.edupage.org/znamky/");
    await page.evaluate(() => {
      window.listeners = [];
      window.chrome = { i18n: { getUILanguage: () => "en" }, storage: {
        local: { get: (_, cb) => cb({ gradesAttendanceStatsEnabled: false }) },
        onChanged: { addListener: cb => listeners.push(cb) },
      } };
      window.changeWeights = value => listeners.forEach(cb => cb({ eeGradesWeightsEnabled: { newValue: value } }, "local"));
    });
    await page.addScriptTag({ path: path.join(ROOT, "scripts/lib/ee-common.js") });
    await page.evaluate(() => { EE.withLanguageReady = cb => cb(); EE.getMessage = key => key; });
    for (const file of scripts) await page.addScriptTag({ path: path.join(ROOT, file) });
    assert.deepEqual(errors, []);
    assert.equal(await page.locator(".ee-grade-weights").count(), 0);
    await page.evaluate(() => changeWeights(true));
    // The native table can arrive before its viewer initializer.
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.type = "text/plain";
      script.id = "synthetic-initializer";
      script.textContent = "$j('#viewer-random').znamkyStudentViewer(" + JSON.stringify({
        kategorie: [{ PredmetID: 1, p_meno: "Empty category", p_vaha: 30 }],
        vsetkyUdalosti: { edupage: [{ PredmetID: 1, p_meno: "<img src=x onerror=alert(1)>", p_vaha: 40 }] },
        vsetkyZnamky: [],
      }) + ");";
      document.head.append(script);
    });
    await page.waitForSelector(".ee-grade-weights", { timeout: 5000 }).catch(async error => {
      t.diagnostic(JSON.stringify({ errors }));
      throw error;
    });
    assert.equal(await page.locator(".ee-grade-weights dt").count(), 2);
    assert.equal(await page.locator(".ee-grade-weights img").count(), 0);
    assert.match(await page.locator(".ee-grade-weights").textContent(), /Empty category1\.5×/);
    assert.equal(await page.locator("tr.predmetRow .ee-grade-weights").count(), 0);
    assert.equal(await page.locator(".ee-grades-toolbar .ee-grade-weights").count(), 1);
    await page.locator(".ee-grade-weights summary").click();
    await page.evaluate(() => {
      const teacher = document.createElement("small");
      teacher.textContent = "Synthetic teacher";
      document.querySelector(".fixedCell").append(document.createElement("br"), teacher);
      __eeGrades.enhanceGradesTable();
    });
    assert.equal(await page.locator(".ee-grade-weights option").first().textContent(), "Synthetic subject");
    // Some skins put the teacher inside the bold label itself.
    await page.evaluate(() => {
      const cell = document.querySelector(".fixedCell");
      cell.querySelector("b").append(cell.querySelector("br"), cell.querySelector("small"));
      __eeGrades.enhanceGradesTable();
    });
    assert.equal(await page.locator(".ee-grade-weights option").first().textContent(), "Synthetic subject");
    assert.equal(await page.locator(".fixedCell small").textContent(), "Synthetic teacher");
    // Native EduPage markup: <b>Subject<div>Teacher</div></b>.
    await page.evaluate(() => {
      const teacher = document.querySelector(".fixedCell small");
      const block = document.createElement("div");
      block.textContent = teacher.textContent;
      teacher.replaceWith(block);
      document.querySelector(".fixedCell br").remove();
      __eeGrades.enhanceGradesTable();
    });
    assert.equal(await page.locator(".ee-grade-weights option").first().textContent(), "Synthetic subject");
    assert.equal(await page.locator(".fixedCell b div").textContent(), "Synthetic teacher");
    await page.evaluate(() => {
      window.originalDisclosure = document.querySelector(".ee-grade-weights");
      __eeGrades.enhanceGradesTable();
      __eeGrades.enhanceGradesTable();
    });
    assert.equal(await page.evaluate(() => originalDisclosure === document.querySelector(".ee-grade-weights") && originalDisclosure.open), true);
    assert.equal(await page.locator(".fixedCell b").textContent(), "Synthetic subjectSynthetic teacher");
    assert.equal(await page.locator("#znamkyTableHeaderBg").innerHTML(), "Native header");
    await page.locator(".ee-grade-weights select").press("Escape");
    assert.equal(await page.locator(".ee-grade-weights").getAttribute("open"), null);
    await page.locator(".ee-grade-weights summary").click();
    await page.locator(".fixedCell").click();
    assert.equal(await page.locator(".ee-grade-weights").getAttribute("open"), null);
    await page.locator(".ee-grade-weights summary").click();
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.weightMutations = 0;
      new MutationObserver(records => weightMutations += records.length)
        .observe(document.querySelector("table"), { childList: true, characterData: true, subtree: true });
    });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => weightMutations), 0);
    await page.evaluate(() => {
      const table = document.querySelector("table.znamkyTable");
      table.replaceWith(table.cloneNode(true));
    });
    await page.waitForFunction(() => document.querySelector(".ee-grade-weights") !== originalDisclosure);
    await page.evaluate(() => changeWeights(false));
    assert.equal(await page.locator(".ee-grade-weights").count(), 0);
    assert.equal(await page.locator("tr.predmetRow td").nth(1).textContent(), "No grades");
    await page.evaluate(() => changeWeights(true));
    assert.equal(await page.locator(".ee-grade-weights").count(), 1);
    await page.evaluate(() => { history.replaceState(null, "", "/user/"); __eeGrades.enhanceGradesTable(); });
    assert.equal(await page.locator(".ee-grade-weights").count(), 0);
    await page.evaluate(() => { history.replaceState(null, "", "/znamky/"); __eeGrades.enhanceGradesTable(); });
    assert.equal(await page.locator(".ee-grade-weights").count(), 1);
    await page.evaluate(() => {
      document.getElementById("synthetic-initializer").textContent = "invalid";
      __eeGrades.enhanceGradesTable();
    });
    assert.equal(await page.locator(".ee-grade-weights").count(), 0);
    await page.close();
  });
}
