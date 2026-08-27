const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}

const settingsPath = path.join(__dirname, "..", "menu", "settings.html");
const html = fs.readFileSync(settingsPath, "utf8");
const settingsScript = fs.readFileSync(path.join(__dirname, "..", "menu", "settings.js"), "utf8");
const settingsCss = fs.readFileSync(path.join(__dirname, "..", "menu", "settings.css"), "utf8");
const switchLabels = Array.from(
  html.matchAll(/<label class="([^"]*\bswitch\b[^"]*)"[^>]*>([\s\S]*?)<\/label>/g),
);

runTest("every settings switch includes the visual switch track", () => {
  assert.ok(switchLabels.length > 0, "expected at least one switch label");
  switchLabels.forEach(([, className, body]) => {
    assert.match(className, /\bswitch\b/);
    assert.match(body, /class="switch-track"/, `missing switch track for ${className}`);
  });
});

runTest("compact settings switches use screen-reader labels", () => {
  const compactSwitches = switchLabels.filter(([, className]) => /\bswitch-compact\b/.test(className));

  assert.ok(compactSwitches.length > 0, "expected compact switches for top-level settings");
  compactSwitches.forEach(([, , body]) => {
    assert.match(body, /class="sr-only"/, "compact switch is missing screen-reader text");
  });
});

runTest("debug-only attendance dates and WIP feature markers stay in their intended settings sections", () => {
  const debugStart = html.indexOf('id="panel-debug"');
  assert.ok(debugStart >= 0, "expected a Debug settings panel");
  assert.ok(html.indexOf('id="HalfyearStartDateInput"') > debugStart);
  assert.ok(html.indexOf('id="HalfyearEndDateInput"') > debugStart);

  const autoLoginRow = html.indexOf('for="AutoLoginCheckbox"');
  const etestCopyRow = html.match(/<div class="setting-row">[\s\S]*?setting-tag-wip[\s\S]*?for="EtestCopyCheckbox"[\s\S]*?<\/div>\s*<div class="setting-row setting-row-dependent"/);
  assert.ok(autoLoginRow >= 0 && html.indexOf('setting-tag-wip', autoLoginRow - 500) >= 0);
  assert.ok(etestCopyRow, "expected the test-copy setting row to keep its WIP marker");
  assert.match(html, /id="AutoLoginPreferredAccountRow"/);
  assert.match(html, /id="EtestQuestionButtonsRow"[^>]*hidden/);
  assert.match(html, /id="EtestWholeTestButtonRow"[^>]*hidden/);
  assert.match(html, /id="EtestIncludeAnswersRow"[^>]*hidden/);
  assert.match(html, /id="EtestIncludeImagesRow"[^>]*hidden/);
  assert.match(html, /for="EtestQuestionButtonsCheckbox"/);
  assert.match(html, /for="EtestWholeTestButtonCheckbox"/);
  assert.match(html, /for="EtestIncludeAnswersCheckbox"/);
  assert.match(html, /for="EtestIncludeImagesCheckbox"/);
});

runTest("test copying and its image export remain experimental dependent settings", () => {
  const imageExport = html.indexOf('id="EtestImageExportInput"');
  const experimentalPanel = html.indexOf('id="panel-experimental"');
  assert.ok(imageExport > experimentalPanel, "expected the image exporter in the Experimental panel");
  assert.match(html, /id="EtestImageExportButton"/);
  assert.match(html, /id="EtestImageExportRow"[^>]*hidden/);
  assert.ok(html.indexOf('for="EtestCopyCheckbox"') > experimentalPanel, "expected test copying in Experimental");
  assert.match(html, /src="etest-image-export\.js"/);
});

runTest("test-copy shortcut and toggle stay together on narrow settings pages", () => {
  const copyRow = html.match(/<div class="setting-row">[\s\S]*?for="EtestCopyCheckbox"[\s\S]*?<\/div>\s*<div class="setting-row setting-row-dependent"/);

  assert.ok(copyRow, "expected the test-copy setting row");
  assert.match(copyRow[0], /<div class="setting-row-actions">[\s\S]*?id="OpenEtestCopyShortcutSettingsButton"[\s\S]*?for="EtestCopyCheckbox"/);
  assert.match(settingsCss, /\.setting-row:has\(\.setting-row-actions\)/);
});

runTest("Test Question Helper stays opt-in inside Experimental", () => {
  const experimentalPanel = html.indexOf('id="panel-experimental"');
  const helper = html.indexOf('id="AiQuestionHelperCheckbox"');
  assert.ok(helper > experimentalPanel, "expected AI helper in Experimental");
  assert.match(html, /id="AiQuestionHelperSettings"[^>]*hidden/);
  assert.match(html, /id="AiProviderSelect"/);
  assert.match(html, /value="ollama"/);
  assert.match(html, /value="lmstudio"/);
  assert.match(html, /value="nvidia"/);
  assert.match(html, /value="openrouter"/);
  assert.match(html, /id="OpenAiShortcutSettingsButton"/);
  assert.match(settingsScript, /suggest-test-question/);
  assert.match(settingsScript, /aiQuestionHelperToggle\.checked = result\[AI_HELPER_ENABLED_KEY\] === true/);
});

