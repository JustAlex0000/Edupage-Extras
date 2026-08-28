const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadInternals(overrides = {}) {
  const context = {
    console,
    URL,
    Blob,
    navigator: { clipboard: {} },
    chrome: {
      i18n: {
        getMessage(key) {
          const messages = {
            etestSelectedAnswer: "Selected answer",
            etestSelectedMarker: "selected",
          };
          return messages[key] || "";
        },
      },
    },
    ...overrides,
  };
  context.globalThis = context;
  context.__EE_TEST__ = true;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "scripts", "etest-enhancer.js"), "utf8"),
    context,
    { filename: "scripts/etest-enhancer.js" },
  );
  return { context, exports: context.__eeTestExports };
}

function text(value) {
  return { nodeType: 3, nodeValue: value };
}

function element(tagName, { className = "", children = [], attributes = {}, ...properties } = {}) {
  const classNames = className.split(/\s+/).filter(Boolean);
  return {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    className,
    classList: { contains: (name) => classNames.includes(name) },
    childNodes: children,
    getAttribute(name) {
      if (Object.hasOwn(attributes, name)) return attributes[name];
      if (name === "type") return properties.type || null;
      if (name === "src") return properties.src || null;
      if (name === "alt") return properties.alt || null;
      if (name === "href") return properties.href || null;
      return null;
    },
    querySelector() {
      return null;
    },
    ...properties,
  };
}

function interactiveControl({ type = "text", value = "", options = [] } = {}) {
  const attributes = new Map();
  const events = [];
  return {
    type,
    value,
    options,
    events,
    classList: { remove() {}, contains() { return false; } },
    getAttribute(name) { return attributes.get(name) || null; },
    hasAttribute(name) { return attributes.has(name); },
    setAttribute(name, attributeValue) { attributes.set(name, String(attributeValue)); },
    removeAttribute(name) { attributes.delete(name); },
    dispatchEvent(event) { events.push(event.type); return true; },
  };
}

test("structured serialization keeps inline blanks and exactly one newline between ABCD answers", () => {
  const { serializeNode, normalizeStructuredText, SELECTED_MARKER_TOKEN, renderQuestionPlain } = loadInternals().exports;
  const select = element("select", {
    options: [
      { value: "", selected: true, textContent: "-- choose --" },
      { value: "one", selected: false, textContent: "First" },
      { value: "two", selected: false, textContent: "Second" },
    ],
  });
  const optionA = element("li", {
    className: "etest-alist-answer",
    children: [
      element("span", { className: "etest-answer-num", children: [text("A)")] }),
      element("span", { children: [text("lorem ipsum")] }),
    ],
  });
  const optionB = element("li", {
    className: "etest-alist-answer",
    attributes: { "aria-checked": "true" },
    children: [
      element("span", { className: "etest-answer-num", children: [text("B)")] }),
      element("div", { children: [text("dolor sit amet")] }),
    ],
  });
  const blank = element("div", {
    className: "etest-answer-input-field-outer",
    children: [text("Complete "), element("input", { type: "text" }), text(" using "), select],
  });
  const root = element("div", {
    children: [blank, element("ul", { className: "etest-alist-abcd", children: [optionA, optionB] })],
  });

  const output = normalizeStructuredText(serializeNode(root, false).plain);
  assert.equal(
    output,
    `Complete ___ using [First / Second]\n\nA) lorem ipsum\nB) dolor sit amet ${SELECTED_MARKER_TOKEN}`,
  );
  assert.equal(
    renderQuestionPlain({ plainBody: output, answers: [] }, { includeAnswers: true }),
    "Complete ___ using [First / Second]\n\nA) lorem ipsum\nB) dolor sit amet (selected)\n",
  );
  assert.doesNotMatch(output, /-- choose --/);
});

