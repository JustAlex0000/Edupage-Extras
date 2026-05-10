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
  const instrumentedSource = source.replace(
    "initDarkMode();",
    'globalThis.__eeTest = { normalizeTheme, shouldSuppressThemeForPath, resolveAppliedTheme }; initDarkMode();',
  );

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
        },
        onChanged: {
          addListener() {},
        },
      },
      runtime: {
        onMessage: {
          addListener() {},
        },
      },
    },
    setTimeout,
    clearTimeout,
  };

  context.window = context;
  context.window.top = context.window;
  context.globalThis = context;

  vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });
  return context.__eeTest;
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
