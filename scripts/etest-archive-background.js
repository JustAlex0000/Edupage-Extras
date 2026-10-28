(function () {
  "use strict";

  const KEY = "eeTestArchive";
  const ENABLED = "eeTestArchiveEnabled";
  const STATUS = "eeTestArchiveStatus";
  const MAX_BYTES = 3 * 1024 * 1024;
  const MAX_TESTS = 50;
  const MAX_QUESTIONS = 300;
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const fail = (key) => { throw new Error(key); };
  const text = (value, max) => {
    if (typeof value !== "string" || value.length > max) fail("eeArchiveUnsupported");
    return value;
  };

  function normalizeQuestion(raw) {
    if (!raw || !/^q\d{1,4}$/.test(raw.id)) fail("eeArchiveUnsupported");
    if (!Array.isArray(raw.answers) || raw.answers.length > 100
      || !Array.isArray(raw.images) || raw.images.length > 4) fail("eeArchiveUnsupported");
    const body = text(raw.body, 24000);
    if (!body.trim() && !raw.images.length && raw.visualsOmitted !== true) fail("eeArchiveUnsupported");
    return {
      id: raw.id,
      number: text(raw.number, 40),
      body,
      answers: raw.answers.map((answer) => text(answer, 4000)),
      images: raw.images.map((image) => {
        if (!image || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.data)) fail("eeArchiveUnsupported");
        return { data: text(image.data, 220000), alt: text(image.alt, 300) };
      }),
      visualsOmitted: raw.visualsOmitted === true,
    };
  }

  function readLibrary(value) {
    if (value === undefined) return { version: 1, tests: [], blocked: [] };
    if (!value || value.version !== 1 || !Array.isArray(value.tests) || value.tests.length > MAX_TESTS
      || !Array.isArray(value.blocked) || value.blocked.length > 200) fail("eeArchiveStorageError");
    return value;
  }

  function mergeSnapshot(root, raw, origin, now = Date.now()) {
    if (!raw || !UUID.test(raw.id) || !Number.isSafeInteger(raw.sequence) || raw.sequence < 1
      || !Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > MAX_QUESTIONS) fail("eeArchiveUnsupported");
    if (root.blocked.includes(raw.id)) return root;
    const previous = root.tests.find((entry) => entry.id === raw.id);
    if (previous && previous.origin !== origin) fail("eeArchiveUnsupported");
    if (previous && previous.sequence >= raw.sequence) return root;
    if (!previous && root.tests.length >= MAX_TESTS) fail("eeArchiveFull");
    const questions = new Map((previous?.questions || []).map((question) => [question.id, question]));
    for (const question of raw.questions) {
      const normalized = normalizeQuestion(question);
      questions.set(normalized.id, normalized);
    }
    if (questions.size > MAX_QUESTIONS) fail("eeArchiveFull");
    const entry = {
      id: raw.id, origin, title: text(raw.title, 160),
      openedAt: previous?.openedAt || now, updatedAt: now, sequence: raw.sequence,
      questions: [...questions.values()],
    };
    const result = { version: 1, blocked: root.blocked, tests: [entry, ...root.tests.filter((item) => item.id !== raw.id)] };
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES) fail("eeArchiveFull");
    return result;
  }

  function removeTest(root, id) {
    if (!UUID.test(id)) fail("eeArchiveUnsupported");
    return { version: 1, tests: root.tests.filter((entry) => entry.id !== id),
      blocked: [...root.blocked.filter((entry) => entry !== id), id].slice(-200) };
  }

  if (globalThis.__EE_TEST__) globalThis.__eeArchiveModelTest = { KEY, ENABLED, STATUS, MAX_BYTES, readLibrary, mergeSnapshot, removeTest, normalizeQuestion };
  if (typeof chrome === "undefined") return;

  function storage(method, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local[method](value, (result) => {
        if (chrome.runtime.lastError) reject(new Error("eeArchiveStorageError"));
        else resolve(result);
      });
    });
  }

  // One writer owns all read/modify/write operations, including deletion.
  let queue = Promise.resolve();
  function request(message, sender) {
    const job = queue.then(async () => {
      const save = message.type === "ee-test-archive-save";
      const settingsPage = sender?.id === chrome.runtime.id
        && typeof sender.url === "string" && sender.url.split(/[?#]/)[0] === chrome.runtime.getURL("menu/settings.html");
      let origin;
      if (save) {
        let url;
        try { url = new URL(sender?.url); } catch (_) { fail("eeArchiveUnsupported"); }
        if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0
          || url.protocol !== "https:" || !/^[^/]+\.edupage\.org$/i.test(url.hostname)) fail("eeArchiveUnsupported");
        // Chrome may retain the original document URL across pushState (Home →
        // eTest). The content script owns the live /elearning route guard.
        origin = url.origin;
      } else if (!settingsPage) fail("eeArchiveUnsupported");
      const stored = await storage("get", [KEY, ENABLED, STATUS]);
      if (message.type === "ee-test-archive-clear") {
        // This explicit recovery path also works with an unreadable library.
        await storage("set", { [ENABLED]: false, [KEY]: { version: 1, tests: [], blocked: [] }, [STATUS]: "" });
        return {};
      }
      const root = readLibrary(stored[KEY]);
      if (save) {
        if (stored[ENABLED] !== true) return { saved: false };
        try {
          const next = mergeSnapshot(root, message.snapshot, origin);
          if (next !== root) await storage("set", { [KEY]: next });
          return { saved: next !== root };
        } catch (error) {
          const key = error.message === "eeArchiveFull" ? "eeArchiveFull" : error.message === "eeArchiveUnsupported" ? "eeArchiveUnsupported" : "eeArchiveStorageError";
          await storage("set", { [STATUS]: key }).catch(() => {});
          throw new Error(key);
        }
      }
      if (message.type === "ee-test-archive-list") return { library: root, status: stored[STATUS] || "" };
      if (message.type === "ee-test-archive-delete") {
        await storage("set", { [KEY]: removeTest(root, message.id), [STATUS]: "" });
        return {};
      }
      fail("eeArchiveUnsupported");
    });
    queue = job.catch(() => {});
    return job;
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!["ee-test-archive-save", "ee-test-archive-list", "ee-test-archive-delete", "ee-test-archive-clear"].includes(message?.type)) return false;
    request(message, sender).then((result) => respond({ ok: true, ...result }))
      .catch((error) => respond({ ok: false, error: ["eeArchiveFull", "eeArchiveUnsupported"].includes(error?.message) ? error.message : "eeArchiveStorageError" }));
    return true;
  });
  if (globalThis.__EE_TEST__) globalThis.__eeArchiveBackgroundTest = { request };
})();