test("selected-answer extraction excludes choice rows from the separate answer block", () => {
  const { collectSelectedAnswers } = loadInternals().exports;
  const typed = element("input", { type: "text", value: "typed answer" });
  const password = element("input", { type: "password", value: "must not be copied" });
  const select = element("select", {
    options: [
      { value: "", selected: false, textContent: "-- choose --" },
      { value: "b", selected: true, textContent: "Choice B" },
    ],
  });
  const selectedRow = element("li", {
    className: "etest-alist-answer",
    children: [text("C) Choice C")],
  });
  const content = {
    querySelectorAll(selector) {
      if (selector === "input, textarea, select") return [typed, password, select];
      if (selector === ".etest-alist-ordering" || selector === ".etest-pair-item") return [];
      return [selectedRow];
    },
  };

  assert.deepEqual(
    Array.from(collectSelectedAnswers(content)),
    ["typed answer", "Choice B"],
  );
});

test("question rendering only adds a separate answer block for non-choice answers", () => {
  const { renderQuestionPlain } = loadInternals().exports;
  const model = { plainBody: "Complete ___ here.", answers: ["typed answer"] };

  assert.equal(
    renderQuestionPlain(model, { includeAnswers: true }),
    "Complete ___ here.\n\nSelected answer: typed answer\n",
  );
  assert.equal(
    renderQuestionPlain(model, { includeAnswers: false }),
    "Complete ___ here.\n",
  );
});

test("stable card ids keep paginated questions distinct", () => {
  const { getQuestionIdentity } = loadInternals().exports;
  const first = element("div", { attributes: { "data-cardid": "card-1" } });
  const second = element("div", { attributes: { "data-cardid": "card-2" } });
  assert.equal(getQuestionIdentity(first, 0, "Same position"), "data-cardid:card-1");
  assert.equal(getQuestionIdentity(second, 0, "Same position"), "data-cardid:card-2");
});

test("whole-test copy includes a portable question type identifier", () => {
  const { getQuestionType, getQuestionInteractionData, renderQuestionHtml } = loadInternals().exports;
  const matching = { querySelector: (selector) => selector === ".etest-pair-item" ? {} : null };
  const choice = { querySelector: (selector) => selector === ".etest-alist-answer" ? {} : null };
  assert.equal(getQuestionType(matching), "matching");
  assert.equal(getQuestionType(choice), "choice");
  assert.equal(getQuestionType({ querySelector: (selector) => [".etest-alist-answer", "select"].includes(selector) ? {} : null }), "mixed");
  assert.match(
    renderQuestionHtml({ type: "matching", interactionData: { pairs: [["A", "1"]] }, htmlBody: "<p>Match</p>", htmlBodyWithoutImages: "<p>Match</p>", answers: [] }, {}),
    /data-ee-question-type="matching" data-ee-question-data=/,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(getQuestionInteractionData({ querySelectorAll: () => [element("li", { children: [text("A) Answer")] })] }, "choice"))),
    { options: ["A) Answer"] },
  );
});

test("test copying is opt-in while its child preferences default on", () => {
  const { resolvePreferences } = loadInternals().exports;
  assert.deepEqual(
    { ...resolvePreferences({}) },
    {
      copyEnabled: false,
      questionButtons: true,
      wholeTestButton: true,
      selectedAnswers: true,
      wholeTestImages: true,
      aiHelper: false,
      aiHelperMessages: false,
    },
  );
  assert.deepEqual(
    { ...resolvePreferences({
      eeEtestQuestionButtonsEnabled: false,
      eeEtestWholeTestButtonEnabled: true,
    }) },
    {
      copyEnabled: false,
      questionButtons: false,
      wholeTestButton: true,
      selectedAnswers: true,
      wholeTestImages: true,
      aiHelper: false,
      aiHelperMessages: false,
    },
  );
  assert.equal(resolvePreferences({ eeEtestCopyEnabled: true }).copyEnabled, true);
  assert.equal(resolvePreferences({ eeAiQuestionHelperEnabled: true }).aiHelper, true);
  assert.equal(resolvePreferences({ eeAiHelperMessagesEnabled: true }).aiHelperMessages, true);
});

