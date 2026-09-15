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
  const context = { globalThis: null, Date, Array, Object, Number, String, RegExp };
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

test("theme normalization handles default and invalid themes", () => {
  const { normalizeTheme, normalizeColor, normalizeCustomTheme, DEFAULT_CUSTOM_THEME } = loadCommon();

  assert.equal(normalizeTheme("ocean"), "ocean");
  assert.equal(normalizeTheme("invalid-theme"), "dark");
  assert.equal(normalizeColor("#ffffff", "#000000"), "#ffffff");
  assert.equal(normalizeColor("invalid", "#000000"), "#000000");

  const custom = normalizeCustomTheme({ bgBase: "#123456" });
  assert.equal(custom.bgBase, "#123456");
  assert.equal(custom.bgRaised, DEFAULT_CUSTOM_THEME.bgRaised);
});

test("date formatting and parsing strictly validates calendar dates", () => {
  const { parseDateOnly, formatDate } = loadCommon();

  assert.equal(parseDateOnly("2026-09-08") instanceof Date, true);
  assert.equal(parseDateOnly("2024-02-31"), null);
  assert.equal(parseDateOnly("invalid"), null);

  const d = new Date(2026, 8, 8); // Sept 8, 2026
  assert.equal(formatDate(d), "2026-09-08");
  assert.equal(formatDate("not-a-date"), "");
});

test("text normalization and balanced bracket extraction utilities", () => {
  const { normalizeKeyText, extractBalanced, extractObjectLiteral, splitTopLevelArguments } = loadCommon();

  assert.equal(normalizeKeyText("Fyzika – 2. polrok"), "fyzika-2-polrok");

  const code = "const obj = { a: [1, 2], b: 'hello' };";
  const openBrace = code.indexOf("{");
  assert.equal(extractBalanced(code, openBrace), "{ a: [1, 2], b: 'hello' }");
  assert.equal(extractObjectLiteral(code, "obj ="), "{ a: [1, 2], b: 'hello' }");

  const argsStr = "1, { x: 2, y: 3 }, ['a', 'b']";
  assert.deepEqual([...splitTopLevelArguments(argsStr)], ["1", "{ x: 2, y: 3 }", "['a', 'b']"]);
});
