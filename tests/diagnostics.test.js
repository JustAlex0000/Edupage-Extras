const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function collectPage(redact) {
  const privateText = "SyntheticPrivateName";
  let onMessage;
  let result;
  const textNode = { nodeType: 3, textContent: privateText };
  const bold = { childNodes: [textNode] };
  const nameCell = { querySelector: () => bold };
  const average = { getAttribute: () => "85.5 %" };
  const tooltip = { getAttribute: () => `${privateText}: individual plan 1` };
  const row = {
    getAttribute: () => privateText,
    querySelector: (selector) => selector === ".fixedCell" ? nameCell : average,
    querySelectorAll: (selector) => selector === ".znZnamka"
      ? [{ textContent: privateText }, { textContent: "85.5 %" }]
      : [tooltip],
  };
  const table = {
    tagName: "TABLE", id: privateText,
    classList: ["znamkyTable", privateText], children: [], childNodes: [textNode],
    attributes: [
      { name: "data-predmetid", value: privateText },
      { name: `data-${privateText}`, value: privateText },
    ],
    querySelectorAll: () => [row],
  };
  table.classList.contains = (name) => table.classList.includes(name);
  const logger = { error() {}, warn() {} };
  const window = { addEventListener() {} };
  window.top = window;
  window.self = window;
  const context = {
    window, console: logger, Node: { TEXT_NODE: 3 },
    location: {
      pathname: `/znamky/${privateText}`,
      origin: "https://synthetic.edupage.org",
      href: `https://synthetic.edupage.org/znamky/${privateText}?student=${privateText}`,
    },
    document: {
      title: privateText,
      querySelector: (selector) => selector.includes("znamkyTable") ? table : null,
      querySelectorAll: (selector) => selector === "table.znamkyTable" ? [table] : [],
      documentElement: { dataset: { eeGradesAttendanceDebug: JSON.stringify({ [privateText]: privateText }) } },
    },
    chrome: {
      runtime: {
        id: "synthetic-extension-id",
        onMessage: { addListener: (callback) => { onMessage = callback; } },
        sendMessage: (message) => { result = message.data; },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "scripts", "diagnostics.js"), "utf8"), context);
  logger.warn("Edupage Extras", privateText);
  window.__eeDiagnostics.record(privateText, { text: privateText });
  onMessage({ type: "ee-collect-page-diagnostics", redact, requestId: "synthetic" }, {}, () => {});
  return { result, privateText };
}

test("default page reports contain structural diagnostics without names, tooltip text, or raw errors/context", () => {
  const { result, privateText } = collectPage();
  assert.equal(result.redacted, true);
  assert.equal(JSON.stringify(result).includes(privateText), false);
  assert.equal(result.frame.url, "https://synthetic.edupage.org");
  assert.equal(result.gradesSample.subjects[0].averageText, "NN.N %");
  assert.equal(result.gradesSample.subjects[0].marks[0], "[text]");
  assert.equal(result.gradesSample.subjects[0].subjectId, null);
  assert.equal(result.gradesSample.subjects[0].tooltips.length, 0);
  assert.equal(result.recordedContextCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)), [{ level: "warn", count: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.containers[0].skeleton.class)), ["znamkyTable"]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.containers[0].skeleton.dataKeys)), ["data-predmetid"]);
});

test("explicit unredacted page reports preserve intended diagnostic details", () => {
  const { result, privateText } = collectPage(false);
  assert.equal(result.redacted, false);
  assert.ok(result.frame.url.includes(privateText));
  assert.equal(result.frame.title, privateText);
  assert.equal(result.gradesSample.subjects[0].subject, privateText);
  assert.equal(result.gradesSample.subjects[0].subjectId, privateText);
  assert.ok(result.gradesSample.subjects[0].tooltips[0].includes(privateText));
  assert.ok(result.errors[0].message.includes(privateText));
  assert.equal(result.recordedContext[0].info.text, privateText);
  assert.equal(result.containers[0].skeleton.attrs[`data-${privateText}`], privateText);
});