test("mixed question interaction data keeps every supported control type", () => {
  const { getQuestionInteractionData } = loadInternals().exports;
  const option = element("li", { children: [text("A) First")] });
  const select = element("select", {
    options: [
      { value: "", textContent: "-- choose --" },
      { value: "one", textContent: "One" },
    ],
  });
  const input = element("input", { type: "text" });
  const content = {
    querySelectorAll(selector) {
      if (selector === ".etest-alist-answer") return [option];
      if (selector === "select") return [select];
      if (selector === "textarea, input") return [input];
      return [];
    },
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(getQuestionInteractionData(content, "mixed"))),
    { options: ["A) First"], dropdowns: [["One"]], blanks: 1 },
  );
});

test("AI treats textarea elaborations as one fill-in field", () => {
  const { isBlankControl, getQuestionInteractionData, getBlankControls } = loadInternals().exports;
  const elaboration = { tagName: "TEXTAREA", type: "textarea" };
  const content = {
    querySelectorAll(selector) {
      return selector === "textarea, input" ? [elaboration] : [];
    },
  };

  assert.equal(isBlankControl(elaboration), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(getQuestionInteractionData(content, "fill-in"))),
    { blanks: 1 },
  );
  assert.equal(getBlankControls(content).length, 1);
  assert.equal(getBlankControls(content)[0], elaboration);
});

test("AI fills every untouched multi-field control and Tab accepts a fallback hint", () => {
  const Event = class { constructor(type) { this.type = type; } };
  const { applyAiAnswer, canApplyAiAnswer, acceptAiSuggestionWithTab } = loadInternals({ Event }).exports;
  const first = interactiveControl();
  const second = interactiveControl();
  const firstSelect = interactiveControl({
    options: [
      { value: "", textContent: "-- choose --", selected: true },
      { value: "one", textContent: "One", selected: false },
      { value: "two", textContent: "Two", selected: false },
    ],
  });
  const secondSelect = interactiveControl({
    options: [
      { value: "", textContent: "-- choose --", selected: true },
      { value: "alpha", textContent: "Alpha", selected: false },
      { value: "beta", textContent: "Beta", selected: false },
    ],
  });
  const content = {
    querySelectorAll(selector) {
      if (selector === ".etest-alist-answer") return [];
      if (selector === "textarea, input") return [first, second];
      if (selector === "select") return [firstSelect, secondSelect];
      return [];
    },
  };

  assert.equal(canApplyAiAnswer(content, {
    choiceIndexes: [],
    fillIns: ["only the first"],
    dropdownIndexes: [1, 1],
  }), false);

  assert.equal(applyAiAnswer(content, {
    choiceIndexes: [],
    fillIns: ["function answer() {}", "second value"],
    dropdownIndexes: [1, 1],
  }), 4);
  assert.equal(first.value, "function answer() {}");
  assert.equal(second.value, "second value");
  assert.equal(firstSelect.value, "two");
  assert.equal(secondSelect.value, "beta");
  assert.deepEqual(first.events, ["input", "change"]);

  const hinted = interactiveControl();
  hinted.setAttribute("placeholder", "Original hint");
  hinted.setAttribute("data-ee-ai-original-placeholder", "Original hint");
  hinted.setAttribute("data-ee-ai-suggestion", "accepted text");
  let prevented = false;
  acceptAiSuggestionWithTab({ key: "Tab", target: hinted, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(hinted.value, "accepted text");
  assert.equal(hinted.getAttribute("placeholder"), "Original hint");
  assert.equal(hinted.getAttribute("data-ee-ai-suggestion"), null);
});

test("AI updates EduPage's visible dropdown label after selecting an answer", () => {
  const { syncDropdownDisplay } = loadInternals().exports;
  const label = { textContent: "-- choose --" };
  const host = { querySelector(selector) { return selector === ".ui-selectmenu-text" ? label : null; } };
  const select = { closest(selector) { return selector === ".etest-answer-input-field-outer" ? host : null; } };
  syncDropdownDisplay(select, { textContent: "Correct answer" });
  assert.equal(label.textContent, "Correct answer");
});

test("AI syncs a jQuery UI dropdown through its generated button", () => {
  const { syncDropdownDisplay } = loadInternals().exports;
  const label = { textContent: "-- choose --" };
  const button = { querySelector(selector) { return selector === ".ui-selectmenu-text" ? label : null; } };
  const select = {
    id: "answer-1",
    ownerDocument: { getElementById(id) { return id === "answer-1-button" ? button : null; } },
    closest() { return null; },
  };
  syncDropdownDisplay(select, { textContent: "Correct answer" });
  assert.equal(label.textContent, "Correct answer");
});

test("AI failures can show a local-only model response for diagnosis", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "etest-enhancer.js"), "utf8");
  assert.match(source, /function appendAiDebugResponse\(content, responseText\)/);
  assert.match(source, /appendAiDebugResponse\(content, response\?\.debugResponse\)/);
  assert.match(source, /Model response \(local only\)/);
});

