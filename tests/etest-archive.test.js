const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../scripts/etest-archive-background.js"), "utf8");
const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";
const origin = "https://example.edupage.org";
const question = (extra = {}) => ({ id: "q0", number: "1", body: "Question\nA\nB", answers: ["A"], images: [], ...extra });
const snapshot = (extra = {}) => ({ id: ID, title: "Practice", sequence: 1, questions: [question()], ...extra });
const plain = (value) => JSON.parse(JSON.stringify(value));

function load({ enabled = true, failWrites = false } = {}) {
  const values = { eeTestArchiveEnabled: enabled };
  const chrome = { runtime: { id: "extension", getURL: path => `chrome-extension://extension/${path}`,
    onMessage: { addListener() {} } }, storage: { local: {
    get(_keys, cb) { cb(structuredClone(values)); },
    set(data, cb) {
      if (failWrites && data.eeTestArchive) chrome.runtime.lastError = { message: "quota" };
      else Object.assign(values, structuredClone(data));
      cb(); delete chrome.runtime.lastError;
    },
  } } };
  const context = { __EE_TEST__: true, TextEncoder, URL, chrome };
  vm.runInNewContext(source, context);
  return { ...context.__eeArchiveModelTest, ...context.__eeArchiveBackgroundTest, values };
}
const settings = { id: "extension", url: "chrome-extension://extension/menu/settings.html#experimental" };
const sender = { id: "extension", tab: { id: 1 }, frameId: 0, url: `${origin}/elearning/?private=not-saved` };
const save = (s = snapshot()) => ({ type: "ee-test-archive-save", snapshot: s });

test("archive is off by default and does not persist opened questions until enabled", async () => {
  const a = load({ enabled: undefined }); delete a.values.eeTestArchiveEnabled;
  assert.equal((await a.request(save(), sender)).saved, false);
  assert.equal(a.values.eeTestArchive, undefined);
  a.values.eeTestArchiveEnabled = true;
  await a.request(save(), sender);
  assert.equal(a.values.eeTestArchive.tests.length, 1);
});

test("archive keeps latest answers, including clearing, and preserves previously visited questions", () => {
  const a = load();
  let root = a.mergeSnapshot(a.readLibrary(), snapshot(), origin, 1);
  root = a.mergeSnapshot(root, snapshot({ sequence: 2, questions: [question({ id: "q1", body: "Next" })] }), origin, 2);
  root = a.mergeSnapshot(root, snapshot({ sequence: 3, questions: [question({ answers: [] })] }), origin, 3);
  assert.equal(root.tests[0].openedAt, 1);
  assert.equal(root.tests[0].updatedAt, 3);
  assert.deepEqual(plain(root.tests[0].questions.map(q => q.answers)), [[], ["A"]]);
  assert.equal(a.mergeSnapshot(root, snapshot({ sequence: 2 }), origin), root);
});

test("archive stores normalized text/raster data, never page HTML, source URLs, keys or correctness claims", () => {
  const a = load();
  const root = a.mergeSnapshot(a.readLibrary(), snapshot({ url: "secret", token: "secret", questions: [question({
    htmlBody: "<script>secret</script>", correct: true, source: "https://private/?token=secret",
    body: "<img onerror=bad()> is text", images: [{ data: "data:image/png;base64,AA==", alt: "Diagram", url: "secret" }],
  })] }), origin);
  assert.equal(JSON.stringify(root).includes("secret"), false);
  assert.equal("correct" in root.tests[0].questions[0], false);
  assert.equal(root.tests[0].questions[0].body, "<img onerror=bad()> is text");
  for (const data of ["https://example/?token=x", "data:image/svg+xml;base64,AA==", "javascript:bad()"])
    assert.throws(() => a.normalizeQuestion(question({ images: [{ data, alt: "" }] })), /eeArchiveUnsupported/);
});

test("archive bounds reject oversized/invalid data without altering the saved answers", () => {
  const a = load(), root = a.mergeSnapshot(a.readLibrary(), snapshot(), origin);
  const original = JSON.stringify(root);
  assert.throws(() => a.mergeSnapshot(root, snapshot({ sequence: 2, questions: [question({ body: "x".repeat(24001) })] }), origin), /eeArchiveUnsupported/);
  const many = Array.from({ length: 301 }, (_, i) => question({ id: `q${i}` }));
  assert.throws(() => a.mergeSnapshot(root, snapshot({ sequence: 2, questions: many }), origin), /eeArchiveUnsupported/);
  const large = Array.from({ length: 150 }, (_, i) => question({ id: `q${i}`, body: "é".repeat(24000) }));
  assert.throws(() => a.mergeSnapshot(root, snapshot({ sequence: 2, questions: large }), origin), /eeArchiveFull/);
  assert.equal(JSON.stringify(root), original);
  assert.throws(() => a.readLibrary({ version: 99, tests: [] }), /eeArchiveStorageError/);
  const full = { ...root, tests: Array.from({ length: 50 }, (_, index) => ({ ...root.tests[0], id: `saved-${index}` })) };
  assert.throws(() => a.mergeSnapshot(full, snapshot(), origin), /eeArchiveFull/);
  assert.equal(a.normalizeQuestion(question({ body: "", visualsOmitted: true })).visualsOmitted, true);
});

