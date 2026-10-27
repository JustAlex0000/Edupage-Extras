const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.join(__dirname, "..");

// Small DOM fixture: no real account names, page captures or credentials.
function fixture(name = "Marek Novák") {
  let observerCallback, disconnected = false;
  const timers = new Map(), events = new Map();
  class Text {
    constructor(data) { this.nodeType = 3; this.data = data; this.parentElement = null; }
    get isConnected() { return this.parentElement?.isConnected || false; }
  }
  class Element {
    constructor(tag, ...children) {
      this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = []; this.parentElement = null; this.attrs = new Map();
      children.forEach(child => this.append(child));
    }
    append(child) { if (typeof child === "string") child = new Text(child); child.parentElement = this; this.childNodes.push(child); return child; }
    get isConnected() { return this === html || this.parentElement?.isConnected || false; }
    getAttribute(key) { return this.attrs.has(key) ? this.attrs.get(key) : null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    matches() { return ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(this.tagName) || this.attrs.has("data-ee-anonymizer-ignore") || (this.attrs.has("contenteditable") && this.attrs.get("contenteditable") !== "false"); }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    contains(node) { return this === node || this.childNodes.some(child => child.nodeType === 1 && child.contains(node) || child === node); }
  }
  const html = new Element("html"), head = html.append(new Element("head")), title = head.append(new Element("title", name + " — EduPage"));
  const classes = new Set();
  html.classList = {
    remove(name) { classes.delete(name); },
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    contains(name) { return classes.has(name); },
  };
  const body = html.append(new Element("body"));
  const profile = body.append(new Element("div"));
  const nameElement = profile.append(new Element("span", name));
  const document = {
    documentElement: html, body,
    addEventListener(type, callback) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(callback); },
    removeEventListener(type, callback) { events.get(type)?.delete(callback); },
    dispatchEvent(event) { for (const callback of events.get(event.type) || []) callback(event); },
    querySelectorAll: selector => selector.includes(".userName") ? [nameElement] : [],
    querySelector: selector => selector === "title" ? title : null,
  };
  const context = { document, __EE_TEST__: true,
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() { disconnected = false; } disconnect() { disconnected = true; } },
    setTimeout(callback) { const id = {}; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["scripts/lib/ee-common.js", "scripts/lib/ee-anonymizer.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const anonymizer = context.EE.createNameAnonymizer(document);
  return { document, body, profile, nameElement, title, Element, Text, context, anonymizer,
    text(element) { return element.childNodes.map(node => node.nodeType === 3 ? node.data : this.text(node)).join(""); },
    mutate(target, type = "childList", attributeName) {
      if (!disconnected) observerCallback([{ target, type, attributeName }]);
      const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback());
    },
    timers,
    installPageBridge(getName) {
      const calls = [];
      const page = { document, Event: context.Event,
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        addEventListener() {},
        $j(selector) {
          assert.equal(selector, "#edubar");
          return { edubar(...args) { calls.push(args); return getName(); } };
        },
      };
      page.window = page;
      vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/anonymizer-main.js"), "utf8"), page);
      return { page, calls };
    },
  };
}

test("the page's loggedUserName option is authoritative across isolated worlds", () => {
  const f = fixture("Unrelated Profile");
  const p = f.body.append(new f.Element("p", "Marek Novák"));
  const { calls } = f.installPageBridge(() => "Marek Novák");
  assert.equal(f.context.$j, undefined); // The content script cannot access page jQuery.
  assert.equal(calls.length, 0); // Disabled means no account-name reads.
  f.anonymizer.setState(true, "Anonymous");
  assert.deepEqual(calls[0], ["option", "loggedUserName"]);
  assert.equal(f.text(p), "Anonymous");
  assert.equal(f.text(f.nameElement), "Unrelated Profile");
  f.anonymizer.setState(false);
  const before = calls.length;
  f.document.dispatchEvent(new f.context.Event("ee-anonymizer-name-ready"));
  assert.equal(calls.length, before);
  assert.equal(f.text(p), "Marek Novák");
});

test("late widget initialization, page-world readiness and account changes refresh the name", () => {
  const f = fixture("Old Profile");
  const p = f.body.append(new f.Element("p", "Marek Novák"));
  f.anonymizer.setState(true, "Anonymous");
  let value = null;
  f.installPageBridge(() => value);
  value = "Marek Novák";
  f.mutate(f.body);
  assert.equal(f.text(p), "Anonymous");
  value = "Eva Malá";
  p.childNodes[0].data = "Eva Malá";
  f.mutate(p.childNodes[0], "characterData");
  assert.equal(f.text(p), "Anonymous");
  f.anonymizer.setState(false);
  assert.equal(f.text(p), "Eva Malá");
});

test("a missing or uninitialized widget keeps the DOM fallback usable", () => {
  const f = fixture();
  f.installPageBridge(() => { throw new Error("not initialized"); });
  f.anonymizer.setState(true, "Anonymous");
  assert.equal(f.text(f.nameElement), "Anonymous");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  assert.ok(manifest.content_scripts.some(entry => entry.world === "MAIN" && entry.js.includes("scripts/anonymizer-main.js")));
});

test("discovers different account names and replaces text, split inline names and presentation attributes", () => {
  for (const name of ["Marek Novák", "Zoë Dvořáková", "Anne-Marie O’Neill", "Alex van Dijk"]) {
    const f = fixture(name);
    const p = f.body.append(new f.Element("p", `Hello ${name}. ${name}!`));
    const parts = name.split(" ");
    const split = f.body.append(new f.Element("p", new f.Element("b", parts.shift()), " ", new f.Element("span", parts.join(" "))));
    p.setAttribute("title", `Profile: ${name}`); p.setAttribute("aria-label", name);
    f.anonymizer.setState(true, "Anonymous");
    assert.equal(f.text(p), "Hello Anonymous. Anonymous!");
    assert.equal(f.text(split), "Anonymous");
    assert.equal(f.text(f.nameElement), "Anonymous");
    assert.equal(p.getAttribute("title"), "Profile: Anonymous");
    assert.equal(p.getAttribute("aria-label"), "Anonymous");
    assert.equal(f.text(f.title), "Anonymous — EduPage");
    f.anonymizer.setState(false);
    assert.equal(f.text(p), `Hello ${name}. ${name}!`);
    assert.equal(f.text(split), name);
    assert.equal(p.getAttribute("title"), `Profile: ${name}`);
  }
});

test("late content, text mutations, alias changes and account switches are reversible", () => {
  const f = fixture();
  f.anonymizer.setState(true, "First");
  const p = f.body.append(new f.Element("p", "Marek Novák"));
  f.mutate(f.body); assert.equal(f.text(p), "First");
  p.childNodes[0].data = "Updated: Marek Novák";
  f.mutate(p.childNodes[0], "characterData"); assert.equal(f.text(p), "Updated: First");
  f.anonymizer.setState(true, "$& <b>Alias</b>");
  assert.equal(f.text(p), "Updated: $& <b>Alias</b>");
  assert.equal(p.childNodes.length, 1); // Alias is plain text, never parsed HTML.
  f.anonymizer.setState(false);
  assert.equal(f.text(p), "Updated: Marek Novák");
  f.nameElement.childNodes[0].data = "Eva Malá";
  p.childNodes[0].data = "Eva Malá";
  f.anonymizer.setState(true, "Second");
  assert.equal(f.text(p), "Second");
  f.nameElement.childNodes[0].data = "Adam Biely";
  p.childNodes[0].data = "Adam Biely";
  f.mutate(f.nameElement.childNodes[0], "characterData");
  assert.equal(f.text(p), "Second");
  f.anonymizer.setState(false); assert.equal(f.text(p), "Adam Biely");
});

test("does not change scripts, editors, form values, unrelated people or substrings", () => {
  const f = fixture();
  const code = f.body.append(new f.Element("script", 'const name = "Marek Novák";'));
  const textarea = f.body.append(new f.Element("textarea", "Marek Novák"));
  const input = f.body.append(new f.Element("input")); input.value = "Marek Novák";
  const editor = f.body.append(new f.Element("div", "Marek Novák")); editor.setAttribute("contenteditable", "true");
  const other = f.body.append(new f.Element("p", "Marek Nováková / Eva Malá / Marek"));
  f.anonymizer.setState(true, "Anonymous");
  assert.equal(f.text(code), 'const name = "Marek Novák";');
  assert.equal(f.text(textarea), "Marek Novák");
  assert.equal(input.value, "Marek Novák");
  assert.equal(f.text(editor), "Marek Novák");
  assert.equal(f.text(other), "Marek Nováková / Eva Malá / Marek");
});

test("matches whitespace, casing and reversed full names without touching longer names", () => {
  const f = fixture();
  const p = f.body.append(new f.Element("p", "MAREK\u00a0NOVÁK; Novák, Marek; Novák Marek; Marek Nováková"));
  f.anonymizer.setState(true, "Anonymous");
  assert.equal(f.text(p), "Anonymous; Anonymous; Anonymous; Marek Nováková");
  f.mutate(p.childNodes[0], "characterData"); assert.equal(f.timers.size, 0);
});

test("detached fragments are restored, and disabled anonymization stays idle", () => {
  const f = fixture(), p = f.body.append(new f.Element("p", "Marek Novák"));
  f.anonymizer.setState(true, "Anonymous");
  f.body.childNodes = f.body.childNodes.filter(node => node !== p); p.parentElement = null;
  f.mutate(f.body); assert.equal(f.text(p), "Marek Novák");
  f.anonymizer.setState(false);
  const late = f.body.append(new f.Element("p", "Marek Novák"));
  f.mutate(f.body); assert.equal(f.text(late), "Marek Novák");
});

test("document_start can enable before the body is available", () => {
  const f = fixture();
  f.document.body = null;
  f.anonymizer.setState(true, "Anonymous");
  assert.equal(f.document.documentElement.classList.contains("ee-anonymizer-active"), false);
  f.document.body = f.body;
  f.mutate(f.document.documentElement);
  assert.equal(f.text(f.nameElement), "Anonymous");
  assert.equal(f.document.documentElement.classList.contains("ee-anonymizer-active"), true);
  f.anonymizer.setState(false);
  assert.equal(f.document.documentElement.classList.contains("ee-anonymizer-active"), false);
  assert.equal(f.text(f.nameElement), "Marek Novák");
});

test("unusable names retain CSS masking until a full name can be anonymized", () => {
  const f = fixture("Student"), active = () => f.document.documentElement.classList.contains("ee-anonymizer-active");
  f.anonymizer.setState(true, "Anonymous");
  assert.equal(active(), false);
  f.nameElement.childNodes[0].data = "Marek Novák";
  f.mutate(f.nameElement.childNodes[0], "characterData");
  assert.equal(f.text(f.nameElement), "Anonymous");
  assert.equal(active(), true);
  f.anonymizer.setState(false);
  assert.equal(active(), false);
  for (const file of ["scripts/instant-theme.css", "scripts/theme-static.css"]) {
    const css = fs.readFileSync(path.join(root, file), "utf8");
    for (const selector of [".edubarProfilebox a.display > span", ".edubarProfilebox .profilemenu .userName", ".edubarProfilebox .profilemenu h1", "form.zteFilterForm .zsvHeaderTitle > h1"]) {
      assert.ok(css.includes(`html.ee-hide-personal-info:not(.ee-anonymizer-active) ${selector}`));
    }
  }
});

test("alias normalization and settings autosave keep defaults, custom values and errors", () => {
  const f = fixture();
  assert.equal(f.context.EE.normalizeAnonymizerAlias(" \n "), "Anonymous");
  assert.equal(f.context.EE.normalizeAnonymizerAlias("x".repeat(100)).length, 80);
  const element = () => ({ checked: false, value: "", hidden: true, disabled: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute() {} });
  const toggle = element(), input = element(), options = element(), status = element();
  const stored = {}, notifications = []; let storageError = false;
  f.context.chrome = { i18n: { getMessage: () => "Save failed" }, runtime: {}, storage: { local: { set(values, callback) {
    if (!storageError) Object.assign(stored, values);
    f.context.chrome.runtime.lastError = storageError ? { message: "failed" } : null;
    callback();
  } } } };
  f.context.addEventListener = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, "menu/anonymizer-settings.js"), "utf8"), f.context);
  const settings = f.context.EE.bindAnonymizerSettings({ toggle, input, options, status, notify: () => notifications.push(true) });
  assert.equal(toggle.disabled, true);
  settings.load({}); assert.equal(input.value, "Anonymous"); assert.equal(options.hidden, true);
  assert.equal(toggle.disabled, false);
  toggle.checked = true; toggle.listeners.change();
  assert.equal(stored.eeAnonymizerAlias, "Anonymous"); assert.equal(options.hidden, false);
  input.value = "Alias"; input.listeners.input(); input.listeners.blur();
  assert.equal(stored.eeAnonymizerAlias, "Alias");
  toggle.checked = false; toggle.listeners.change(); assert.equal(options.hidden, true);
  toggle.checked = true; toggle.listeners.change(); assert.equal(input.value, "Alias");
  storageError = true; input.value = "Other"; input.listeners.input(); input.listeners.blur();
  assert.equal(status.hidden, false); assert.equal(status.textContent, "Save failed");
  assert.equal(stored.eeAnonymizerAlias, "Alias"); assert.ok(notifications.length > 0);
});