test("AI only auto-orders untouched sortable questions", () => {
  const { hasOrderingAnswer, canApplyAiAnswer } = loadInternals().exports;
  const makeRow = (index) => ({ dataset: { ind: String(index) } });
  const untouchedRows = [makeRow(0), makeRow(1), makeRow(2)];
  const movedRows = [makeRow(1), makeRow(0), makeRow(2)];
  const content = (rows) => ({
    querySelectorAll(selector) {
      if (selector === ".etest-alist-answer") return rows;
      if (selector === ".etest-alist-ordering .etest-alist-answer") return rows;
      return [];
    },
  });
  const suggestion = { choiceIndexes: [], fillIns: [], dropdownIndexes: [], matches: [], ordering: [0, 2, 1] };

  assert.equal(hasOrderingAnswer(content(untouchedRows)), false);
  assert.equal(canApplyAiAnswer(content(untouchedRows), suggestion), true);
  assert.equal(hasOrderingAnswer(content(movedRows)), true);
  assert.equal(canApplyAiAnswer(content(movedRows), suggestion), false);
});

test("AI drags a complete matching suggestion only when nothing is connected", () => {
  const dispatched = [];
  const MouseEvent = class { constructor(type) { this.type = type; } };
  const document = { dispatchEvent(event) { dispatched.push(event.type); } };
  const makeRow = () => {
    const sourceEvents = [];
    const source = {
      getBoundingClientRect() { return { left: 0, top: 0, width: 20, height: 20 }; },
      dispatchEvent(event) { sourceEvents.push(event.type); },
    };
    const target = { getBoundingClientRect() { return { left: 40, top: 40, width: 20, height: 20 }; } };
    return {
      sourceEvents,
      classList: { contains() { return false; } },
      getBoundingClientRect() { return { left: 40, top: 40, width: 20, height: 20 }; },
      querySelector(selector) { return selector === ".pair-r" ? source : target; },
    };
  };
  const first = makeRow();
  const second = makeRow();
  const content = {
    querySelectorAll(selector) {
      if (selector === ".etest-pair-item") return [first, second];
      return [];
    },
  };
  const { applyAiAnswer, canApplyAiAnswer } = loadInternals({ MouseEvent, document }).exports;
  const suggestion = { choiceIndexes: [], fillIns: [], dropdownIndexes: [], matches: [{ left: 0, right: 1 }, { left: 1, right: 0 }] };
  assert.equal(canApplyAiAnswer(content, suggestion), true);
  assert.equal(applyAiAnswer(content, suggestion), 2);
  assert.deepEqual(first.sourceEvents, ["mousedown"]);
  assert.deepEqual(second.sourceEvents, ["mousedown"]);
  assert.deepEqual(dispatched, ["mousemove", "mousemove", "mousemove", "mouseup", "mousemove", "mousemove", "mousemove", "mouseup"]);
});