test("archive refuses foreign pages and subframes, permits smart navigation, and denies page access to list/delete", async () => {
  const a = load();
  for (const override of [{ url: "https://foreign.example/elearning/" }, { frameId: 1 }, { url: "http://example.edupage.org/elearning/" }, { id: "foreign" }])
    await assert.rejects(a.request(save(), { ...sender, ...override }), /eeArchiveUnsupported/);
  for (const type of ["ee-test-archive-list", "ee-test-archive-delete", "ee-test-archive-clear"])
    await assert.rejects(a.request({ type, id: ID }, sender), /eeArchiveUnsupported/);
  await a.request(save(), { ...sender, url: `${origin}/user/` });
  const stored = JSON.stringify(a.values.eeTestArchive);
  assert.equal(stored.includes("private"), false);
  await assert.rejects(a.request(save(snapshot({ sequence: 2 })), { ...sender, url: "https://other.edupage.org/elearning/" }), /eeArchiveUnsupported/);
});

test("serialized saves merge simultaneous tabs and deletion prevents active-tab recreation", async () => {
  const a = load();
  await Promise.all([a.request(save(), sender), a.request(save(snapshot({ id: ID2 })), { ...sender, tab: { id: 2 } })]);
  assert.equal(a.values.eeTestArchive.tests.length, 2);
  await Promise.all([
    a.request({ type: "ee-test-archive-delete", id: ID }, settings),
    a.request(save(snapshot({ sequence: 2 })), sender),
  ]);
  assert.deepEqual(a.values.eeTestArchive.tests.map(entry => entry.id), [ID2]);
  await a.request({ type: "ee-test-archive-clear" }, settings);
  assert.equal(a.values.eeTestArchiveEnabled, false);
  await a.request(save(snapshot({ sequence: 3 })), sender);
  assert.equal(a.values.eeTestArchive.tests.length, 0);
  assert.equal(a.values.eeTestArchive.blocked.length, 0);
});

test("disabling retains tests; failed writes preserve data and expose only a bounded error key", async () => {
  const a = load(); await a.request(save(), sender);
  const before = structuredClone(a.values.eeTestArchive);
  a.values.eeTestArchiveEnabled = false;
  await a.request(save(snapshot({ sequence: 2 })), sender);
  assert.deepEqual(a.values.eeTestArchive, before);
  const failing = load({ failWrites: true });
  failing.values.eeTestArchive = before;
  await assert.rejects(failing.request(save(snapshot({ sequence: 2 })), sender), /eeArchiveStorageError/);
  assert.deepEqual(failing.values.eeTestArchive, before);
  assert.equal(failing.values.eeTestArchiveStatus, "eeArchiveStorageError");
});

test("explicit clear recovers an unreadable library and disables recording", async () => {
  const a = load(); a.values.eeTestArchive = { version: 99, tests: "invalid" };
  await assert.rejects(a.request({ type: "ee-test-archive-list" }, settings), /eeArchiveStorageError/);
  await a.request({ type: "ee-test-archive-clear" }, settings);
  assert.equal(a.values.eeTestArchiveEnabled, false);
  assert.deepEqual(plain(a.values.eeTestArchive), { version: 1, tests: [], blocked: [] });
});

test("archive settings use read-only text rendering and both browser background registrations include archive", () => {
  const ui = fs.readFileSync(require.resolve("../menu/etest-archive-settings.js"), "utf8");
  assert.doesNotMatch(ui, /innerHTML|insertAdjacentHTML|eval\(/);
  const background = fs.readFileSync(require.resolve("../scripts/background.js"), "utf8");
  const packaging = fs.readFileSync(require.resolve("../scripts-dev/package-policy.js"), "utf8");
  assert.match(background, /importScripts\([^;]+etest-archive-background\.js/);
  assert.match(packaging, /manifest\.background\.scripts = \[[^;]+etest-archive-background\.js/);
});
