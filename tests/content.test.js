const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createClassList() {
  const values = new Set();
  return {
    add(...tokens) {
      tokens.forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => values.delete(token));
    },
    toggle(token, force) {
      if (force === undefined) {
        if (values.has(token)) {
          values.delete(token);
          return false;
        }
        values.add(token);
        return true;
      }
      if (force) {
        values.add(token);
        return true;
      }
      values.delete(token);
      return false;
    },
    contains(token) {
      return values.has(token);
    },
  };
}

function loadContentInternals(pathname = "/") {
  const scriptPath = path.join(__dirname, "..", "scripts", "content.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const documentElement = {
    classList: createClassList(),
    style: {
      setProperty() {},
    },
    dataset: {},
    querySelectorAll() {
      return [];
    },
  };

  const context = {
    console,
    location: { pathname },
    document: {
      readyState: "complete",
      documentElement,
      body: {},
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      createElement() {
        return {
          id: "",
          textContent: "",
          remove() {},
        };
      },
      getElementById() {
        return null;
      },
      head: {
        appendChild() {},
        querySelector() {
          return null;
        },
      },
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    chrome: {
      storage: {
        local: {
          get(_keys, callback) {
            callback({});
          },
          set(_values, callback) {
            if (callback) callback();
          },
        },
        onChanged: {
          addListener() {},
        },
      },
      runtime: {
        onMessage: {
          addListener() {},
        },
        getManifest() {
          return { version: "0.0.0-test" };
        },
      },
      i18n: {
        getMessage() {
          return "";
        },
      },
    },
    setTimeout,
    clearTimeout,
  };

  context.window = context;
  context.window.top = context.window;
  context.globalThis = context;
  context.__EE_TEST__ = true;

  const libSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "lib", "ee-common.js"), "utf8");
  vm.runInNewContext(libSource + "\n" + source, context, { filename: scriptPath });
  return context.__eeTestExports;
}

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

runTest("login routes suppress dark theme application", () => {
  const { shouldSuppressThemeForPath, resolveAppliedTheme } = loadContentInternals("/login/");

  assert.equal(shouldSuppressThemeForPath("/login/"), true);
  assert.equal(resolveAppliedTheme({ darkModeEnabled: true, theme: "forest", pathname: "/login/" }), "light");
});

runTest("non-login routes still apply the selected theme", () => {
  const { shouldSuppressThemeForPath, resolveAppliedTheme } = loadContentInternals("/dashboard");

  assert.equal(shouldSuppressThemeForPath("/dashboard"), false);
  assert.equal(resolveAppliedTheme({ darkModeEnabled: true, theme: "forest", pathname: "/dashboard" }), "forest");
});

runTest("stored light theme remains light when themes are enabled", () => {
  const { normalizeTheme, resolveAppliedTheme } = loadContentInternals("/dashboard");

  assert.equal(normalizeTheme("light"), "light");
  assert.equal(resolveAppliedTheme({ darkModeEnabled: true, theme: "light", pathname: "/dashboard" }), "light");
});

runTest("dark-mode normalizer only recolors visible non-heading borders", () => {
  const { hasVisibleBorder, isHeadingElement } = loadContentInternals("/dashboard");
  const noBorder = {
    borderTopWidth: "0px", borderRightWidth: "0px", borderBottomWidth: "0px", borderLeftWidth: "0px",
    borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none",
    outlineWidth: "0px", outlineStyle: "none",
  };
  const bottomBorder = { ...noBorder, borderBottomWidth: "1px", borderBottomStyle: "solid" };

  assert.equal(hasVisibleBorder(noBorder), false);
  assert.equal(hasVisibleBorder(bottomBorder), true);
  assert.equal(isHeadingElement({ tagName: "H1" }), true);
  assert.equal(isHeadingElement({ tagName: "DIV" }), false);
});

runTest("update review links follow the current browser", () => {
  const { resolveReviewUrl, getUpdateToastExitDuration, UPDATE_TOAST_DURATION_MS } = loadContentInternals("/dashboard");

  assert.equal(
    resolveReviewUrl("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"),
    "https://chromewebstore.google.com/detail/edupage-extras/ljakjcljhfkjgndmopmpaakklgnkccca/reviews",
  );
  assert.equal(
    resolveReviewUrl("Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0"),
    "https://addons.mozilla.org/en-US/firefox/addon/edupage-extras/reviews/",
  );
  assert.equal(UPDATE_TOAST_DURATION_MS, 20_000);
  assert.equal(getUpdateToastExitDuration(false), 220);
  assert.equal(getUpdateToastExitDuration(true), 0);
});

runTest("update toast countdown uses one smooth CSS transition", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "content.js"), "utf8");

  assert.match(source, /"transition: transform 20s linear"/);
  assert.doesNotMatch(source, /setInterval\(updateProgress/);
});