test("AI matching uses EduPage's own drop callback outside the test harness", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "etest-enhancer.js"), "utf8");
  const bridge = fs.readFileSync(path.join(__dirname, "..", "scripts", "etest-answer-bridge.js"), "utf8");
  assert.match(source, /if \(!IS_TEST\) return applyAiMatchesThroughPage\(content, matches\);/);
  assert.match(bridge, /drop\.call\(target, jq\.Event\("drop", \{ target \}\), \{ helper: jq\(source\) \}\);/);
  assert.match(bridge, /initialRows\.some\(\(row\) => row\.classList\.contains\("isConnected"\)\)/);
});

test("the test page keeps image export out of its action bar", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "etest-enhancer.js"), "utf8");
  assert.match(source, /etest-screen-action-btn flat-button flat-button-blue \$\{COPY_ALL_BTN_CLASS\}/);
  assert.doesNotMatch(source, /downloadTestImage|makeDownloadImageButton|DOWNLOAD_IMAGE_BTN_CLASS/);
});

test("whole-test rendering numbers questions and controls rich-copy images", () => {
  const { renderTestPayload } = loadInternals().exports;
  const model = {
    plainBody: "Question?",
    htmlBody: '<div>Question?<img src="https://example.test/image.png" alt="Diagram"></div>',
    htmlBodyWithoutImages: "<div>Question?</div>",
    answers: [],
  };

  const withImages = renderTestPayload([model], { includeAnswers: true, includeImages: true });
  const withoutImages = renderTestPayload([model], { includeAnswers: true, includeImages: false });
  assert.match(withImages.plain, /^1\. Question\?/);
  assert.doesNotMatch(withImages.plain, /Selected answer/);
  assert.match(withImages.html, /<img /);
  assert.doesNotMatch(withoutImages.html, /<img /);
});

test("image sources reject executable and transient URL schemes", () => {
  const { sanitizeImageSource } = loadInternals().exports;
  assert.equal(sanitizeImageSource("javascript:alert(1)"), "");
  assert.equal(sanitizeImageSource("blob:https://example.test/123"), "");
  assert.equal(sanitizeImageSource("data:text/html;base64,PHNjcmlwdD4="), "");
  assert.equal(sanitizeImageSource("data:image/svg+xml;base64,PHN2Zz4="), "");
  assert.equal(sanitizeImageSource("data:image/png;base64,AA=="), "data:image/png;base64,AA==");
  assert.equal(sanitizeImageSource("https://example.test/image.png"), "https://example.test/image.png");
});

test("rich clipboard writes both MIME types and falls back to plain text", async () => {
  const richWrites = [];
  const plainWrites = [];
  class ClipboardItemStub {
    constructor(types) {
      this.types = types;
    }
  }
  const navigator = {
    clipboard: {
      write(items) {
        richWrites.push(items);
        return Promise.resolve();
      },
      writeText(value) {
        plainWrites.push(value);
        return Promise.resolve();
      },
    },
  };
  const { exports } = loadInternals({ navigator, ClipboardItem: ClipboardItemStub });
  await exports.writeClipboard({ plain: "Question", html: "<p>Question</p>" });
  assert.equal(richWrites.length, 1);
  assert.deepEqual(Object.keys(richWrites[0][0].types).sort(), ["text/html", "text/plain"]);
  assert.equal(plainWrites.length, 0);

  navigator.clipboard.write = () => Promise.reject(new Error("not supported"));
  await exports.writeClipboard({ plain: "Fallback", html: "<p>Fallback</p>" });
  assert.deepEqual(plainWrites, ["Fallback"]);
});

test("plain clipboard fallback uses execCommand when a shortcut has no clipboard activation", async () => {
  const appended = [];
  const document = {
    body: {
      appendChild(element) {
        appended.push(element);
      },
    },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        select() {},
        remove() {},
      };
    },
    execCommand(command) {
      return command === "copy";
    },
  };
  const navigator = {
    clipboard: {
      writeText() {
        return Promise.reject(new Error("user activation is required"));
      },
    },
  };
  const { exports } = loadInternals({ document, navigator });
  await exports.writePlainText("Shortcut copy");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].value, "Shortcut copy");
});
