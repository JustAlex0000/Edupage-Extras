const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCommon() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "lib", "ee-common.js"),
    "utf8",
  );
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "ee-common.js" });
  return context.EE;
}

test("CSV escaping neutralizes spreadsheet formulas after leading whitespace", () => {
  const { csvEscape } = loadCommon();

  assert.equal(csvEscape("=HYPERLINK(\"https://example.test\")"), "\"'=HYPERLINK(\"\"https://example.test\"\")\"");
  assert.equal(csvEscape("  +SUM(1,2)"), "\"'  +SUM(1,2)\"");
  assert.equal(csvEscape("\t@SUM(A1:A2)"), "'\t@SUM(A1:A2)");
  assert.equal(csvEscape("-2"), "'-2");
  assert.equal(csvEscape("ordinary text"), "ordinary text");
  assert.equal(csvEscape("quoted, text"), "\"quoted, text\"");
});

test("shared HTML escaping protects text interpolated into extension markup", () => {
  const { escapeHtml } = loadCommon();

  assert.equal(
    escapeHtml("<img src=x onerror='alert(1)'>&"),
    "&lt;img src=x onerror=&#39;alert(1)&#39;&gt;&amp;",
  );
});

test("theme storage contract keeps every live page preference together", () => {
  const { THEME_STORAGE_KEY_LIST, readThemeSettings, createThemeMessage } = loadCommon();
  const values = {
    darkModeEnabled: true,
    themeMode: "purple",
    cleanUiEnabled: true,
    hideHelpTextEnabled: true,
    eeHidePageHeroesEnabled: true,
    eeHidePersonalInfoEnabled: true,
    eeHideLikesEnabled: true,
    eeHideEdupageHelpEnabled: true,
    eeHideEducationalGamesEnabled: true,
    eeHideTestYourselfEnabled: true,
    eeHideInteractiveBlackboardsEnabled: true,
    eeHidePhotosEnabled: true,
    eeHideRegistrationSurveysEnabled: true,
  };

  assert.equal(THEME_STORAGE_KEY_LIST.length, 16);
  const message = createThemeMessage(readThemeSettings(values));
  assert.equal(message.type, "ee-set-theme");
  assert.equal(message.theme, "purple");
  assert.equal(message.darkModeEnabled, true);
  assert.equal(message.cleanUiEnabled, true);
  assert.equal(message.hideHelpTextEnabled, true);
  assert.equal(message.hidePageHeroesEnabled, true);
  assert.equal(message.hidePersonalInfoEnabled, true);
  assert.equal(message.hideLikesEnabled, true);
  assert.equal(message.hideEdupageHelpEnabled, true);
  assert.equal(message.hideEducationalGamesEnabled, true);
  assert.equal(message.hideTestYourselfEnabled, true);
  assert.equal(message.hideInteractiveBlackboardsEnabled, true);
  assert.equal(message.hidePhotosEnabled, true);
  assert.equal(message.hideRegistrationSurveysEnabled, true);
});