runTest("the Stay Active test site asks for optional access before opening", () => {
  assert.match(html, /<button class="inline-link inline-link-button" id="OpenTestingSiteButton" type="button"/);
  assert.match(settingsScript, /const TESTING_SITE_PERMISSION = "https:\/\/edublurtesting\.ct\.ws\/\*";/);
  assert.match(settingsScript, /chrome\.permissions\.request\(\{ origins: \[TESTING_SITE_PERMISSION\] \}/);
  assert.match(settingsScript, /chrome\.tabs\.create\(\{ url: TESTING_SITE_URL \}\)/);
});

runTest("optional export tools are opt-in", () => {
  assert.match(html, /id="TimetableExportCheckbox"/);
  assert.match(html, /id="TimetableExportContent" hidden/);
  assert.match(settingsScript, /ucivoExportToggle\.checked = result\[UCIVO_EXPORT_KEY\] === true/);
  assert.match(settingsScript, /gradesExportToggle\.checked = result\[GRADES_EXPORT_KEY\] === true/);
  assert.match(settingsScript, /timetableExportToggle\.checked = result\[TIMETABLE_EXPORT_KEY\] === true/);
});

runTest("grades sorting and filtering is independently configurable and defaults on", () => {
  assert.match(html, /id="GradesSortFilterCheckbox"/);
  assert.match(settingsScript, /gradesSortFilterToggle\.checked = result\[GRADES_SORT_FILTER_KEY\] !== false/);
  assert.match(settingsScript, /\[GRADES_SORT_FILTER_KEY\]: gradesSortFilterToggle\.checked/);
});

runTest("timetable controls live in the Timetable tab", () => {
  const featuresPanel = html.indexOf('id="panel-features"');
  const timetablePanel = html.indexOf('id="panel-timetable"');
  const updatesPanel = html.indexOf('id="panel-updates"');

  assert.ok(featuresPanel >= 0 && timetablePanel > featuresPanel && updatesPanel > timetablePanel);
  [
    'for="TimetableHighlightsCheckbox"',
    'id="TimetableHighlightColorsRow"',
    'for="TimetableExportCheckbox"',
    'id="TimetableExportContent"',
  ].forEach((target) => {
    const index = html.indexOf(target);
    assert.ok(index > timetablePanel && index < updatesPanel, `expected ${target} in the Timetable tab`);
  });
});

runTest("Grades tab owns the grades-page settings", () => {
  const featuresPanel = html.indexOf('id="panel-features"');
  const gradesPanel = html.indexOf('id="panel-grades"');
  const timetablePanel = html.indexOf('id="panel-timetable"');

  assert.ok(featuresPanel >= 0 && gradesPanel > featuresPanel && timetablePanel > gradesPanel);
  assert.match(html, /id="nav-grades"[^>]*aria-controls="panel-grades"/);

  [
    'for="GradeBadgesCheckbox"',
    'for="GradesAttendanceCheckbox"',
    'for="GradesSortFilterCheckbox"',
    'for="GradesExportCheckbox"',
  ].forEach((target) => {
    const index = html.indexOf(target);
    assert.ok(index > gradesPanel && index < timetablePanel, `expected ${target} in Grades`);
  });

  const attendanceSummary = html.indexOf('for="AttendancePercentagesCheckbox"');
  assert.ok(attendanceSummary > featuresPanel && attendanceSummary < gradesPanel, "expected the standalone Attendance setting to remain in Features");
});

runTest("normal settings form one continuous searchable document", () => {
  assert.match(html, /id="SettingsSearchInput"[^>]*type="search"|type="search"[^>]*id="SettingsSearchInput"/);
  assert.match(html, /id="StandardSettingsContent"/);
  assert.doesNotMatch(html, /role="tab(list)?"/);

  ["appearance", "cleanup", "features", "grades", "timetable", "updates", "debug"].forEach((section) => {
    const openingTag = html.match(new RegExp(`<section[^>]*id="panel-${section}"[^>]*>`))?.[0];
    assert.ok(openingTag, `expected ${section} section`);
    assert.match(openingTag, /settings-standard-section/);
    assert.doesNotMatch(openingTag, /\shidden(?:\s|>)/);
  });

  assert.match(settingsScript, /normalizeSettingsSearch/);
  assert.match(settingsScript, /scrollIntoView/);
  assert.match(settingsScript, /requestAnimationFrame\(updateActiveSettingsSection\)/);
  assert.match(settingsScript, /row\.closest\("\[hidden\]"\)/, "search must respect dependent hidden controls");
});

runTest("Experimental stays isolated and acknowledgement expires on extension updates", () => {
  assert.match(html, /id="panel-experimental"[^>]*hidden/);
  assert.match(html, /data-i18n="experimentalConfirmContinue">I understand the risks</);
  assert.match(settingsScript, /eeExperimentalAcknowledgedVersion/);
  assert.match(settingsScript, /chrome\.runtime\.getManifest\(\)\.version/);
  assert.match(settingsScript, /result\[EXPERIMENTAL_ACKNOWLEDGEMENT_KEY\] === currentExtensionVersion/);
  assert.doesNotMatch(settingsScript, /sessionStorage/);
  assert.match(settingsScript, /standardSettingsContent\.hidden = true/);
  assert.match(settingsScript, /settingsSearch\.hidden = true/);
});

runTest("narrow settings keep search and jump navigation sticky", () => {
  assert.match(settingsCss, /@media \(max-width: 900px\)[\s\S]*?\.settings-sidebar\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(settingsCss, /@media \(max-width: 900px\)[\s\S]*?\.settings-nav\s*\{[\s\S]*?flex-direction:\s*row/);
  assert.match(settingsCss, /\.setting-group\s*\{\s*scroll-margin-top:\s*132px/);
  assert.match(settingsCss, /#SettingsSearchInput\s*\{[\s\S]*?min-height:\s*44px/);
});
