const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadLogin({ passwordStep = false } = {}) {
  let interval;
  let onChanged;
  let clicks = 0;
  let nextTimer = 0;
  const timers = new Map();
  const listeners = new Map();
  const windowListeners = new Map();
  const elements = new Map();
  const createElement = () => ({
    isConnected: true,
    classList: { add() {}, remove() {} },
    setAttribute() {}, remove() {},
  });
  const container = { appendChild: (element) => { elements.set(element.id, element); } };
  const control = { isConnected: true, disabled: false, click: () => { clicks += 1; } };
  const form = {
    isConnected: true,
    querySelector: (selector) => selector.startsWith('input[type="text"]') ? username : control,
    requestSubmit: () => { clicks += 1; },
  };
  const field = (type) => ({
    tagName: "INPUT", type, value: "autofilled", isConnected: true, offsetWidth: 100,
    closest: () => form,
  });
  const username = { ...field("text"), id: "usernamefield" };
  const password = field("password");
  const document = {
    body: container, head: container, readyState: "complete",
    createElement,
    getElementById: (id) => id === "usernamefield" ? username : elements.get(id),
    querySelector: (selector) => selector === 'input[type="password"]' && passwordStep ? password : null,
    querySelectorAll: () => [],
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
  };
  const window = {
    location: { pathname: "/login/" },
    setInterval: (callback) => { interval = callback; return 1; },
    clearInterval: () => { interval = null; },
    setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (type, callback) => windowListeners.set(type, callback),
  };
  window.top = window;
  const context = {
    window, document, setTimeout: window.setTimeout,
    MutationObserver: class { observe() {} disconnect() {} },
    chrome: {
      i18n: { getMessage: () => "Submitting" },
      storage: {
        local: { get: (_keys, callback) => callback({ eeAutoLoginEnabled: true }) },
        onChanged: { addListener: (callback) => { onChanged = callback; } },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "scripts/lib/ee-common.js"), "utf8") + "\n" + fs.readFileSync(path.join(__dirname, "..", "scripts", "autologin.js"), "utf8"), context);
  return {
    control, form, username, password, window,
    get clicks() { return clicks; },
    tick: () => interval?.(),
    type: (type = "keydown") => listeners.get(type)?.({ target: passwordStep ? password : username }),
    disable: () => onChanged({ eeAutoLoginEnabled: { newValue: false } }, "local"),
    leave: () => windowListeners.get("pagehide")(),
    flushSubmit: () => {
      for (const [id, timer] of Array.from(timers)) {
        if (timer.ms !== 200) continue;
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

for (const passwordStep of [false, true]) {
  const step = passwordStep ? "password" : "username";
  for (const action of ["keydown", "beforeinput", "paste", "disable", "disconnect", "disconnect form", "disconnect field", "clear", "disabled control", "pagehide", "route change"]) {
    test(`${step} auto-login cancels a queued submit after ${action}`, () => {
      const login = loadLogin({ passwordStep });
      login.tick();
      if (["keydown", "beforeinput", "paste"].includes(action)) login.type(action);
      else if (action === "disable") login.disable();
      else if (action === "disconnect") login.control.isConnected = false;
      else if (action === "disconnect form") login.form.isConnected = false;
      else if (action === "disconnect field") (passwordStep ? login.password : login.username).isConnected = false;
      else if (action === "clear") (passwordStep ? login.password : login.username).value = "";
      else if (action === "disabled control") login.control.disabled = true;
      else if (action === "pagehide") login.leave();
      else login.window.location.pathname = "/user/";
      login.flushSubmit();
      assert.equal(login.clicks, 0);
    });
  }
  test(`${step} auto-login still submits one unchanged autofilled form`, () => {
    const login = loadLogin({ passwordStep });
    login.tick();
    login.tick();
    login.flushSubmit();
    assert.equal(login.clicks, 1);
  });
}
