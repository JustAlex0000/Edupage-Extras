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
    ["ee-theme-purple", "#171326", "#c3b9df"],
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