runTest("an active eTest player suppresses the theme only when auto-off is enabled", () => {
  const { resolveAppliedTheme } = loadContentInternals("/dashboard");

  assert.equal(resolveAppliedTheme({
    darkModeEnabled: true,
    theme: "forest",
    pathname: "/dashboard",
    etestAutoThemeOffEnabled: true,
    etestPlayerActive: true,
  }), "light");
  assert.equal(resolveAppliedTheme({
    darkModeEnabled: true,
    theme: "forest",
    pathname: "/dashboard",
    etestAutoThemeOffEnabled: true,
    etestPlayerActive: false,
  }), "forest");
  assert.equal(resolveAppliedTheme({
    darkModeEnabled: true,
    theme: "forest",
    pathname: "/dashboard",
    etestAutoThemeOffEnabled: false,
    etestPlayerActive: true,
  }), "forest");
});

runTest("automatic eTest theme suppression defaults on but requires Stay Active Mode", () => {
  const { isEtestAutoThemeOffActive } = loadContentInternals("/dashboard");

  assert.equal(isEtestAutoThemeOffActive({
    eeActivityShieldEnabled: true,
  }), true);
  assert.equal(isEtestAutoThemeOffActive({
    eeActivityShieldEnabled: false,
  }), false);
  assert.equal(isEtestAutoThemeOffActive({
    eeActivityShieldEnabled: true,
    eeEtestAutoThemeOffEnabled: false,
  }), false);
});

runTest("custom theme pre-paint fallback matches the shared default background", () => {
  const context = {};
  context.globalThis = context;
  const libPath = path.join(__dirname, "..", "scripts", "lib", "ee-common.js");
  vm.runInNewContext(fs.readFileSync(libPath, "utf8"), context, { filename: libPath });

  const css = fs.readFileSync(path.join(__dirname, "..", "scripts", "instant-theme.css"), "utf8");
  const customRule = css.match(/html\.ee-theme-custom,[\s\S]*?\{([\s\S]*?)\}/);

  assert.ok(customRule, "expected the custom theme pre-paint rule");
  assert.match(
    customRule[1],
    new RegExp(`var\\(--ee-custom-bg-base, ${context.EE.DEFAULT_CUSTOM_THEME.bgBase}\\)`),
  );
});

runTest("built-in dark themes keep secondary text readable", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "scripts", "content.js"), "utf8");
  const rules = [
    ["ee-dark", "#0c1220", "#b6c0d1"],
    ["ee-theme-ocean", "#071a1f", "#a8d0d1"],
    ["ee-theme-forest", "#11170f", "#b3c6aa"],
    ["ee-theme-emerald", "#071a12", "#a5d6bd"],
    ["ee-theme-purple", "#180b35", "#d2c2ee"],
  ];
  const luminanceForHex = (hex) => {
    const channels = hex.slice(1).match(/../g).map((part) => Number.parseInt(part, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };

  for (const [theme, background, mutedText] of rules) {
    assert.match(css, new RegExp(`html\\.${theme}[\\s\\S]*?--ee-text-muted: ${mutedText}`));
    const contrast = (Math.max(luminanceForHex(background), luminanceForHex(mutedText)) + 0.05)
      / (Math.min(luminanceForHex(background), luminanceForHex(mutedText)) + 0.05);
    assert.ok(contrast >= 7, `${theme} muted text contrast should be at least 7:1, got ${contrast}`);
  }
});

runTest("known late-rendered widgets have direct first-paint theme coverage", () => {
  const contentCss = fs.readFileSync(path.join(__dirname, "..", "scripts", "content.js"), "utf8");
  const instantCss = fs.readFileSync(path.join(__dirname, "..", "scripts", "instant-theme.css"), "utf8");

  for (const selector of [
    ".hwsideElem", ".ui-datepicker-calendar", ".separator", ".zsvHeaderTitle",
    ".fixedCell", ".znZnamka", ".akceptujBtn", ".dropDownBtn", ".dropDownPanel",
    ".ecourse-standards-subject-item",
  ]) {
    assert.match(contentCss, new RegExp(selector.replace(/\./g, "\\.")));
    assert.match(instantCss, new RegExp(selector.replace(/\./g, "\\.")));
  }
  assert.match(contentCss, /html\.ee-dark \.usercalendarTitle \{\s*border: none !important;/);
  assert.match(contentCss, /--ee-current-period: color-mix\(in srgb, var\(--ee-link\) 28%, var\(--ee-card-bg\)\)/);
  assert.match(contentCss, /--ee-current-period: color-mix\(in srgb, var\(--ee-custom-accent, #4fc3f7\) 28%, var\(--ee-custom-bg-raised, #171d28\)\)/);
});

runTest("cached theme bootstrap runs before the larger content script", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  const bootstrapIndex = scripts.indexOf("scripts/theme-bootstrap.js");
  const contentIndex = scripts.indexOf("scripts/content.js");
  const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "theme-bootstrap.js"), "utf8");

  assert.ok(bootstrapIndex >= 0 && bootstrapIndex < contentIndex);
  assert.match(source, /root\.classList\.add\("ee-dark", `ee-theme-\$\{theme\}`\)/);
  assert.match(source, /eeThemeCacheV1/);
});

runTest("dark theme preserves native eTest copy-button styling", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "scripts", "content.js"), "utf8");
  assert.match(
    css,
    /html\.ee-dark button:not\(\.ee-etest-copyall-btn\):not\(\.ee-etest-question-copy-btn\)/,
  );
});
